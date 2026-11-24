import type { Metadata } from 'next';
import { AppShell } from '@/components/nexus/AppShell';
import { ComponentGallery } from './ComponentGallery';

export const metadata: Metadata = {
  title: 'Components · NexusID',
  robots: { index: false, follow: false },
};

export default function DevComponentsPage({
  searchParams,
}: {
  searchParams: { area?: string };
}) {
  const area = searchParams.area === 'provider' ? 'provider' : 'user';
  return (
    <AppShell
      area={area}
      title="Component gallery"
      user={
        area === 'provider'
          ? { name: 'Shop A', subtitle: 'shop-a.demo' }
          : { name: 'Ayesha Khan', subtitle: 'ayesha@example.pk' }
      }
    >
      <ComponentGallery area={area} />
    </AppShell>
  );
}
