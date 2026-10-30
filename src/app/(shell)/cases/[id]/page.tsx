import { Suspense } from 'react';
import { CaseDetail } from '@/components/case-detail/case-detail';
import { LoadingState } from '@/components/shell/states';
import { loadSeed } from '@/lib/seed';

// The seed's ids are prerendered. Cases opened later aren't in this list; they render on first
// request, and the shell reads the pathname, which needs at least one sample to validate against.
export async function generateStaticParams() {
  const { cases } = await loadSeed();
  return cases.map((c) => ({ id: c.id }));
}

async function CaseRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetail caseId={id} />;
}

export default function Page({ params }: PageProps<'/cases/[id]'>) {
  return (
    <Suspense fallback={<LoadingState label="Loading case" />}>
      <CaseRoute params={params} />
    </Suspense>
  );
}
