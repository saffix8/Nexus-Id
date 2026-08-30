// apps/web/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardSummary {
  credentialCount: number;
  verificationsThisMonth: number;
  lastVerifiedAt: string | null;
  expiringCount: number;
  recentActivity: {
    id: string;
    verifierId: string;
    status: string;
    createdAt: string;
  }[];
}

function StatCard({
  title,
  value,
  warning,
}: {
  title: string;
  value: string | number;
  warning?: boolean;
}) {
  return (
    <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-5 flex flex-col gap-2">
      <span className="text-[10px] font-mono tracking-wider uppercase text-[#525A72]">{title}</span>
      <span
        className="text-3xl font-semibold tracking-tight"
        style={{
          fontFamily: 'DM Sans, sans-serif',
          color: warning ? '#F59E0B' : '#EEF0F6',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/v1/verification/history', { credentials: 'include' });
        const json = await res.json();

        if (json.success) {
          const history = json.data as { requestId: string; verifierId: string; status: string; created_at: string }[];
          const now = new Date();
          const thisMonthCount = history.filter((h) => {
            const d = new Date(h.created_at);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length;

          setData({
            credentialCount: 0, // wired up once a credentials-list endpoint exists
            verificationsThisMonth: thisMonthCount,
            lastVerifiedAt: history[0]?.created_at ?? null,
            expiringCount: 0,
            recentActivity: history.slice(0, 5).map((h) => ({
              id: h.requestId,
              verifierId: h.verifierId,
              status: h.status,
              createdAt: h.created_at,
            })),
          });
        } else {
          setData({ credentialCount: 0, verificationsThisMonth: 0, lastVerifiedAt: null, expiringCount: 0, recentActivity: [] });
        }
      } catch {
        setData({ credentialCount: 0, verificationsThisMonth: 0, lastVerifiedAt: null, expiringCount: 0, recentActivity: [] });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-[#13161E] rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[#13161E] border border-[#1E2330] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#EEF0F6', fontFamily: 'DM Sans, sans-serif' }}>
          Welcome back
        </h1>
        <Link
          href="/dashboard/credentials"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)' }}
        >
          + Add Credential
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Credentials" value={data.credentialCount} />
        <StatCard title="Verifications This Month" value={data.verificationsThisMonth} />
        <StatCard title="Last Verified" value={formatRelative(data.lastVerifiedAt)} />
        <StatCard title="Expiring Soon" value={data.expiringCount} warning={data.expiringCount > 0} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-[#13161E] border border-[#1E2330] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#EEF0F6]">My Credentials</h2>
            <Link href="/dashboard/credentials" className="text-xs text-[#3B6FE8] hover:text-[#4A7EF7]">
              View all →
            </Link>
          </div>

          {data.credentialCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#1A1E28] border border-[#252C3D] flex items-center justify-center mb-4 text-3xl">
                🆔
              </div>
              <p className="text-sm font-medium text-[#EEF0F6] mb-1">No credentials yet</p>
              <p className="text-xs text-[#8B92A8] max-w-xs mb-4">
                Connect NADRA, HEC, your university, or LinkedIn to start proving things about yourself without oversharing.
              </p>
              <Link
                href="/dashboard/credentials"
                className="text-sm px-4 py-2 rounded-lg border transition-colors"
                style={{ borderColor: '#252C3D', color: '#8B92A8' }}
              >
                Add your first credential
              </Link>
            </div>
          ) : (
            <p className="text-sm text-[#8B92A8]">Credential list renders here.</p>
          )}
        </div>

        <div className="bg-[#13161E] border border-[#1E2330] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#EEF0F6]">Recent Activity</h2>
            <Link href="/dashboard/history" className="text-xs text-[#3B6FE8] hover:text-[#4A7EF7]">
              View history →
            </Link>
          </div>

          {data.recentActivity.length === 0 ? (
            <p className="text-xs text-[#525A72]">No verifications yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.recentActivity.map((item) => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-[#8B92A8] truncate">{item.verifierId}</span>
                  <span className="text-xs text-[#525A72] shrink-0 ml-2">{formatRelative(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}