// ConsentSheet — docs/DESIGN.md §5.2 (SCR-008). Based on the EUDI wallet
// "Request → Share" screen and the Microsoft Authenticator approve push.
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, useBottomSheetSpringConfigs, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, EyeOff, Fingerprint, ShieldCheck, TimerOff, CircleX } from 'lucide-react-native';
import { predicateLabel } from '@nexusid/types';
import { predicateSentence, PRIVACY_LINE } from '../lib/copy';
import { alpha, colors, fonts, icon, motion, radius, sheetShadow, space } from '../styles/tokens';
import { Button, ConfirmDialog, CountdownRing, Divider, Text } from '../ui';

export interface ConsentCredential {
  categoryLabel: string;
  issuerName: string;
  expiry: string; // MM/YYYY
}

interface Props {
  verifierName: string;
  verifierDomain: string | null;
  predicate: string;
  /** Issuer that can confirm the predicate (shown under the code). */
  issuerName: string;
  /** Credential that will be used, or null when none can confirm it (FR-025). */
  credential: ConsentCredential | null;
  neverShared: string[];
  remaining: number;
  approving?: boolean;
  declining?: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onClose: () => void;
  onAddCredential?: () => void;
}

export function ConsentSheet(p: Props) {
  const insets = useSafeAreaInsets();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const expired = p.remaining <= 0;
  const missing = !p.credential;
  const animationConfigs = useBottomSheetSpringConfigs({ ...motion.sheetSpring, overshootClamping: true });
  const initial = useMemo(() => p.verifierName.trim().charAt(0).toUpperCase() || '?', [p.verifierName]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.72} pressBehavior="none" />,
    [],
  );

  return (
    <>
      <BottomSheet
        index={0}
        enableDynamicSizing
        enablePanDownToClose={false}
        animationConfigs={animationConfigs}
        backdropComponent={renderBackdrop}
        backgroundStyle={s.sheetBg}
        handleIndicatorStyle={s.handle}
        style={sheetShadow}
        accessibilityLabel={`Verification request from ${p.verifierName}`}
      >
        <BottomSheetView style={[s.content, { paddingBottom: insets.bottom + space[5] }]}>
          {/* Requester */}
          <View style={[s.row, expired && s.greyed]}>
            <View style={s.avatar}>
              <Text style={{ fontFamily: fonts.displayBold, fontSize: 20, color: colors.text }}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="sectionTitle" style={{ fontSize: 18 }} accessibilityRole="header" numberOfLines={1}>
                {p.verifierName}
              </Text>
              <View style={s.domainRow}>
                <ShieldCheck size={14} color={colors.success} strokeWidth={2} />
                <Text variant="bodySmall" numberOfLines={1}>
                  {p.verifierDomain ? `${p.verifierDomain} · ` : ''}Registered verifier
                </Text>
              </View>
            </View>
            {!expired ? <CountdownRing remaining={p.remaining} /> : null}
          </View>

          <Text variant="body" color={colors.text} style={[{ marginTop: space[4] }, expired && s.greyed]}>
            {p.verifierName} wants to confirm {predicateSentence(p.predicate)}.
          </Text>

          <Divider />

          {/* Will be confirmed */}
          <View style={expired && s.greyed}>
            <Text variant="eyebrow" style={{ marginBottom: space[3] }}>
              Will be confirmed
            </Text>
            <View style={s.claimRow}>
              <View style={[s.checkTile, { backgroundColor: alpha(colors.success, 0.1), borderColor: alpha(colors.success, 0.25) }]}>
                <Check size={icon.inline} color={colors.success} strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ fontSize: 16 }}>
                  {predicateLabel(p.predicate)}
                </Text>
                <Text variant="mono" style={{ marginTop: 2 }}>
                  {p.predicate}
                  <Text variant="bodySmall" style={{ fontSize: 12 }}>
                    {'  ·  '}from {p.issuerName}
                  </Text>
                </Text>
              </View>
              <Text variant="label" color={colors.success} accessibilityLabel="Answer shared: yes">
                Yes
              </Text>
            </View>
          </View>

          <Divider />

          {/* Never shared */}
          <View style={expired && s.greyed}>
            <Text variant="eyebrow" style={{ marginBottom: space[3] }}>
              Never shared
            </Text>
            <View style={s.claimRow}>
              <View style={s.checkTile}>
                <EyeOff size={icon.inline} color={colors.textMuted} strokeWidth={icon.stroke} />
              </View>
              <Text variant="bodySmall" style={{ flex: 1 }}>
                {p.neverShared.join(' · ')}
              </Text>
            </View>
            <Text variant="bodySmall" color={colors.textMuted} style={{ marginTop: space[3] }}>
              {PRIVACY_LINE}
            </Text>
          </View>

          <Divider />

          {/* Credential used / state banners */}
          {expired ? (
            <View style={[s.banner, { borderColor: alpha(colors.warning, 0.25), backgroundColor: alpha(colors.warning, 0.1) }]} accessibilityLiveRegion="polite">
              <TimerOff size={icon.nav} color={colors.warning} strokeWidth={icon.stroke} />
              <View style={{ flex: 1 }}>
                <Text variant="label" color={colors.warning}>
                  Request expired
                </Text>
                <Text variant="bodySmall">Nothing was shared. Start again from {p.verifierName}.</Text>
              </View>
            </View>
          ) : missing ? (
            <View style={[s.banner, { borderColor: alpha(colors.danger, 0.25), backgroundColor: alpha(colors.danger, 0.1) }]}>
              <CircleX size={icon.nav} color={colors.danger} strokeWidth={icon.stroke} />
              <View style={{ flex: 1 }}>
                <Text variant="label" color={colors.danger}>
                  No credential can confirm this
                </Text>
                <Text variant="bodySmall">Add a credential from {p.issuerName} first.</Text>
              </View>
            </View>
          ) : (
            <Text variant="bodySmall">
              Using: <Text variant="bodySmall" color={colors.text}>{p.credential!.categoryLabel}</Text> · {p.credential!.issuerName} · exp {p.credential!.expiry}
            </Text>
          )}

          {/* Actions */}
          <View style={[s.actions]}>
            {expired ? (
              <Button label="Close" variant="secondary" onPress={p.onClose} style={{ flex: 1 }} />
            ) : missing ? (
              <>
                <Button label="Decline" variant="secondary" onPress={() => setConfirmDecline(true)} style={{ flex: 1 }} loading={p.declining} />
                {p.onAddCredential ? <Button label="Add credential" onPress={p.onAddCredential} style={{ flex: 2 }} /> : null}
              </>
            ) : (
              <>
                <Button label="Decline" variant="secondary" onPress={() => setConfirmDecline(true)} disabled={p.approving} loading={p.declining} style={{ flex: 1 }} />
                <Button
                  label="Approve with fingerprint"
                  Icon={Fingerprint}
                  onPress={p.onApprove}
                  loading={p.approving}
                  disabled={p.declining}
                  style={{ flex: 2 }}
                />
              </>
            )}
          </View>
        </BottomSheetView>
      </BottomSheet>

      <ConfirmDialog
        visible={confirmDecline}
        title={`Decline request from ${p.verifierName}?`}
        body={`${p.verifierName} will be told you declined. Nothing about you is shared.`}
        confirmLabel="Decline request"
        destructive
        onCancel={() => setConfirmDecline(false)}
        onConfirm={() => {
          setConfirmDecline(false);
          p.onDecline();
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  sheetBg: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, borderColor: colors.border },
  handle: { backgroundColor: colors.borderStrong, width: 40 },
  content: { paddingHorizontal: space.page, paddingTop: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  avatar: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  domainRow: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: 2 },
  claimRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  checkTile: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.card, padding: space[4] },
  actions: { flexDirection: 'row', gap: space[3], marginTop: space[5] },
  greyed: { opacity: 0.45 },
});
