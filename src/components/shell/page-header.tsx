import type { ReactNode } from 'react';
import { HeaderControls } from './header-controls';

/** Title, subtitle and the as-of / persona controls. Every page starts with one. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold text-navy-deep">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <HeaderControls />
    </header>
  );
}
