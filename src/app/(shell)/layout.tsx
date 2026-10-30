import { AppProviders } from '@/components/shell/providers';
import { Shell } from '@/components/shell/shell';
import { loadSeed } from '@/lib/seed';

export default async function ShellLayout({ children }: LayoutProps<'/'>) {
  const seed = await loadSeed();
  return (
    <AppProviders seed={seed}>
      <Shell>{children}</Shell>
    </AppProviders>
  );
}
