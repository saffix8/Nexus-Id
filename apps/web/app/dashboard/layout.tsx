import { getSession } from '@/lib/auth';
import { DashboardChrome } from './DashboardChrome';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  const user = {
    name: session?.name ?? 'User',
    email: session?.email ?? '',
  };

  return <DashboardChrome user={user}>{children}</DashboardChrome>;
}