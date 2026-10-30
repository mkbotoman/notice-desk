import { AppProviders } from '@/components/shell/providers';
import { Shell } from '@/components/shell/shell';
import { loadReport } from '@/lib/data-quality';
import { loadSeed } from '@/lib/seed';

export default async function ShellLayout({ children }: LayoutProps<'/'>) {
  const [seed, issues] = await Promise.all([loadSeed(), loadReport()]);
  return (
    <AppProviders seed={seed} issues={issues}>
      <Shell>{children}</Shell>
    </AppProviders>
  );
}
