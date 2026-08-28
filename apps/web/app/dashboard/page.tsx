'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface KPIData {
  totalVerifications: number;
  thisMonth: number;
  successRate: number;
  avgResponseTime: number;
  totalChange: string;
  monthChange: string;
  successChange: string;
  responseChange: string;
}

interface DailyVolume {
  date: string;
  count: number;
}

interface FieldPopularity {
  field: string;
  count: number;
}

interface StatusBreakdown {
  name: string;
  value: number;
  color: string;
}

interface RecentVerification {
  id: string;
  requestedFields: string[];
  status: 'completed' | 'rejected' | 'expired';
  responseTimeSec: number;
  createdAt: string;
}

interface AnalyticsData {
  kpi: KPIData;
  dailyVolume: DailyVolume[];
  fieldPopularity: FieldPopularity[];
  statusBreakdown: StatusBreakdown[];
  recent: RecentVerification[];
}

// ── Mock data (replaces API until backend is live) ────────────────────────────

function generateMockData(): AnalyticsData {
  const today = new Date();
  const dailyVolume: DailyVolume[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: Math.floor(Math.random() * 40 + 5),
    };
  });

  return {
    kpi: {
      totalVerifications: 1_284,
      thisMonth: 247,
      successRate: 91.4,
      avgResponseTime: 8.3,
      totalChange: '+12%',
      monthChange: '+18%',
      successChange: '+2.1%',
      responseChange: '-1.2s',
    },
    dailyVolume,
    fieldPopularity: [
      { field: 'degree_title', count: 312 },
      { field: 'age_over_18', count: 289 },
      { field: 'enrollment_status', count: 201 },
      { field: 'current_company', count: 178 },
      { field: 'full_name', count: 154 },
    ],
    statusBreakdown: [
      { name: 'Completed', value: 1173, color: '#22C55E' },
      { name: 'Rejected', value: 74, color: '#EF4444' },
      { name: 'Expired', value: 37, color: '#525A72' },
    ],
    recent: Array.from({ length: 10 }, (_, i) => ({
      id: `req_${Math.random().toString(36).slice(2, 10)}`,
      requestedFields: [
        ['degree_title', 'university'],
        ['age_over_18', 'full_name'],
        ['enrollment_status'],
        ['current_company', 'current_title', 'experience_years'],
        ['cnic', 'full_name'],
      ][i % 5],
      status: (['completed', 'completed', 'completed', 'rejected', 'expired'] as const)[i % 5],
      responseTimeSec: parseFloat((Math.random() * 20 + 2).toFixed(1)),
      createdAt: new Date(Date.now() - i * 3_600_000 * 2).toISOString(),
    })),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({
  title,
  value,
  change,
  trend,
  unit,
  icon,
}: {
  title: string;
  value: string | number;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  unit?: string;
  icon: React.ReactNode;
}) {
  const trendColor = trend === 'up' ? '#22C55E' : trend === 'down' ? '#EF4444' : '#8B92A8';
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  return (
    <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-wider uppercase text-[#525A72]">{title}</span>
        <div className="w-8 h-8 rounded-lg bg-[#1A1E28] flex items-center justify-center text-[#8B92A8]">
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-[2rem] font-semibold text-[#EEF0F6] leading-none tracking-tight" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          {value}
          {unit && <span className="text-lg text-[#8B92A8] ml-1">{unit}</span>}
        </span>
        <span className="text-sm font-medium" style={{ color: trendColor }}>
          {trendArrow} {change}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RecentVerification['status'] }) {
  const map = {
    completed: { label: 'Completed', bg: '#0F2A1A', text: '#22C55E', border: '#16532F' },
    rejected:  { label: 'Rejected',  bg: '#250F0F', text: '#EF4444', border: '#4A1515' },
    expired:   { label: 'Expired',   bg: '#1A1E28', text: '#525A72', border: '#252C3D' },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono tracking-wider uppercase px-2 py-0.5 rounded"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#13161E] border border-[#252C3D] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-[#525A72] font-mono mb-1">{label}</p>
      <p className="text-sm font-semibold text-[#EEF0F6]">{payload[0].value} verifications</p>
    </div>
  );
};

const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#13161E] border border-[#252C3D] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-[#525A72] font-mono mb-1">{label}</p>
      <p className="text-sm font-semibold text-[#EEF0F6]">{payload[0].value} requests</p>
    </div>
  );
};

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#13161E] border border-[#252C3D] rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-[#525A72] font-mono mb-1">{payload[0].name}</p>
      <p className="text-sm font-semibold text-[#EEF0F6]">{payload[0].value}</p>
    </div>
  );
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function VerifierDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = document.cookie
          .split('; ')
          .find((c) => c.startsWith('nexusid_token='))
          ?.split('=')[1];

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/analytics/verifications`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) throw new Error('API error');
        const json = await res.json();
        setData(json.data);
      } catch {
        // Fall back to mock data so the UI is always populated during dev
        setData(generateMockData());
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-[#13161E] border border-[#1E2330] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 h-64 bg-[#13161E] border border-[#1E2330] rounded-xl" />
          <div className="h-64 bg-[#13161E] border border-[#1E2330] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* ── KPI Row ── */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          title="Total Verifications"
          value={data.kpi.totalVerifications.toLocaleString()}
          change={data.kpi.totalChange}
          trend="up"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M8 2l6 3.5v5L8 14 2 10.5v-5L8 2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
            </svg>
          }
        />
        <KPICard
          title="This Month"
          value={data.kpi.thisMonth}
          change={data.kpi.monthChange}
          trend="up"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
              <path d="M5 2v2M11 2v2M2 7h12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          }
        />
        <KPICard
          title="Success Rate"
          value={data.kpi.successRate}
          change={data.kpi.successChange}
          trend="up"
          unit="%"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.25" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <KPICard
          title="Avg Response Time"
          value={data.kpi.avgResponseTime}
          change={data.kpi.responseChange}
          trend="down"
          unit="s"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.25" />
              <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          }
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Line chart — daily volume */}
        <div className="col-span-2 bg-[#13161E] border border-[#1E2330] rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-[#EEF0F6]">Verification Volume</h2>
            <p className="text-xs text-[#525A72] mt-0.5">Last 30 days</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.dailyVolume} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#1E2330" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#525A72', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                interval={6}
              />
              <YAxis
                tick={{ fill: '#525A72', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#252C3D', strokeWidth: 1 }} />
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B6FE8" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#3B6FE8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Line
                type="monotone"
                dataKey="count"
                stroke="#3B6FE8"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3B6FE8', stroke: '#13161E', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart — status breakdown */}
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-[#EEF0F6]">Status Breakdown</h2>
            <p className="text-xs text-[#525A72] mt-0.5">All time</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={data.statusBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                dataKey="value"
              >
                {data.statusBreakdown.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {data.statusBreakdown.map((s) => {
              const total = data.statusBreakdown.reduce((a, b) => a + b.value, 0);
              return (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-xs text-[#8B92A8]">{s.name}</span>
                  </div>
                  <span className="text-xs font-mono text-[#525A72]">
                    {((s.value / total) * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Bar chart — top fields */}
        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-[#EEF0F6]">Top Requested Fields</h2>
            <p className="text-xs text-[#525A72] mt-0.5">By frequency</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={data.fieldPopularity}
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
                width={110}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: '#1A1E28' }} />
              <Bar dataKey="count" fill="#3B6FE8" radius={[0, 3, 3, 0]} maxBarSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent verifications table */}
        <div className="col-span-2 bg-[#13161E] border border-[#1E2330] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#EEF0F6]">Recent Verifications</h2>
              <p className="text-xs text-[#525A72] mt-0.5">Last 10 requests</p>
            </div>
            <a href="/verifier/analytics" className="text-xs text-[#3B6FE8] hover:text-[#4A7EF7] transition-colors">
              View full history →
            </a>
          </div>

          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2330]">
                  {['Request ID', 'Fields', 'Status', 'Response', 'Date'].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[10px] font-mono tracking-wider uppercase text-[#525A72] pb-3 pr-4 last:pr-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2330]">
                {data.recent.map((row) => (
                  <tr key={row.id} className="group hover:bg-[#1A1E28]/50 transition-colors">
                    <td className="py-3 pr-4">
                      <span className="text-xs font-mono text-[#525A72]">{row.id}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs text-[#8B92A8] truncate max-w-[120px] block">
                        {row.requestedFields.slice(0, 2).join(', ')}
                        {row.requestedFields.length > 2 && (
                          <span className="text-[#525A72]"> +{row.requestedFields.length - 2}</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs font-mono text-[#8B92A8]">{row.responseTimeSec}s</span>
                    </td>
                    <td className="py-3">
                      <span className="text-xs text-[#525A72]">{formatRelative(row.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
