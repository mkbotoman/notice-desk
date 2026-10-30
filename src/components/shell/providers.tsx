'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Seed } from '@/domain/schemas';
import type { DataQualityIssue } from '@/domain/types';
import { DataQualityProvider } from '@/lib/data-quality-context';
import { PersonaProvider } from '@/lib/persona/context';
import { buildPersonas } from '@/lib/persona/personas';
import { StoreProvider } from '@/store/react';

export function AppProviders({
  seed,
  issues,
  children,
}: {
  seed: Seed;
  issues: DataQualityIssue[];
  children: ReactNode;
}) {
  const personas = useMemo(() => buildPersonas(seed), [seed]);
  return (
    <StoreProvider seed={seed}>
      <PersonaProvider personas={personas} defaultAsOf={seed.meta.dataAsOf}>
        <DataQualityProvider issues={issues}>{children}</DataQualityProvider>
      </PersonaProvider>
    </StoreProvider>
  );
}
