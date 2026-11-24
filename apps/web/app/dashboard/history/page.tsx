'use client';

import { useState, useEffect, useCallback } from 'react';
import { FIELD_CATEGORY } from '@/lib/verifierApi';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'completed' | 'rejected' | 'expired';

interface VerificationRow {
  id: string;
  /** Requesting platform (UC-006). */
  verifierName: string;
  requestedFields: string[];
  status: Status;
  /** null when the request expired without a decision */
  responseTimeSec: number | null;
  credentialType: 'identity' | 'education' | 'employment' | 'enrollment';
  createdAt: string;
}

interface DailyPoint {
  date: string;
  completed: number;
  rejected: number;
  expired: number;
}

interface FieldStat {
  field: string;
  count: number;
}

interface AnalyticsPayload {
  rows: VerificationRow[];
  daily: DailyPoint[];
  fieldStats: FieldStat[];
  totals: {
    completed: number;
    rejected: number;
    expired: number;
    avgResponseTime: number;
  };
}

// ── Real data → payload ───────────────────────────────────────────────────────

/** One entry from GET /api/v1/verification/history (MOD-6, UC-006). */
interface HistoryRecord {
  requestId: string;
  verifierName: string;
  requestedFields: string[];
  status: Status;
  decidedAt: string | null;
  created_at: string;
}

async function fetchHistory(): Promise<HistoryRecord[]> {
  const res = await fetch('/api/v1/verification/history?limit=100', { credentials: 'include' });
  const json = (await res.json()) as { success: boolean; data?: HistoryRecord[]; error?: string };
  if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Failed to load history');
  return json.data;
}

function buildPayload(records: HistoryRecord[], from: Date, to: Date): AnalyticsPayload {
  const rows: VerificationRow[] = records
    .filter((r) => {
      const c = new Date(r.created_at).getTime();
      return c >= from.getTime() && c <= to.getTime();
    })
    .map((r) => ({
      id: r.requestId,
      verifierName: r.verifierName,
      requestedFields: r.requestedFields,
      status: r.status,
      responseTimeSec: r.decidedAt
        ? Math.round((new Date(r.decidedAt).getTime() - new Date(r.created_at).getTime()) / 100) / 10
        : null,
      credentialType: FIELD_CATEGORY[r.requestedFields[0] ?? ''] ?? 'identity',
      createdAt: r.created_at,
    }));

  const dayMap: Record<string, DailyPoint> = {};
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dayMap[key] = { date: key, completed: 0, rejected: 0, expired: 0 };
    cursor.setDate(cursor.getDate() + 1);
  }
  rows.forEach((r) => {
    const key = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (dayMap[key]) dayMap[key][r.status]++;
  });
  const daily = Object.values(dayMap);

  const fieldMap: Record<string, number> = {};
  rows.forEach((r) => r.requestedFields.forEach((f) => { fieldMap[f] = (fieldMap[f] ?? 0) + 1; }));
  const fieldStats = Object.entries(fieldMap)
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);

  const completed = rows.filter((r) => r.status === 'completed').length;
  const rejected  = rows.filter((r) => r.status === 'rejected').length;
  const expired   = rows.filter((r) => r.status === 'expired').length;
  const times = rows.map((r) => r.responseTimeSec).filter((t): t is number => t !== null);
  const avgRT = times.length ? parseFloat((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) : 0;

  return { rows, daily, fieldStats, totals: { completed, rejected, expired, avgResponseTime: avgRT } };
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(rows: VerificationRow[]) {
  const header = ['Platform', 'Status', 'Fields', 'Credential Type', 'Response Time (s)', 'Date'];
  const lines = rows.map((r) => [
    `"${r.verifierName.replace(/"/g, '""')}"`,
    r.status,
    r.requestedFields.join(' | '),
    r.credentialType,
    r.responseTimeSec ?? '',
    new Date(r.createdAt).toLocaleString(),
  ].join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexusid-verifications-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** YYYY-MM-DD in the viewer's local calendar (toISOString would give the UTC date,
 *  which in Pakistan (UTC+5) is still "yesterday" until 05:00 and hid today's entries). */
function isoDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_META: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  completed: { label: 'Completed', bg: '#0F2A1A', text: '#22C55E', border: '#16532F' },
  rejected:  { label: 'Rejected',  bg: '#250F0F', text: '#EF4444', border: '#4A1515' },
  expired:   { label: 'Expired',   bg: '#1A1E28', text: '#525A72', border: '#252C3D' },
};

const CRED_META = {
  identity:   { label: 'Identity',   color: '#3B82F6' },
  education:  { label: 'Education',  color: '#8B5CF6' },
  employment: { label: 'Employment', color: '#0EA5E9' },
  enrollment: { label: 'Enrollment', color: '#10B981' },
};

function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded"
      style={{ background: m.bg, color: m.text, border: `1px solid ${m.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}

function CredBadge({ type }: { type: VerificationRow['credentialType'] }) {
  const m = CRED_META[type];
  return (
    <span
      className="inline-flex text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded"
      style={{ background: `${m.color}12`, color: m.color, border: `1px solid ${m.color}25` }}
    >
      {m.label}
    </span>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#13161E] border border-[#252C3D] rounded-lg px-3 py-2 shadow-lg text-xs font-mono">
      <p className="text-[#525A72] mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const PRESET_RANGES = [
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function AnalyticsPage() {
  const today = new Date();
  const [toDate, setToDate]     = useState(isoDate(today));
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  });
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [page, setPage]                 = useState(1);
  const [data, setData]                 = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading]           = useState(true);
  const [exporting, setExporting]       = useState(false);
  const [activePreset, setActivePreset] = useState<number | null>(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      // Both ends in local time; a bare "YYYY-MM-DD" would parse as UTC midnight.
      const from = new Date(`${fromDate}T00:00:00`);
      const to = new Date(`${toDate}T23:59:59.999`);
      setData(buildPayload(await fetchHistory(), from, to));
    } catch {
      // Honest empty state — never invented numbers.
      setData(buildPayload([], new Date(`${fromDate}T00:00:00`), new Date(`${toDate}T23:59:59.999`)));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function applyPreset(days: number) {
    const d = new Date();
    const f = new Date();
    f.setDate(f.getDate() - days);
    setToDate(isoDate(d));
    setFromDate(isoDate(f));
    setActivePreset(days);
  }

  function handleDateChange(field: 'from' | 'to', val: string) {
    if (field === 'from') setFromDate(val);
    else setToDate(val);
    setActivePreset(null);
  }

  function handleExport() {
    if (!data) return;
    setExporting(true);
    setTimeout(() => {
      exportCSV(filteredRows);
      setExporting(false);
    }, 300);
  }

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-[#13161E] border border-[#1E2330] rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[#13161E] border border-[#1E2330] rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-[#13161E] border border-[#1E2330] rounded-xl" />
        <div className="h-80 bg-[#13161E] border border-[#1E2330] rounded-xl" />
      </div>
    );
  }

  const filteredRows = statusFilter === 'all'
    ? data.rows
    : data.rows.filter((r) => r.status === statusFilter);

  const pageRows    = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages  = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const successRate = data.rows.length
    ? ((data.totals.completed / data.rows.length) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">

      {/* ── Filter bar ── */}
      <div className="bg-[#13161E] border border-[#1E2330] rounded-xl px-5 py-4 flex flex-wrap items-center gap-4">
        {/* Preset pills */}
        <div className="flex items-center gap-1.5">
          {PRESET_RANGES.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => applyPreset(days)}
              className="px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all duration-150"
              style={{
                background: activePreset === days ? 'rgba(59,111,232,0.15)' : '#0A0C10',
                color:      activePreset === days ? '#3B6FE8'               : '#8B92A8',
                border:    `1px solid ${activePreset === days ? 'rgba(59,111,232,0.3)' : '#252C3D'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-[#252C3D]">|</span>

        {/* Date pickers */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#525A72] font-mono">From</span>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => handleDateChange('from', e.target.value)}
            className="bg-[#0A0C10] border border-[#252C3D] rounded-md px-3 py-1.5 text-xs font-mono text-[#EEF0F6] outline-none focus:border-[#3B6FE8] transition-colors [color-scheme:dark]"
          />
          <span className="text-xs text-[#525A72] font-mono">→</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={isoDate(today)}
            onChange={(e) => handleDateChange('to', e.target.value)}
            className="bg-[#0A0C10] border border-[#252C3D] rounded-md px-3 py-1.5 text-xs font-mono text-[#EEF0F6] outline-none focus:border-[#3B6FE8] transition-colors [color-scheme:dark]"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5 ml-auto">
          {(['all', 'completed', 'rejected', 'expired'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className="px-3 py-1.5 rounded-md text-xs font-mono font-medium capitalize transition-all duration-150"
              style={{
                background: statusFilter === s
                  ? s === 'completed' ? '#0F2A1A'
                  : s === 'rejected'  ? '#250F0F'
                  : s === 'expired'   ? '#1A1E28'
                  : 'rgba(59,111,232,0.1)'
                  : '#0A0C10',
                color: statusFilter === s
                  ? s === 'completed' ? '#22C55E'
                  : s === 'rejected'  ? '#EF4444'
                  : s === 'expired'   ? '#8B92A8'
                  : '#3B6FE8'
                  : '#525A72',
                border: `1px solid ${statusFilter === s
                  ? s === 'completed' ? '#16532F'
                  : s === 'rejected'  ? '#4A1515'
                  : s === 'expired'   ? '#252C3D'
                  : 'rgba(59,111,232,0.3)'
                  : '#1E2330'}`,
              }}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={exporting || filteredRows.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: '#0A0C10',
            color: '#8B92A8',
            border: '1px solid #252C3D',
          }}
        >
          {exporting ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v3M6 8v3M1 6h3M8 6h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3 5l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          Export CSV
        </button>
      </div>

      {/* ── KPI summary row ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Total in Range',
            value: data.rows.length.toLocaleString(),
            sub: `${fromDate} → ${toDate}`,
            color: '#3B6FE8',
          },
          {
            label: 'Completed',
            value: data.totals.completed.toLocaleString(),
            sub: `${successRate}% success rate`,
            color: '#22C55E',
          },
          {
            label: 'Rejected / Expired',
            value: (data.totals.rejected + data.totals.expired).toLocaleString(),
            sub: `${data.totals.rejected} rejected · ${data.totals.expired} expired`,
            color: '#EF4444',
          },
          {
            label: 'Avg Response Time',
            value: `${data.totals.avgResponseTime}s`,
            sub: 'phone-to-backend round trip',
            color: '#F59E0B',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-[#13161E] border border-[#1E2330] rounded-xl p-5 space-y-1"
          >
            <p className="text-[10px] font-mono tracking-wider uppercase text-[#525A72]">{card.label}</p>
            <p
              className="text-3xl font-semibold tracking-tight"
              style={{ color: card.color, fontFamily: 'DM Sans, sans-serif' }}
            >
              {card.value}
            </p>
            <p className="text-[11px] text-[#525A72]">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Stacked line chart */}
        <div className="col-span-2 bg-[#13161E] border border-[#1E2330] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#EEF0F6] mb-0.5">Daily Volume by Status</h2>
          <p className="text-xs text-[#525A72] mb-4">Completed · Rejected · Expired</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#1E2330" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#525A72', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                interval={Math.max(0, Math.floor(data.daily.length / 8) - 1)}
              />
              <YAxis
                tick={{ fill: '#525A72', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#252C3D', strokeWidth: 1 }} />
              <Legend
                wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace', color: '#8B92A8', paddingTop: '12px' }}
              />
              <Line type="monotone" dataKey="completed" name="Completed" stroke="#22C55E" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#22C55E', stroke: '#13161E', strokeWidth: 2 }} />
              <Line type="monotone" dataKey="rejected"  name="Rejected"  stroke="#EF4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="expired"   name="Expired"   stroke="#525A72" strokeWidth={1.5} dot={false} strokeDasharray="2 2" activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart — field popularity */}
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#EEF0F6] mb-0.5">Top Requested Fields</h2>
          <p className="text-xs text-[#525A72] mb-4">All verifications in range</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={data.fieldStats.slice(0, 8)}
              layout="vertical"
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke="#1E2330" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: '#525A72', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="field"
                tick={{ fill: '#8B92A8', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                width={115}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#1A1E28' }} />
              <Bar dataKey="count" name="Requests" fill="#3B6FE8" radius={[0, 3, 3, 0]} maxBarSize={10} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Full data table ── */}
      <div className="bg-[#13161E] border border-[#1E2330] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2330]">
          <div>
            <h2 className="text-sm font-semibold text-[#EEF0F6]">Verification Log</h2>
            <p className="text-xs text-[#525A72] mt-0.5">
              {filteredRows.length.toLocaleString()} result{filteredRows.length !== 1 ? 's' : ''}
              {statusFilter !== 'all' && ` · filtered by ${statusFilter}`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#525A72]">
            <span>Page {page} of {totalPages}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E2330]">
                {['Platform', 'Fields Requested', 'Credential', 'Status', 'Response', 'Date'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] font-mono tracking-wider uppercase text-[#525A72] px-6 py-3 first:pl-6"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2330]">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-[#1A1E28] border border-[#252C3D] flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#525A72]" viewBox="0 0 20 20" fill="none">
                          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M10 6v4M10 13v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                      <p className="text-sm text-[#8B92A8]">No verifications found</p>
                      <p className="text-xs text-[#525A72]">Try adjusting your date range or status filter</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#1A1E28]/40 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className="text-sm text-[#EEF0F6]" title={row.id}>{row.verifierName}</span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {row.requestedFields.slice(0, 3).map((f) => (
                          <span
                            key={f}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: '#1A1E28', color: '#8B92A8', border: '1px solid #252C3D' }}
                          >
                            {f}
                          </span>
                        ))}
                        {row.requestedFields.length > 3 && (
                          <span className="text-[10px] font-mono text-[#525A72]">
                            +{row.requestedFields.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <CredBadge type={row.credentialType} />
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className="text-xs font-mono"
                        style={{
                          color: row.responseTimeSec === null ? '#525A72'
                               : row.responseTimeSec < 10 ? '#22C55E'
                               : row.responseTimeSec < 20 ? '#F59E0B'
                               : '#EF4444',
                        }}
                      >
                        {row.responseTimeSec === null ? '—' : `${row.responseTimeSec}s`}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="text-xs text-[#525A72]" title={new Date(row.createdAt).toLocaleString()}>
                        {formatRelative(row.createdAt)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#1E2330]">
            <span className="text-xs text-[#525A72] font-mono">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </span>
            <div className="flex items-center gap-1">
              <PagButton
                label="←"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              />
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | '…')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, i) =>
                  item === '…' ? (
                    <span key={`ellipsis-${i}`} className="w-8 text-center text-xs text-[#525A72] font-mono">…</span>
                  ) : (
                    <PagButton
                      key={item}
                      label={String(item)}
                      onClick={() => setPage(item as number)}
                      active={page === item}
                    />
                  )
                )}
              <PagButton
                label="→"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pagination button ─────────────────────────────────────────────────────────

function PagButton({
  label,
  onClick,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 flex items-center justify-center rounded-md text-xs font-mono transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: active ? 'rgba(59,111,232,0.15)' : 'transparent',
        color:      active ? '#3B6FE8' : '#8B92A8',
        border:    `1px solid ${active ? 'rgba(59,111,232,0.3)' : 'transparent'}`,
      }}
    >
      {label}
    </button>
  );
}
