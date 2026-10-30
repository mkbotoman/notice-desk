'use client';

import type { Action } from '@/domain/types';
import { Guard } from './guard';
import { PageHeader } from './page-header';
import { EmptyState } from './states';

/** Placeholder for a page that a later milestone replaces. Still enforces who may open it. */
export function RouteStub({ title, requires }: { title: string; requires: Action }) {
  return (
    <>
      <PageHeader title={title} />
      <Guard requires={requires}>
        <EmptyState title={`${title} is coming next`}>
          This page is built in a later milestone. The navigation, people and dates above already
          work.
        </EmptyState>
      </Guard>
    </>
  );
}
