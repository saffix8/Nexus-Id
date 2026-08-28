'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ─── Inline SVG Icons ───────────────────────────────────────────────────────

function ShieldIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CheckCircleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function LockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function PhoneIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12" y2="18.01" />
    </svg>
  );
}

function GlobeIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function PlusCircleIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function MenuIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function XIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Animated Credential Card ───────────────────────────────────────────────

const HERO_CARD_FIELDS = [
  { label: 'Degree Title', value: 'BS Computer Science', reveal: true,  locked: false },
  { label: 'University',   value: 'Air University',      reveal: true,  locked: false },
  { label: 'CGPA',         value: '3.87 / 4.00',         reveal: true,  locked: true },
  { label: 'CNIC Number',  value: '35201-123...',         reveal: true,  locked: true },
];

function AnimatedCredentialCard() {
  const [cycle, setCycle] = useState(0);

  // Re-trigger animation every 7s
  useEffect(() => {
    const t = setInterval(() => setCycle((c) => c + 1), 7000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      key={cycle}
      className="relative w-full max-w-sm mx-auto animate-float"
      style={{ filter: 'drop-shadow(0 32px 64px rgba(59,111,232,0.18))' }}
    >
      {/* Glow behind card */}
      <div
        className="absolute inset-0 rounded-2xl blur-2xl opacity-30 -z-10"
        style={{ background: 'linear-gradient(135deg, #3B6FE840, #5B4FE840)' }}
      />

      <div className="rounded-2xl border border-border-default bg-bg-elevated overflow-hidden shadow-lg">
        {/* Card header strip */}
        <div
          className="relative h-20 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1A0D35, #0C0E13)' }}
        >
          {/* Security pattern */}
          <div
            className="absolute inset-0 opacity-[0.05] text-[#8B5CF6] security-pattern"
            style={{ color: '#8B5CF6' }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, #8B5CF680, transparent)' }}
          />
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
              style={{ background: '#8B5CF620', border: '1px solid #8B5CF630' }}
            >
              🎓
            </div>
            <div>
              <p className="text-[10px] font-mono tracking-widest uppercase" style={{ color: '#8B5CF6' }}>
                Education
              </p>
              <p className="text-sm font-medium text-text-primary">Higher Education Commission</p>
            </div>
          </div>
          {/* Issued badge */}
          <div className="absolute top-4 right-4">
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-sm border"
              style={{ color: '#22C55E', background: '#0F2A1A', borderColor: '#16532F30' }}
            >
              ● ACTIVE
            </span>
          </div>
        </div>

        {/* Fields */}
        <div className="p-4 space-y-1">
          {HERO_CARD_FIELDS.map((field, i) => (
            <div
              key={field.label}
              className={`field-reveal field-delay-${i + 1} flex items-center justify-between py-2 border-b border-border-subtle last:border-0`}
            >
              <span className="text-[11px] font-mono text-text-tertiary uppercase tracking-wide">
                {field.label}
              </span>
              {field.locked ? (
                <div className={`flex items-center gap-1.5 field-lock${i > 2 ? '-2' : ''}`}>
                  <LockIcon className="w-3 h-3 text-text-tertiary" />
                  <span className="text-sm text-text-tertiary tracking-[0.2em] font-mono">
                    ••••••
                  </span>
                </div>
              ) : (
                <span className="text-sm font-medium text-text-primary">{field.value}</span>
              )}
            </div>
          ))}

          {/* Footer */}
          <div className="pt-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-tertiary">
              SD-JWT · RFC 9901
            </span>
            <span className="text-[10px] font-mono" style={{ color: '#8B5CF6' }}>
              2 of 4 fields shared
            </span>
          </div>
        </div>
      </div>

      {/* Floating labels */}
      <div
        className="absolute -right-4 top-16 text-[10px] font-mono px-2 py-1 rounded-md border animate-fade-in-up"
        style={{
          background: '#0F2A1A',
          borderColor: '#16532F',
          color: '#22C55E',
          animationDelay: '2.2s',
          opacity: 0,
        }}
      >
        ✓ Degree verified
      </div>
      <div
        className="absolute -left-6 bottom-14 text-[10px] font-mono px-2 py-1 rounded-md border animate-fade-in-up"
        style={{
          background: '#071B26',
          borderColor: '#1E4060',
          color: '#38BDF8',
          animationDelay: '2.8s',
          opacity: 0,
        }}
      >
        🔒 CNIC hidden
      </div>
    </div>
  );
}

// ─── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Features',     href: '#features' },
    { label: 'How it Works', href: '#how-it-works' },
    { label: 'For Verifiers',href: '#verifiers' },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(12,14,19,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #1E2330' : '1px solid transparent',
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)' }}
          >
            N
          </div>
          <span
            className="text-lg font-display font-semibold"
            style={{
              background: 'linear-gradient(135deg, #EEF0F6, #8B92A8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            NexusID
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/auth/login"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors px-4 py-2 rounded-md hover:bg-bg-overlay"
          >
            Sign in
          </Link>
          <Link
            href="/auth/register"
            className="text-sm font-medium text-white px-4 py-2 rounded-md transition-all duration-150 hover:opacity-90 active:opacity-80"
            style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)' }}
          >
            Get started
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-text-secondary hover:text-text-primary"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <XIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border-subtle bg-bg-elevated">
          <div className="px-6 py-4 space-y-1">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="block py-3 text-text-secondary hover:text-text-primary transition-colors border-b border-border-subtle last:border-0"
              >
                {l.label}
              </a>
            ))}
            <div className="pt-4 flex flex-col gap-2">
              <Link href="/auth/login" className="text-center py-2.5 text-text-secondary border border-border-default rounded-lg">
                Sign in
              </Link>
              <Link
                href="/auth/register"
                className="text-center py-2.5 text-white font-medium rounded-lg"
                style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)' }}
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Section: Hero ───────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Ambient background gradient */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-[0.07]"
          style={{ background: '#3B6FE8' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-[0.05]"
          style={{ background: '#5B4FE8' }}
        />
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: 'radial-gradient(circle, #EEF0F6 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-16 items-center w-full">
        {/* Left: copy */}
        <div>
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 mb-6">
            <span
              className="text-xs font-mono tracking-wider uppercase px-3 py-1.5 rounded-full border"
              style={{
                color: '#3B6FE8',
                background: '#3B6FE810',
                borderColor: '#3B6FE830',
              }}
            >
              Powered by SD-JWT · RFC 9901 Compliant
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-5xl md:text-6xl font-display font-bold leading-[1.1] tracking-tight mb-6"
            style={{ color: '#EEF0F6' }}
          >
            Prove what matters.{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Hide what doesn&apos;t.
            </span>
          </h1>

          <p className="text-lg text-text-secondary leading-relaxed mb-8 max-w-lg">
            NexusID lets you verify your degree, identity, or enrollment to any website —
            without uploading your full documents. Share only what each request actually needs.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)', boxShadow: '0 0 0 1px rgba(59,111,232,0.4), 0 4px 16px rgba(59,111,232,0.2)' }}
            >
              Get the App
            </Link>
            <a
              href="#verifiers"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium border transition-all duration-150 hover:bg-bg-overlay"
              style={{ color: '#EEF0F6', borderColor: '#252C3D' }}
            >
              I&apos;m a Verifier →
            </a>
          </div>

          {/* Social proof */}
          <div className="mt-10 flex items-center gap-6">
            <div className="flex -space-x-2">
              {['#3B6FE8', '#8B5CF6', '#10B981', '#F59E0B'].map((c, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-bg-base flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: c }}
                >
                  {['N', 'H', 'A', 'L'][i]}
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm text-text-primary font-medium">NADRA · HEC · Air University · LinkedIn</p>
              <p className="text-xs text-text-tertiary">Four trusted credential sources</p>
            </div>
          </div>
        </div>

        {/* Right: animated credential card */}
        <div className="hidden md:flex justify-center">
          <AnimatedCredentialCard />
        </div>
      </div>
    </section>
  );
}

// ─── Section: Problem / Solution ─────────────────────────────────────────────

function ProblemSolutionSection() {
  const OldWayRow = ({ label }: { label: string }) => (
    <div className="flex items-center gap-3 py-2.5 border-b border-red-900/20 last:border-0">
      <div className="w-6 h-6 rounded-full bg-red-900/30 border border-red-800/40 flex items-center justify-center flex-shrink-0">
        <span className="text-xs text-red-400">✗</span>
      </div>
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="ml-auto text-xs font-mono text-red-400/70 bg-red-900/20 px-2 py-0.5 rounded">exposed</span>
    </div>
  );

  const NewWayRow = ({
    label,
    shared,
  }: {
    label: string;
    shared: boolean;
  }) => (
    <div className="flex items-center gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
          shared
            ? 'bg-green-900/30 border border-green-700/40'
            : 'bg-bg-overlay border border-border-subtle'
        }`}
      >
        {shared ? (
          <span className="text-xs text-green-400">✓</span>
        ) : (
          <LockIcon className="w-3 h-3 text-text-tertiary" />
        )}
      </div>
      <span className={`text-sm ${shared ? 'text-text-primary' : 'text-text-tertiary'}`}>
        {label}
      </span>
      <span
        className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${
          shared
            ? 'text-green-400 bg-green-900/20'
            : 'text-text-tertiary bg-bg-overlay'
        }`}
      >
        {shared ? 'verified' : '••••••'}
      </span>
    </div>
  );

  return (
    <section id="features" className="py-24 border-t border-border-subtle">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section eyebrow */}
        <div className="text-center mb-14">
          <p className="text-xs font-mono text-text-tertiary tracking-widest uppercase mb-3">
            The problem we solve
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-text-primary">
            A job portal asks for your degree.
            <br />
            <span className="text-text-secondary font-normal">You shouldn&apos;t have to share everything.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* The Old Way */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#4A1515' }}>
            <div
              className="px-5 py-3 border-b flex items-center gap-2"
              style={{ background: '#250F0F', borderColor: '#4A1515' }}
            >
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-red-400">The old way</span>
              <span className="ml-auto text-xs text-text-tertiary font-mono">Upload: transcript.pdf</span>
            </div>
            <div className="p-5 bg-bg-elevated">
              <p className="text-xs font-mono text-text-tertiary uppercase tracking-wide mb-3">
                They asked for: degree title
              </p>
              <p className="text-xs font-mono text-text-tertiary uppercase tracking-wide mb-3">
                But they got:
              </p>
              <div className="space-y-0">
                <OldWayRow label="Full Name" />
                <OldWayRow label="CNIC Number" />
                <OldWayRow label="Father's Name" />
                <OldWayRow label="Date of Birth" />
                <OldWayRow label="Home Address" />
                <OldWayRow label="Degree Title ← the one they needed" />
                <OldWayRow label="CGPA" />
                <OldWayRow label="All Courses + Marks" />
              </div>
              <div className="mt-4 p-3 rounded-lg bg-red-900/10 border border-red-900/20">
                <p className="text-xs text-red-400">
                  ⚠ You have no control over how this data is used or stored.
                </p>
              </div>
            </div>
          </div>

          {/* The NexusID Way */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: '#16532F' }}
          >
            <div
              className="px-5 py-3 border-b flex items-center gap-2"
              style={{ background: '#0F2A1A', borderColor: '#16532F' }}
            >
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-400">The NexusID way</span>
              <span className="ml-auto text-xs text-text-tertiary font-mono">SD-JWT proof</span>
            </div>
            <div className="p-5 bg-bg-elevated">
              <p className="text-xs font-mono text-text-tertiary uppercase tracking-wide mb-3">
                They asked for: degree title
              </p>
              <p className="text-xs font-mono text-text-tertiary uppercase tracking-wide mb-3">
                And they got exactly that:
              </p>
              <div className="space-y-0">
                <NewWayRow label="Full Name"       shared={false} />
                <NewWayRow label="CNIC Number"     shared={false} />
                <NewWayRow label="Father's Name"   shared={false} />
                <NewWayRow label="Date of Birth"   shared={false} />
                <NewWayRow label="Home Address"    shared={false} />
                <NewWayRow label="Degree Title"    shared={true}  />
                <NewWayRow label="CGPA"            shared={false} />
                <NewWayRow label="All Courses"     shared={false} />
              </div>
              <div className="mt-4 p-3 rounded-lg bg-green-900/10 border border-green-900/20">
                <p className="text-xs text-green-400">
                  ✓ Cryptographically verified. You chose exactly what to share.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section: How It Works ───────────────────────────────────────────────────

function HowItWorksSection() {
  const steps = [
    {
      number: '01',
      icon: <PlusCircleIcon className="w-7 h-7" />,
      title: 'Add your credential',
      description:
        'Connect to NADRA for identity, HEC for your degree, Air University for enrollment, or LinkedIn for employment. Each credential is verified at source and stored encrypted on your device.',
      accent: '#3B6FE8',
      accentBg: '#3B6FE810',
    },
    {
      number: '02',
      icon: <GlobeIcon className="w-7 h-7" />,
      title: 'Website requests verification',
      description:
        'The NexusID browser extension detects a verification request on any website. No special integration needed by the site — just two lines of HTML.',
      accent: '#8B5CF6',
      accentBg: '#8B5CF610',
    },
    {
      number: '03',
      icon: <PhoneIcon className="w-7 h-7" />,
      title: 'Approve on your phone',
      description:
        'You get a push notification. See exactly which fields will be shared and which stay hidden. Approve with biometrics. The proof reaches the website in seconds.',
      accent: '#10B981',
      accentBg: '#10B98110',
    },
  ];

  return (
    <section id="how-it-works" className="py-24 border-t border-border-subtle">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-xs font-mono text-text-tertiary tracking-widest uppercase mb-3">
            The flow
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-text-primary">
            Three steps. Under ten seconds.
          </h2>
          <p className="mt-3 text-text-secondary max-w-xl mx-auto">
            From credential request to verified result, entirely without passwords or document uploads.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line (desktop only) */}
          <div
            className="absolute top-10 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px hidden md:block"
            style={{
              background: 'linear-gradient(90deg, #3B6FE840, #8B5CF640, #10B98140)',
            }}
          />

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div key={step.number} className="relative flex flex-col items-center text-center md:items-start md:text-left">
                {/* Step icon */}
                <div className="relative mb-5">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center border"
                    style={{
                      background: step.accentBg,
                      borderColor: `${step.accent}30`,
                      color: step.accent,
                    }}
                  >
                    {step.icon}
                  </div>
                  <span
                    className="absolute -top-2 -right-2 text-[10px] font-mono font-bold w-5 h-5 rounded-full flex items-center justify-center text-white"
                    style={{ background: step.accent }}
                  >
                    {step.number.slice(1)}
                  </span>
                </div>

                <h3 className="text-lg font-display font-semibold text-text-primary mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section: Credential Sources ─────────────────────────────────────────────

function CredentialSourcesSection() {
  const sources = [
    {
      icon: '🆔',
      name: 'NADRA Pakistan',
      type: 'National Identity',
      accent: '#3B82F6',
      bg: '#0D1B35',
      claims: ['Full Name', 'CNIC Number', 'Date of Birth', 'Age / Age Over 18', 'Gender', 'Home Address'],
    },
    {
      icon: '🎓',
      name: 'Higher Education Commission',
      type: 'Education',
      accent: '#8B5CF6',
      bg: '#1A0D35',
      claims: ['Degree Title', 'University Name', 'Year of Award', 'Registration Number', 'Enrollment Status'],
    },
    {
      icon: '🏫',
      name: 'Air University',
      type: 'Enrollment',
      accent: '#10B981',
      bg: '#071E15',
      claims: ['Enrollment Status', 'Program / Department', 'Registration Number', 'Current CGPA', 'Current Batch'],
    },
    {
      icon: '💼',
      name: 'LinkedIn',
      type: 'Employment',
      accent: '#0EA5E9',
      bg: '#071B26',
      claims: ['Current Employer', 'Job Title', 'Employment Status', 'Total Experience', 'Position Count'],
    },
  ];

  return (
    <section className="py-24 border-t border-border-subtle">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-mono text-text-tertiary tracking-widest uppercase mb-3">
            Credential sources
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-text-primary">
            Verified at the source.
          </h2>
          <p className="mt-3 text-text-secondary max-w-lg mx-auto">
            Every credential is issued directly by the authority that holds the data —
            NADRA, HEC, your university portal, or LinkedIn.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {sources.map((source) => (
            <div
              key={source.name}
              className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden group hover:border-border-strong transition-all duration-300"
            >
              {/* Header */}
              <div
                className="relative h-20 overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${source.bg}, #0C0E13)`,
                  borderBottom: `1px solid ${source.accent}20`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-[0.04] security-pattern"
                  style={{ color: source.accent }}
                />
                <div className="absolute inset-0 flex items-center px-4 gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: `${source.accent}20`, border: `1px solid ${source.accent}30` }}
                  >
                    {source.icon}
                  </div>
                  <div>
                    <p
                      className="text-[10px] font-mono uppercase tracking-wider"
                      style={{ color: source.accent }}
                    >
                      {source.type}
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-4">
                <p className="text-sm font-medium text-text-primary mb-3 leading-snug">
                  {source.name}
                </p>
                <div className="space-y-1.5">
                  {source.claims.map((claim) => (
                    <div key={claim} className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: source.accent }}
                      />
                      <span className="text-xs text-text-secondary">{claim}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: For Verifiers ───────────────────────────────────────────────────

const CODE_SNIPPET = `<!-- Add to your page where you want verification -->
<div
  id="nexusid-verify"
  data-verifier-id="yourcompany.com"
  data-verifier-name="Your Company"
  data-fields="degree_title,university"
  data-nonce="a8f3d2b1c9e4..."
>
</div>`;

function VerifiersSection() {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  const copyCode = () => {
    navigator.clipboard.writeText(CODE_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlighted = CODE_SNIPPET
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(id|data-verifier-id|data-verifier-name|data-fields|data-nonce)=/g, '<span style="color:#38BDF8">$1</span>=')
    .replace(/(&lt;div|&lt;\/div&gt;)/g, '<span style="color:#8B5CF6">$1</span>')
    .replace(/"(.*?)"/g, '<span style="color:#22C55E">"$1"</span>')
    .replace(/(#.*)/g, '<span style="color:#525A72">$1</span>');

  return (
    <section id="verifiers" className="py-24 border-t border-border-subtle">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left: copy */}
          <div>
            <p className="text-xs font-mono text-text-tertiary tracking-widest uppercase mb-4">
              For verifiers
            </p>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-text-primary mb-4">
              Two lines of HTML is all it takes.
            </h2>
            <p className="text-text-secondary leading-relaxed mb-6">
              Add the NexusID verification widget anywhere on your site. When a user visits, the browser
              extension sends the request to their phone. You receive a cryptographically verified proof
              — no documents, no storage, no compliance headache.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                'No server-side integration required',
                'Proof verified by open cryptographic standard',
                'Users consent explicitly before any data is shared',
                'Your verification analytics in a single dashboard',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-text-secondary">{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/verifier/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)' }}
            >
              Create verifier account →
            </Link>
          </div>

          {/* Right: code snippet */}
          <div>
            <div
              className="rounded-xl border border-border-default overflow-hidden"
              style={{ background: '#080A10' }}
            >
              {/* Terminal header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-xs font-mono text-text-tertiary">index.html</span>
                <button
                  onClick={copyCode}
                  className="text-xs font-mono text-text-tertiary hover:text-text-primary transition-colors px-2 py-0.5 rounded border border-border-subtle hover:border-border-default"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              {/* Code */}
              <div className="p-5 overflow-x-auto">
                <pre
                  ref={ref}
                  className="text-sm font-mono leading-relaxed"
                  style={{ color: '#EEF0F6' }}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              </div>

              {/* Footer note */}
              <div className="px-5 pb-4">
                <p className="text-xs font-mono text-text-tertiary border-t border-border-subtle pt-3">
                  That&apos;s it. The NexusID extension handles the rest.
                </p>
              </div>
            </div>

            {/* Stat pills */}
            <div className="flex gap-3 mt-4">
              {[
                { v: '< 5s',  label: 'avg verification time' },
                { v: 'RFC 9901', label: 'standard' },
                { v: '0 docs', label: 'stored on your server' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex-1 text-center py-2 rounded-lg border border-border-subtle bg-bg-elevated"
                >
                  <p className="text-sm font-mono font-medium text-text-primary">{s.v}</p>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border-subtle py-12 mt-8">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-10 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #3B6FE8, #5B4FE8)' }}
              >
                N
              </div>
              <span className="font-display font-semibold text-text-primary">NexusID</span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Privacy-preserving digital identity for Pakistan.
              Prove what matters. Nothing more.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-3">Product</p>
              <ul className="space-y-2">
                {['Features', 'How it Works', 'For Verifiers', 'Documentation'].map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-3">Account</p>
              <ul className="space-y-2">
                {['Sign in', 'Register', 'Verifier Portal', 'API Keys'].map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Protocol */}
          <div>
            <p className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-3">Built on</p>
            <div className="space-y-2">
              {[
                { label: 'SD-JWT',             sub: 'IETF RFC 9901' },
                { label: 'RSA-2048',           sub: 'Credential signing' },
                { label: 'Hyperledger Fabric', sub: 'Audit trail' },
                { label: 'snarkjs / Circom',   sub: 'ZK age proofs' },
              ].map((item) => (
                <div key={item.label} className="flex items-baseline gap-2">
                  <span className="text-xs font-mono text-text-primary">{item.label}</span>
                  <span className="text-xs text-text-tertiary">— {item.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-6 border-t border-border-subtle">
          <p className="text-xs text-text-tertiary font-mono">
            Open Source · Air University FYP · 2024
          </p>
          <div className="flex items-center gap-1.5">
            <ShieldIcon className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="text-xs text-text-tertiary font-mono">
              No personal data stored on our servers
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-bg-base">
      <Nav />
      <HeroSection />
      <ProblemSolutionSection />
      <HowItWorksSection />
      <CredentialSourcesSection />
      <VerifiersSection />
      <Footer />
    </main>
  );
}
