import { getSession } from '@/lib/auth';
import { AppShell } from '@/components/nexus/AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <AppShell area="user" user={{ name: session?.name ?? 'User', subtitle: session?.email ?? undefined }}>
      {children}
    </AppShell>
  );
}
