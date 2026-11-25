// SCR-003 Credential Detail (FR-010–FR-014) — Apple Wallet pass detail.
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, RefreshCw, Trash2 } from 'lucide-react-native';
import { predicateLabel } from '@nexusid/types';
import { CredentialCard } from '../components/CredentialCard';
import { categoryMeta, predicatesFor } from '../lib/category';
import { formatDate } from '../lib/format';
import { credentialStatus, errorMessage } from '../lib/wallet';
import { PRIVACY_LINE } from '../lib/copy';
import type { RootStackParamList } from '../navigation/types';
import { useCredentialsStore } from '../store/credentials.store';
import { alpha, colors, space } from '../styles/tokens';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Screen,
  Text,
  toast,
} from '../ui';
import { CircleX } from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'CredentialDetail'>;

export function CredentialDetailScreen({ route, navigation }: Props) {
  const { width } = useWindowDimensions();
  const { credentials, revoked, removeCredential } = useCredentialsStore();
  const cred = credentials.find(c => c.id === route.params.credentialId);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!cred) {
    return (
      <Screen onBack={navigation.goBack} title="Credential">
        <EmptyState
          Icon={CircleX}
          title="Credential not found"
          body="It may have been deleted from this device."
          actionLabel="Back to wallet"
          onAction={navigation.goBack}
        />
      </Screen>
    );
  }

  const meta = categoryMeta(cred.type);
  const status = credentialStatus(cred, revoked);
  const predicates = predicatesFor(cred.type);

  async function onDelete() {
    setDeleting(true);
    try {
      await removeCredential(cred!.id);
      setConfirm(false);
      toast('Credential deleted');
      navigation.goBack();
    } catch (err) {
      setDeleting(false);
      setConfirm(false);
      toast(errorMessage(err, 'Could not delete the credential.'), 'error');
    }
  }

  return (
    <Screen
      onBack={navigation.goBack}
      eyebrow={meta.label}
      title={meta.issuerName}
    >
      <ScrollView
        contentContainerStyle={{ padding: space.page, gap: space[5] }}
      >
        <CredentialCard
          width={width - space.page * 2}
          category={cred.type}
          status={status}
          predicates={predicates}
          credentialId={cred.id}
          expiresAt={cred.expires_at}
        />

        <View>
          <Text variant="eyebrow" style={{ marginBottom: space[3] }}>
            Confirms
          </Text>
          <Card style={{ padding: 0 }}>
            {predicates.map((code, i) => (
              <View key={code} style={[s.predRow, i > 0 && s.rowBorder]}>
                <View
                  style={[
                    s.check,
                    {
                      backgroundColor: alpha(meta.color, 0.12),
                      borderColor: alpha(meta.color, 0.3),
                    },
                  ]}
                >
                  <Check size={14} color={meta.color} strokeWidth={2.5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="label">{predicateLabel(code)}</Text>
                  <Text variant="mono">{code}</Text>
                </View>
              </View>
            ))}
          </Card>
          <Text variant="bodySmall" style={{ marginTop: space[3] }}>
            {PRIVACY_LINE}
          </Text>
        </View>

        <View>
          <Text variant="eyebrow" style={{ marginBottom: space[3] }}>
            Details
          </Text>
          <Card style={{ padding: 0 }}>
            <Row label="Issuer" value={meta.issuerName} sub={cred.issuer} />
            <Row label="Issued" value={formatDate(cred.issued_at)} border />
            <Row
              label="Expires"
              value={formatDate(cred.expires_at)}
              valueColor={status === 'expired' ? colors.danger : undefined}
              border
            />
            <Row label="Credential ID" value={cred.id} mono border />
          </Card>
        </View>

        <View style={{ gap: space[3] }}>
          <Button
            label={
              status === 'valid' ? 'Update credential' : 'Renew credential'
            }
            Icon={RefreshCw}
            variant="secondary"
            onPress={() =>
              navigation.navigate('AddCredential', { category: cred.type })
            }
          />
          <Button
            label="Delete credential"
            Icon={Trash2}
            variant="danger"
            onPress={() => setConfirm(true)}
          />
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirm}
        title="Delete this credential?"
        body={`Your ${meta.label} credential is removed from this phone. Requests that need it will fail until you add it again from ${meta.issuerName}.`}
        confirmLabel="Delete credential"
        destructive
        loading={deleting}
        onCancel={() => setConfirm(false)}
        onConfirm={onDelete}
      />
    </Screen>
  );
}

function Row({
  label,
  value,
  sub,
  mono,
  border,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  border?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={[s.row, border && s.rowBorder]}>
      <Text variant="bodySmall" style={{ width: 110 }}>
        {label}
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text
          variant={mono ? 'mono' : 'label'}
          color={valueColor ?? colors.text}
          align="right"
          selectable={mono}
        >
          {value}
        </Text>
        {sub ? (
          <Text variant="mono" align="right">
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  predRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
});
