'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { DataQualityIssue } from '@/domain/types';

/** Issues keyed by the id they refer to (a lease id, notice id or property id). */
export function indexIssues(issues: readonly DataQualityIssue[]): Map<string, DataQualityIssue[]> {
  const byRef = new Map<string, DataQualityIssue[]>();
  for (const issue of issues) byRef.set(issue.rowRef, [...(byRef.get(issue.rowRef) ?? []), issue]);
  return byRef;
}

/**
 * The issues worth a person's attention for these records: warnings and errors. Info entries are
 * routine repairs (a date converted, a name merged) and would put a flag on almost every row.
 */
export function issuesNeedingReview(
  byRowRef: ReadonlyMap<string, DataQualityIssue[]>,
  ...refs: (string | null)[]
): DataQualityIssue[] {
  return refs.flatMap((ref) =>
    ref === null ? [] : (byRowRef.get(ref) ?? []).filter((i) => i.severity !== 'info'),
  );
}

interface Value {
  issues: readonly DataQualityIssue[];
  byRowRef: ReadonlyMap<string, DataQualityIssue[]>;
}

const Context = createContext<Value | null>(null);

export function DataQualityProvider({
  issues,
  children,
}: {
  issues: readonly DataQualityIssue[];
  children: ReactNode;
}) {
  const value = useMemo(() => ({ issues, byRowRef: indexIssues(issues) }), [issues]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDataQuality(): Value {
  const value = useContext(Context);
  if (!value) throw new Error('useDataQuality must be used inside <DataQualityProvider>');
  return value;
}
