// SCR-008 Verification request (FR-020, FR-021) — hosts the ConsentSheet.
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiService, type PendingRequestDTO } from '../services/api.service';
import { ConsentSheet } from '../components/ConsentSheet';
import { buildProof, checkRequest, ProofStepError } from '../lib/proof';
import { useAuthStore } from '../store/auth.store';
import { categoryMeta, categoryOfPredicate, NEVER_SHARED } from '../lib/category';
import { formatExpiry, hostOf } from '../lib/format';
import { errorMessage, pickCredentialFor } from '../lib/wallet';
import type { RootStackParamList } from '../navigation/types';
import { useCredentialsStore } from '../store/credentials.store';
import { useSessionStore } from '../store/session.store';
import { timing } from '../styles/tokens';
import { ErrorState, Screen, Spinner, toast } from '../ui';
import { colors } from '../styles/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Request'>;

function secondsLeft(r: PendingRequestDTO | undefined): number {
  return r ? Math.max(0, Math.ceil((Date.parse(r.expiresAt) - Date.now()) / 1000)) : 0;
}

export function RequestScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const fromStore = useSessionStore(s => s.pending.find(p => p.requestId === requestId));
  const [request, setRequest] = useState<PendingRequestDTO | undefined>(fromStore);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(() => secondsLeft(fromStore));
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const { credentials, revoked, loaded, loadCredentials } = useCredentialsStore();

  useEffect(() => {
    useSessionStore.getState().markSeen(requestId);
    if (!loaded) void loadCredentials();
  }, [requestId, loaded, loadCredentials]);

  // Not in the poll cache (e.g. opened from a notification) — fetch it.
  useEffect(() => {
    if (request) return;
    apiService
      .getPendingRequests()
      .then(rows => {
        useSessionStore.getState().setPending(rows);
        const r = rows.find(x => x.requestId === requestId);
        if (r) setRequest(r);
        else setLoadError('This request is no longer waiting — it was answered or it expired.');
      })
      .catch(err => setLoadError(errorMessage(err, 'Could not load the request.')));
  }, [request, requestId]);

  // 120 s countdown (ALG-005 closes the session server-side at 0).
  useEffect(() => {
    if (!request) return;
    const tick = () => setRemaining(secondsLeft(request));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [request]);

  useEffect(() => {
    if (remaining === timing.warnAtSec || remaining === timing.dangerAtSec) AccessibilityInfo.announceForAccessibility(`${remaining} seconds left to answer`);
    if (request && remaining === 0) AccessibilityInfo.announceForAccessibility('Request expired');
  }, [remaining, request]);

  if (loadError) {
    return (
      <Screen onBack={navigation.goBack} title="Request">
        <ErrorState title="Request unavailable" message={loadError} onRetry={() => navigation.goBack()} />
      </Screen>
    );
  }
  if (!request || !loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,6,9,0.6)' }}>
        <Spinner color={colors.accentText} size={28} />
      </View>
    );
  }

  const category = categoryOfPredicate(request.predicate) ?? 'identity';
  const issuer = categoryMeta(category);
  const credential = pickCredentialFor(request.predicate, credentials, revoked);

  async function approve() {
    if (!credential || !request) return;
    const userId = useAuthStore.getState().userId;
    if (!userId) return;
    setApproving(true);
    try {
      // Step 1 (check) + step 2 (generate). Signing with the Keystore key opens
      // the fingerprint prompt — the in-app auth before approving (FR-015 → FR-021).
      checkRequest(request, credential, revoked);
      const proof = await buildProof(request, credential, userId);
      useSessionStore.getState().setPrepared({ requestId: request.requestId, credentialId: credential.id, proof });
      navigation.replace('Proof', { requestId: request.requestId, credentialId: credential.id });
    } catch (err) {
      setApproving(false);
      if (err instanceof ProofStepError && err.cancelled) return; // prompt dismissed — stay on the sheet
      toast(errorMessage(err, 'Could not approve this request.'), 'error');
    }
  }

  async function decline() {
    if (!request) return;
    setDeclining(true);
    try {
      // No usable credential → API-037 (FR-025); otherwise API-036 decline (FR-023).
      if (credential) await apiService.rejectVerification(request.requestId);
      else await apiService.failVerification(request.requestId);
      toast('Request declined');
    } catch (err) {
      toast(errorMessage(err, 'Could not send your answer.'), 'error');
    } finally {
      useSessionStore.getState().setPending(useSessionStore.getState().pending.filter(p => p.requestId !== request.requestId));
      navigation.goBack();
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ConsentSheet
        verifierName={request.verifierName}
        verifierDomain={request.verifierDomain ?? hostOf(request.pageUrl)}
        predicate={request.predicate}
        issuerName={issuer.issuerName}
        credential={credential ? { categoryLabel: issuer.label, issuerName: issuer.issuerName, expiry: formatExpiry(credential.expires_at) } : null}
        neverShared={NEVER_SHARED[category]}
        remaining={remaining}
        approving={approving}
        declining={declining}
        onApprove={approve}
        onDecline={decline}
        onClose={navigation.goBack}
        onAddCredential={() => navigation.replace('AddCredential', { category })}
      />
    </View>
  );
}
