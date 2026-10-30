'use client';

import { useEffect } from 'react';
import { evaluateTriggers } from '@/domain/notifications/triggers';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { buildNotificationEvent } from '@/store/actions';
import { useLookups } from '@/store/lookups';
import { useStore, useStoreState } from '@/store/react';

/**
 * Drafts the automatic notifications (deadlines, stage and owner changes, insurance) whenever
 * the store hydrates or its state changes. They are judged against the DATA date, never the as-of
 * picker: previewing a later date must not leave real, lasting drafts behind. Each draft is saved
 * once, with its `notification_drafted` event (logged as `system`, under an id fixed by the
 * notification so two tabs can't log it twice). The event is written first, so a notification
 * never exists without its audit entry. Safe for any persona: automatic events skip the
 * `send_notification` check. Mount once, app-wide, inside the store and persona providers.
 */
export function useAutoNotifications(): void {
  const store = useStore();
  const lookups = useLookups();
  const { hydrated, cases, eventsByCase, notifications } = useStoreState();
  const { dataDate } = useAsOf();
  const { persona, personas } = usePersona();

  useEffect(() => {
    if (!hydrated) return;
    const drafts = evaluateTriggers({
      asOf: dataDate,
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
      const eventId = `EV-AUTO-${draft.id}`;
      try {
        if (!store.getEvents(draft.caseId).some((e) => e.id === eventId)) {
          store.append(
            buildNotificationEvent(
              c,
              'notification_drafted',
              draft.id,
              { persona, asOf: dataDate },
              { automatic: true, id: eventId },
            ),
          );
        }
        store.upsertNotification(draft);
      } catch {
        // Ids only: never log notification text.
        console.warn('Could not save automatic notification', draft.id);
      }
    }
  }, [hydrated, cases, eventsByCase, notifications, dataDate, lookups, personas, persona, store]);
}
