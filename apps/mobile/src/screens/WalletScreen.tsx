// SCR-002 Credential Wallet (FR-010) — Apple Wallet-style stack of CredentialCards.
import React, { useCallback, useEffect } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BellRing, ChevronRight, Plus, WalletCards } from 'lucide-react-native';
import { predicateLabel } from '@nexusid/types';
import { CredentialCard, CARD_RATIO } from '../components/CredentialCard';
import { CATEGORY_ORDER, categoryMeta, predicatesFor } from '../lib/category';
import { credentialStatus } from '../lib/wallet';
import type { RootStackParamList } from '../navigation/types';
import { useTabBarHeight } from '../navigation/TabBar';
import { useCredentialsStore } from '../store/credentials.store';
import { useSessionStore } from '../store/session.store';
import { alpha, colors, icon, motion, radius, space } from '../styles/tokens';
import {
  EmptyState,
  ErrorState,
  IconButton,
  IconTile,
  Screen,
  Skeleton,
  Text,
} from '../ui';

const STACK_OFFSET = 72; // each next card shifted 72 px down (§5.1)

export function WalletScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const cardWidth = width - space.page * 2;
  const cardHeight = cardWidth / CARD_RATIO;
  const bottomPad = useTabBarHeight() + 56 + space[8];

  const { credentials, revoked, loaded, loading, error, loadCredentials } =
    useCredentialsStore();
  const pending = useSessionStore(s => s.pending);

  useEffect(() => {
    if (!loaded) void loadCredentials();
  }, [loaded, loadCredentials]);

  useFocusEffect(
    useCallback(() => {
      if (loaded) void useCredentialsStore.getState().refreshRevocation();
    }, [loaded]),
  );

  // Order by category so the stack reads the same way every time.
  const sorted = [...credentials].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.type) - CATEGORY_ORDER.indexOf(b.type),
  );
  const live = pending.filter(p => Date.parse(p.expiresAt) > Date.now());

  return (
    <Screen
      eyebrow="Wallet"
      title="Your credentials"
      noBottomInset
      right={
        <IconButton
          Icon={Plus}
          label="Add credential"
          onPress={() => nav.navigate('AddCredential')}
          color={colors.accentText}
        />
      }
    >
      <ScrollView
        contentContainerStyle={{
          padding: space.page,
          paddingBottom: bottomPad,
          gap: space[4],
        }}
        refreshControl={
          <RefreshControl
            refreshing={loading && loaded}
            onRefresh={loadCredentials}
            tintColor={colors.accentText}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {live.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${live[0].verifierName} wants to confirm ${predicateLabel(live[0].predicate)}. Open request.`}
            onPress={() =>
              nav.navigate('Request', { requestId: live[0].requestId })
            }
            style={({ pressed }) => [
              s.banner,
              pressed && { backgroundColor: alpha(colors.accent, 0.16) },
            ]}
          >
            <BellRing
              size={icon.nav}
              color={colors.accentText}
              strokeWidth={icon.stroke}
            />
            <View style={{ flex: 1 }}>
              <Text variant="label">{live[0].verifierName} sent a request</Text>
              <Text variant="bodySmall">
                Confirm: {predicateLabel(live[0].predicate)}
              </Text>
            </View>
            <ChevronRight
              size={icon.nav}
              color={colors.textMuted}
              strokeWidth={icon.stroke}
            />
          </Pressable>
        ) : null}

        {!loaded ? (
          <View>
            {[0, 1, 2].map(i => (
              <Skeleton
                key={i}
                height={cardHeight}
                r={radius.credential}
                style={{
                  position: i === 0 ? 'relative' : 'absolute',
                  top: i * STACK_OFFSET,
                  left: 0,
                  right: 0,
                }}
              />
            ))}
            <View style={{ height: STACK_OFFSET * 2 }} />
          </View>
        ) : error ? (
          <ErrorState
            title="Couldn't open your wallet"
            message={error}
            onRetry={loadCredentials}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            Icon={WalletCards}
            title="Add your first credential"
            body="Get a credential from NADRA, HEC, Air University or LinkedIn. It stays on this phone."
            actionLabel="Add credential"
            onAction={() => nav.navigate('AddCredential')}
          >
            <View style={s.catRow}>
              {CATEGORY_ORDER.map(c => {
                const m = categoryMeta(c);
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${m.label} credential`}
                    onPress={() =>
                      nav.navigate('AddCredential', { category: c })
                    }
                  >
                    <IconTile Icon={m.Icon} color={m.color} size={52} />
                  </Pressable>
                );
              })}
            </View>
          </EmptyState>
        ) : (
          <View
            style={{ height: (sorted.length - 1) * STACK_OFFSET + cardHeight }}
          >
            {sorted.map((c, i) => (
              <Animated.View
                key={c.id}
                entering={FadeInDown.delay(i * motion.stagger).duration(
                  motion.enter,
                )}
                style={{
                  position: 'absolute',
                  top: i * STACK_OFFSET,
                  left: 0,
                  zIndex: i,
                  elevation: i,
                }}
              >
                <CredentialCard
                  width={cardWidth}
                  category={c.type}
                  status={credentialStatus(c, revoked)}
                  predicates={predicatesFor(c.type)}
                  credentialId={c.id}
                  expiresAt={c.expires_at}
                  onPress={() =>
                    nav.navigate('CredentialDetail', { credentialId: c.id })
                  }
                />
              </Animated.View>
            ))}
          </View>
        )}

        {loaded && !error && sorted.length > 0 ? (
          <Text
            variant="bodySmall"
            align="center"
            style={{ marginTop: space[2] }}
          >
            {sorted.length} credential{sorted.length === 1 ? '' : 's'} ·
            stored on this phone
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: alpha(colors.accent, 0.35),
    backgroundColor: alpha(colors.accent, 0.1),
  },
  catRow: { flexDirection: 'row', gap: space[3], marginTop: space[2] },
});
