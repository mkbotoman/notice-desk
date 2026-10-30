'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, LoadingState } from '@/components/shell/states';
import {
  countByStatus,
  filterNotifications,
  type OutboxFilter,
} from '@/domain/notifications/compose';
import type { Notification } from '@/domain/types';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { Composer } from './composer';
import { NotificationDetail } from './notification-detail';
import { NotificationList } from './notification-list';
import type { CaseLabeler, Mode } from './shared';

function OutboxBody() {
  const { notifications, cases } = useStoreState();
  const lookups = useLookups();
  const composeParam = useSearchParams().get('compose');

  const [mode, setMode] = useState<Mode>(
    composeParam ? { kind: 'compose', caseId: composeParam } : { kind: 'idle' },
  );
  const [seenParam, setSeenParam] = useState(composeParam);
  if (composeParam !== seenParam) {
    setSeenParam(composeParam);
    if (composeParam) setMode({ kind: 'compose', caseId: composeParam });
  }

  const [filter, setFilter] = useState<OutboxFilter>({
    status: 'draft',
    caseId: null,
    recipient: null,
  });

  const caseLabel = useCallback<CaseLabeler>(
    (id) => {
      const c = cases.find((x) => x.id === id);
      if (!c) return id;
      const tenant = lookups.tenantById.get(c.tenantId)?.displayName ?? 'Unknown tenant';
      const property = c.propertyId ? lookups.propertyById.get(c.propertyId)?.name : undefined;
      return [id, tenant, property].filter(Boolean).join(' · ');
    },
    [cases, lookups],
  );

  const clearComposeParam = () => {
    if (composeParam) window.history.replaceState(null, '', '/outbox');
  };

  const open = (n: Notification) => {
    clearComposeParam();
    setFilter((f) => ({ ...f, status: n.status }));
    setMode({ kind: 'view', id: n.id });
  };

  const items = filterNotifications(notifications, filter);
  const counts = countByStatus(notifications, filter);
  const selected = mode.kind === 'view' ? notifications.find((n) => n.id === mode.id) : undefined;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <NotificationList
        all={notifications}
        items={items}
        counts={counts}
        filter={filter}
        onFilter={setFilter}
        selectedId={mode.kind === 'view' ? mode.id : null}
        onSelect={open}
        onCompose={() => {
          clearComposeParam();
          setMode({ kind: 'compose', caseId: null });
        }}
        caseLabel={caseLabel}
      />
      <div className="min-w-0 flex-[999_1_520px]">
        {mode.kind === 'compose' ? (
          <Composer
            key={mode.caseId ?? 'new'}
            initialCaseId={mode.caseId}
            caseLabel={caseLabel}
            onDone={open}
            onCancel={() => {
              clearComposeParam();
              setMode({ kind: 'idle' });
            }}
          />
        ) : selected ? (
          <NotificationDetail
            key={selected.id}
            n={selected}
            caseName={selected.caseId}
            onChanged={open}
          />
        ) : (
          <EmptyState title="Pick a notification to review">
            Open a draft to edit, send or dismiss it, or start a new notification.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function OutboxGate() {
  const { hydrated } = useStoreState();
  return hydrated ? <OutboxBody /> : <LoadingState label="Loading outbox" />;
}

export function Outbox() {
  return (
    <>
      <PageHeader
        title="Outbox"
        subtitle="Notices Notice Desk drafted for you. Nothing is emailed: sending records the message in the case log."
      />
      <Guard requires="send_notification">
        <OutboxGate />
      </Guard>
    </>
  );
}
