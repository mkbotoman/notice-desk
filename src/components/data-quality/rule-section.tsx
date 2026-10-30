'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Chip, type ChipTone } from '@/components/ui/chip';
import type { RuleSection as Section } from '@/domain/data-quality/report';
import type { DataQualityIssue, DataQualitySeverity } from '@/domain/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
/** Lists this short start open; longer ones (138 date conversions) start closed. */
const OPEN_BY_DEFAULT_MAX = 8;

const SEVERITY_TONES: Record<DataQualitySeverity, ChipTone> = {
  error: 'danger',
  warning: 'warning',
  info: 'gray',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function IssueRow({ issue, href }: { issue: DataQualityIssue; href: string | null }) {
  const routine = issue.severity === 'info';
  return (
    <li
      className={cn(
        'flex flex-col gap-1 border-t px-4 py-2.5 text-sm sm:flex-row sm:items-baseline sm:gap-3',
        routine ? 'text-muted-foreground' : 'bg-card text-foreground',
      )}
    >
      <span className="flex shrink-0 flex-wrap items-center gap-1.5 sm:w-52">
        <Chip tone={SEVERITY_TONES[issue.severity]} className={cn(routine && 'font-medium')}>
          {issue.severity}
        </Chip>
        <Chip tone="outline" className="font-medium">
          {issue.action}
        </Chip>
      </span>
      <span className="shrink-0 font-mono text-xs sm:w-20">
        {href ? (
          <Link href={href} className="font-semibold text-navy underline-offset-2 hover:underline">
            {issue.rowRef}
          </Link>
        ) : (
          issue.rowRef
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{issue.message}</span>
        {issue.before !== undefined || issue.after !== undefined ? (
          <span className="mt-0.5 block text-xs">
            <span className="text-muted-foreground">{issue.field}: </span>
            <code className="rounded bg-muted px-1.5 py-0.5 break-all text-gray-800">
              {issue.before ?? '(empty)'}
            </code>{' '}
            <span aria-hidden>→</span>
            <span className="sr-only">became</span>{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 break-all text-gray-800">
              {issue.after ?? '(empty)'}
            </code>
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function RuleSection({
  section,
  visible,
  filtered,
  hrefFor,
}: {
  section: Section;
  /** The section's issues after the page filters. */
  visible: DataQualityIssue[];
  filtered: boolean;
  hrefFor: (rowRef: string) => string | null;
}) {
  const { rule, issues, bySeverity } = section;
  const [expanded, setExpanded] = useState(
    issues.length > 0 && issues.length <= OPEN_BY_DEFAULT_MAX,
  );
  const [shown, setShown] = useState(PAGE_SIZE);
  const listId = `rule-list-${rule.id}`;

  return (
    <section
      aria-labelledby={`rule-${rule.id}`}
      data-rule={rule.id}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-col gap-2 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`rule-${rule.id}`} className="flex flex-wrap items-baseline gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-gray-800">
              {rule.id}
            </code>
            <span className="text-base font-bold text-navy-deep">{rule.title}</span>
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {issues.length === 0 ? (
              <Chip tone="success">Checked, nothing found</Chip>
            ) : (
              <>
                <Chip tone="navy" data-testid={`count-${rule.id}`}>
                  {plural(issues.length, 'issue')}
                </Chip>
                {bySeverity.error > 0 ? (
                  <Chip tone="danger">{plural(bySeverity.error, 'error')}</Chip>
                ) : null}
                {bySeverity.warning > 0 ? (
                  <Chip tone="warning">{plural(bySeverity.warning, 'warning')}</Chip>
                ) : null}
                {bySeverity.info > 0 ? <Chip tone="gray">{bySeverity.info} routine</Chip> : null}
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Checks: </span>
          {rule.checks}
        </p>
        {rule.response ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">What the app did: </span>
            {rule.response}
          </p>
        ) : null}
      </div>

      {issues.length > 0 ? (
        <div className="border-t bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? 'Hide' : 'Show'} {filtered ? `${visible.length} of ` : ''}
              {plural(issues.length, 'issue')}
            </Button>
          </div>
          {expanded ? (
            <div id={listId}>
              {visible.length === 0 ? (
                <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                  No issues match the filters.
                </p>
              ) : (
                <ul>
                  {visible.slice(0, shown).map((issue, n) => (
                    <IssueRow
                      key={`${issue.rowRef}-${issue.field}-${n}`}
                      issue={issue}
                      href={hrefFor(issue.rowRef)}
                    />
                  ))}
                </ul>
              )}
              {visible.length > shown ? (
                <div className="border-t px-4 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShown((s) => s + PAGE_SIZE)}
                  >
                    Show {Math.min(PAGE_SIZE, visible.length - shown)} more (
                    {visible.length - shown} left)
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
