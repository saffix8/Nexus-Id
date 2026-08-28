'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  {
    href: '/verifier/dashboard',
    label: 'Overview',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      </svg>
    ),
  },
  {
    href: '/verifier/create',
    label: 'Create Request',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/verifier/integration',
    label: 'Integration',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <path d="M5 4L2 8l3 4M11 4l3 4-3 4M9 3l-2 10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/verifier/analytics',
    label: 'Analytics',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <path d="M1 12l4-4 3 3 4-5 3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M1 15h14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/verifier/api-keys',
    label: 'API Keys',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
        <circle cx="5.5" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M8.5 7H15M12 5v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M14 5v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/verifier/dashboard': 'Overview',
  '/verifier/create': 'Create Verification Request',
  '/verifier/integration': 'Integration Guide',
  '/verifier/analytics': 'Analytics',
  '/verifier/api-keys': 'API Keys',
};

export default function VerifierLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const pageTitle = PAGE_TITLES[pathname] ?? 'Verifier Portal';

  function handleLogout() {
    document.cookie = 'nexusid_token=; Max-Age=0; path=/';
    router.push('/auth/login');
  }

  return (
    <div className="flex h-screen bg-[#0C0E13] overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-[#13161E] border-r border-[#1E2330]">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-[#1E2330]">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#3B6FE8] to-[#5B4FE8] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 6v4M6 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-[#EEF0F6]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              NexusID
            </span>
            <span className="ml-2 text-[10px] font-mono tracking-wider uppercase text-[#3B6FE8] bg-[#3B6FE8]/10 border border-[#3B6FE8]/20 px-1.5 py-0.5 rounded">
              Verifier
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="px-3 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150',
                    isActive
                      ? 'bg-[#1A1E28] text-[#EEF0F6] border-l-2 border-[#3B6FE8] pl-[10px]'
                      : 'text-[#8B92A8] hover:text-[#EEF0F6] hover:bg-[#1A1E28]/50',
                  ].join(' ')}
                >
                  <span className={isActive ? 'text-[#3B6FE8]' : 'text-current'}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom section */}
        <div className="border-t border-[#1E2330] p-3 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[#8B92A8] hover:text-[#EEF0F6] hover:bg-[#1A1E28]/50 transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M6 12H2V4h4M6 8h8M11 5l3 3-3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Switch to User View
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[#525A72] hover:text-[#EF4444] hover:bg-[#EF4444]/5 transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M10 12h4V4h-4M6 12H2V4h4M6 8h8M9 5l3 3-3 3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 flex-shrink-0 flex items-center justify-between px-8 border-b border-[#1E2330] bg-[#0C0E13]/80 backdrop-blur-sm">
          <h1 className="text-base font-semibold text-[#EEF0F6]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {pageTitle}
          </h1>

          <div className="flex items-center gap-3">
            {/* Docs link */}
            <a
              href="https://docs.nexusid.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#525A72] hover:text-[#8B92A8] transition-colors"
            >
              Docs ↗
            </a>

            {/* User avatar */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3B6FE8] to-[#5B4FE8] flex items-center justify-center text-white text-xs font-semibold"
              >
                V
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-10 w-48 bg-[#13161E] border border-[#252C3D] rounded-lg shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-[#1E2330]">
                    <p className="text-xs text-[#EEF0F6] font-medium">Verifier Account</p>
                    <p className="text-xs text-[#525A72] mt-0.5 font-mono">demo-jobportal.com</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-sm text-[#EF4444] hover:bg-[#EF4444]/5 transition-colors"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
