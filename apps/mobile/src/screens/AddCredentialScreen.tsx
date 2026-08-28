/**
 * apps/mobile/src/screens/AddCredentialScreen.tsx
 *
 * Full-screen modal for adding credentials from 4 sources:
 * NADRA, HEC, Air University, LinkedIn
 *
 * State machine: source_select → form_input → processing → success | error
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Alert,
  FlatList,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SDJWTCredential } from '@nexusid/types';
import { StorageService } from '../services/storage.service';

// ─── Types ────────────────────────────────────────────────────────────────────

type CredentialSource = 'nadra' | 'hec' | 'au' | 'linkedin';

type FlowStep =
  | 'source_select'
  | 'nadra_form'
  | 'nadra_otp'
  | 'hec_form'
  | 'au_form'
  | 'au_otp'
  | 'linkedin_webview'
  | 'processing'
  | 'success'
  | 'error';

type RootStackParamList = {
  AddCredential: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'AddCredential'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = 'http://10.0.2.2:4000/api/v1';

const CNIC_REGEX = /^\d{5}-\d{7}-\d{1}$/;
const PHONE_REGEX = /^(\+92|0)?3\d{9}$/;

// Credential type accent colours from design system
const CREDENTIAL_META: Record<
  CredentialSource,
  {
    icon: string;
    label: string;
    description: string;
    accent: string;
    accentBg: string;
    issuer: string;
  }
> = {
  nadra: {
    icon: '🆔',
    label: 'NADRA Pakistan',
    description: 'Verify your CNIC and national identity',
    accent: '#3B82F6',
    accentBg: '#0D1B35',
    issuer: 'nadra.gov.pk',
  },
  hec: {
    icon: '🎓',
    label: 'Higher Education Commission',
    description: 'Verify your university degree',
    accent: '#8B5CF6',
    accentBg: '#1A0D35',
    issuer: 'hec.gov.pk',
  },
  au: {
    icon: '🏫',
    label: 'Air University',
    description: 'Connect your student portal account',
    accent: '#10B981',
    accentBg: '#071E15',
    issuer: 'au.edu.pk',
  },
  linkedin: {
    icon: '💼',
    label: 'LinkedIn',
    description: 'Import your employment history',
    accent: '#0EA5E9',
    accentBg: '#071B26',
    issuer: 'linkedin.com',
  },
};

const UNIVERSITIES = [
  'Air University',
  'COMSATS University',
  'FAST-NUCES',
  'Government College University',
  'IBA Karachi',
  'NUST',
  'Quaid-i-Azam University',
  'University of Engineering and Technology',
  'University of Karachi',
  'University of the Punjab',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StyledInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  error?: string;
  hint?: string;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

function StyledInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  error,
  hint,
  maxLength,
  autoCapitalize = 'none',
}: StyledInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={s.inputWrapper}>
      <Text style={s.inputLabel}>{label}</Text>
      <View
        style={[
          s.inputBox,
          focused && s.inputBoxFocused,
          error ? s.inputBoxError : null,
        ]}
      >
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#525A72"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {error ? (
        <Text style={s.inputError}>{error}</Text>
      ) : hint ? (
        <Text style={s.inputHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  accent?: string;
}

function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  accent = '#3B6FE8',
}: PrimaryButtonProps) {
  return (
    <TouchableOpacity
      style={[s.primaryBtn, { backgroundColor: accent }, (disabled || loading) && s.primaryBtnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Text style={s.primaryBtnText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

interface BackButtonProps {
  onPress: () => void;
}

function BackButton({ onPress }: BackButtonProps) {
  return (
    <TouchableOpacity style={s.backBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.backBtnChevron}>‹</Text>
      <Text style={s.backBtnText}>Back</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function AddCredentialScreen({ navigation }: Props) {
  // ── State ──
  const [step, setStep] = useState<FlowStep>('source_select');
  const [source, setSource] = useState<CredentialSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [issuedCredential, setIssuedCredential] = useState<SDJWTCredential | null>(null);

  // NADRA form state
  const [cnic, setCnic] = useState('');
  const [phone, setPhone] = useState('');
  const [nadraSessionId, setNadraSessionId] = useState('');
  const [otp, setOtp] = useState('');
  const [cnicError, setCnicError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // HEC form state
  const [degreeNumber, setDegreeNumber] = useState('');
  const [universitySearch, setUniversitySearch] = useState('');
  const [selectedUniversity, setSelectedUniversity] = useState('');
  const [showUniversityDropdown, setShowUniversityDropdown] = useState(false);
  const [studentName, setStudentName] = useState('');

  // AU form state
  const [auUsername, setAuUsername] = useState('');
  const [auPassword, setAuPassword] = useState('');
  const [auOtp, setAuOtp] = useState('');
  const [auNeedsOtp, setAuNeedsOtp] = useState(false);

  // LinkedIn state
  const [linkedInAuthUrl, setLinkedInAuthUrl] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ── Navigation helpers ──

  const transition = useCallback(
    (nextStep: FlowStep) => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
      setStep(nextStep);
    },
    [fadeAnim]
  );

  const handleSelectSource = (selected: CredentialSource) => {
    setSource(selected);
    if (selected === 'nadra') transition('nadra_form');
    else if (selected === 'hec') transition('hec_form');
    else if (selected === 'au') transition('au_form');
    else if (selected === 'linkedin') handleLinkedInStart();
  };

  const handleBack = () => {
    setErrorMessage('');
    if (
      step === 'nadra_form' ||
      step === 'hec_form' ||
      step === 'au_form' ||
      step === 'linkedin_webview'
    ) {
      transition('source_select');
    } else if (step === 'nadra_otp') {
      transition('nadra_form');
    } else if (step === 'au_otp') {
      transition('au_form');
    }
  };

  // ── NADRA flow ──

  const validateNadraForm = (): boolean => {
    let valid = true;
    if (!CNIC_REGEX.test(cnic)) {
      setCnicError('Format must be: 12345-1234567-1');
      valid = false;
    } else {
      setCnicError('');
    }
    if (!PHONE_REGEX.test(phone)) {
      setPhoneError('Enter a valid Pakistani mobile number');
      valid = false;
    } else {
      setPhoneError('');
    }
    return valid;
  };

  const handleNadraSendOtp = async () => {
    if (!validateNadraForm()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/credentials/nadra/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnic, phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Verification failed');
      setNadraSessionId(json.data?.session_id ?? '');
      transition('nadra_otp');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Request failed');
      transition('error');
    } finally {
      setLoading(false);
    }
  };

  const handleNadraSubmitOtp = async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    transition('processing');
    try {
      const res = await fetch(`${API_BASE}/credentials/nadra/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: nadraSessionId, otp }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'OTP verification failed');
      const credential: SDJWTCredential = json.data.credential;
      await StorageService.getInstance().saveCredential(credential);
      setIssuedCredential(credential);
      transition('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'OTP verification failed');
      transition('error');
    } finally {
      setLoading(false);
    }
  };

  // ── HEC flow ──

  const handleHecVerify = async () => {
    if (!degreeNumber.trim() || !selectedUniversity || !studentName.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    transition('processing');
    try {
      const res = await fetch(`${API_BASE}/credentials/hec/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          degree_number: degreeNumber.trim(),
          university: selectedUniversity,
          student_name: studentName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Degree not found in HEC records');
      const credential: SDJWTCredential = json.data.credential;
      await StorageService.getInstance().saveCredential(credential);
      setIssuedCredential(credential);
      transition('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'HEC verification failed');
      transition('error');
    }
  };

  // ── AU flow ──

  const handleAuConnect = async () => {
    if (!auUsername.trim() || !auPassword.trim()) {
      Alert.alert('Missing fields', 'Username and password are required.');
      return;
    }
    transition('processing');
    try {
      const res = await fetch(`${API_BASE}/credentials/au/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: auUsername.trim(),
          password: auPassword,
          ...(auNeedsOtp && auOtp ? { otp: auOtp } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error?.includes('otp') || json.error?.includes('OTP')) {
          setAuNeedsOtp(true);
          transition('au_otp');
          return;
        }
        throw new Error(json.error ?? 'Portal connection failed');
      }
      const credential: SDJWTCredential = json.data.credential;
      await StorageService.getInstance().saveCredential(credential);
      setIssuedCredential(credential);
      transition('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not connect to Air University portal');
      transition('error');
    }
  };

  // ── LinkedIn flow ──

  const handleLinkedInStart = async () => {
    setSource('linkedin');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/credentials/linkedin/auth-url`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not start LinkedIn flow');
      setLinkedInAuthUrl(json.data.auth_url);
      transition('linkedin_webview');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'LinkedIn unavailable');
      transition('error');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkedInNavChange = async (navState: { url: string }) => {
    const { url } = navState;
    // Deep link or callback: nexusid://credential-added or backend callback URL
    if (
      url.includes('nexusid://credential-added') ||
      url.includes('localhost:4004') ||
      url.includes('/credentials/linkedin/callback')
    ) {
      transition('processing');
      // The backend issues and stores the credential after OAuth callback.
      // Poll or fetch the latest linkedin credential for this user.
      try {
        const res = await fetch(`${API_BASE}/credentials/linkedin/status`);
        const json = await res.json();
        if (res.ok && json.data?.credential) {
          const credential: SDJWTCredential = json.data.credential;
          await StorageService.getInstance().saveCredential(credential);
          setIssuedCredential(credential);
          transition('success');
        } else {
          throw new Error(json.error ?? 'Could not retrieve LinkedIn credential');
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'LinkedIn authorisation failed');
        transition('error');
      }
    }
  };

  // ── Credential summary for success screen ──

  const getSuccessSummary = (): Array<{ label: string; value: string }> => {
    if (!issuedCredential) return [];
    const meta = issuedCredential.metadata;
    if (!meta) return [];
    return meta.always_visible_fields.slice(0, 4).map((field) => ({
      label: meta.field_labels[field] ?? field,
      value: String((issuedCredential as Record<string, unknown>)[field] ?? ''),
    }));
  };

  // ── Render steps ──────────────────────────────────────────────────────────

  const renderSourceSelect = () => (
    <ScrollView style={s.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={s.sectionHeader}>
        <Text style={s.title}>Add Credential</Text>
        <Text style={s.subtitle}>Choose a source to verify your information</Text>
      </View>

      {(Object.entries(CREDENTIAL_META) as [CredentialSource, typeof CREDENTIAL_META['nadra']][]).map(
        ([key, meta]) => (
          <TouchableOpacity
            key={key}
            style={[s.sourceCard, { borderColor: `${meta.accent}30` }]}
            onPress={() => handleSelectSource(key)}
            activeOpacity={0.75}
          >
            <View style={[s.sourceIconBox, { backgroundColor: meta.accentBg, borderColor: `${meta.accent}30` }]}>
              <Text style={s.sourceIcon}>{meta.icon}</Text>
            </View>
            <View style={s.sourceCardContent}>
              <Text style={s.sourceCardLabel}>{meta.label}</Text>
              <Text style={s.sourceCardDesc}>{meta.description}</Text>
            </View>
            <Text style={[s.sourceChevron, { color: meta.accent }]}>›</Text>
          </TouchableOpacity>
        )
      )}
    </ScrollView>
  );

  const renderNadraForm = () => (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={s.scrollContent} showsVerticalScrollIndicator={false}>
        <BackButton onPress={handleBack} />
        <View style={s.formHeader}>
          <View style={[s.formHeaderIcon, { backgroundColor: CREDENTIAL_META.nadra.accentBg }]}>
            <Text style={s.formHeaderEmoji}>🆔</Text>
          </View>
          <Text style={s.formTitle}>NADRA Pakistan</Text>
          <Text style={s.formSubtitle}>Verify your national identity card</Text>
        </View>

        <StyledInput
          label="CNIC Number"
          value={cnic}
          onChangeText={setCnic}
          placeholder="12345-1234567-1"
          keyboardType="numeric"
          error={cnicError}
          hint="Format: 13 digits with dashes"
          maxLength={15}
        />
        <StyledInput
          label="Registered Mobile Number"
          value={phone}
          onChangeText={setPhone}
          placeholder="0300-1234567"
          keyboardType="phone-pad"
          error={phoneError}
          hint="Number registered with NADRA"
          maxLength={13}
        />

        <View style={s.trustNote}>
          <Text style={s.trustNoteText}>
            🔒 Your request is sent directly to NADRA Verisys. We never store your CNIC.
          </Text>
        </View>

        <PrimaryButton
          label="Send Verification Code"
          onPress={handleNadraSendOtp}
          loading={loading}
          accent={CREDENTIAL_META.nadra.accent}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderNadraOtp = () => (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={s.scrollContent} showsVerticalScrollIndicator={false}>
        <BackButton onPress={handleBack} />
        <View style={s.otpHeader}>
          <Text style={s.title}>Enter OTP</Text>
          <Text style={s.subtitle}>
            A 6-digit code was sent to{'\n'}
            <Text style={{ color: CREDENTIAL_META.nadra.accent }}>{phone}</Text>
          </Text>
        </View>

        <StyledInput
          label="Verification Code"
          value={otp}
          onChangeText={setOtp}
          placeholder="000000"
          keyboardType="numeric"
          maxLength={6}
          hint="Check your SMS"
          autoCapitalize="none"
        />

        <PrimaryButton
          label="Verify & Add Credential"
          onPress={handleNadraSubmitOtp}
          loading={loading}
          disabled={otp.length !== 6}
          accent={CREDENTIAL_META.nadra.accent}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderHecForm = () => {
    const filtered = UNIVERSITIES.filter((u) =>
      u.toLowerCase().includes(universitySearch.toLowerCase())
    );

    return (
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <BackButton onPress={handleBack} />
          <View style={s.formHeader}>
            <View style={[s.formHeaderIcon, { backgroundColor: CREDENTIAL_META.hec.accentBg }]}>
              <Text style={s.formHeaderEmoji}>🎓</Text>
            </View>
            <Text style={s.formTitle}>Higher Education Commission</Text>
            <Text style={s.formSubtitle}>Verify your university degree</Text>
          </View>

          <StyledInput
            label="Degree / Roll Number"
            value={degreeNumber}
            onChangeText={setDegreeNumber}
            placeholder="DEG-2024-XXXXXXX"
            autoCapitalize="characters"
          />

          {/* University searchable picker */}
          <View style={s.inputWrapper}>
            <Text style={s.inputLabel}>University</Text>
            <View style={[s.inputBox, showUniversityDropdown && s.inputBoxFocused]}>
              <TextInput
                style={s.input}
                value={selectedUniversity || universitySearch}
                onChangeText={(text) => {
                  setUniversitySearch(text);
                  setSelectedUniversity('');
                  setShowUniversityDropdown(text.length > 0);
                }}
                placeholder="Type to search..."
                placeholderTextColor="#525A72"
                onFocus={() => setShowUniversityDropdown(universitySearch.length > 0)}
              />
            </View>
            {showUniversityDropdown && filtered.length > 0 && (
              <View style={s.dropdown}>
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={s.dropdownItem}
                      onPress={() => {
                        setSelectedUniversity(item);
                        setUniversitySearch(item);
                        setShowUniversityDropdown(false);
                      }}
                    >
                      <Text style={s.dropdownItemText}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}
          </View>

          <StyledInput
            label="Your Full Name (as on degree)"
            value={studentName}
            onChangeText={setStudentName}
            placeholder="Muhammad Ali Khan"
            autoCapitalize="words"
          />

          <View style={s.trustNote}>
            <Text style={s.trustNoteText}>
              🔒 Degree data is verified directly with HEC records.
            </Text>
          </View>

          <PrimaryButton
            label="Verify with HEC"
            onPress={handleHecVerify}
            accent={CREDENTIAL_META.hec.accent}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  const renderAuForm = () => (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={s.scrollContent} showsVerticalScrollIndicator={false}>
        <BackButton onPress={handleBack} />
        <View style={s.formHeader}>
          <View style={[s.formHeaderIcon, { backgroundColor: CREDENTIAL_META.au.accentBg }]}>
            <Text style={s.formHeaderEmoji}>🏫</Text>
          </View>
          <Text style={s.formTitle}>Air University</Text>
          <Text style={s.formSubtitle}>Student portal verification</Text>
        </View>

        {/* Privacy warning banner */}
        <View style={s.warningBanner}>
          <Text style={s.warningBannerIcon}>⚠️</Text>
          <Text style={s.warningBannerText}>
            Your portal credentials are used once and immediately discarded. They are never logged or stored.
          </Text>
        </View>

        <StyledInput
          label="Student Portal Username"
          value={auUsername}
          onChangeText={setAuUsername}
          placeholder="SP19-BSE-XXX"
          autoCapitalize="none"
        />
        <StyledInput
          label="Portal Password"
          value={auPassword}
          onChangeText={setAuPassword}
          placeholder="••••••••"
          secureTextEntry
        />

        <PrimaryButton
          label="Connect Portal"
          onPress={handleAuConnect}
          accent={CREDENTIAL_META.au.accent}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderAuOtp = () => (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={s.scrollContent} showsVerticalScrollIndicator={false}>
        <BackButton onPress={handleBack} />
        <View style={s.otpHeader}>
          <Text style={s.title}>Portal OTP</Text>
          <Text style={s.subtitle}>
            Air University sent a one-time code to your registered number
          </Text>
        </View>
        <StyledInput
          label="OTP Code"
          value={auOtp}
          onChangeText={setAuOtp}
          placeholder="000000"
          keyboardType="numeric"
          maxLength={6}
        />
        <PrimaryButton
          label="Submit OTP"
          onPress={handleAuConnect}
          disabled={auOtp.length !== 6}
          accent={CREDENTIAL_META.au.accent}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderLinkedInWebView = () => (
    <View style={s.flex}>
      <View style={s.webViewHeader}>
        <TouchableOpacity onPress={handleBack} style={s.webViewClose}>
          <Text style={s.webViewCloseText}>✕</Text>
        </TouchableOpacity>
        <Text style={s.webViewTitle}>Connect LinkedIn</Text>
        <View style={{ width: 40 }} />
      </View>
      <WebView
        source={{ uri: linkedInAuthUrl }}
        onNavigationStateChange={handleLinkedInNavChange}
        startInLoadingState
        renderLoading={() => (
          <View style={s.webViewLoading}>
            <ActivityIndicator color="#0EA5E9" size="large" />
          </View>
        )}
      />
    </View>
  );

  const renderProcessing = () => {
    const meta = source ? CREDENTIAL_META[source] : CREDENTIAL_META.nadra;
    return (
      <View style={s.centeredScreen}>
        <View style={[s.processingIconBox, { backgroundColor: meta.accentBg }]}>
          <Text style={s.processingIcon}>{meta.icon}</Text>
        </View>
        <ActivityIndicator
          color={meta.accent}
          size="large"
          style={{ marginTop: 24 }}
        />
        <Text style={s.processingTitle}>Verifying with {meta.label}</Text>
        <Text style={s.processingSubtitle}>This usually takes a few seconds</Text>
      </View>
    );
  };

  const renderSuccess = () => {
    const meta = source ? CREDENTIAL_META[source] : CREDENTIAL_META.nadra;
    const summary = getSuccessSummary();

    return (
      <View style={s.centeredScreen}>
        <View style={[s.successRing, { borderColor: `${meta.accent}40` }]}>
          <View style={[s.successInner, { backgroundColor: meta.accentBg }]}>
            <Text style={s.successCheckmark}>✓</Text>
          </View>
        </View>

        <Text style={s.successTitle}>Credential Added</Text>
        <Text style={s.successSubtitle}>
          Your {meta.label} credential is now in your wallet
        </Text>

        {summary.length > 0 && (
          <View style={s.summaryCard}>
            <Text style={s.summaryCardLabel}>VERIFIED DETAILS</Text>
            {summary.map(({ label, value }) =>
              value ? (
                <View key={label} style={s.summaryRow}>
                  <Text style={s.summaryKey}>{label}</Text>
                  <Text style={s.summaryValue}>{value}</Text>
                </View>
              ) : null
            )}
          </View>
        )}

        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: meta.accent, marginTop: 32 }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={s.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderError = () => (
    <View style={s.centeredScreen}>
      <View style={s.errorRing}>
        <View style={s.errorInner}>
          <Text style={s.errorX}>✕</Text>
        </View>
      </View>

      <Text style={s.errorTitle}>Verification Failed</Text>
      <Text style={s.errorMessage}>{errorMessage || 'Something went wrong. Please try again.'}</Text>

      <TouchableOpacity
        style={[s.primaryBtn, { backgroundColor: '#3B6FE8', marginTop: 8 }]}
        onPress={() => {
          setErrorMessage('');
          transition(
            source === 'nadra'
              ? 'nadra_form'
              : source === 'hec'
              ? 'hec_form'
              : source === 'au'
              ? 'au_form'
              : 'source_select'
          );
        }}
        activeOpacity={0.8}
      >
        <Text style={s.primaryBtnText}>Try Again</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.ghostBtn}
        onPress={() => transition('source_select')}
      >
        <Text style={s.ghostBtnText}>Use a different source</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Root render ──────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      case 'source_select':     return renderSourceSelect();
      case 'nadra_form':        return renderNadraForm();
      case 'nadra_otp':         return renderNadraOtp();
      case 'hec_form':          return renderHecForm();
      case 'au_form':           return renderAuForm();
      case 'au_otp':            return renderAuOtp();
      case 'linkedin_webview':  return renderLinkedInWebView();
      case 'processing':        return renderProcessing();
      case 'success':           return renderSuccess();
      case 'error':             return renderError();
    }
  };

  return (
    <View style={s.screen}>
      {/* Dismiss handle (modal mode) */}
      {step === 'source_select' && (
        <View style={s.dragHandle}>
          <View style={s.dragBar} />
          <TouchableOpacity style={s.dismissBtn} onPress={() => navigation.goBack()}>
            <Text style={s.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <Animated.View style={[s.flex, { opacity: fadeAnim }]}>
        {renderStep()}
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Layout
  screen: {
    flex: 1,
    backgroundColor: '#0C0E13',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },

  // Drag handle / dismiss row
  dragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  dragBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#252C3D',
    marginRight: 12,
  },
  dismissBtn: {
    padding: 6,
  },
  dismissText: {
    color: '#525A72',
    fontSize: 18,
    fontWeight: '400',
  },

  // Source select
  sectionHeader: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#EEF0F6',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#8B92A8',
    lineHeight: 22,
  },

  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13161E',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  sourceIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sourceIcon: {
    fontSize: 24,
  },
  sourceCardContent: {
    flex: 1,
  },
  sourceCardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EEF0F6',
    marginBottom: 3,
  },
  sourceCardDesc: {
    fontSize: 13,
    color: '#8B92A8',
    lineHeight: 18,
  },
  sourceChevron: {
    fontSize: 22,
    marginLeft: 8,
    fontWeight: '300',
  },

  // Back button
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 20,
  },
  backBtnChevron: {
    fontSize: 28,
    color: '#8B92A8',
    lineHeight: 28,
    marginRight: 4,
  },
  backBtnText: {
    fontSize: 16,
    color: '#8B92A8',
  },

  // Form header
  formHeader: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  formHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  formHeaderEmoji: {
    fontSize: 32,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#EEF0F6',
    textAlign: 'center',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#8B92A8',
    textAlign: 'center',
  },

  // OTP header
  otpHeader: {
    paddingTop: 4,
    paddingBottom: 28,
  },

  // Input
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8B92A8',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inputBox: {
    backgroundColor: '#0A0C10',
    borderWidth: 1,
    borderColor: '#252C3D',
    borderRadius: 8,
  },
  inputBoxFocused: {
    borderColor: '#3B6FE8',
  },
  inputBoxError: {
    borderColor: '#EF4444',
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#EEF0F6',
  },
  inputError: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  inputHint: {
    fontSize: 12,
    color: '#525A72',
    marginTop: 4,
  },

  // University dropdown
  dropdown: {
    backgroundColor: '#13161E',
    borderWidth: 1,
    borderColor: '#252C3D',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2330',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#EEF0F6',
  },

  // Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#261D07',
    borderWidth: 1,
    borderColor: '#4D3A0E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  warningBannerIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  warningBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#F59E0B',
    lineHeight: 19,
  },

  // Trust note
  trustNote: {
    backgroundColor: '#071B29',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    marginTop: 4,
  },
  trustNoteText: {
    fontSize: 12,
    color: '#525A72',
    lineHeight: 18,
  },

  // Primary button
  primaryBtn: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.2,
  },

  // Ghost button
  ghostBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  ghostBtnText: {
    fontSize: 14,
    color: '#8B92A8',
    textDecorationLine: 'underline',
  },

  // WebView
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#13161E',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2330',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 52 : 12,
  },
  webViewClose: {
    width: 40,
    alignItems: 'flex-start',
  },
  webViewCloseText: {
    fontSize: 18,
    color: '#8B92A8',
  },
  webViewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EEF0F6',
  },
  webViewLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    inset: 0,
  },

  // Centred screens (processing, success, error)
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },

  // Processing
  processingIconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingIcon: {
    fontSize: 40,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#EEF0F6',
    marginTop: 20,
    textAlign: 'center',
  },
  processingSubtitle: {
    fontSize: 14,
    color: '#525A72',
    marginTop: 6,
    textAlign: 'center',
  },

  // Success
  successRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCheckmark: {
    fontSize: 32,
    color: '#22C55E',
    fontWeight: '300',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#EEF0F6',
    marginTop: 20,
    letterSpacing: -0.3,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#8B92A8',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 21,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: '#13161E',
    borderWidth: 1,
    borderColor: '#252C3D',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  summaryCardLabel: {
    fontSize: 10,
    color: '#525A72',
    letterSpacing: 1.5,
    marginBottom: 12,
    fontVariant: ['small-caps'],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2330',
  },
  summaryKey: {
    fontSize: 13,
    color: '#8B92A8',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#EEF0F6',
    maxWidth: '55%',
    textAlign: 'right',
  },

  // Error
  errorRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#4A1515',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#250F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorX: {
    fontSize: 30,
    color: '#EF4444',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#EEF0F6',
    marginTop: 20,
  },
  errorMessage: {
    fontSize: 14,
    color: '#8B92A8',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
    lineHeight: 21,
    paddingHorizontal: 8,
  },
});
