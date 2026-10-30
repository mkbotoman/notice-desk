'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { TRIGGER_LABELS, recipientKey, type OutboxFilter } from '@/domain/notifications/compose';
import type { Notification, NotificationStatus } from '@/domain/types';
import { cn } from '@/lib/utils';
import { CONTROL, TRIGGER_TONES, formatWhen, type CaseLabeler } from './shared';

const TABS: { status: NotificationStatus; label: string }[] = [
  { status: 'draft', label: 'Drafts' },
  { status: 'sent', label: 'Sent' },
  { status: 'dismissed', label: 'Dismissed' },
];

const WHEN_PREFIX: Record<NotificationStatus, string> = {
  draft: 'Drafted',
  sent: 'Sent',
  dismissed: 'Dismissed',
};

export function NotificationList({
  all,
  items,
  counts,
  filter,
  onFilter,
  selectedId,
  onSelect,
  onCompose,
  caseLabel,
}: {
  /** Everything in the outbox, to build the filter choices. */
  all: readonly Notification[];
  items: readonly Notification[];
  counts: Record<NotificationStatus, number>;
  filter: OutboxFilter;
  onFilter: (next: OutboxFilter) => void;
  selectedId: string | null;
  onSelect: (n: Notification) => void;
  onCompose: () => void;
  caseLabel: CaseLabeler;
}) {
  const caseIds = [...new Set(all.map((n) => n.caseId))].sort();
  const recipients = new Map(all.map((n) => [recipientKey(n), n.recipientLabel]));

  return (
    <section
      aria-label="Notifications"
      className="min-w-0 flex-[1_1_340px] overflow-hidden rounded-xl border bg-card lg:max-w-[440px]"
    >
      <div role="tablist" aria-label="Status" className="flex gap-1 overflow-x-auto border-b px-2">
        {TABS.map(({ status, label }) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filter.status === status}
            onClick={() => onFilter({ ...filter, status })}
            className={cn(
              'min-h-10 border-b-2 border-transparent px-3.5 text-sm font-semibold whitespace-nowrap text-gray-600 hover:text-navy focus-visible:outline-2 focus-visible:outline-ring',
              filter.status === status && 'border-navy text-navy',
            )}
          >
            {label} <span className="tabular-nums">{counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row lg:flex-col xl:flex-row">
        <select
          aria-label="Filter by case"
          className={CONTROL}
          value={filter.caseId ?? ''}
          onChange={(e) => onFilter({ ...filter, caseId: e.target.value || null })}
        >
          <option value="">All cases</option>
          {caseIds.map((id) => (
            <option key={id} value={id}>
              {caseLabel(id)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by recipient"
          className={CONTROL}
          value={filter.recipient ?? ''}
          onChange={(e) => onFilter({ ...filter, recipient: e.target.value || null })}
        >
          <option value="">All recipients</option>
          {[...recipients].map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing here{filter.caseId || filter.recipient ? ' for these filters' : ' yet'}.
        </p>
      ) : (
        <ul aria-label="Notification list">
          {items.map((n) => (
            <li key={n.id} className={cn('border-b', n.id === selectedId && 'bg-navy-soft')}>
              <button
                type="button"
                onClick={() => onSelect(n)}
                aria-current={n.id === selectedId ? 'true' : undefined}
                className="flex w-full flex-col gap-1.5 px-4 pt-3.5 pb-1.5 text-left hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={TRIGGER_TONES[n.trigger]}>{TRIGGER_LABELS[n.trigger]}</Chip>
                    {n.source === 'ai_draft' ? <Chip tone="navy">AI-assisted</Chip> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {WHEN_PREFIX[n.status]} {formatWhen(n.sentAt ?? n.createdAt)}
                  </span>
                </span>
                <span className="text-sm font-semibold break-words text-foreground">
                  {n.subject}
                </span>
                <span className="text-[13px] text-muted-foreground">To {n.recipientLabel}</span>
              </button>
              <div className="px-4 pb-3 text-[13px]">
                <Link href={`/cases/${n.caseId}`} className="font-semibold text-navy">
                  Case {n.caseId}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="p-4">
        <Button type="button" variant="outline" className="h-10 w-full" onClick={onCompose}>
          New notification
        </Button>
      </div>
    </section>
  );
}
