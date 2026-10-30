'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, LoadingState } from '@/components/shell/states';
import { Stat } from '@/components/ui/stat';
import { buildAnalytics, type Analytics, type WorkloadRow } from '@/domain/analytics';
import { formatCents, longDate, STAGE_LABELS, TEAM_LABELS } from '@/lib/format';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { BarList, type BarRow } from './bar-list';
import { ChartCard } from './chart-card';
import { coverageText, monthLabel, percent, plural, weekLabel } from './format';
import { ActivityBars, MonthlyBars } from './time-charts';

const workloadRows = (rows: WorkloadRow[]): BarRow[] =>
  rows.map((r) => ({
    key: r.key,
    label: r.label,
    value: r.open,
    valueText: plural(r.open, 'case'),
    detail: `${r.overdue} overdue`,
    flagged: r.overdue,
  }));

const topLabel = (shown: number, total: number, noun: string) =>
  total > shown ? `Top ${shown} of ${total} ${noun}` : `All ${total} ${noun}`;

function NoHistoryNote() {
  return (
    <aside
      data-testid="no-history-note"
      className="rounded-xl border border-navy-line bg-navy-soft px-4 py-3 text-sm text-gray-700"
    >
      <h2 className="font-bold text-navy-deep">History starts when changes are made in the app</h2>
      <p className="mt-1">
        The imported data records where each case is now, not when it moved: it has no stage
        history, no resolution dates and one balance per lease. So there are no charts of stages
        over time, days in each stage, time to resolution or AR over time. The charts below use what
        the data does have, and the activity chart fills in as people work in the app.
      </p>
    </aside>
  );
}

function TeamSection({ data }: { data: Analytics }) {
  const { sent, ar, activity, cure } = data;
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
  const arNote = 'Live lease balances today. The data has one balance per lease, no history.';

  return (
    <section aria-labelledby="team-title" className="flex flex-col gap-4">
      <h2 id="team-title" className="text-lg font-bold text-navy-deep">
        Legal team
      </h2>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          id="stages"
          title="Open cases by stage"
          tells="Where the open caseload sits right now."
          coverage="As of the as-of date."
          empty={data.openCount === 0 ? 'No open cases in your view.' : undefined}
          table={{
            caption: 'Open cases by stage',
            columns: [{ label: 'Stage' }, { label: 'Open cases', numeric: true }],
            rows: data.stages.map((s) => [STAGE_LABELS[s.stage], s.count]),
          }}
        >
          <BarList
            rows={data.stages.map((s) => ({
              key: s.stage,
              label: STAGE_LABELS[s.stage],
              value: s.count,
              valueText: String(s.count),
            }))}
          />
        </ChartCard>

        <ChartCard
          id="sent"
          title="Cases by month sent"
          tells="How many notices went out each month, including cases since resolved."
          coverage={sentCoverage}
          empty={months.length === 0 ? 'No cases with a send date in your view.' : undefined}
          table={{
            caption: 'Cases by month sent',
            columns: [{ label: 'Month' }, { label: 'Cases sent', numeric: true }],
            rows: months.map((m) => [m.label, m.count]),
          }}
        >
          <MonthlyBars data={months} label={`Cases sent per month, ${sentCoverage ?? ''}`} />
        </ChartCard>

        <ChartCard
          id="workload"
          title="Workload by owner team"
          tells="Which team has the ball on open cases, and how many of those are overdue."
          coverage="Open cases as of the as-of date. The darker bar segment is overdue."
          empty={data.openCount === 0 ? 'No open cases in your view.' : undefined}
          table={{
            caption: 'Open cases and overdue cases by owner team',
            columns: [
              { label: 'Team' },
              { label: 'Open cases', numeric: true },
              { label: 'Overdue', numeric: true },
            ],
            rows: data.teams.map((t) => [t.label, t.open, t.overdue]),
          }}
        >
          <BarList rows={workloadRows(data.teams)} />
        </ChartCard>

        <ChartCard
          id="managers"
          title="Asset Management cases by person"
          tells="Who in Asset Management holds the cases handed to that team."
          coverage="Open cases owned by Asset Management, grouped by the property's asset manager."
          empty={data.managers.length === 0 ? 'No open cases with Asset Management.' : undefined}
          table={{
            caption: 'Open Asset Management cases by asset manager',
            columns: [
              { label: 'Asset manager' },
              { label: 'Open cases', numeric: true },
              { label: 'Overdue', numeric: true },
            ],
            rows: data.managers.map((m) => [m.label, m.open, m.overdue]),
          }}
        >
          <BarList rows={workloadRows(data.managers)} />
        </ChartCard>

        <ChartCard
          id="ar-property"
          title="AR in open cases, by property"
          tells="Where the money owed on open cases is concentrated."
          coverage={arNote}
          empty={
            ar.byProperty.length === 0 ? 'No open cases with a lease in your view.' : undefined
          }
          table={{
            caption: 'Live AR balance of leases with open cases, by property',
            columns: [
              { label: 'Property' },
              { label: 'Leases', numeric: true },
              { label: 'AR balance', numeric: true },
            ],
            rows: ar.byProperty.map((p) => [p.label, p.leases, formatCents(p.ar)]),
          }}
        >
          <BarList
            rows={ar.byProperty.map((p) => ({
              key: p.key,
              label: p.label,
              value: p.ar,
              valueText: formatCents(p.ar),
            }))}
          />
        </ChartCard>

        <ChartCard
          id="ar-fund"
          title="AR in open cases, by fund"
          tells="How the same balances split between the funds."
          coverage={arNote}
          empty={ar.byFund.length === 0 ? 'No open cases with a lease in your view.' : undefined}
          table={{
            caption: 'Live AR balance of leases with open cases, by fund',
            columns: [
              { label: 'Fund' },
              { label: 'Leases', numeric: true },
              { label: 'AR balance', numeric: true },
            ],
            rows: ar.byFund.map((f) => [f.label, f.leases, formatCents(f.ar)]),
          }}
        >
          <BarList
            rows={ar.byFund.map((f) => ({
              key: f.key,
              label: f.label,
              value: f.ar,
              valueText: formatCents(f.ar),
            }))}
          />
        </ChartCard>

        <ChartCard
          id="activity"
          title="App activity by week"
          tells="Notes, stage changes and owner changes made in the app each week."
          coverage={
            weeks.length > 0
              ? `${plural(activity.total, 'action')}, weeks starting ${weeks[0].label} to ${weeks[weeks.length - 1].label}. Imported notes are not counted.`
              : 'Imported notes are not counted.'
          }
          empty={
            weeks.length === 0
              ? 'Nothing yet. Notes, stage changes and owner changes made in the app will appear here.'
              : undefined
          }
          table={{
            caption: 'App activity by week',
            columns: [
              { label: 'Week starting' },
              { label: 'Notes', numeric: true },
              { label: 'Stage changes', numeric: true },
              { label: 'Owner changes', numeric: true },
            ],
            rows: weeks.map((w) => [w.label, w.notes, w.stageChanges, w.ownerChanges]),
          }}
        >
          <ActivityBars data={weeks} label="App activity per week, stacked by kind of action" />
        </ChartCard>
      </div>
      <p data-testid="cure-note" className="text-sm text-muted-foreground">
        Cure rate is cured divided by cured plus closed.{' '}
        {cure.resolved > 0
          ? `Only ${plural(cure.resolved, 'case')} ${cure.resolved === 1 ? 'has' : 'have'} been resolved, so one more outcome moves it a lot.`
          : 'No case has been resolved yet.'}
      </p>
    </section>
  );
}

function RepeatTable({ data }: { data: Analytics }) {
  const { rows, total } = data.repeat;
  return (
    <ChartCard
      id="repeat"
      title="Repeat offenders"
      tells="Tenants with two or more cases, most cases first. Open one to see its history."
      coverage={topLabel(rows.length, total, 'tenants with 2+ cases')}
      empty={rows.length === 0 ? 'No tenant in your view has more than one case.' : undefined}
      table={{
        caption: 'Tenants with two or more cases',
        columns: [
          { label: 'Tenant' },
          { label: 'Cases', numeric: true },
          { label: 'Open', numeric: true },
          { label: 'Leases affected', numeric: true },
          { label: 'Live AR', numeric: true },
        ],
        rows: rows.map((r) => [
          <Link
            key={r.tenantId}
            href={`/tenants/${r.tenantId}`}
            className="font-semibold text-navy hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {r.name}
          </Link>,
          r.cases,
          r.open,
          r.leasesAffected,
          formatCents(r.ar),
        ]),
      }}
      tableOpen
    />
  );
}

function TenantSection({ data }: { data: Analytics }) {
  const byCases = data.tenantsByCases;
  const byAr = data.tenantsByAr;
  const { sent } = data;
  const casesCoverage = `${topLabel(byCases.rows.length, byCases.total, 'tenants')}, closed cases included${
    sent.from !== null && sent.to !== null
      ? `. Notices sent ${coverageText(sent.from, sent.to)}.`
      : '.'
  }`;

  return (
    <section aria-labelledby="tenants-title" className="flex flex-col gap-4">
      <h2 id="tenants-title" className="text-lg font-bold text-navy-deep">
        Tenants
      </h2>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          id="tenant-cases"
          title="Cases per tenant"
          tells="Which tenants keep ending up in front of Legal."
          coverage={casesCoverage}
          empty={byCases.rows.length === 0 ? 'No cases in your view.' : undefined}
          table={{
            caption: 'Cases per tenant',
            columns: [
              { label: 'Tenant' },
              { label: 'Cases', numeric: true },
              { label: 'Open', numeric: true },
            ],
            rows: byCases.rows.map((r) => [r.name, r.cases, r.open]),
          }}
        >
          <BarList
            rows={byCases.rows.map((r) => ({
              key: r.tenantId,
              label: r.name,
              value: r.cases,
              valueText: plural(r.cases, 'case'),
              detail: `${r.open} open`,
              href: `/tenants/${r.tenantId}`,
            }))}
          />
        </ChartCard>

        <ChartCard
          id="tenant-ar"
          title="Live AR balance per tenant"
          tells="Who owes the most today across all their leases in your view."
          coverage={`${topLabel(byAr.rows.length, byAr.total, 'tenants owing money')}. Live lease balances today, no history.`}
          empty={byAr.rows.length === 0 ? 'No tenant in your view owes a balance.' : undefined}
          table={{
            caption: 'Live AR balance per tenant',
            columns: [
              { label: 'Tenant' },
              { label: 'Leases', numeric: true },
              { label: 'AR balance', numeric: true },
            ],
            rows: byAr.rows.map((r) => [r.name, r.leases, formatCents(r.ar)]),
          }}
        >
          <BarList
            rows={byAr.rows.map((r) => ({
              key: r.tenantId,
              label: r.name,
              value: r.ar,
              valueText: formatCents(r.ar),
              href: `/tenants/${r.tenantId}`,
            }))}
          />
        </ChartCard>
      </div>
      <RepeatTable data={data} />
    </section>
  );
}

function AnalyticsBody() {
  const { persona } = usePersona();
  const { asOf } = useAsOf();
  const { cases, eventsByCase } = useStoreState();
  const { leaseById, propertyById, personById, tenantById } = useLookups();

  const data = useMemo(
    () =>
      buildAnalytics({
        persona,
        asOf,
        cases,
        eventsByCase,
        leaseById,
        propertyById,
        personById,
        tenantById,
        teamLabels: TEAM_LABELS,
      }),
    [persona, asOf, cases, eventsByCase, leaseById, propertyById, personById, tenantById],
  );

  return (
    <div className="flex flex-col gap-6">
      <NoHistoryNote />
      {data.caseCount === 0 ? (
        <EmptyState title="No cases in your view">
          Charts appear here once your properties have cases.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <div data-testid="kpi-open">
              <Stat
                value={data.openCount}
                label="Open cases"
                detail={`of ${plural(data.caseCount, 'case')} in your view`}
              />
            </div>
            <div data-testid="kpi-overdue">
              <Stat
                value={data.due.overdue}
                label="Overdue now"
                detail="Notice to Cure past its deadline"
                tone={data.due.overdue > 0 ? 'danger' : 'neutral'}
              />
            </div>
            <div data-testid="kpi-week">
              <Stat
                value={data.due.dueThisWeek}
                label="Due this week"
                detail="Deadline in the next 7 days"
                tone={data.due.dueThisWeek > 0 ? 'warning' : 'neutral'}
              />
            </div>
            <div data-testid="kpi-cure">
              <Stat
                value={data.cure.rate === null ? '—' : percent(data.cure.rate)}
                label="Cure rate"
                detail={`${data.cure.cured} cured, ${data.cure.closed} closed`}
              />
            </div>
            <div data-testid="kpi-ar" className="col-span-2">
              <Stat
                value={formatCents(data.ar.total)}
                label="AR in open cases"
                detail="Live lease balances"
              />
            </div>
          </div>
          <TeamSection data={data} />
          <TenantSection data={data} />
        </>
      )}
    </div>
  );
}

export function AnalyticsView() {
  const { asOf } = useAsOf();
  const { hydrated } = useStoreState();
  return (
    <>
      <PageHeader title="Analytics" subtitle={`Trends and workload as of ${longDate(asOf)}`} />
      <Guard requires="view_analytics">
        {hydrated ? <AnalyticsBody /> : <LoadingState label="Loading analytics" />}
      </Guard>
    </>
  );
}
