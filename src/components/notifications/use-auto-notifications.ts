'use client';

import { useEffect } from 'react';
import { evaluateTriggers } from '@/domain/notifications/triggers';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { buildNotificationEvent } from '@/store/actions';
import { useLookups } from '@/store/lookups';
import { useStore, useStoreState } from '@/store/react';

/**
 * Drafts the automatic notifications (deadlines, stage and owner changes, insurance) whenever
 * the store hydrates or its state or the as-of date changes. Every draft is saved once and its
 * `notification_drafted` event logged as `system`. Safe for any persona: automatic events skip
 * the `send_notification` check. Mount once, app-wide, inside the store and persona providers.
 */
export function useAutoNotifications(): void {
  const store = useStore();
  const lookups = useLookups();
  const { hydrated, cases, eventsByCase, notifications } = useStoreState();
  const { asOf } = useAsOf();
  const { persona, personas } = usePersona();

  useEffect(() => {
    if (!hydrated) return;
    const drafts = evaluateTriggers({
      asOf,
      now: new Date().toISOString(),
      cases,
      eventsByCase,
      existing: notifications,
      refs: { ...lookups, coi: store.getSeed().coi },
      personas,
    });
    for (const draft of drafts) {
      const c = store.getCase(draft.caseId);
      if (!c) continue;
      try {
        store.upsertNotification(draft);
        store.append(
          buildNotificationEvent(
            c,
            'notification_drafted',
            draft.id,
            { persona, asOf },
            { automatic: true },
          ),
        );
      } catch {
        // A draft that cannot be saved is skipped; the next state change retries it.
      }
    }
  }, [hydrated, cases, eventsByCase, notifications, asOf, lookups, personas, persona, store]);
}
