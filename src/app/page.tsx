import { Suspense } from 'react';
import { loadSeed } from '@/lib/seed';

async function SeedSummary() {
  const seed = await loadSeed();
  return (
    <p className="text-sm text-muted-foreground">
      Seed: {seed.meta.source} · data as of {seed.meta.dataAsOf} · {seed.cases.length} cases ·{' '}
      {seed.leases.length} leases · {seed.properties.length} properties
    </p>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Notice Desk</h1>
      <p>Placeholder. The app shell and case views arrive in the next milestones.</p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading seed…</p>}>
        <SeedSummary />
      </Suspense>
    </main>
  );
}
