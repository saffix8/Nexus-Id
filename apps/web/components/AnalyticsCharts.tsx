// apps/web/components/AnalyticsCharts.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DailyPoint { date: string; count: number }
interface StatusBreakdown { name: string; value: number; color: string }

const STATUS_COLORS: Record<string, string> = {
  completed: '#22C55E',
  rejected: '#EF4444',
  expired: '#525A72',
};

export function VerificationVolumeChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5">
      <p className="text-sm font-medium text-text-secondary mb-4">Verification volume, last 30 days</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid stroke="#1E2330" vertical={false} />
          <XAxis dataKey="date" stroke="#525A72" fontSize={12} />
          <YAxis stroke="#525A72" fontSize={12} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#13161E', border: '1px solid #252C3D', borderRadius: 8 }} />
          <Line type="monotone" dataKey="count" stroke="#3B6FE8" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusBreakdownChart({ data }: { data: StatusBreakdown[] }) {
  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-xl p-5">
      <p className="text-sm font-medium text-text-secondary mb-4">Status breakdown</p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
            {data.map((entry, i) => (
              <Cell key={i} fill={STATUS_COLORS[entry.name] ?? entry.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: '#13161E', border: '1px solid #252C3D', borderRadius: 8 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
