/**
 * apps/mobile/src/screens/HistoryScreen.tsx
 *
 * Verification history screen — shows all past verification events
 * grouped by date with filter tabs and a bottom sheet detail view.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  SectionListData,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { Portal, Modal } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVerificationStore } from '../store/verification.store';
import type { VerificationHistoryRecord } from '../services/storage.service';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bgBase:        '#0C0E13',
  bgElevated:    '#13161E',
  bgInset:       '#0A0C10',
  bgOverlay:     '#1A1E28',
  borderSubtle:  '#1E2330',
  borderDefault: '#252C3D',
  borderStrong:  '#3A4560',
  textPrimary:   '#EEF0F6',
  textSecondary: '#8B92A8',
  textTertiary:  '#525A72',
  accentPrimary: '#3B6FE8',
  success:       '#22C55E',
  successBg:     '#0F2A1A',
  successBorder: '#16532F',
  danger:        '#EF4444',
  dangerBg:      '#250F0F',
  dangerBorder:  '#4A1515',
  warning:       '#F59E0B',
} as const;

const SP = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
const R  = { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 } as const;

// ─── Filter definitions ────────────────────────────────────────────────────────

type FilterKey = 'all' | 'today' | 'week' | 'month';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',   label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

// ─── Date utilities ────────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function relativeTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now  = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr  < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7)  return `${diffDay} days ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function exactTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Section header label for a given ISO date string */
function sectionLabel(isoString: string): string {
  const date = new Date(isoString);
  const now  = new Date();
  const diffDay = Math.floor(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (diffDay === 0) return 'Today';
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7)  return date.toLocaleDateString('en-GB', { weekday: 'long' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isWithinFilter(isoString: string, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  const date = new Date(isoString);
  const now  = new Date();
  if (filter === 'today') return startOfDay(date).getTime() === startOfDay(now).getTime();
  if (filter === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return date >= weekAgo;
  }
  if (filter === 'month') {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  return true;
}

// ─── Field truncation helper ───────────────────────────────────────────────────

function formatFields(fields: string[]): string {
  if (fields.length === 0) return '—';
  const fieldLabels = fields.map(f =>
    f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  );
  if (fieldLabels.length <= 2) return fieldLabels.join(', ');
  return `${fieldLabels[0]}, ${fieldLabels[1]} +${fieldLabels.length - 2} more`;
}

// ─── Grouping into SectionList data ───────────────────────────────────────────

interface HistorySection {
  title: string;
  data:  VerificationHistoryRecord[];
}

function groupByDate(records: VerificationHistoryRecord[]): HistorySection[] {
  const map = new Map<string, VerificationHistoryRecord[]>();

  // Sort newest first before grouping
  const sorted = [...records].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  for (const record of sorted) {
    const key = startOfDay(new Date(record.timestamp)).toISOString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(record);
  }

  return Array.from(map.entries()).map(([key, data]) => ({
    title: sectionLabel(data[0].timestamp),
    data,
  }));
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface FilterTabsProps {
  active:   FilterKey;
  onChange: (key: FilterKey) => void;
}

function FilterTabs({ active, onChange }: FilterTabsProps): React.ReactElement {
  return (
    <View style={styles.filterRow}>
      {FILTERS.map(({ key, label }) => {
        const isActive = key === active;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.filterTab, isActive && styles.filterTabActive]}
            onPress={() => onChange(key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }): React.ReactElement {
  const isOk = status === 'completed' || status === 'approved';
  return (
    <View style={[styles.statusIcon, isOk ? styles.statusIconOk : styles.statusIconFail]}>
      <Text style={[styles.statusIconText, isOk ? styles.statusIconTextOk : styles.statusIconTextFail]}>
        {isOk ? '✓' : '✕'}
      </Text>
    </View>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────

interface HistoryRowProps {
  record:  VerificationHistoryRecord;
  onPress: (record: VerificationHistoryRecord) => void;
  isLast:  boolean;
}

function HistoryRow({ record, onPress, isLast }: HistoryRowProps): React.ReactElement {
  const fields   = JSON.parse(record.disclosed_fields) as string[];
  const fieldStr = formatFields(fields);
  const timeStr  = relativeTimestamp(record.timestamp);

  return (
    <TouchableOpacity
      style={[styles.historyRow, isLast && styles.historyRowLast]}
      onPress={() => onPress(record)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Verification for ${record.verifier_name ?? record.verifier_id}`}
    >
      <StatusIcon status={record.status} />

      <View style={styles.historyRowBody}>
        <View style={styles.historyRowTop}>
          <Text style={styles.verifierName} numberOfLines={1}>
            {record.verifier_name ?? record.verifier_id}
          </Text>
          <Text style={styles.timestamp}>{timeStr}</Text>
        </View>

        <Text style={styles.fieldsSummary} numberOfLines={1}>
          {fieldStr}
        </Text>

        <View style={styles.credentialChip}>
          <Text style={styles.credentialChipText} numberOfLines={1}>
            {record.credential_id}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): React.ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterKey }): React.ReactElement {
  const messages: Record<FilterKey, string> = {
    all:   'No verifications yet',
    today: 'No verifications today',
    week:  'No verifications this week',
    month: 'No verifications this month',
  };
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconBox}>
        <Text style={styles.emptyIcon}>🕐</Text>
      </View>
      <Text style={styles.emptyTitle}>{messages[filter]}</Text>
      <Text style={styles.emptySubtitle}>
        When websites verify your credentials, the history will appear here.
      </Text>
    </View>
  );
}

// ─── Detail bottom sheet ──────────────────────────────────────────────────────

interface DetailSheetProps {
  record:   VerificationHistoryRecord | null;
  visible:  boolean;
  onClose:  () => void;
  onDelete: (id: string) => void;
}

function DetailSheet({ record, visible, onClose, onDelete }: DetailSheetProps): React.ReactElement {
  const insets       = useSafeAreaInsets();
  const slideAnim    = useRef(new Animated.Value(300)).current;
  const [delConfirm, setDelConfirm] = useState(false);

  useEffect(() => {
    if (visible) {
      setDelConfirm(false);
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, bounciness: 0,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300, duration: 200, useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!record) return <></>;

  const fields    = JSON.parse(record.disclosed_fields) as string[];
  const isOk      = record.status === 'completed' || record.status === 'approved';
  const statusColor = isOk ? C.success : C.danger;

  const handleDelete = (): void => {
    if (!delConfirm) {
      setDelConfirm(true);
      return;
    }
    onDelete(record.id);
    onClose();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.modalOverlay}
      >
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} activeOpacity={1} />

        <Animated.View
          style={[
            styles.sheetContainer,
            { paddingBottom: insets.bottom + SP[4] },
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle */}
          <View style={styles.sheetHandle} />

          {/* Header row */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetVerifierName}>
                {record.verifier_name ?? record.verifier_id}
              </Text>
              <Text style={styles.sheetVerifierDomain}>{record.verifier_id}</Text>
            </View>
            <View style={[
              styles.sheetStatusBadge,
              { backgroundColor: isOk ? C.successBg : C.dangerBg,
                borderColor:     isOk ? C.successBorder : C.dangerBorder },
            ]}>
              <Text style={[styles.sheetStatusText, { color: statusColor }]}>
                {isOk ? 'Completed' : 'Failed'}
              </Text>
            </View>
          </View>

          {/* Timestamp */}
          <Text style={styles.sheetTimestamp}>{exactTimestamp(record.timestamp)}</Text>

          <View style={styles.sheetDivider} />

          {/* Disclosed fields */}
          <Text style={styles.sheetSectionLabel}>FIELDS DISCLOSED</Text>
          {fields.length > 0 ? (
            fields.map((field) => (
              <View key={field} style={styles.sheetFieldRow}>
                <View style={styles.sheetFieldDot} />
                <Text style={styles.sheetFieldName}>
                  {field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.sheetNoFields}>No fields recorded</Text>
          )}

          <View style={styles.sheetDivider} />

          {/* Credential info */}
          <Text style={styles.sheetSectionLabel}>CREDENTIAL USED</Text>
          <View style={styles.sheetCredentialBox}>
            <Text style={styles.sheetCredentialId} numberOfLines={1}>
              {record.credential_id}
            </Text>
          </View>

          <View style={styles.sheetDivider} />

          {/* Delete button */}
          <TouchableOpacity
            style={[
              styles.deleteBtn,
              delConfirm && styles.deleteBtnConfirm,
            ]}
            onPress={handleDelete}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Delete this record"
          >
            <Text style={styles.deleteBtnText}>
              {delConfirm ? 'Tap again to confirm delete' : 'Delete this record'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </Portal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function HistoryScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();

  const { history, loading, loadHistory, addHistoryRecord } = useVerificationStore();

  const [filter,         setFilter]         = useState<FilterKey>('all');
  const [refreshing,     setRefreshing]      = useState(false);
  const [selectedRecord, setSelectedRecord]  = useState<VerificationHistoryRecord | null>(null);
  const [sheetVisible,   setSheetVisible]    = useState(false);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const filteredRecords = useMemo(
    () => history.filter(r => isWithinFilter(r.timestamp, filter)),
    [history, filter],
  );

  const sections = useMemo(
    () => groupByDate(filteredRecords),
    [filteredRecords],
  );

  const openDetail = useCallback((record: VerificationHistoryRecord): void => {
    setSelectedRecord(record);
    setSheetVisible(true);
  }, []);

  const closeDetail = useCallback((): void => {
    setSheetVisible(false);
    setTimeout(() => setSelectedRecord(null), 300);
  }, []);

  const handleDelete = useCallback((id: string): void => {
    // StorageService.deleteHistoryRecord called from store if wired; for now filter locally
    // The store can expose a removeHistoryRecord action; we optimistically remove here
    useVerificationStore.setState(state => ({
      history: state.history.filter(r => r.id !== id),
    }));
  }, []);

  const renderItem = useCallback(
    ({ item, index, section }: {
      item:    VerificationHistoryRecord;
      index:   number;
      section: SectionListData<VerificationHistoryRecord, HistorySection>;
    }) => (
      <HistoryRow
        record={item}
        onPress={openDetail}
        isLast={index === section.data.length - 1}
      />
    ),
    [openDetail],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<VerificationHistoryRecord, HistorySection> }) => (
      <SectionHeader title={(section as HistorySection).title} />
    ),
    [],
  );

  const keyExtractor = useCallback((item: VerificationHistoryRecord) => item.id, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Verification History</Text>
      </View>

      {/* Filter tabs */}
      <FilterTabs active={filter} onChange={setFilter} />

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.accentPrimary} />
        </View>
      ) : (
        <SectionList<VerificationHistoryRecord, HistorySection>
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={[
            styles.listContent,
            sections.length === 0 && styles.listContentEmpty,
          ]}
          stickySectionHeadersEnabled
          ListEmptyComponent={<EmptyState filter={filter} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accentPrimary}
              colors={[C.accentPrimary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom sheet detail */}
      <DetailSheet
        record={selectedRecord}
        visible={sheetVisible}
        onClose={closeDetail}
        onDelete={handleDelete}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Screen
  screen: {
    flex:            1,
    backgroundColor: C.bgBase,
  },

  // Header
  header: {
    paddingHorizontal: SP[4],
    paddingTop:        SP[3],
    paddingBottom:     SP[4],
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  headerTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize:   24,
    color:      C.textPrimary,
    letterSpacing: -0.5,
  },

  // Filter tabs
  filterRow: {
    flexDirection:  'row',
    paddingHorizontal: SP[4],
    paddingVertical:   SP[3],
    gap:            SP[2],
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  filterTab: {
    paddingHorizontal: SP[3],
    paddingVertical:   SP[1] + 2,
    borderRadius:      R.full,
    borderWidth:       1,
    borderColor:       C.borderSubtle,
  },
  filterTabActive: {
    backgroundColor: 'rgba(59, 111, 232, 0.10)',
    borderColor:     'rgba(59, 111, 232, 0.30)',
  },
  filterTabText: {
    fontFamily: 'Inter-Medium',
    fontSize:   13,
    color:      C.textSecondary,
  },
  filterTabTextActive: {
    color: C.accentPrimary,
  },

  // List
  listContent: {
    paddingBottom: SP[8],
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // Section header
  sectionHeader: {
    backgroundColor:   C.bgBase,
    paddingHorizontal: SP[4],
    paddingTop:        SP[5],
    paddingBottom:     SP[2],
  },
  sectionHeaderText: {
    fontFamily:    'Inter-Medium',
    fontSize:      11,
    color:         C.textTertiary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // History row
  historyRow: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    paddingHorizontal: SP[4],
    paddingVertical:   SP[4],
    gap:               SP[3],
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
    backgroundColor:   C.bgBase,
  },
  historyRowLast: {
    borderBottomWidth: 0,
  },
  historyRowBody: {
    flex: 1,
    gap:  SP[1],
  },
  historyRowTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    gap:            SP[2],
  },
  verifierName: {
    fontFamily: 'Inter-Medium',
    fontSize:   15,
    color:      C.textPrimary,
    flex:       1,
  },
  timestamp: {
    fontFamily: 'Inter-Regular',
    fontSize:   12,
    color:      C.textTertiary,
    flexShrink: 0,
  },
  fieldsSummary: {
    fontFamily: 'Inter-Regular',
    fontSize:   13,
    color:      C.textSecondary,
  },
  credentialChip: {
    alignSelf:         'flex-start',
    backgroundColor:   C.bgOverlay,
    borderRadius:      R.sm,
    paddingHorizontal: SP[2],
    paddingVertical:   2,
    borderWidth:       1,
    borderColor:       C.borderSubtle,
    marginTop:         SP[1],
  },
  credentialChipText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize:   10,
    color:      C.textTertiary,
  },

  // Status icon
  statusIcon: {
    width:          28,
    height:         28,
    borderRadius:   R.full,
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      2,
    flexShrink:     0,
  },
  statusIconOk: {
    backgroundColor: C.successBg,
    borderWidth:     1,
    borderColor:     C.successBorder,
  },
  statusIconFail: {
    backgroundColor: C.dangerBg,
    borderWidth:     1,
    borderColor:     C.dangerBorder,
  },
  statusIconText: {
    fontSize:   12,
    fontFamily: 'Inter-Medium',
  },
  statusIconTextOk:   { color: C.success },
  statusIconTextFail: { color: C.danger },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: SP[8],
    paddingVertical:   SP[8],
  },
  emptyIconBox: {
    width:           64,
    height:          64,
    borderRadius:    R.xl,
    backgroundColor: C.bgElevated,
    borderWidth:     1,
    borderColor:     C.borderSubtle,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    SP[4],
  },
  emptyIcon: {
    fontSize: 28,
  },
  emptyTitle: {
    fontFamily:    'DMSans-SemiBold',
    fontSize:      18,
    color:         C.textPrimary,
    marginBottom:  SP[2],
    textAlign:     'center',
  },
  emptySubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize:   14,
    color:      C.textSecondary,
    textAlign:  'center',
    lineHeight: 22,
  },

  // Loading
  loadingContainer: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Modal / bottom sheet
  modalOverlay: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetContainer: {
    backgroundColor: C.bgElevated,
    borderTopLeftRadius:  R.xl,
    borderTopRightRadius: R.xl,
    paddingHorizontal:    SP[5],
    paddingTop:           SP[3],
    borderTopWidth:       1,
    borderColor:          C.borderDefault,
  },
  sheetHandle: {
    width:           40,
    height:          4,
    borderRadius:    R.full,
    backgroundColor: C.borderDefault,
    alignSelf:       'center',
    marginBottom:    SP[5],
  },
  sheetHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   SP[2],
  },
  sheetVerifierName: {
    fontFamily: 'DMSans-SemiBold',
    fontSize:   18,
    color:      C.textPrimary,
    flex:       1,
    marginRight: SP[3],
  },
  sheetVerifierDomain: {
    fontFamily: 'Inter-Regular',
    fontSize:   13,
    color:      C.textSecondary,
    marginTop:  SP[1],
  },
  sheetStatusBadge: {
    paddingHorizontal: SP[3],
    paddingVertical:   SP[1],
    borderRadius:      R.md,
    borderWidth:       1,
  },
  sheetStatusText: {
    fontFamily: 'Inter-Medium',
    fontSize:   12,
  },
  sheetTimestamp: {
    fontFamily:   'JetBrainsMono-Regular',
    fontSize:     12,
    color:        C.textTertiary,
    marginBottom: SP[4],
  },
  sheetDivider: {
    height:          1,
    backgroundColor: C.borderSubtle,
    marginVertical:  SP[4],
  },
  sheetSectionLabel: {
    fontFamily:    'Inter-Medium',
    fontSize:      10,
    color:         C.textTertiary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom:  SP[3],
  },
  sheetFieldRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SP[3],
    paddingVertical: SP[2],
  },
  sheetFieldDot: {
    width:           6,
    height:          6,
    borderRadius:    R.full,
    backgroundColor: C.accentPrimary,
  },
  sheetFieldName: {
    fontFamily: 'Inter-Regular',
    fontSize:   14,
    color:      C.textPrimary,
  },
  sheetNoFields: {
    fontFamily: 'Inter-Regular',
    fontSize:   14,
    color:      C.textTertiary,
    fontStyle:  'italic',
  },
  sheetCredentialBox: {
    backgroundColor:   C.bgInset,
    borderRadius:      R.md,
    paddingHorizontal: SP[3],
    paddingVertical:   SP[3],
    borderWidth:       1,
    borderColor:       C.borderSubtle,
  },
  sheetCredentialId: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize:   12,
    color:      C.textSecondary,
  },
  deleteBtn: {
    height:         48,
    borderRadius:   R.md,
    borderWidth:    1,
    borderColor:    C.dangerBorder,
    alignItems:     'center',
    justifyContent: 'center',
  },
  deleteBtnConfirm: {
    backgroundColor: C.dangerBg,
    borderColor:     C.danger,
  },
  deleteBtnText: {
    fontFamily: 'Inter-Medium',
    fontSize:   15,
    color:      C.danger,
  },
});
