'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { TRIGGER_LABELS, dismissDraft, editDraft, sendDraft } from '@/domain/notifications/compose';
import type { Notification } from '@/domain/types';
import { errorMessage } from '@/components/case-detail/case-actions';
import { useStore } from '@/store/react';
import { useCaseActions } from '@/store/use-case-actions';
import { CONTROL, FIELD_LABEL, TEXTAREA, TRIGGER_TONES, formatWhen } from './shared';

export const NO_EMAIL_NOTE =
  'Sending adds this message to the case history. In this prototype no email leaves Notice Desk.';

function Heading({ n, caseName }: { n: Notification; caseName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={TRIGGER_TONES[n.trigger]}>
          {n.trigger === 'manual' ? '' : 'Automatic · '}
          {TRIGGER_LABELS[n.trigger]}
        </Chip>
        <Link href={`/cases/${n.caseId}`} className="text-[13px] font-semibold text-navy">
          Case {caseName}
        </Link>
      </div>
      {n.source === 'template' ? (
        <Chip tone="navy">Standard template · no AI</Chip>
      ) : (
        <Chip tone="warning">Edited by you</Chip>
      )}
    </div>
  );
}

/** A draft you can edit, send or dismiss; a sent or dismissed notification is read-only. */
export function NotificationDetail({
  n,
  caseName,
  onChanged,
}: {
  n: Notification;
  caseName: string;
  onChanged: (next: Notification) => void;
}) {
  const store = useStore();
  const actions = useCaseActions();
  const [subject, setSubject] = useState(n.subject);
  const [body, setBody] = useState(n.body);
  const [error, setError] = useState<string | null>(null);

  if (n.status !== 'draft') {
    return (
      <section
        aria-label="Notification detail"
        className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6"
      >
        <Heading n={n} caseName={caseName} />
        <p className="text-sm text-muted-foreground">
          {n.status === 'sent'
            ? `Sent ${formatWhen(n.sentAt ?? n.createdAt)}. It is in the case log and can no longer be changed. No email was sent.`
            : 'Dismissed. It stays here for the record and can no longer be changed.'}
        </p>
        <dl className="flex flex-col gap-3">
          <div>
            <dt className={FIELD_LABEL}>To</dt>
            <dd className="text-sm">{n.recipientLabel}</dd>
          </div>
          <div>
            <dt className={FIELD_LABEL}>Subject</dt>
            <dd className="text-sm break-words">{n.subject}</dd>
          </div>
          <div>
            <dt className={FIELD_LABEL}>Message</dt>
            <dd className="text-sm break-words whitespace-pre-wrap">{n.body}</dd>
          </div>
        </dl>
      </section>
    );
  }

  const run = (act: () => Notification) => {
    try {
      const next = act();
      setError(null);
      onChanged(next);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const save = () =>
    run(() => {
      const next = editDraft(n, { subject, body });
      store.upsertNotification(next);
      return next;
    });

  const send = () =>
    run(() => {
      const next = sendDraft(editDraft(n, { subject, body }), new Date().toISOString());
      actions.logNotification(n.caseId, 'notification_sent', n.id);
      store.upsertNotification(next);
      return next;
    });

  const dismiss = () =>
    run(() => {
      const next = dismissDraft(n);
      store.upsertNotification(next);
      return next;
    });

  return (
    <section
      aria-label="Draft"
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6"
    >
      <Heading n={n} caseName={caseName} />
      <div className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>To</span>
        <p className="text-sm">{n.recipientLabel}</p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Subject</span>
        <input className={CONTROL} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Message</span>
        <textarea
          aria-label="Message"
          rows={12}
          className={TEXTAREA}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" className="h-10 px-3.5" onClick={dismiss}>
          Dismiss
        </Button>
        <Button type="button" variant="outline" className="h-10 px-3.5" onClick={save}>
          Save changes
        </Button>
        <Button type="button" className="h-10 px-3.5" onClick={send}>
          Send
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{NO_EMAIL_NOTE}</p>
    </section>
  );
}
