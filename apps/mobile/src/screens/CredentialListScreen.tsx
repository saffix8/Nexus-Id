/**
 * apps/mobile/src/screens/CredentialListScreen.tsx
 *
 * Main wallet screen — shows all stored SD-JWT credentials.
 * Sub-component: CredentialCard
 */

import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
  Animated,
  RefreshControl,
  ListRenderItemInfo,
} from 'react-native';
import { Card, Chip, FAB } from 'react-native-paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { SDJWTCredential, CredentialType } from '@nexusid/types';
import { useCredentialsStore } from '../store/credentials.store';

// ─── Navigation types ────────────────────────────────────────────────────────

type RootStackParamList = {
  CredentialList: undefined;
  CredentialDetail: { credentialId: string };
  AddCredential: undefined;
};

type CredentialListNavProp = StackNavigationProp<RootStackParamList, 'CredentialList'>;

// ─── Design tokens (mirrors NEXUSID_DESIGN.md) ────────────────────────────

const C = {
  bgBase:     '#0C0E13',
  bgElevated: '#13161E',
  bgOverlay:  '#1A1E28',
  borderSubtle:  '#1E2330',
  borderDefault: '#252C3D',
  textPrimary:   '#EEF0F6',
  textSecondary: '#8B92A8',
  textTertiary:  '#525A72',
  accentPrimary: '#3B6FE8',
  success:  '#22C55E',
  successBg:'#0F2A1A',
  warning:  '#F59E0B',
  warningBg:'#261D07',
  danger:   '#EF4444',
  dangerBg: '#250F0F',
  // Per credential-type
  identity:   { accent: '#3B82F6', bg: '#0D1B35' },
  education:  { accent: '#8B5CF6', bg: '#1A0D35' },
  employment: { accent: '#0EA5E9', bg: '#071B26' },
  enrollment: { accent: '#10B981', bg: '#071E15' },
} as const;

// ─── Credential metadata map ──────────────────────────────────────────────

interface CredentialMeta {
  icon: string;
  label: string;
  issuer: string;
  accent: string;
  bg: string;
}

const CREDENTIAL_META: Record<CredentialType, CredentialMeta> = {
  identity: {
    icon: '🆔',
    label: 'National Identity',
    issuer: 'NADRA Pakistan',
    accent: C.identity.accent,
    bg: C.identity.bg,
  },
  education: {
    icon: '🎓',
    label: 'Education',
    issuer: 'Higher Education Commission',
    accent: C.education.accent,
    bg: C.education.bg,
  },
  employment: {
    icon: '💼',
    label: 'Employment',
    issuer: 'LinkedIn',
    accent: C.employment.accent,
    bg: C.employment.bg,
  },
  enrollment: {
    icon: '🏫',
    label: 'Enrollment',
    issuer: 'Air University',
    accent: C.enrollment.accent,
    bg: C.enrollment.bg,
  },
};

// ─── Status helper ────────────────────────────────────────────────────────

type CredentialStatus = 'active' | 'expiring' | 'expired';

function getStatus(expiresAt: string): CredentialStatus {
  const exp = new Date(expiresAt).getTime();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (now >= exp) return 'expired';
  if (exp - now <= thirtyDays) return 'expiring';
  return 'active';
}

function formatIssuedDate(issuedAt: string): string {
  const date = new Date(issuedAt);
  return date.toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── CredentialCard ───────────────────────────────────────────────────────

interface CredentialCardProps {
  credential: SDJWTCredential;
  onPress: () => void;
  onLongPress: () => void;
}

function CredentialCard({ credential, onPress, onLongPress }: CredentialCardProps) {
  const meta = CREDENTIAL_META[credential.type];
  const status = getStatus(credential.expires_at);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.975,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  const statusConfig = {
    active:   { label: 'Active',        textColor: C.success,  bgColor: C.successBg, borderColor: '#16532F' },
    expiring: { label: 'Expiring Soon', textColor: C.warning,  bgColor: C.warningBg, borderColor: '#4D3A0E' },
    expired:  { label: 'Expired',       textColor: C.danger,   bgColor: C.dangerBg,  borderColor: '#4A1515' },
  }[status];

  return (
    <Animated.View style={[cc.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${meta.label} credential from ${meta.issuer}`}
      >
        <Card style={[cc.card, { borderColor: C.borderSubtle }]} elevation={0}>
          {/* ── Document header strip ─────────────────────── */}
          <View style={[cc.header, { backgroundColor: meta.bg, borderBottomColor: `${meta.accent}25` }]}>
            {/* Security diagonal pattern overlay — rendered as a repeated pseudo-border */}
            <View style={cc.patternOverlay} pointerEvents="none" />

            <View style={cc.headerContent}>
              {/* Icon badge */}
              <View style={[cc.iconBox, { backgroundColor: `${meta.accent}1A`, borderColor: `${meta.accent}30` }]}>
                <Text style={cc.iconText}>{meta.icon}</Text>
              </View>

              {/* Type + issuer */}
              <View style={cc.headerText}>
                <Text style={[cc.credentialType, { color: meta.accent }]}>
                  {meta.label.toUpperCase()}
                </Text>
                <Text style={cc.issuerName}>{meta.issuer}</Text>
              </View>

              {/* Status badge */}
              <View style={[cc.statusBadge, { backgroundColor: statusConfig.bgColor, borderColor: statusConfig.borderColor }]}>
                <View style={[cc.statusDot, { backgroundColor: statusConfig.textColor }]} />
                <Text style={[cc.statusText, { color: statusConfig.textColor }]}>
                  {statusConfig.label}
                </Text>
              </View>
            </View>

            {/* Bottom accent line */}
            <View style={[cc.headerAccentLine, { backgroundColor: `${meta.accent}60` }]} />
          </View>

          {/* ── Card body ────────────────────────────────── */}
          <Card.Content style={cc.body}>
            <View style={cc.bodyRow}>
              <Text style={cc.bodyLabel}>ISSUED</Text>
              <Text style={cc.bodyValue}>{formatIssuedDate(credential.issued_at)}</Text>
            </View>

            {/* Private fields count chip */}
            <View style={cc.chipRow}>
              <Chip
                style={cc.chip}
                textStyle={cc.chipText}
                icon={() => (
                  <Text style={cc.chipIcon}>🔒</Text>
                )}
                compact
              >
                {(credential.metadata?.selectively_disclosable_fields?.length ?? 0)} protected fields
              </Chip>

              <View style={cc.chevron}>
                <Text style={cc.chevronText}>›</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    </Animated.View>
  );
}

const cc = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: C.bgElevated,
    overflow: 'hidden',
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 0,
    borderBottomWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  patternOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.04,
    // Diagonal lines are tricky in RN; use a tinted overlay instead
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  credentialType: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  issuerName: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  headerAccentLine: {
    height: 1,
    marginHorizontal: -16,
  },

  // Body
  body: {
    paddingTop: 12,
    paddingBottom: 14,
  },
  bodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bodyLabel: {
    fontSize: 10,
    color: C.textTertiary,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
  bodyValue: {
    fontSize: 13,
    color: C.textSecondary,
    fontWeight: '400',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    backgroundColor: C.bgOverlay,
    borderRadius: 6,
    height: 28,
  },
  chipText: {
    fontSize: 11,
    color: C.textTertiary,
  },
  chipIcon: {
    fontSize: 10,
  },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.bgOverlay,
    borderWidth: 1,
    borderColor: C.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronText: {
    fontSize: 18,
    color: C.textTertiary,
    lineHeight: 22,
  },
});

// ─── EmptyState ───────────────────────────────────────────────────────────

interface EmptyStateProps {
  onAddCredential: () => void;
}

function EmptyState({ onAddCredential }: EmptyStateProps) {
  return (
    <View style={es.container}>
      {/* Illustration — document vault */}
      <View style={es.illustration}>
        <View style={es.illustrationInner}>
          <Text style={es.illustrationIcon}>🗂️</Text>
        </View>
        {/* Decorative dots */}
        <View style={[es.dot, es.dotTL]} />
        <View style={[es.dot, es.dotBR]} />
      </View>

      <Text style={es.title}>No credentials yet</Text>
      <Text style={es.description}>
        Add your national identity, degree, enrollment, or employment — verify once,
        share selectively forever.
      </Text>

      <TouchableOpacity style={es.button} onPress={onAddCredential} activeOpacity={0.85}>
        <Text style={es.buttonText}>Add your first credential</Text>
      </TouchableOpacity>

      {/* Source hint chips */}
      <View style={es.sourceRow}>
        {['NADRA', 'HEC', 'Air University', 'LinkedIn'].map(source => (
          <View key={source} style={es.sourceChip}>
            <Text style={es.sourceChipText}>{source}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const es = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  illustration: {
    width: 100,
    height: 100,
    marginBottom: 28,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationInner: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: C.bgElevated,
    borderWidth: 1,
    borderColor: C.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationIcon: {
    fontSize: 36,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.borderDefault,
    position: 'absolute',
  },
  dotTL: { top: 4, left: 4 },
  dotBR: { bottom: 4, right: 4 },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: C.accentPrimary,
    borderRadius: 10,
    marginBottom: 24,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  sourceChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: C.bgOverlay,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.borderSubtle,
  },
  sourceChipText: {
    fontSize: 11,
    color: C.textTertiary,
    fontWeight: '500',
  },
});

// ─── CredentialListScreen ─────────────────────────────────────────────────

export function CredentialListScreen(): React.JSX.Element {
  const navigation = useNavigation<CredentialListNavProp>();
  const { credentials, loading, loadCredentials, removeCredential } = useCredentialsStore();

  // Reload every time this screen comes into focus (e.g. after adding a credential)
  useFocusEffect(
    useCallback(() => {
      loadCredentials();
    }, [loadCredentials])
  );

  const handleRefresh = useCallback(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleCardPress = useCallback(
    (credentialId: string) => {
      navigation.navigate('CredentialDetail', { credentialId });
    },
    [navigation]
  );

  const handleLongPress = useCallback(
    (credential: SDJWTCredential) => {
      const meta = CREDENTIAL_META[credential.type];

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: `${meta.label} — ${meta.issuer}`,
            options: ['Cancel', 'View Details', 'Delete'],
            destructiveButtonIndex: 2,
            cancelButtonIndex: 0,
          },
          (buttonIndex) => {
            if (buttonIndex === 1) {
              navigation.navigate('CredentialDetail', { credentialId: credential.id });
            } else if (buttonIndex === 2) {
              confirmDelete(credential);
            }
          }
        );
      } else {
        // Android: use Alert as action sheet fallback
        Alert.alert(
          `${meta.label}`,
          meta.issuer,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'View Details',
              onPress: () => navigation.navigate('CredentialDetail', { credentialId: credential.id }),
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => confirmDelete(credential),
            },
          ]
        );
      }
    },
    [navigation] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const confirmDelete = useCallback(
    (credential: SDJWTCredential) => {
      const meta = CREDENTIAL_META[credential.type];
      Alert.alert(
        'Delete credential?',
        `This will remove your ${meta.label} credential from your wallet. You can add it again later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete credential',
            style: 'destructive',
            onPress: () => removeCredential(credential.id),
          },
        ]
      );
    },
    [removeCredential]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SDJWTCredential>) => (
      <CredentialCard
        credential={item}
        onPress={() => handleCardPress(item.id)}
        onLongPress={() => handleLongPress(item)}
      />
    ),
    [handleCardPress, handleLongPress]
  );

  const keyExtractor = useCallback((item: SDJWTCredential) => item.id, []);

  const ListHeaderComponent = useCallback(
    () => (
      <View style={sl.listHeader}>
        <Text style={sl.countLabel}>
          {credentials.length === 0
            ? 'No credentials'
            : `${credentials.length} credential${credentials.length === 1 ? '' : 's'}`}
        </Text>
      </View>
    ),
    [credentials.length]
  );

  return (
    <View style={sl.screen}>
      <FlatList<SDJWTCredential>
        data={credentials}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          sl.listContent,
          credentials.length === 0 && sl.listContentEmpty,
        ]}
        ListHeaderComponent={credentials.length > 0 ? ListHeaderComponent : null}
        ListEmptyComponent={
          !loading ? (
            <EmptyState onAddCredential={() => navigation.navigate('AddCredential')} />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={handleRefresh}
            tintColor={C.accentPrimary}
            colors={[C.accentPrimary]}
            progressBackgroundColor={C.bgElevated}
          />
        }
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={null}
      />

      {/* FAB — always visible, navigates to AddCredential */}
      <FAB
        icon="plus"
        style={sl.fab}
        color="#ffffff"
        onPress={() => navigation.navigate('AddCredential')}
        accessibilityLabel="Add credential"
      />
    </View>
  );
}

const sl = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bgBase,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 96, // room above FAB
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listHeader: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 4,
  },
  countLabel: {
    fontSize: 12,
    color: C.textTertiary,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    backgroundColor: C.accentPrimary,
    borderRadius: 16,
  },
});

// ─── Navigator header options helper ─────────────────────────────────────
// Apply these in your Stack.Screen declaration:
//
//   <Stack.Screen
//     name="CredentialList"
//     component={CredentialListScreen}
//     options={CredentialListScreen.headerOptions}
//   />

CredentialListScreen.headerOptions = {
  title: 'My Credentials',
  headerStyle: {
    backgroundColor: C.bgBase,
    shadowColor: 'transparent',
    elevation: 0,
  },
  headerTitleStyle: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  headerTintColor: C.accentPrimary,
} as const;

export default CredentialListScreen;
