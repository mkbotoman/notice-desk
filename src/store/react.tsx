'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { Seed } from '@/domain/schemas';
import { EventSourcedStore, type CaseStore, type StoreState } from './case-store';
import { LocalStoragePersistence } from './persistence';

const StoreContext = createContext<EventSourcedStore | null>(null);

export function StoreProvider({ seed, children }: { seed: Seed; children: ReactNode }) {
  const [store] = useState(() => new EventSourcedStore(seed, new LocalStoragePersistence()));
  // Saved state is read after hydration so server and client render the same first frame.
  useEffect(() => store.hydrate(), [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): CaseStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

/** Current cases, events and notifications. Re-renders on every change. */
export function useStoreState(): StoreState {
  const store = useStore();
  const subscribe = useMemo(() => (cb: () => void) => store.subscribe(cb), [store]);
  return useSyncExternalStore(
    subscribe,
    () => store.getState(),
    () => store.getState(),
  );
}
