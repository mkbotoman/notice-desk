'use client';

import { useMemo } from 'react';
import { Stat } from '@/components/ui/stat';
import { buildTenantTrend } from '@/domain/analytics';
import { AR_AGING_LABELS } from '@/domain/aging';
import { STAGE_LABELS, formatCents, longDate, shortDate } from '@/lib/format';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { BarList } from './bar-list';
import { ChartCard } from './chart-card';
import { coverageText, monthLabel, plural, weekLabel } from './format';
import { ActivityBars, MonthlyBars } from './time-charts';

/**
 * One tenant over time: when their notices went out, what has been done on their cases since,
 * how long each notice has been open, and what they owe on each lease. Everything is limited to
 * what the viewing persona may see. The data holds one balance per lease and no stage history,
 * so the picture is built from send dates and the changes made in the app.
 */
export function TenantTrend({ tenantId }: { tenantId: string }) {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases, eventsByCase } = useStoreState();
  const { leaseById, propertyById } = useLookups();

  const trend = useMemo(
    () =>
      buildTenantTrend({
        tenantId,
        persona,
        asOf,
        cases,
        eventsByCase,
        leases: leaseById.values(),
        propertyById,
      }),
    [tenantId, persona, asOf, cases, eventsByCase, leaseById, propertyById],
  );

  if (trend.caseCount === 0) {
    return (
      <p
        data-testid="tenant-trend"
        className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
      >
        No cases for this tenant in your view, so there is no trend to show.
      </p>
    );
  }

  const { sent, activity } = trend;
  const spansYears = sent.from !== null && sent.from.slice(0, 4) !== sent.to?.slice(0, 4);
  const months = sent.months.map((m) => ({
    label: monthLabel(m.month, spansYears),
    count: m.count,
  }));
  const weeks = activity.weeks.map((w) => ({ ...w, label: weekLabel(w.week) }));
  const sentCoverage =
    sent.from !== null && sent.to !== null
      ? `${coverageText(sent.from, sent.to)}.${sent.undated > 0 ? ` ${plural(sent.undated, 'case')} without a send date left out.` : ''}`
      : undefined;
  const sentCases = trend.cases.filter((c) => c.daysSinceSent !== null);

  return (
    <div data-testid="tenant-trend" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          value={trend.caseCount}
          label="Cases"
          detail={`${trend.openCount} open, ${trend.resolvedCount} cured or closed`}
        />
        <Stat
          value={formatCents(trend.totalAr)}
          label="Live balance"
          detail="Across their leases in view"
        />
        <Stat
          value={sent.from === null ? '—' : shortDate(sent.from)}
          label="First notice"
          detail={
            sent.from === null
              ? 'No notice has gone out'
              : `Earliest send date in view: ${longDate(sent.from)}`
          }
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          id="tt-sent"
          title="Notices by month sent"
          tells="When this tenant's notices went out. A pattern of repeat notices shows here."
          coverage={sentCoverage}
          empty={months.length === 0 ? 'No notice with a send date for this tenant.' : undefined}
          table={{
            caption: 'Notices sent by month for this tenant',
            columns: [{ label: 'Month' }, { label: 'Cases sent', numeric: true }],
            rows: months.map((m) => [m.label, m.count]),
          }}
        >
          <MonthlyBars data={months} label={`Notices sent per month, ${sentCoverage ?? ''}`} />
        </ChartCard>

        <ChartCard
          id="tt-activity"
          title="Work on their cases, by week"
          tells="Notes, stage changes and owner changes made in the app. It fills in as people work."
          coverage="Changes made in this app only; imported notes are not counted."
          empty={
            weeks.length === 0
              ? 'Nothing has been changed on these cases in the app yet.'
              : undefined
          }
          table={{
            caption: 'App activity on this tenant by week',
            columns: [
              { label: 'Week of' },
              { label: 'Notes', numeric: true },
              { label: 'Stage changes', numeric: true },
              { label: 'Owner changes', numeric: true },
            ],
            rows: weeks.map((w) => [w.label, w.notes, w.stageChanges, w.ownerChanges]),
          }}
        >
          <ActivityBars data={weeks} label="App activity on this tenant by week" />
        </ChartCard>

        <ChartCard
          id="tt-age"
          title="Time since each notice"
          tells="How long each notice has been out as of the as-of date. Open cases are marked."
          empty={sentCases.length === 0 ? 'No case for this tenant has a send date.' : undefined}
          table={{
            caption: 'Days since each notice went out',
            columns: [
              { label: 'Case' },
              { label: 'Stage' },
              { label: 'Open' },
              { label: 'Days since notice', numeric: true },
            ],
            rows: sentCases.map((c) => [
              c.caseId,
              STAGE_LABELS[c.stage],
              c.open ? 'Yes' : 'No',
              c.daysSinceSent,
            ]),
          }}
        >
          <BarList
            rows={sentCases.map((c) => ({
              key: c.caseId,
              label: `${c.caseId} · ${STAGE_LABELS[c.stage]}`,
              value: c.daysSinceSent ?? 0,
              valueText: plural(c.daysSinceSent ?? 0, 'day'),
              detail: c.open ? 'open' : 'closed',
              flagged: c.open ? (c.daysSinceSent ?? 0) : 0,
              href: `/cases/${c.caseId}`,
            }))}
          />
        </ChartCard>

        <ChartCard
          id="tt-ar"
          title="Live balance by lease"
          tells="What they owe on each lease today."
          coverage="Live lease balances today. The data has one balance per lease, no history."
          empty={trend.leases.length === 0 ? 'No leases for this tenant in your view.' : undefined}
          table={{
            caption: 'Live balance by lease',
            columns: [
              { label: 'Lease' },
              { label: 'Recorded aging' },
              { label: 'Balance', numeric: true },
            ],
            rows: trend.leases.map((l) => [
              l.label,
              AR_AGING_LABELS[l.aging],
              formatCents(l.balance),
            ]),
          }}
        >
          <BarList
            rows={trend.leases.map((l) => ({
              key: l.leaseId,
              label: l.label,
              value: Math.max(0, l.balance),
              valueText: formatCents(l.balance),
              detail: AR_AGING_LABELS[l.aging],
            }))}
          />
        </ChartCard>
      </div>
    </div>
  );
}
