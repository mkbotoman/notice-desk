'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { can } from '@/domain/permissions';
import type { Action } from '@/domain/types';
import { usePersona } from '@/lib/persona/context';
import { personaOptionLabel } from '@/lib/persona/personas';
import { EmptyState } from './states';

/** Shows its children only to personas who may use the page; everyone else gets a plain explanation. */
export function Guard({ requires, children }: { requires: Action; children: ReactNode }) {
  const { persona } = usePersona();
  if (can(persona, requires)) return <>{children}</>;
  return (
    <EmptyState
      title="This page isn't available in your current view"
      action={
        <Link href="/" className="text-sm font-semibold text-navy">
          Back to the overview
        </Link>
      }
    >
      {personaOptionLabel(persona)} can&apos;t open this page. Pick another person in &ldquo;Viewing
      as&rdquo; to see it.
    </EmptyState>
  );
}
