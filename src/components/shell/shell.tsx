'use client';

import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { openCases, casesInScope, waitingOnPersona } from '@/domain/selectors';
import { UrlParamSync, useIsClient, usePersona } from '@/lib/persona/context';
import { navFor, type NavItem } from '@/lib/persona/personas';
import { cn } from '@/lib/utils';
import { useStoreState } from '@/store/react';
import { useAutoNotifications } from '@/components/notifications/use-auto-notifications';
import { LoadingState } from './states';
import { ResetDemoButton } from './reset-demo';

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1.5 no-underline">
      <span
        aria-hidden="true"
        className="flex size-[34px] items-center justify-center rounded-lg bg-navy text-sm font-bold text-white"
      >
        ND
      </span>
      <span className="flex flex-col">
        <span className="text-[15px] font-bold text-navy-deep">Notice Desk</span>
        <span className="text-xs text-muted-foreground">Meridian Peak Equity</span>
      </span>
    </Link>
  );
}

function useBadges(): Record<string, number> {
  const { persona } = usePersona();
  const { cases, notifications } = useStoreState();
  return {
    '/cases': openCases(casesInScope(cases, persona)).length,
    '/inbox': waitingOnPersona(cases, persona).length,
    '/outbox': notifications.filter((n) => n.status === 'draft').length,
  };
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const badges = useBadges();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badge = badges[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-sm text-gray-700 no-underline hover:bg-navy-soft/60 hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active && 'bg-navy-soft font-semibold text-navy',
            )}
          >
            <span>{item.label}</span>
            {badge ? (
              <span className="text-xs text-muted-foreground tabular-nums">{badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar on wide screens, a bar with a menu button on narrow ones. */
export function Shell({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  // Deadline and insurance notifications are raised app-wide, whichever page is open.
  useAutoNotifications();
  const { persona } = usePersona();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = navFor(persona);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <Brand />
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((open) => !open)}
          className="min-h-10 rounded-lg border border-input px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </header>
      {menuOpen ? (
        <div id="mobile-nav" className="flex flex-col gap-4 border-b bg-card px-3 py-3 md:hidden">
          <NavLinks items={items} onNavigate={() => setMenuOpen(false)} />
          <div className="px-1.5">
            <ResetDemoButton />
          </div>
        </div>
      ) : null}

      <aside className="hidden w-58 shrink-0 flex-col gap-6 border-r bg-card px-3.5 py-5 md:flex">
        <Brand />
        <NavLinks items={items} />
        <div className="mt-auto flex flex-col gap-2 px-1.5">
          <ResetDemoButton />
          <span className="text-xs text-muted-foreground">Prototype · sample data</span>
        </div>
      </aside>

      <main id="main" className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 md:px-8 md:pb-12">
        <Suspense fallback={null}>
          <UrlParamSync />
        </Suspense>
        {isClient ? children : <LoadingState />}
      </main>
    </div>
  );
}
