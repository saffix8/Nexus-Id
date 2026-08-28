import type { Metadata } from 'next';
import { Inter, DM_Sans, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// ── Font loading (server-side, no 'use client') ──────────────────────────────

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  weight: ['400', '500'],
  display: 'swap',
});

// ── Metadata (only valid in server components) ────────────────────────────────

export const metadata: Metadata = {
  title: 'NexusID — Privacy-First Identity Verification',
  description:
    'Prove your identity, degree, or enrollment to any website — without uploading your full documents. Powered by SD-JWT selective disclosure.',
  keywords: [
    'identity verification',
    'SD-JWT',
    'privacy',
    'NADRA',
    'HEC',
    'selective disclosure',
    'Pakistan',
  ],
  authors: [{ name: 'NexusID Team', url: 'https://nexusid.com' }],
  openGraph: {
    title: 'NexusID — Privacy-First Identity Verification',
    description:
      'Prove what matters. Hide what doesn\'t. SD-JWT selective disclosure for Pakistan.',
    type: 'website',
    locale: 'en_PK',
    siteName: 'NexusID',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NexusID — Privacy-First Identity Verification',
    description: 'Prove what matters. Hide what doesn\'t.',
  },
  robots: {
    index: true,
    follow: true,
  },
  themeColor: '#0C0E13',
};

// ── Root Layout ───────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-bg-base text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
