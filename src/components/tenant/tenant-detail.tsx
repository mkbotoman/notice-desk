'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { StageChip } from '@/components/case/case-chips';
import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, LoadingState } from '@/components/shell/states';
import { Chip } from '@/components/ui/chip';
import { Stat } from '@/components/ui/stat';
import { can } from '@/domain/permissions';
import { isTerminal } from '@/domain/stage';
import type { Case, Lease } from '@/domain/types';
import { formatCents, longDate } from '@/lib/format';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import {
  actorLabeller,
  agingText,
  buildTimeline,
  coiDisplay,
  leasesInScope,
  openCaseForLease,
  propertyLine,
} from './tenant-logic';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function NotFound() {
  return (
    <EmptyState
      title="Tenant not found"
      action={
        <Link href="/tenants" className="text-sm font-semibold text-navy">
          Back to all tenants
        </Link>
      }
    >
      There is no tenant with that link in your current view.
    </EmptyState>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function LeaseCard({ lease, openCase }: { lease: Lease; openCase: Case | undefined }) {
  const { asOf } = useAsOf();
  const { propertyById, coiByLeaseId } = useLookups();
  const property = lease.propertyId ? propertyById.get(lease.propertyId) : undefined;
  const aging = agingText(lease);
  const coi = coiDisplay(coiByLeaseId.get(lease.id), asOf);

  return (
    <article
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="lease-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-navy-deep">{propertyLine(property)}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{lease.suite ?? 'No suite listed'}</p>
        </div>
        <Chip tone={lease.status === 'active' ? 'success' : 'gray'}>
          {statusLabel(lease.status)}
        </Chip>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2.5">
        {openCase ? (
          <>
            <span className="text-sm text-gray-700">Case {openCase.id}</span>
            <Link
              href={`/cases/${openCase.id}`}
              aria-label={`Open case ${openCase.id}`}
              className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <StageChip stage={openCase.stage} />
            </Link>
          </>
        ) : (
          <span className="text-sm text-gray-700">No open case</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Field label="Monthly rent">
          <span className="tabular-nums">{formatCents(lease.monthlyRent)}</span>
        </Field>
        <Field label="AR balance">
          <span className="font-bold tabular-nums">{formatCents(lease.arBalance)}</span>
        </Field>
        <div className="col-span-2">
          <dt className="text-xs font-semibold text-gray-600">AR aging</dt>
          <dd className="mt-1">
            <Chip tone={aging.understated ? 'warning' : 'outline'} className="whitespace-normal">
              {aging.text}
            </Chip>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs font-semibold text-gray-600">Insurance certificate</dt>
          <dd className="mt-1">
            <Chip tone={coi.tone}>{coi.label}</Chip>
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function TenantDetail({ id }: { id: string }) {
  const { persona, personas } = usePersona();
  const { cases, eventsByCase, hydrated } = useStoreState();
  const { tenantById, leasesByTenant } = useLookups();

  const tenant = tenantById.get(id);
  const leases = useMemo(
    () => leasesInScope(leasesByTenant.get(id) ?? [], persona),
    [leasesByTenant, id, persona],
  );
  const tenantCases = useMemo(
    () => cases.filter((c) => c.tenantId === id && can(persona, 'view_case', c)),
    [cases, id, persona],
  );
  const timeline = useMemo(
    () => buildTimeline(tenantCases, eventsByCase, actorLabeller(personas)),
    [tenantCases, eventsByCase, personas],
  );

  if (!hydrated) {
    return (
      <>
        <PageHeader title="Tenant" />
        <LoadingState label="Loading tenant" />
      </>
    );
  }
  if (!tenant || leases.length === 0) {
    return (
      <>
        <PageHeader title="Tenant" />
        <Guard requires="view_case">
          <NotFound />
        </Guard>
      </>
    );
  }

  const openCount = tenantCases.filter((c) => !isTerminal(c.stage)).length;
  const totalAr = leases.reduce((sum, l) => sum + (l.arBalance ?? 0), 0);
  const totalRent = leases.reduce((sum, l) => sum + (l.monthlyRent ?? 0), 0);
  const variants = tenant.nameVariants.filter((n) => n !== tenant.displayName);

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-[13px] text-gray-600">
        <Link href="/tenants" className="font-medium text-navy">
          Tenants
        </Link>{' '}
        <span aria-hidden="true">/</span> {tenant.displayName}
      </nav>
      <PageHeader
        title={tenant.displayName}
        subtitle={`${plural(leases.length, 'lease')} · ${plural(openCount, 'open case')}`}
        actions={
          variants.length > 0 ? (
            <details className="text-[13px] text-gray-600">
              <summary className="cursor-pointer font-semibold text-navy">Also appears as</summary>
              <ul className="mt-1.5 list-disc pl-5">
                {variants.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              {can(persona, 'view_data_quality') ? (
                <p className="mt-1.5">
                  <Link href="/data-quality" className="font-semibold text-navy">
                    See how names were merged
                  </Link>
                </p>
              ) : null}
            </details>
          ) : null
        }
      />
      <Guard requires="view_case">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat value={formatCents(totalAr)} label="AR across leases" />
          <Stat value={formatCents(totalRent)} label="Monthly rent" />
          <Stat value={openCount} label="Open cases" />
        </div>

        <section
          aria-label="Leases"
          className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3"
        >
          {leases.map((lease) => (
            <LeaseCard
              key={lease.id}
              lease={lease}
              openCase={openCaseForLease(tenantCases, lease.id)}
            />
          ))}
        </section>

        <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-bold text-navy-deep">History across all leases</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No case history yet.</p>
          ) : (
            <ol className="divide-y" data-testid="tenant-timeline">
              {timeline.map((e) => (
                <li key={e.id} className="flex gap-4 py-2.5">
                  <span className="w-32 flex-none text-[13px] font-semibold text-gray-700">
                    {longDate(e.date)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-semibold text-gray-600">
                      Case {e.caseId} · {e.actor}
                    </span>
                    <span className="text-sm">{e.summary}</span>
                    {e.note ? (
                      <span className="text-sm break-words whitespace-pre-wrap text-gray-700">
                        {e.note}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </Guard>
    </>
  );
}
