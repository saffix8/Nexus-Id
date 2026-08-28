'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

// ── Icons ───────────────────────────────────────────────────────────────────

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2L3 5.5V10c0 4 3 7 7 8 4-1 7-4 7-8V5.5L10 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4.5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 2h5v5M14 2L8 8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NexusIDMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold"
        style={{ background: 'linear-gradient(135deg, #3B6FE8 0%, #5B4FE8 100%)' }}
        aria-hidden="true"
      >
        N
      </div>
      <span className="text-[15px] font-semibold text-[#EEF0F6]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        NexusID
      </span>
    </div>
  );
}

// ── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',       href: '/dashboard',             Icon: GridIcon   },
  { label: 'My Credentials',  href: '/dashboard/credentials', Icon: ShieldIcon },
  { label: 'History',         href: '/dashboard/history',     Icon: ClockIcon  },
  { label: 'Settings',        href: '/dashboard/settings',    Icon: GearIcon   },
] as const;

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth?action=logout', { method: 'POST' });
    router.push('/auth/login');
  };

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-60 flex flex-col z-30"
      style={{
        background:   '#13161E',
        borderRight:  '1px solid #1E2330',
      }}
    >
      {/* Logo */}
      <div className="h-16 px-5 flex items-center border-b" style={{ borderColor: '#1E2330' }}>
        <NexusIDMark />
      </div>

      {/* User pill */}
      <div className="px-4 py-4 border-b" style={{ borderColor: '#1E2330' }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg" style={{ background: '#0A0C10' }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)' }}
          >
            U
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: '#EEF0F6' }}>User</p>
            <p className="text-xs truncate" style={{ color: '#525A72' }}>user@example.com</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Primary navigation">
        {NAV_ITEMS.map(({ label, href, Icon }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150"
              style={{
                color:      isActive ? '#EEF0F6' : '#8B92A8',
                background: isActive ? '#1A1E28' : 'transparent',
                borderLeft: isActive ? '2px solid #3B6FE8' : '2px solid transparent',
              }}
            >
              <Icon
                className="w-4 h-4 shrink-0 transition-colors"
                aria-hidden="true"
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 space-y-1 border-t" style={{ borderColor: '#1E2330' }}>
        <Link
          href="/verifier"
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors"
          style={{ color: '#3B6FE8' }}
        >
          <ExternalLinkIcon className="w-4 h-4 shrink-0" />
          Verifier Portal
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-left"
          style={{ color: '#8B92A8' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#EEF0F6'; (e.currentTarget as HTMLButtonElement).style.background = '#1A1E28'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8B92A8'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <LogoutIcon className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Topbar ───────────────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':             'Dashboard',
  '/dashboard/credentials': 'My Credentials',
  '/dashboard/history':     'Verification History',
  '/dashboard/settings':    'Settings',
};

function Topbar() {
  const pathname = usePathname();
  const title    = PAGE_TITLES[pathname] ?? 'Dashboard';

  return (
    <header
      className="fixed top-0 right-0 h-16 flex items-center justify-between px-8 z-20"
      style={{
        left:         '240px',
        background:   '#0C0E13',
        borderBottom: '1px solid #1E2330',
      }}
    >
      <h1 className="text-lg font-semibold" style={{ color: '#EEF0F6', fontFamily: 'DM Sans, sans-serif' }}>
        {title}
      </h1>

      <div className="flex items-center gap-3">
        {/* Notification bell — placeholder */}
        <button
          aria-label="Notifications"
          className="w-9 h-9 rounded-md flex items-center justify-center transition-colors"
          style={{ color: '#525A72' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1E28'; (e.currentTarget as HTMLButtonElement).style.color = '#EEF0F6'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#525A72'; }}
        >
          <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5" aria-hidden="true">
            <path d="M10 2a5.5 5.5 0 00-5.5 5.5v2L3 12v1h14v-1l-1.5-2.5v-2A5.5 5.5 0 0010 2ZM8 14a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)' }}
          aria-label="User menu"
          role="button"
          tabIndex={0}
        >
          U
        </div>
      </div>
    </header>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#0C0E13' }}>
      <Sidebar />
      <Topbar />
      <main
        className="min-h-screen pt-16"
        style={{ marginLeft: '240px' }}
      >
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
