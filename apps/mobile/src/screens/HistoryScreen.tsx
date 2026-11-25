// SCR-010 Verification history (FR-028) — grouped by day, bank-transaction style.
// Shows the platform, the condition and the outcome; there are no claim values to show.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { History as HistoryIcon, Trash2 } from 'lucide-react-native';
import { predicateLabel } from '@nexusid/types';
import type { HistoryRecordDTO } from '../services/api.service';
import { categoryMeta, categoryOfPredicate } from '../lib/category';
import { dayKey, dayLabel, formatTime } from '../lib/format';
import { outcomeStatus } from '../lib/status';
import { useTabBarHeight } from '../navigation/TabBar';
import { useHistoryStore } from '../store/history.store';
import { alpha, colors, fonts, radius, space } from '../styles/tokens';
import { errorMessage } from '../lib/wallet';
import { ConfirmDialog, EmptyState, ErrorState, IconButton, Screen, Skeleton, StatusBadge, Text, toast } from '../ui';

function when(r: HistoryRecordDTO): string {
  return r.decidedAt ?? r.created_at;
}

export function HistoryScreen() {
  const { records, loaded, loading, error, load, remove, clear } = useHistoryStore();
  const [confirm, setConfirm] = useState<{ kind: 'one'; record: HistoryRecordDTO } | { kind: 'all' } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'all') {
        await clear();
        toast('History cleared');
      } else {
        await remove(confirm.record.requestId);
        toast('Entry deleted');
      }
    } catch (err) {
      toast(errorMessage(err, 'Could not delete.'), 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  const bottomPad = useTabBarHeight() + 56 + space[8];

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sections = useMemo(() => {
    const groups = new Map<string, { title: string; data: HistoryRecordDTO[] }>();
    for (const r of records) {
      const k = dayKey(when(r));
      if (!groups.has(k)) groups.set(k, { title: dayLabel(when(r)), data: [] });
      groups.get(k)!.data.push(r);
    }
    return [...groups.values()];
  }, [records]);

  return (
    <Screen
      eyebrow="History"
      title="Verifications"
      noBottomInset
      right={records.length > 0 ? <IconButton Icon={Trash2} label="Clear all history" onPress={() => setConfirm({ kind: 'all' })} color={colors.textMuted} /> : undefined}
    >
      {!loaded ? (
        <View style={{ padding: space.page, gap: space[3] }}>
          <Skeleton width={90} height={14} r={4} />
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} height={68} />
          ))}
        </View>
      ) : error && records.length === 0 ? (
        <ErrorState title="Couldn't load history" message={error} onRetry={load} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={r => r.requestId}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: bottomPad, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading && loaded} onRefresh={load} tintColor={colors.accentText} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
          renderSectionHeader={({ section }) => (
            <Text variant="eyebrow" style={{ marginTop: space[5], marginBottom: space[2] }} accessibilityRole="header">
              {section.title}
            </Text>
          )}
          renderItem={({ item, index, section }) => (
            <Row r={item} first={index === 0} last={index === section.data.length - 1} onDelete={() => setConfirm({ kind: 'one', record: item })} />
          )}
          ListFooterComponent={records.length > 0 ? <Text variant="bodySmall" align="center" style={{ marginTop: space[5] }}>Long-press an entry to delete it. The website keeps its own record.</Text> : undefined}
          ListEmptyComponent={
            <EmptyState Icon={HistoryIcon} title="No verifications yet" body="When a website asks you to confirm something, the answer you gave shows up here." />
          }
        />
      )}
      <ConfirmDialog
        visible={confirm !== null}
        title={confirm?.kind === 'all' ? 'Clear all history?' : 'Delete this entry?'}
        body={
          confirm?.kind === 'all'
            ? 'Every entry is removed from your history on this phone and the web portal. Websites keep their own logs.'
            : `The ${confirm?.kind === 'one' ? confirm.record.verifierName : ''} entry is removed from your history. The website keeps its own log.`
        }
        confirmLabel={confirm?.kind === 'all' ? 'Clear history' : 'Delete entry'}
        destructive
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      />
    </Screen>
  );
}

function Row({ r, first, last, onDelete }: { r: HistoryRecordDTO; first: boolean; last: boolean; onDelete: () => void }) {
  const category = categoryOfPredicate(r.predicate);
  const catColor = category ? categoryMeta(category).color : colors.textMuted;
  const initial = r.verifierName.trim().charAt(0).toUpperCase() || '?';
  const status = outcomeStatus(r.outcome);
  return (
    <Animated.View entering={FadeIn.duration(200)}>
    <Pressable
      onLongPress={onDelete}
      accessibilityLabel={`${r.verifierName}, ${predicateLabel(r.predicate)}, ${status}, at ${formatTime(when(r))}`}
      accessibilityActions={[{ name: 'delete', label: 'Delete entry' }]}
      onAccessibilityAction={e => e.nativeEvent.actionName === 'delete' && onDelete()}
      style={({ pressed }) => [s.row, first && s.first, last && s.last, !first && { borderTopWidth: 0 }, pressed && { backgroundColor: colors.overlay }]}
    >
      <View style={s.avatar}>
        <Text style={{ fontFamily: fonts.displayBold, fontSize: 16, color: colors.text }}>{initial}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="label" numberOfLines={1}>
          {r.verifierName}
        </Text>
        <View style={[s.chip, { borderColor: alpha(catColor, 0.3), backgroundColor: alpha(catColor, 0.1) }]}>
          <Text variant="bodySmall" color={colors.text} style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
            {predicateLabel(r.predicate)}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <StatusBadge status={status} compact />
        <Text variant="mono">{formatTime(when(r))}</Text>
      </View>
    </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  first: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  last: { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
  avatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: space[2], paddingVertical: 2 },
});
