'use client';

import { AppShell } from '@/components/nexus/AppShell';
import { useVerifierProfile } from '@/lib/verifierApi';

export function VerifierShell({ children }: { children: React.ReactNode }) {
  const { data: profile } = useVerifierProfile();

  return (
    <AppShell
      area="provider"
      user={{ name: profile?.displayName ?? 'Service Provider', subtitle: profile?.domain }}
    >
      {children}
    </AppShell>
  );
}
