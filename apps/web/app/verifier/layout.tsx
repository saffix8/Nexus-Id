import type { Metadata } from 'next';
import { VerifierShell } from '@/components/nexus/VerifierShell';

export const metadata: Metadata = { title: { default: 'Service Provider', template: '%s · NexusID' } };

export default function VerifierLayout({ children }: { children: React.ReactNode }) {
  return <VerifierShell>{children}</VerifierShell>;
}
