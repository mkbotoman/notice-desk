'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { OwnerChip, StageChip, DeadlineChip } from '@/components/case/case-chips';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, LoadingState } from '@/components/shell/states';
import { Chip } from '@/components/ui/chip';
import { AR_AGING_LABELS } from '@/domain/aging';
import { effectiveCoiStatus } from '@/domain/coi';
import { caseDeadline, cureDeadlineDetail } from '@/domain/deadline';
import { describeCurePeriod } from '@/domain/cure';
import { can } from '@/domain/permissions';
import { waitingOn } from '@/domain/stage';
import type { Case } from '@/domain/types';
import { ISSUE_LABELS, TEAM_LABELS, formatCents, longDate } from '@/lib/format';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { cn } from '@/lib/utils';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { Activity } from './activity';
import { CaseActions } from './case-actions';
import {
  COI_LABELS,
  COI_TONES,
  LENDER_LABELS,
  availableActions,
  balanceDelta,
  deadlineRule,
  stageSteps,
  teamName,
} from './logic';

function BackLink() {
  return (
    <Link href="/cases" className="text-sm font-semibold text-navy">
      Back to cases
    </Link>
  );
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'sm:col-span-2')}>
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border bg-card p-5">
      <h2 className="mb-3.5 text-base font-bold text-navy-deep">{title}</h2>
      {children}
    </section>
  );
}

function Stepper({ stage }: { stage: Case['stage'] }) {
  return (
    <section aria-label="Case stage" className="rounded-xl border bg-card px-5 py-4">
      <ol className="flex flex-wrap gap-x-0 gap-y-3">
        {stageSteps(stage).map((step, i) => (
          <li
            key={step.key}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="flex flex-1 basis-36 items-center gap-2.5 pr-3"
          >
            <span
              className={cn(
                'flex size-7 flex-none items-center justify-center rounded-full border text-[13px] font-bold',
                step.state === 'done' && 'border-navy bg-navy text-white',
                step.state === 'current' && 'border-2 border-navy bg-card text-navy',
                step.state === 'next' && 'border-border bg-muted text-gray-600',
              )}
            >
              {step.state === 'done' ? '✓' : i + 1}
            </span>
            <span
              className={cn(
                'text-sm',
                step.state === 'current' ? 'font-bold text-navy-deep' : 'font-semibold',
              )}
            >
              {step.label}
              {step.state === 'current' ? <span className="sr-only"> (current stage)</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CaseDetail({ caseId }: { caseId: string }) {
  const { persona, personas } = usePersona();
  const { asOf } = useAsOf();
  const { cases, eventsByCase, hydrated } = useStoreState();
  const lookups = useLookups();

  const c = cases.find((x) => x.id === caseId);

  if (!hydrated) return <LoadingState label="Loading case" />;

  if (!c) {
    return (
      <>
        <PageHeader title="Case not found" />
        <EmptyState title="We couldn't find that case" action={<BackLink />}>
          It may have been removed, or the link may be out of date.
        </EmptyState>
      </>
    );
  }

  if (!can(persona, 'view_case', c)) {
    return (
      <>
        <PageHeader title="Case" />
        <EmptyState title="This case isn't available in your current view" action={<BackLink />}>
          Pick another person in &ldquo;Viewing as&rdquo; to see it.
        </EmptyState>
      </>
    );
  }

  const tenant = lookups.tenantById.get(c.tenantId);
  const lease = c.leaseId ? lookups.leaseById.get(c.leaseId) : undefined;
  const property = c.propertyId ? lookups.propertyById.get(c.propertyId) : undefined;
  const coi = lease ? lookups.coiByLeaseId.get(lease.id) : undefined;
  const coiStatus = coi ? effectiveCoiStatus(coi, asOf) : null;

  const deadline = caseDeadline(c, asOf);
  const detail = cureDeadlineDetail(c.dateSent, c.curePeriod);
  const inCure = c.stage === 'notice_to_cure';
  const avail = availableActions(persona, c);
  const waiting = waitingOn(c);
  const events = eventsByCase.get(c.id) ?? [];
  const delta = balanceDelta(c.amountOwedAtNotice, lease?.arBalance ?? null, formatCents);
  const agingDiffers =
    lease !== undefined &&
    lease.arAgingImplied !== null &&
    lease.arAgingImplied !== lease.arAgingRecorded;
  const guarantorShown = avail.viewGuarantor;

  const subtitle = [
    property?.name ?? 'Unknown property',
    lease?.suite ? `Suite ${lease.suite}` : null,
    c.leaseId ? `Lease ${c.leaseId}` : 'Lease not matched',
  ]
    .filter(Boolean)
    .join(' · ');

  const banner = inCure
    ? deadline.status === 'overdue'
      ? {
          tone: 'danger',
          title: `The cure period ended ${longDate(deadline.deadline as string)} with no recorded cure.`,
        }
      : deadline.status === 'missing'
        ? {
            tone: 'warning',
            title: 'Deadline missing: the cure period or send date could not be read.',
          }
        : null
    : null;

  return (
    <>
      <PageHeader
        title={tenant?.displayName ?? 'Unknown tenant'}
        subtitle={
          <>
            {subtitle} ·{' '}
            <Link
              href={`/tenants/${encodeURIComponent(c.tenantId)}`}
              className="font-semibold text-navy"
            >
              View tenant
            </Link>
          </>
        }
        actions={
          <>
            <StageChip stage={c.stage} />
            <DeadlineChip deadline={deadline} />
            <Chip tone="outline">{ISSUE_LABELS[c.issueType]}</Chip>
            {waiting ? (
              <Chip tone="navy">Waiting on {TEAM_LABELS[waiting]}</Chip>
            ) : (
              <OwnerChip owner={null} />
            )}
          </>
        }
      />
      <nav aria-label="Breadcrumb" className="-mt-3 text-[13px] text-muted-foreground">
        <Link href="/cases" className="font-semibold text-navy">
          Cases
        </Link>{' '}
        / <span data-testid="case-id">{c.id}</span>
      </nav>

      <CaseActions c={c} persona={persona} avail={avail} key={`${c.id}:${c.stage}:${c.owner}`} />

      {banner ? (
        <div
          role="status"
          className={cn(
            'rounded-xl border px-4 py-3.5 text-sm font-bold',
            banner.tone === 'danger'
              ? 'border-danger-line bg-danger-soft text-danger'
              : 'border-warning-line bg-warning-soft text-warning',
          )}
        >
          {banner.title}
        </div>
      ) : null}

      <Stepper stage={c.stage} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Card title="Notice and deadline">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Date sent">
                {c.dateSent ? longDate(c.dateSent) : <Muted>Not sent yet</Muted>}
              </Fact>
              <Fact label="Cure period">{describeCurePeriod(c.curePeriod)}</Fact>
              <div className="rounded-lg bg-surface p-3 sm:col-span-2" data-testid="deadline-box">
                <dt className="text-xs font-semibold text-gray-600">
                  {inCure || c.stage === 'non_compliant'
                    ? 'Cure deadline (calculated)'
                    : 'Cure deadline (history)'}
                </dt>
                {deadline.deadline ? (
                  <dd
                    className={cn(
                      'mt-0.5 text-lg font-bold tabular-nums',
                      deadline.status === 'overdue' ? 'text-danger' : 'text-navy-deep',
                    )}
                  >
                    {longDate(deadline.deadline)}
                  </dd>
                ) : (
                  <dd className="mt-0.5 text-lg font-bold text-warning">Deadline missing</dd>
                )}
                <dd className="mt-0.5 text-[13px] text-gray-600">{deadlineRule(c, detail)}</dd>
                {!inCure && c.stage !== 'non_compliant' && deadline.deadline ? (
                  <dd className="mt-0.5 text-[13px] text-gray-600">
                    The case is past Notice to Cure, so this date is history, not a flag.
                  </dd>
                ) : null}
              </div>
              <Fact label="Issue">{ISSUE_LABELS[c.issueType]}</Fact>
              <Fact label="Owner">{teamName(c.owner)}</Fact>
              <Fact label="Waiting on">
                {waiting ? teamName(waiting) : <Muted>Nobody (case finished)</Muted>}
              </Fact>
              <Fact label="Legal's working status">
                {c.workflowStatus ?? <Muted>None recorded</Muted>}
              </Fact>
              <Fact label="Lender notice">
                {c.lenderNotice ? LENDER_LABELS[c.lenderNotice] : <Muted>Not recorded</Muted>}
              </Fact>
              <Fact label="Court case no.">{c.courtCaseNo ?? <Muted>None yet</Muted>}</Fact>
              <Fact label="Legal fees terms">
                {c.legalFeesTerms ?? <Muted>Not recorded</Muted>}
              </Fact>
              <Fact label="Insurance certificate">
                {coiStatus ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Chip tone={COI_TONES[coiStatus]}>{COI_LABELS[coiStatus]}</Chip>
                    {coi?.expiresOn ? (
                      <span className="text-muted-foreground">
                        expires {longDate(coi.expiresOn)}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <Muted>No lease to check</Muted>
                )}
              </Fact>
              {guarantorShown ? (
                <Fact label="Guarantor">{c.guarantorName ?? <Muted>None on file</Muted>}</Fact>
              ) : c.hasGuarantor ? (
                <Fact label="Guarantor">
                  <Muted>Guarantor details are restricted</Muted>
                </Fact>
              ) : null}
            </dl>
          </Card>

          <Card title="Amount owed">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold text-gray-600">
                  On the notice{c.dateSent ? ` · ${longDate(c.dateSent)}` : ''}
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums">
                  {formatCents(c.amountOwedAtNotice)}
                </div>
              </div>
              <div className="rounded-lg border border-navy-line bg-navy-soft/40 p-3">
                <div className="text-xs font-semibold text-navy">AR balance today</div>
                <div className="mt-1 text-xl font-bold text-navy-deep tabular-nums">
                  {formatCents(lease?.arBalance ?? null)}
                </div>
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              {delta ? (
                <Chip tone={delta.tone === 'gray' ? 'outline' : delta.tone}>{delta.text}</Chip>
              ) : null}
              {lease?.monthlyRent != null ? (
                <Chip tone="outline">Rent {formatCents(lease.monthlyRent)} / mo</Chip>
              ) : null}
              {lease ? (
                <Chip tone="outline">Recorded aging {AR_AGING_LABELS[lease.arAgingRecorded]}</Chip>
              ) : null}
              {agingDiffers && lease?.arAgingImplied ? (
                <Chip tone="warning">Balance implies {AR_AGING_LABELS[lease.arAgingImplied]}</Chip>
              ) : null}
            </div>
            <p className="mt-3 text-[13px] text-gray-600">
              {lease
                ? 'The accounting balance is the source of truth. The notice amount is kept as sent.'
                : 'This case has no matched lease, so there is no live balance.'}
            </p>
          </Card>
        </div>

        <Activity c={c} events={events} personas={personas} canAddUpdate={avail.addUpdate} />
      </div>
    </>
  );
}
