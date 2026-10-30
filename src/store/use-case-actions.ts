'use client';

import { useAsOf, usePersona } from '@/lib/persona/context';
import type { ISODate, Lease, Stage, Team } from '@/domain/types';
import type { LeaseSignal } from '@/domain/watchlist';
import {
  buildAdvance,
  buildNotificationEvent,
  buildOpenCase,
  buildOwnerChange,
  buildUpdate,
  type NotificationEventOptions,
} from './actions';
import { useStore } from './react';

/**
 * The only way UI code changes a case. Each call builds an audited event, checks `can()`, and
 * appends it to the store. They throw (PermissionError or Error) if the action isn't allowed.
 */
export function useCaseActions() {
  const store = useStore();
  const { persona } = usePersona();
  const { asOf } = useAsOf();

  const withCase = (caseId: string) => {
    const c = store.getCase(caseId);
    if (!c) throw new Error(`No case ${caseId}`);
    return c;
  };
  const ctx = { persona, asOf };

  return {
    addUpdate: (caseId: string, text: string, date?: ISODate) =>
      store.append(buildUpdate(withCase(caseId), text, ctx, date)),
    advance: (caseId: string, to: Stage, note?: string) =>
      store.append(buildAdvance(withCase(caseId), to, ctx, note)),
    changeOwner: (caseId: string, to: Team, note?: string) =>
      store.append(buildOwnerChange(withCase(caseId), to, ctx, note)),
    /** Logs that a notification was drafted or sent. The notification itself is saved with `store.upsertNotification`. */
    logNotification: (
      caseId: string,
      type: 'notification_drafted' | 'notification_sent',
      notificationId: string,
      options?: NotificationEventOptions,
    ) => store.append(buildNotificationEvent(withCase(caseId), type, notificationId, ctx, options)),
    /** Opens a Non-Compliant case for a flagged lease and returns the new case id. */
    openCase: (lease: Lease, signals: readonly LeaseSignal[]) => {
      const { newCase, event } = buildOpenCase(lease, signals, ctx);
      store.openCase(newCase, event);
      return newCase.id;
    },
  };
}
