import Link from 'next/link';
import { DeadlineChip, OwnerChip, StageChip } from '@/components/case/case-chips';
import { Chip } from '@/components/ui/chip';
import { caseDeadline } from '@/domain/deadline';
import { waitingOn } from '@/domain/stage';
import type { Case, Cents, ISODate } from '@/domain/types';
import { ISSUE_LABELS, formatCents, shortDate, weekdayDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CaseGroup, GroupKey } from './filters';

/** Everything a row shows, resolved from the lookups so the table stays presentational. */
export interface CaseRow {
  case: Case;
  tenant: string;
  place: string;
  /** The lease's live balance, not the figure from the notice. */
  owed: Cents | null;
  owedChanged: boolean;
  /** Link target for the "Data check" chip, or null for a plain chip. */
  dataCheckHref: string | null;
  hasDataCheck: boolean;
}

const GROUP_STYLES: Record<GroupKey, { label: string; text: string; row: string }> = {
  overdue: { label: 'OVERDUE', text: 'text-danger', row: 'bg-danger-soft/40' },
  week: { label: 'DUE THIS WEEK', text: 'text-warning', row: 'bg-warning-soft/40' },
  later: { label: 'LATER', text: 'text-navy', row: '' },
  missing: { label: 'DEADLINE MISSING', text: 'text-warning', row: 'bg-warning-soft/40' },
  none: { label: 'NO CURE DEADLINE', text: 'text-gray-700', row: '' },
  closed: { label: 'CURED AND CLOSED', text: 'text-gray-700', row: '' },
};

function groupSub(key: GroupKey, count: number, weekEnd: ISODate): string {
  const cases = `${count} ${count === 1 ? 'case' : 'cases'}`;
  switch (key) {
    case 'week':
      return `through ${weekdayDate(weekEnd)}`;
    case 'missing':
      return `${cases} · cure period couldn't be read`;
    case 'none':
      return `${cases} · Non-compliant, Default, Collections and notices with no cure date`;
    default:
      return cases;
  }
}

function DeadlineCell({ c, asOf }: { c: Case; asOf: ISODate }) {
  const deadline = caseDeadline(c, asOf);
  if (deadline.status === 'missing') {
    return (
      <>
        <div className="font-semibold text-warning">Needs a deadline</div>
        <DeadlineChip deadline={deadline} />
      </>
    );
  }
  if (deadline.deadline === null) {
    return (
      <div className="text-muted-foreground">
        {c.stage === 'notice_to_cure' && c.curePeriod.kind === 'none' ? 'No cure date' : '—'}
      </div>
    );
  }
  if (deadline.status === 'none') {
    return (
      <>
        <div className="text-muted-foreground tabular-nums">{shortDate(deadline.deadline)}</div>
        <div className="text-xs text-muted-foreground">Cure period ended</div>
      </>
    );
  }
  return (
    <>
      <div className="font-semibold tabular-nums">{weekdayDate(deadline.deadline)}</div>
      <div className="mt-1">
        <DeadlineChip deadline={deadline} />
      </div>
    </>
  );
}

function Row({ row, group, asOf }: { row: CaseRow; group: GroupKey; asOf: ISODate }) {
  const { case: c } = row;
  return (
    <tr
      data-testid="case-row"
      data-group={group}
      className={cn('border-b last:border-b-0', GROUP_STYLES[group].row)}
    >
      <td className="px-4 py-3 whitespace-nowrap">
        <DeadlineCell c={c} asOf={asOf} />
      </td>
      <td className="px-4 py-3">
        <Link href={`/cases/${c.id}`} className="font-semibold text-navy hover:underline">
          {row.tenant}
        </Link>
        <div className="mt-0.5 text-[13px] text-muted-foreground">{row.place}</div>
      </td>
      <td className="px-4 py-3">
        <StageChip stage={c.stage} />
      </td>
      <td className="px-4 py-3 text-gray-700">{ISSUE_LABELS[c.issueType]}</td>
      <td className="px-4 py-3">
        <OwnerChip owner={waitingOn(c)} />
      </td>
      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
        {formatCents(row.owed)}
        {row.owedChanged ? (
          <div className="text-xs font-medium text-warning">Changed since notice</div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        {row.hasDataCheck ? (
          row.dataCheckHref ? (
            <Link href={row.dataCheckHref} className="rounded-full">
              <Chip tone="gray">Data check</Chip>
            </Link>
          ) : (
            <Chip tone="gray">Data check</Chip>
          )
        ) : null}
      </td>
    </tr>
  );
}

export function CaseTable({
  groups,
  rows,
  asOf,
  weekEnd,
}: {
  groups: readonly CaseGroup[];
  rows: ReadonlyMap<string, CaseRow>;
  asOf: ISODate;
  weekEnd: ISODate;
}) {
  return (
    <div className="relative overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-surface text-left text-xs font-semibold whitespace-nowrap text-gray-600">
            <th className="px-4 py-2.5">Cure deadline</th>
            <th className="px-4 py-2.5">Tenant and lease</th>
            <th className="px-4 py-2.5">Stage</th>
            <th className="px-4 py-2.5">Issue</th>
            <th className="px-4 py-2.5">Waiting on</th>
            <th className="px-4 py-2.5 text-right">Owed (AR)</th>
            <th className="px-4 py-2.5">
              <span className="sr-only">Flags</span>
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key} data-testid={`group-${g.key}`}>
            <tr className="border-b bg-background">
              <th
                colSpan={7}
                scope="colgroup"
                className={cn(
                  'px-4 py-2 text-left text-xs font-bold tracking-wide',
                  GROUP_STYLES[g.key].text,
                )}
              >
                {GROUP_STYLES[g.key].label}{' '}
                <span className="font-medium tracking-normal text-muted-foreground">
                  {groupSub(g.key, g.cases.length, weekEnd)}
                </span>
              </th>
            </tr>
            {g.cases.map((c) => {
              const row = rows.get(c.id);
              return row ? <Row key={c.id} row={row} group={g.key} asOf={asOf} /> : null;
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
