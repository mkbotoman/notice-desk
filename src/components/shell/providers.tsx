'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Seed } from '@/domain/schemas';
import { PersonaProvider } from '@/lib/persona/context';
import { buildPersonas } from '@/lib/persona/personas';
import { StoreProvider } from '@/store/react';

export function AppProviders({ seed, children }: { seed: Seed; children: ReactNode }) {
  const personas = useMemo(() => buildPersonas(seed), [seed]);
  return (
    <StoreProvider seed={seed}>
      <PersonaProvider personas={personas} defaultAsOf={seed.meta.dataAsOf}>
        {children}
      </PersonaProvider>
    </StoreProvider>
  );
}
