import { Suspense } from 'react';
import { LoadingState } from '@/components/shell/states';
import { TenantDetail } from '@/components/tenant/tenant-detail';
import { loadSeed } from '@/lib/seed';

/** The shell reads the pathname, so a dynamic segment needs known values to prerender with. */
export async function generateStaticParams() {
  const { tenants } = await loadSeed();
  return tenants.map((t) => ({ id: t.id }));
}

async function TenantRoute({ params }: PageProps<'/tenants/[id]'>) {
  const { id } = await params;
  return <TenantDetail id={id} />;
}

export default function Page(props: PageProps<'/tenants/[id]'>) {
  return (
    <Suspense fallback={<LoadingState label="Loading tenant" />}>
      <TenantRoute {...props} />
    </Suspense>
  );
}
