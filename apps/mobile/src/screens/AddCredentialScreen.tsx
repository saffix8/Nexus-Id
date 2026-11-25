// SCR-004 Add credential + SCR-005 attribute entry (FR-006, FR-007).
// State machine: pick source → form (→ OTP for NADRA) → processing → success | error.
// Requests go to the issuer for the chosen category (BR-010); the issued
// SD-JWT is stored only on this phone.
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ChevronRight,
  CircleX,
  ExternalLink,
} from 'lucide-react-native';
import { predicateLabel, type CredentialType, type SDJWTCredential } from '@nexusid/types';
import { apiService } from '../services/api.service';
import { CredentialCard } from '../components/CredentialCard';
import { AnimatedCheck } from '../components/AnimatedCheck';
import { CATEGORY_ORDER, categoryMeta, predicatesFor } from '../lib/category';
import { errorMessage } from '../lib/wallet';
import type { RootStackParamList } from '../navigation/types';
import { useCredentialsStore } from '../store/credentials.store';
import {
  alpha,
  colors,
  fonts,
  icon,
  motion,
  radius,
  space,
} from '../styles/tokens';
import { MAX_CONTENT } from '../styles/layout';
import { Button, IconTile, Screen, Spinner, Text, TextField, toast } from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'AddCredential'>;

type Step =
  | { id: 'pick' }
  | { id: 'form'; category: CredentialType }
  | { id: 'otp'; sessionId: string; phone: string }
  | {
      id: 'processing';
      category: CredentialType;
      message: string;
      cancellable?: boolean;
    }
  | { id: 'success'; credential: SDJWTCredential }
  | { id: 'error'; category: CredentialType; message: string };

const SHORT_ISSUER: Record<CredentialType, string> = {
  identity: 'NADRA',
  education: 'HEC',
  enrollment: 'Air University',
  employment: 'LinkedIn',
};
const SOURCE_HINT: Record<CredentialType, string> = {
  identity: 'CNIC and mobile number, then a one-time code',
  education: 'Degree number and university',
  enrollment: 'Air University portal sign-in',
  employment: 'Sign in with LinkedIn',
};

export function AddCredentialScreen({ route, navigation }: Props) {
  const initial = route.params?.category;
  const [step, setStep] = useState<Step>(
    initial ? { id: 'form', category: initial } : { id: 'pick' },
  );
  const addCredential = useCredentialsStore(s => s.addCredential);
  const cancelRef = useRef(false);

  async function finish(
    category: CredentialType,
    issue: () => Promise<{ credential?: SDJWTCredential } | undefined>,
  ) {
    cancelRef.current = false;
    setStep({
      id: 'processing',
      category,
      message: `Verifying with ${SHORT_ISSUER[category]}…`,
    });
    try {
      const res = await issue();
      if (cancelRef.current) return;
      if (!res?.credential)
        throw new Error(
          `${SHORT_ISSUER[category]} did not return a credential.`,
        );
      await addCredential(res.credential);
      setStep({ id: 'success', credential: res.credential });
    } catch (err) {
      if (!cancelRef.current)
        setStep({
          id: 'error',
          category,
          message: errorMessage(
            err,
            `${SHORT_ISSUER[category]} could not verify these details.`,
          ),
        });
    }
  }

  const back = () => {
    if (step.id === 'form' && !initial) setStep({ id: 'pick' });
    else if (step.id === 'otp') setStep({ id: 'form', category: 'identity' });
    else if (step.id === 'processing' && step.cancellable) {
      cancelRef.current = true;
      setStep({ id: 'form', category: step.category });
    } else navigation.goBack();
  };

  const title =
    step.id === 'pick'
      ? 'Add credential'
      : step.id === 'form'
        ? categoryMeta(step.category).label
        : step.id === 'otp'
          ? 'Enter code'
          : step.id === 'success'
            ? 'Credential added'
            : '';

  return (
    <Screen
      onBack={step.id === 'processing' && !step.cancellable ? undefined : back}
      title={title}
      eyebrow={
        step.id === 'form' ? categoryMeta(step.category).issuerName : undefined
      }
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {step.id === 'pick' && (
            <PickSource
              onPick={category => setStep({ id: 'form', category })}
            />
          )}

          {step.id === 'form' && step.category === 'identity' && (
            <NadraForm
              onSubmit={async (cnic, phone) => {
                setStep({
                  id: 'processing',
                  category: 'identity',
                  message: 'Contacting NADRA…',
                });
                try {
                  const { session_id } = await apiService.nadraVerify(
                    cnic,
                    phone,
                  );
                  setStep({ id: 'otp', sessionId: session_id, phone });
                } catch (err) {
                  setStep({
                    id: 'error',
                    category: 'identity',
                    message: errorMessage(
                      err,
                      'NADRA could not start verification.',
                    ),
                  });
                }
              }}
            />
          )}
          {step.id === 'otp' && (
            <OtpForm
              phone={step.phone}
              onSubmit={otp =>
                finish('identity', () =>
                  apiService.nadraVerifyOtp(step.sessionId, otp),
                )
              }
            />
          )}
          {step.id === 'form' && step.category === 'education' && (
            <HecForm
              onSubmit={body =>
                finish('education', () => apiService.hecVerify(body))
              }
            />
          )}
          {step.id === 'form' && step.category === 'enrollment' && (
            <AuForm
              onSubmit={body =>
                finish('enrollment', () => apiService.auScrape(body))
              }
            />
          )}
          {step.id === 'form' && step.category === 'employment' && (
            <LinkedInForm
              onStart={async () => {
                cancelRef.current = false;
                try {
                  const { auth_url } = await apiService.linkedinAuthUrl();
                  await Linking.openURL(auth_url);
                  setStep({
                    id: 'processing',
                    category: 'employment',
                    message: 'Waiting for LinkedIn…',
                    cancellable: true,
                  });
                  const deadline = Date.now() + 120_000;
                  while (!cancelRef.current && Date.now() < deadline) {
                    await new Promise<void>(r => setTimeout(r, 2000));
                    if (cancelRef.current) return;
                    const st = await apiService
                      .linkedinStatus()
                      .catch(() => null);
                    if (st?.status === 'completed' && st.credential) {
                      const cred = st.credential;
                      await finish('employment', async () => ({
                        credential: cred,
                      }));
                      return;
                    }
                    if (st?.status === 'failed')
                      throw new Error('LinkedIn sign-in was not completed.');
                  }
                  if (!cancelRef.current)
                    throw new Error(
                      'LinkedIn did not respond in time. Try again.',
                    );
                } catch (err) {
                  if (!cancelRef.current)
                    setStep({
                      id: 'error',
                      category: 'employment',
                      message: errorMessage(
                        err,
                        'Could not start LinkedIn sign-in.',
                      ),
                    });
                }
              }}
            />
          )}

          {step.id === 'processing' && (
            <Processing category={step.category} message={step.message} />
          )}
          {step.id === 'success' && (
            <Success
              credential={step.credential}
              onDone={() => {
                toast('Credential added');
                navigation.navigate('Tabs', { screen: 'Wallet' });
              }}
            />
          )}
          {step.id === 'error' && (
            <Animated.View
              entering={FadeIn.duration(motion.enter)}
              style={s.center}
            >
              <IconTile Icon={CircleX} color={colors.danger} />
              <Text variant="sectionTitle" align="center">
                {SHORT_ISSUER[step.category]} couldn't verify this
              </Text>
              <Text
                variant="bodySmall"
                align="center"
                style={{ maxWidth: 300 }}
              >
                {step.message}
              </Text>
              <View
                style={{
                  alignSelf: 'stretch',
                  gap: space[3],
                  marginTop: space[4],
                }}
              >
                <Button
                  label="Try again"
                  onPress={() =>
                    setStep({ id: 'form', category: step.category })
                  }
                />
                <Button
                  label="Back to wallet"
                  variant="ghost"
                  onPress={() => navigation.goBack()}
                />
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ── Pick source (2×2 category tiles, Google Wallet "Add to wallet") ─────────

function PickSource({ onPick }: { onPick: (c: CredentialType) => void }) {
  return (
    <View style={{ gap: space[5] }}>
      <Text variant="bodySmall" style={{ fontSize: 15, lineHeight: 22 }}>
        Choose who should confirm your details. The credential is issued to this
        phone only.
      </Text>
      <View style={s.list}>
        {CATEGORY_ORDER.map((c, i) => {
          const m = categoryMeta(c);
          return (
            <Animated.View
              key={c}
              entering={FadeInUp.delay(i * motion.stagger).duration(motion.enter)}
              style={i > 0 ? s.listDivider : undefined}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${m.label}, issued by ${m.issuerName}`}
                onPress={() => onPick(c)}
                style={({ pressed }) => [s.source, pressed && { backgroundColor: colors.overlay }]}
              >
                <View
                  style={[
                    s.sourceIcon,
                    { backgroundColor: alpha(m.color, 0.12), borderColor: alpha(m.color, 0.3) },
                  ]}
                >
                  <m.Icon size={20} color={m.color} strokeWidth={icon.stroke} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="label" numberOfLines={1}>
                    {m.issuerName}
                  </Text>
                  <Text variant="bodySmall" numberOfLines={1} color={m.color} style={{ fontSize: 12, lineHeight: 16 }}>
                    {m.label}
                  </Text>
                  <Text variant="bodySmall" numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                    {SOURCE_HINT[c]}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textFaint} strokeWidth={icon.stroke} />
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

function formatCnic(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

function NadraForm({
  onSubmit,
}: {
  onSubmit: (cnic: string, phone: string) => void;
}) {
  const [cnic, setCnic] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<{ cnic?: string; phone?: string }>({});
  const submit = () => {
    const e: typeof err = {};
    if (!/^\d{5}-\d{7}-\d$/.test(cnic))
      e.cnic = 'Enter all 13 digits of your CNIC.';
    if (!/^(\+92|0)?3\d{9}$/.test(phone.replace(/[\s-]/g, '')))
      e.phone = 'Enter a Pakistani mobile number, e.g. 03001234567.';
    setErr(e);
    if (!e.cnic && !e.phone) onSubmit(cnic, phone.replace(/[\s-]/g, ''));
  };
  return (
    <FormFrame category="identity" onSubmit={submit} submitLabel="Send code">
      <TextField
        label="CNIC"
        value={cnic}
        onChangeText={v => setCnic(formatCnic(v))}
        keyboardType="number-pad"
        placeholder="12345-1234567-1"
        mono
        maxLength={15}
        error={err.cnic}
      />
      <TextField
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="03001234567"
        mono
        error={err.phone}
        hint="NADRA sends a 6-digit code to this number."
      />
    </FormFrame>
  );
}

function OtpForm({
  phone,
  onSubmit,
}: {
  phone: string;
  onSubmit: (otp: string) => void;
}) {
  const [otp, setOtp] = useState('');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ gap: space[5] }}>
      <Text variant="body">
        Enter the 6-digit code NADRA sent to{' '}
        <Text
          variant="body"
          color={colors.text}
          style={{ fontFamily: fonts.mono }}
        >
          {phone}
        </Text>
        .
      </Text>
      <Pressable
        onPress={() => input.current?.focus()}
        style={s.otpRow}
        accessibilityLabel={`One-time code, ${otp.length} of 6 digits entered`}
      >
        {Array.from({ length: 6 }, (_, i) => {
          const active = i === Math.min(otp.length, 5);
          return (
            <View
              key={i}
              style={[
                s.otpBox,
                active && { borderColor: colors.accent },
                otp[i] ? { borderColor: colors.borderStrong } : null,
              ]}
            >
              <Text
                style={{
                  fontFamily: fonts.monoMedium,
                  fontSize: 22,
                  color: colors.text,
                }}
              >
                {otp[i] ?? ''}
              </Text>
            </View>
          );
        })}
        <TextInput
          ref={input}
          value={otp}
          onChangeText={v => setOtp(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={6}
          style={s.hiddenInput}
          onSubmitEditing={() => otp.length === 6 && onSubmit(otp)}
        />
      </Pressable>
      <Button
        label="Verify code"
        disabled={otp.length !== 6}
        onPress={() => onSubmit(otp)}
      />
    </View>
  );
}

function HecForm({
  onSubmit,
}: {
  onSubmit: (b: {
    degree_number: string;
    university: string;
    student_name: string;
  }) => void;
}) {
  const [degree, setDegree] = useState('');
  const [uni, setUni] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (
      degree.trim().length < 3 ||
      uni.trim().length < 2 ||
      name.trim().length < 2
    ) {
      setErr('Fill in all three fields as they appear on your degree.');
      return;
    }
    setErr(null);
    onSubmit({
      degree_number: degree.trim(),
      university: uni.trim(),
      student_name: name.trim(),
    });
  };
  return (
    <FormFrame
      category="education"
      onSubmit={submit}
      submitLabel="Verify with HEC"
    >
      <TextField
        label="Degree number"
        value={degree}
        onChangeText={setDegree}
        autoCapitalize="characters"
        placeholder="HEC-2023-001234"
        mono
      />
      <TextField
        label="University"
        value={uni}
        onChangeText={setUni}
        placeholder="Air University"
      />
      <TextField
        label="Name on degree"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        error={err}
      />
    </FormFrame>
  );
}

function AuForm({
  onSubmit,
}: {
  onSubmit: (b: { username: string; password: string }) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (username.trim().length < 2 || password.length < 4) {
      setErr('Enter your portal username and password.');
      return;
    }
    setErr(null);
    onSubmit({ username: username.trim(), password });
  };
  return (
    <FormFrame
      category="enrollment"
      onSubmit={submit}
      submitLabel="Verify with Air University"
    >
      <TextField
        label="Portal username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        placeholder="231987"
        mono
      />
      <TextField
        label="Portal password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={err}
        hint="Used once to read your enrollment. Not stored."
      />
    </FormFrame>
  );
}

function LinkedInForm({ onStart }: { onStart: () => void }) {
  return (
    <FormFrame
      category="employment"
      onSubmit={onStart}
      submitLabel="Continue with LinkedIn"
      submitIcon={ExternalLink}
    >
      <Text variant="body">
        LinkedIn opens in your browser. After you sign in, come back here — the
        credential arrives automatically.
      </Text>
    </FormFrame>
  );
}

function FormFrame({
  category,
  children,
  onSubmit,
  submitLabel,
  submitIcon,
}: {
  category: CredentialType;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel: string;
  submitIcon?: typeof ChevronRight;
}) {
  const m = categoryMeta(category);
  return (
    <Animated.View
      entering={FadeIn.duration(motion.enter)}
      style={{ gap: space[5] }}
    >
      <View
        style={[
          s.formHead,
          {
            borderColor: alpha(m.color, 0.25),
            backgroundColor: alpha(m.color, 0.08),
          },
        ]}
      >
        <m.Icon size={icon.header} color={m.color} strokeWidth={icon.stroke} />
        <Text variant="bodySmall" style={{ flex: 1 }}>
          {m.issuerName} confirms these details and issues a credential to this
          phone. Only predicates like “
          {predicateLabel(predicatesFor(category)[0] ?? '')}” are ever
          shared.
        </Text>
      </View>
      {children}
      <Button label={submitLabel} Icon={submitIcon} onPress={onSubmit} />
    </Animated.View>
  );
}

// ── Processing / success ──────────────────────────────────────────────────────

function Processing({
  category,
  message,
}: {
  category: CredentialType;
  message: string;
}) {
  const m = categoryMeta(category);
  return (
    <View style={s.center} accessibilityLiveRegion="polite">
      <View
        style={[
          s.procTile,
          {
            borderColor: alpha(m.color, 0.3),
            backgroundColor: alpha(m.color, 0.12),
          },
        ]}
      >
        <m.Icon size={40} color={m.color} strokeWidth={icon.stroke} />
        <View style={s.spinner}>
          <Spinner color={m.color} />
        </View>
      </View>
      <Text variant="sectionTitle" align="center">
        {message}
      </Text>
      <Text variant="bodySmall" align="center" style={{ maxWidth: 280 }}>
        This usually takes a few seconds.
      </Text>
    </View>
  );
}

function Success({
  credential,
  onDone,
}: {
  credential: SDJWTCredential;
  onDone: () => void;
}) {
  const { width } = useWindowDimensions();
  const m = categoryMeta(credential.type);
  return (
    <View style={[s.center, { gap: space[5] }]}>
      <AnimatedCheck size={88} />
      <View style={{ gap: space[2] }}>
        <Text variant="pageTitle" align="center">
          Credential added
        </Text>
        <Text variant="bodySmall" align="center">
          {m.issuerName} issued your {m.label} credential. It is stored on this
          phone only.
        </Text>
      </View>
      <Animated.View
        entering={ZoomIn.delay(250).duration(300).springify().damping(18)}
      >
        <CredentialCard
          width={Math.min(width - space.page * 2, MAX_CONTENT)}
          category={credential.type}
          status="valid"
          predicates={predicatesFor(credential.type)}
          credentialId={credential.id}
          expiresAt={credential.expires_at}
        />
      </Animated.View>
      <Button
        label="Go to wallet"
        onPress={onDone}
        style={{ alignSelf: 'stretch' }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, padding: space.page },
  list: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  listDivider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[4],
    minHeight: 76,
  },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formHead: {
    flexDirection: 'row',
    gap: space[3],
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space[4],
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[2],
  },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    paddingVertical: space[8],
  },
  procTile: {
    width: 96,
    height: 96,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 4,
  },
});
