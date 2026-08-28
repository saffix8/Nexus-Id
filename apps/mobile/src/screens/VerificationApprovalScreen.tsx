/**
 * apps/mobile/src/screens/VerificationApprovalScreen.tsx
 *
 * Critical screen — shown when a push notification triggers a verification request.
 * Handles the full approve/reject flow with biometric auth and proof generation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActivityIndicator, Snackbar, Surface } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CryptoService } from '../services/crypto.service';
import { KeystoreService } from '../services/keystore.service';
import {
  StorageService,
  type PendingVerification,
  type VerificationHistoryRecord,
} from '../services/storage.service';
import type { SDJWTCredential } from '@nexusid/types';

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bgBase:          '#0C0E13',
  bgElevated:      '#13161E',
  bgInset:         '#0A0C10',
  bgOverlay:       '#1A1E28',
  borderSubtle:    '#1E2330',
  borderDefault:   '#252C3D',
  textPrimary:     '#EEF0F6',
  textSecondary:   '#8B92A8',
  textTertiary:    '#525A72',
  accentPrimary:   '#3B6FE8',
  success:         '#22C55E',
  successBg:       '#0F2A1A',
  successBorder:   '#16532F',
  warning:         '#F59E0B',
  warningBg:       '#261D07',
  warningBorder:   '#4D3A0E',
  danger:          '#EF4444',
  dangerBg:        '#250F0F',
  dangerBorder:    '#4A1515',
} as const;

// ─── Navigation types ──────────────────────────────────────────────────────────

export type RootStackParamList = {
  VerificationApproval: { verification_request_id: string };
  [key: string]: object | undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'VerificationApproval'>;

// ─── Trusted verifier domains ──────────────────────────────────────────────────

const TRUSTED_VERIFIER_DOMAINS = new Set([
  'demo-jobportal.nexusid.com',
  'nexusid.com',
  'hec.gov.pk',
  'nadra.gov.pk',
]);

// ─── Credential display helpers ────────────────────────────────────────────────

const CRED_META: Record<
  string,
  { label: string; icon: string; accent: string; accentBg: string }
> = {
  identity:   { label: 'National Identity', icon: '🆔', accent: '#3B82F6', accentBg: '#0D1B35' },
  education:  { label: 'Education',         icon: '🎓', accent: '#8B5CF6', accentBg: '#1A0D35' },
  employment: { label: 'Employment',        icon: '💼', accent: '#0EA5E9', accentBg: '#071B26' },
  enrollment: { label: 'Enrollment',        icon: '🏫', accent: '#10B981', accentBg: '#071E15' },
};

// ─── Screen state machine ──────────────────────────────────────────────────────

type ScreenState =
  | 'loading'
  | 'ready'
  | 'approving'
  | 'success'
  | 'error_not_found'
  | 'error_expired'
  | 'error_no_credential'
  | 'error_network';

// ─── Main Component ────────────────────────────────────────────────────────────

export default function VerificationApprovalScreen({ route, navigation }: Props) {
  const { verification_request_id } = route.params;

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [request, setRequest]             = useState<PendingVerification | null>(null);
  const [credential, setCredential]       = useState<SDJWTCredential | null>(null);
  const [decodedFields, setDecodedFields] = useState<Record<string, unknown>>({});
  const [errorMessage, setErrorMessage]   = useState('');
  const [snackVisible, setSnackVisible]   = useState(false);
  const [snackMessage, setSnackMessage]   = useState('');
  const [timeLeft, setTimeLeft]           = useState<number | null>(null);

  // Success animation values
  const successScale   = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // ── Block hardware back during critical states ──
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screenState === 'approving' || screenState === 'success') return true;
      return false;
    });
    return () => sub.remove();
  }, [screenState]);

  // ── Load on mount ──
  useEffect(() => {
    loadVerificationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Expiry countdown ──
  useEffect(() => {
    if (!request || screenState !== 'ready') return;
    const tick = () => {
      const remaining = Math.floor(
        (new Date(request.expires_at).getTime() - Date.now()) / 1000,
      );
      setTimeLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [request, screenState]);

  // ── Auto-expire when countdown hits 0 ──
  useEffect(() => {
    if (timeLeft !== null && timeLeft <= 0 && screenState === 'ready') {
      setScreenState('error_expired');
    }
  }, [timeLeft, screenState]);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadVerificationData = useCallback(async () => {
    try {
      const storage = StorageService.getInstance();
      const pending = await storage.getPendingVerification(verification_request_id);

      if (!pending) {
        setScreenState('error_not_found');
        return;
      }
      if (new Date(pending.expires_at) < new Date()) {
        setScreenState('error_expired');
        return;
      }

      setRequest(pending);

      const requestedFields = JSON.parse(pending.requested_fields) as string[];
      const matchingCred = await storage.findCredentialForFields(requestedFields);

      if (!matchingCred) {
        setScreenState('error_no_credential');
        return;
      }

      setCredential(matchingCred);

      const crypto  = CryptoService.getInstance();
      const decoded = await crypto.decodeCredentialForDisplay(matchingCred);
      setDecodedFields(decoded);

      setScreenState('ready');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load request.');
      setScreenState('error_network');
    }
  }, [verification_request_id]);

  // ─── Approve flow ──────────────────────────────────────────────────────────

  const handleApprove = useCallback(async () => {
    if (!request || !credential) return;
    setScreenState('approving');

    try {
      // 1. Biometric prompt
      const keystore = KeystoreService.getInstance();
      let signature: string;
      try {
        signature = await keystore.signData(credential.subject, verification_request_id);
      } catch {
        setSnackMessage('Biometric authentication failed or was cancelled.');
        setSnackVisible(true);
        setScreenState('ready');
        return;
      }
      void signature; // used internally by keystore, kept for explicit confirmation

      // 2. Generate selective disclosure proof
      const crypto = CryptoService.getInstance();
      const requestedFields = JSON.parse(request.requested_fields) as string[];

      const proof = await crypto.generateProofForVerification({
        credential,
        requestedFields,
        verifierId: request.verifier_id,
        nonce:      request.nonce,
        userId:     credential.subject,
      });

      // 3. Submit proof to backend
      const res = await fetch(
        'http://10.0.2.2:4000/api/v1/verification/submit-proof',
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ verification_request_id, proof }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`);
      }

      // 4. Update local DB
      const storage = StorageService.getInstance();
      await storage.updatePendingVerificationStatus(verification_request_id, 'approved');

      const historyRecord: VerificationHistoryRecord = {
        id:               `${verification_request_id}_${Date.now()}`,
        credential_id:    credential.id,
        verifier_id:      request.verifier_id,
        verifier_name:    request.verifier_name ?? request.verifier_id,
        disclosed_fields: request.requested_fields,
        timestamp:        new Date().toISOString(),
        status:           'completed',
      };
      await storage.saveVerificationHistory(historyRecord);

      // 5. Play success animation then pop
      setScreenState('success');
      Animated.parallel([
        Animated.spring(successScale,   { toValue: 1, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start(() => setTimeout(() => navigation.goBack(), 1800));

    } catch (err) {
      setSnackMessage(err instanceof Error ? err.message : 'Verification failed.');
      setSnackVisible(true);
      setScreenState('ready');
    }
  }, [request, credential, verification_request_id, navigation, successScale, successOpacity]);

  // ─── Reject flow ───────────────────────────────────────────────────────────

  const handleReject = useCallback(async () => {
    if (!request) {
      navigation.goBack();
      return;
    }
    try {
      await fetch(
        `http://10.0.2.2:4000/api/v1/verification/reject/${verification_request_id}`,
        { method: 'POST' },
      );
    } catch {
      // Fire-and-forget; local state update always runs
    }
    const storage = StorageService.getInstance();
    await storage
      .updatePendingVerificationStatus(verification_request_id, 'rejected')
      .catch(() => {});
    navigation.goBack();
  }, [request, verification_request_id, navigation]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const requestedFields: string[] = request
    ? (JSON.parse(request.requested_fields) as string[])
    : [];

  const allSelectiveFields: string[] =
    credential?.metadata?.selectively_disclosable_fields ?? [];

  const alwaysVisibleFields: string[] =
    credential?.metadata?.always_visible_fields ?? [];

  const hiddenFields = allSelectiveFields.filter(f => !requestedFields.includes(f));
  const isTrusted    = request ? TRUSTED_VERIFIER_DOMAINS.has(request.verifier_id) : false;
  const isExpiringSoon = timeLeft !== null && timeLeft > 0 && timeLeft <= 120;
  const credMeta     = credential ? (CRED_META[credential.type] ?? CRED_META.identity) : null;

  const fieldLabel = (field: string): string =>
    credential?.metadata?.field_labels?.[field] ??
    field.replace(/_/g, ' ');

  const fieldValue = (field: string): string => {
    const val = decodedFields[field];
    return val !== undefined && val !== null ? String(val) : '—';
  };

  // ─── Sub-renders ───────────────────────────────────────────────────────────

  const renderLoading = () => (
    <View style={s.centeredFill}>
      <ActivityIndicator size="large" color={C.accentPrimary} />
      <Text style={s.loadingText}>Loading request…</Text>
    </View>
  );

  const renderError = (icon: string, title: string, body: string) => (
    <View style={s.centeredFill}>
      <Text style={s.errorIcon}>{icon}</Text>
      <Text style={s.errorTitle}>{title}</Text>
      <Text style={s.errorBody}>{body}</Text>
      <TouchableOpacity style={s.dismissBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Text style={s.dismissBtnText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSuccess = () => (
    <View style={s.centeredFill}>
      <Animated.View
        style={[
          s.successCircle,
          { transform: [{ scale: successScale }], opacity: successOpacity },
        ]}
      >
        <Text style={s.successCheckmark}>✓</Text>
      </Animated.View>
      <Animated.Text style={[s.successTitle, { opacity: successOpacity }]}>
        Verified
      </Animated.Text>
      <Animated.Text style={[s.successSub, { opacity: successOpacity }]}>
        Your proof was sent successfully
      </Animated.Text>
    </View>
  );

  const renderApproving = () => (
    <View style={s.centeredFill}>
      <ActivityIndicator size="large" color={C.accentPrimary} />
      <Text style={s.loadingText}>Generating proof…</Text>
      <Text style={s.loadingSubText}>Signing with your private key</Text>
    </View>
  );

  // ─── State routing ─────────────────────────────────────────────────────────

  if (screenState === 'loading')
    return <View style={s.container}>{renderLoading()}</View>;
  if (screenState === 'success')
    return <View style={s.container}>{renderSuccess()}</View>;
  if (screenState === 'approving')
    return <View style={s.container}>{renderApproving()}</View>;
  if (screenState === 'error_not_found')
    return <View style={s.container}>{renderError('🔍', 'Request Not Found', 'This verification request no longer exists or has already been handled.')}</View>;
  if (screenState === 'error_expired')
    return <View style={s.container}>{renderError('⏱️', 'Request Expired', 'This request timed out. Ask the website to send a new verification request.')}</View>;
  if (screenState === 'error_no_credential')
    return <View style={s.container}>{renderError('🔒', 'No Matching Credential', "You don't have a credential covering the requested fields. Add one first.")}</View>;
  if (screenState === 'error_network')
    return <View style={s.container}>{renderError('📡', 'Failed to Load', errorMessage || 'Could not load the request. Check your connection.')}</View>;

  // ─── Ready state ───────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* HEADER */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Verification Request</Text>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={handleReject}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Reject and close"
        >
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* EXPIRY WARNING */}
      {isExpiringSoon && (
        <View style={s.expiryBanner}>
          <Text style={s.expiryIcon}>⏱</Text>
          <Text style={s.expiryText}>
            Expires in {timeLeft}s — please respond quickly
          </Text>
        </View>
      )}

      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* VERIFIER CARD */}
        <Surface style={s.verifierCard} elevation={0}>
          <View style={s.verifierRow}>
            <View style={s.verifierAvatar}>
              <Text style={s.verifierAvatarText}>
                {(request?.verifier_name ?? request?.verifier_id ?? '?')
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={s.verifierInfo}>
              <Text style={s.verifierName}>
                {request?.verifier_name ?? request?.verifier_id}
              </Text>
              <Text style={s.verifierDomain}>{request?.verifier_id}</Text>
            </View>
            {isTrusted ? (
              <View style={s.trustedBadge}>
                <Text style={s.trustedBadgeText}>✓ Trusted</Text>
              </View>
            ) : (
              <View style={s.unknownBadge}>
                <Text style={s.unknownBadgeText}>⚠ Unknown</Text>
              </View>
            )}
          </View>
          {!isTrusted && (
            <View style={s.unknownWarning}>
              <Text style={s.unknownWarningText}>
                This verifier is not in the NexusID trusted registry. Verify the
                website URL before approving.
              </Text>
            </View>
          )}
        </Surface>

        {/* WILL BE SHARED */}
        <View style={s.sectionBlock}>
          <Text style={s.sectionLabel}>WILL BE SHARED</Text>

          {requestedFields.map(field => (
            <View key={field} style={s.fieldRow}>
              <View style={s.checkIcon}>
                <Text style={s.checkIconText}>✓</Text>
              </View>
              <View style={s.fieldTextBlock}>
                <Text style={s.fieldKey}>{fieldLabel(field)}</Text>
                <Text style={s.fieldValue}>{fieldValue(field)}</Text>
              </View>
            </View>
          ))}

          {/* Always-visible claims are implicitly included */}
          {alwaysVisibleFields.map(field => (
            <View key={`av_${field}`} style={s.fieldRow}>
              <View style={s.checkIcon}>
                <Text style={s.checkIconText}>✓</Text>
              </View>
              <View style={s.fieldTextBlock}>
                <Text style={s.fieldKey}>{fieldLabel(field)}</Text>
                <Text style={[s.fieldValue, s.fieldValueMuted]}>Always visible</Text>
              </View>
            </View>
          ))}
        </View>

        {/* WILL STAY HIDDEN */}
        {hiddenFields.length > 0 && (
          <View style={s.sectionBlock}>
            <Text style={s.sectionLabel}>WILL STAY HIDDEN</Text>
            {hiddenFields.map(field => (
              <View key={field} style={[s.fieldRow, s.fieldRowHidden]}>
                <View style={s.lockIcon}>
                  <Text style={s.lockIconText}>🔒</Text>
                </View>
                <View style={s.fieldTextBlock}>
                  <Text style={[s.fieldKey, s.fieldKeyHidden]}>{fieldLabel(field)}</Text>
                  <Text style={s.fieldValueRedacted}>••••••</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* CREDENTIAL CHIP */}
        {credential && credMeta && (
          <View
            style={[
              s.credentialChip,
              {
                backgroundColor: credMeta.accentBg,
                borderColor:     `${credMeta.accent}30`,
              },
            ]}
          >
            <View style={s.credentialChipLeft}>
              <Text style={s.credentialChipIcon}>{credMeta.icon}</Text>
              <View>
                <Text style={s.credentialChipLabel}>USING CREDENTIAL</Text>
                <Text style={[s.credentialChipName, { color: credMeta.accent }]}>
                  {credential.display_name ?? credMeta.label}
                </Text>
              </View>
            </View>
            <Text style={[s.credentialChipIssuer, { color: `${credMeta.accent}80` }]}>
              {credential.issuer}
            </Text>
          </View>
        )}

      </ScrollView>

      {/* ACTION BUTTONS */}
      <View style={s.actions}>
        <TouchableOpacity
          style={s.rejectButton}
          onPress={handleReject}
          activeOpacity={0.8}
          accessibilityLabel="Reject verification"
          accessibilityRole="button"
        >
          <Text style={s.rejectButtonText}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.approveButton}
          onPress={handleApprove}
          activeOpacity={0.8}
          accessibilityLabel="Approve and sign verification"
          accessibilityRole="button"
        >
          <Text style={s.approveButtonText}>Approve & Sign</Text>
        </TouchableOpacity>
      </View>

      {/* SNACKBAR */}
      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={4000}
        style={s.snackbar}
      >
        <Text style={s.snackbarText}>{snackMessage}</Text>
      </Snackbar>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: C.bgBase,
  },
  centeredFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: C.bgBase,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
    backgroundColor: C.bgBase,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.bgOverlay,
    borderWidth: 1,
    borderColor: C.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: C.textSecondary,
  },

  // Expiry warning
  expiryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: C.warningBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  expiryIcon: {
    fontSize: 14,
  },
  expiryText: {
    fontSize: 13,
    color: C.warning,
    fontWeight: '500',
  },

  // Verifier card
  verifierCard: {
    backgroundColor: C.bgElevated,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.borderDefault,
  },
  verifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  verifierAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.bgOverlay,
    borderWidth: 1,
    borderColor: C.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifierAvatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: C.textPrimary,
  },
  verifierInfo: {
    flex: 1,
  },
  verifierName: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 2,
  },
  verifierDomain: {
    fontSize: 12,
    color: C.textTertiary,
  },
  trustedBadge: {
    backgroundColor: C.successBg,
    borderWidth: 1,
    borderColor: C.successBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trustedBadgeText: {
    fontSize: 11,
    color: C.success,
    fontWeight: '600',
  },
  unknownBadge: {
    backgroundColor: C.warningBg,
    borderWidth: 1,
    borderColor: C.warningBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unknownBadgeText: {
    fontSize: 11,
    color: C.warning,
    fontWeight: '600',
  },
  unknownWarning: {
    marginTop: 12,
    padding: 10,
    backgroundColor: C.warningBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.warningBorder,
  },
  unknownWarningText: {
    fontSize: 12,
    color: C.warning,
    lineHeight: 18,
  },

  // Section blocks
  sectionBlock: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textTertiary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },

  // Field rows
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  fieldRowHidden: {
    opacity: 0.55,
  },
  fieldTextBlock: {
    flex: 1,
  },
  fieldKey: {
    fontSize: 11,
    color: C.textSecondary,
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  fieldKeyHidden: {
    color: C.textTertiary,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textPrimary,
  },
  fieldValueMuted: {
    color: C.textTertiary,
    fontStyle: 'italic',
    fontWeight: '400',
  },
  fieldValueRedacted: {
    fontSize: 14,
    color: C.textTertiary,
    letterSpacing: 3,
  },

  // Icons
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.successBg,
    borderWidth: 1,
    borderColor: C.successBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconText: {
    fontSize: 11,
    color: C.success,
    fontWeight: '700',
  },
  lockIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.bgOverlay,
    borderWidth: 1,
    borderColor: C.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIconText: {
    fontSize: 10,
  },

  // Credential chip
  credentialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },
  credentialChipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  credentialChipIcon: {
    fontSize: 22,
  },
  credentialChipLabel: {
    fontSize: 9,
    color: C.textTertiary,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  credentialChipName: {
    fontSize: 14,
    fontWeight: '600',
  },
  credentialChipIssuer: {
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Action buttons
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: C.borderSubtle,
    backgroundColor: C.bgBase,
  },
  rejectButton: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.dangerBorder,
    backgroundColor: C.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.danger,
  },
  approveButton: {
    flex: 2,
    height: 52,
    borderRadius: 10,
    backgroundColor: C.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Loading / error
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: C.textSecondary,
    fontWeight: '500',
  },
  loadingSubText: {
    marginTop: 6,
    fontSize: 13,
    color: C.textTertiary,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  dismissBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderDefault,
  },
  dismissBtnText: {
    fontSize: 15,
    color: C.textSecondary,
    fontWeight: '500',
  },

  // Success
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.successBg,
    borderWidth: 2,
    borderColor: C.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successCheckmark: {
    fontSize: 44,
    color: C.success,
    fontWeight: '700',
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  successSub: {
    fontSize: 15,
    color: C.textSecondary,
  },

  // Snackbar
  snackbar: {
    backgroundColor: C.bgElevated,
    borderWidth: 1,
    borderColor: C.borderDefault,
  },
  snackbarText: {
    color: C.textPrimary,
    fontSize: 14,
  },
});
