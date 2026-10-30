'use client';

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ISODate, Persona } from '@/domain/types';
import { todayISO } from './asof';
import { PrefsStore } from './prefs';

interface PersonaContextValue {
  prefs: PrefsStore;
  personas: readonly Persona[];
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

const browserStorage = () => (typeof window === 'undefined' ? undefined : window.localStorage);
const browserSearch = () => (typeof window === 'undefined' ? '' : window.location.search);

export function PersonaProvider({
  personas,
  defaultAsOf,
  children,
}: {
  personas: readonly Persona[];
  defaultAsOf: ISODate;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      prefs: new PrefsStore(personas, defaultAsOf, browserStorage, browserSearch),
      personas,
    }),
    [personas, defaultAsOf],
  );
  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

function usePersonaContext(): PersonaContextValue {
  const value = useContext(PersonaContext);
  if (!value) throw new Error('Persona hooks must be used inside <PersonaProvider>');
  return value;
}

function usePrefs() {
  const { prefs } = usePersonaContext();
  return useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getServerSnapshot);
}

/** The persona currently being viewed, and a way to switch. */
export function usePersona() {
  const { prefs, personas } = usePersonaContext();
  const { personaId } = usePrefs();
  const persona = personas.find((p) => p.id === personaId) ?? personas[0];
  return { persona, personas, setPersonaId: (id: string) => prefs.setPersona(id) };
}

/** The date the whole app treats as today. All date logic reads this. */
export function useAsOf() {
  const { prefs } = usePersonaContext();
  const { asOf } = usePrefs();
  return {
    asOf,
    dataDate: prefs.defaultAsOf,
    isDataDate: asOf === prefs.defaultAsOf,
    setAsOf: (date: ISODate) => prefs.setAsOf(date),
    resetToDataDate: () => prefs.setAsOf(null),
    jumpToToday: () => prefs.setAsOf(todayISO()),
  };
}

/** True once running in the browser, after hydration. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Handles ?as= and ?asOf= on in-app navigation and removes them from the URL afterwards.
 * (The first load is handled before the first render, inside PrefsStore.)
 * Render it inside <Suspense>: it reads search params.
 */
export function UrlParamSync() {
  const { prefs } = usePersonaContext();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const as = params.get('as');
    const asOf = params.get('asOf');
    if (!as && !asOf) return;
    prefs.applyParams(as, asOf);
    const rest = new URLSearchParams(params.toString());
    rest.delete('as');
    rest.delete('asOf');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router, prefs]);

  return null;
}
