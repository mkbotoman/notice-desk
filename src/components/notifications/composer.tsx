'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import {
  buildManualNotification,
  defaultRecipient,
  defaultTemplate,
  renderForCase,
} from '@/domain/notifications/compose';
import { legalRecipient, personaRecipient } from '@/domain/notifications/recipients';
import { TEMPLATES, type TemplateId } from '@/domain/notifications/templates';
import type { NotificationRefs } from '@/domain/notifications/triggers';
import { openCases } from '@/domain/selectors';
import type { Notification } from '@/domain/types';
import { errorMessage } from '@/components/case-detail/case-actions';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { personaOptionLabel } from '@/lib/persona/personas';
import { useLookups } from '@/store/lookups';
import { useStore, useStoreState } from '@/store/react';
import { useCaseActions } from '@/store/use-case-actions';
import { NO_EMAIL_NOTE } from './notification-detail';
import { CONTROL, FIELD_LABEL, TEXTAREA, newManualId, type CaseLabeler } from './shared';

interface Text {
  subject: string;
  body: string;
}

export function Composer({
  initialCaseId,
  caseLabel,
  onDone,
  onCancel,
}: {
  initialCaseId: string | null;
  caseLabel: CaseLabeler;
  onDone: (saved: Notification) => void;
  onCancel: () => void;
}) {
  const store = useStore();
  const actions = useCaseActions();
  const lookups = useLookups();
  const { cases } = useStoreState();
  const { asOf } = useAsOf();
  const { personas } = usePersona();

  const [caseId, setCaseId] = useState(initialCaseId ?? '');
  const [templateOverride, setTemplateOverride] = useState<TemplateId | null>(null);
  const [recipientOverride, setRecipientOverride] = useState<string | null>(null);
  const [edit, setEdit] = useState<Text | null>(null);
  const [error, setError] = useState<string | null>(null);

  const c = cases.find((x) => x.id === caseId);
  const refs = useMemo<NotificationRefs>(
    () => ({ ...lookups, coi: store.getSeed().coi }),
    [lookups, store],
  );
  const choices = useMemo(() => {
    const open = new Set(openCases(cases).map((x) => x.id));
    return [...cases].sort(
      (a, b) => Number(open.has(b.id)) - Number(open.has(a.id)) || a.id.localeCompare(b.id),
    );
  }, [cases]);

  const templateId: TemplateId = templateOverride ?? (c ? defaultTemplate(c, asOf) : 'blank');
  const chosen = personas.find((p) => p.id === recipientOverride);
  const recipient =
    c && recipientOverride === null
      ? defaultRecipient(templateId, c, { refs, personas })
      : chosen
        ? personaRecipient(chosen)
        : legalRecipient(personas);
  const rendered: Text = c
    ? renderForCase(templateId, c, recipient, { asOf, refs, personas })
    : { subject: '', body: '' };
  const text = edit ?? rendered;
  const edited =
    edit !== null && (edit.subject !== rendered.subject || edit.body !== rendered.body);

  const save = (status: 'draft' | 'sent') => {
    if (!c) {
      setError('Pick a case first.');
      return;
    }
    try {
      const n = buildManualNotification({
        id: newManualId(),
        caseId: c.id,
        recipient,
        subject: text.subject,
        body: text.body,
        template: templateId === 'blank' ? null : { rendered },
        status,
        now: new Date().toISOString(),
      });
      actions.logNotification(
        c.id,
        status === 'sent' ? 'notification_sent' : 'notification_drafted',
        n.id,
      );
      store.upsertNotification(n);
      onDone(n);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section
      aria-label="Compose"
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="text-base font-bold text-navy-deep">New notification</h2>
        {c ? (
          <div className="flex flex-wrap items-center gap-2">
            {edited ? (
              <Chip tone="warning">Edited by you</Chip>
            ) : templateId === 'blank' ? null : (
              <Chip tone="navy">Standard template · no AI</Chip>
            )}
            <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-navy">
              Case {c.id}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={FIELD_LABEL}>Case</span>
          <select
            aria-label="Case"
            className={CONTROL}
            value={caseId}
            onChange={(e) => {
              setCaseId(e.target.value);
              setTemplateOverride(null);
              setRecipientOverride(null);
              setEdit(null);
            }}
          >
            <option value="">Choose a case</option>
            {choices.map((x) => (
              <option key={x.id} value={x.id}>
                {caseLabel(x.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={FIELD_LABEL}>Template</span>
          <select
            aria-label="Template"
            className={CONTROL}
            value={templateId}
            onChange={(e) => {
              setTemplateOverride(e.target.value as TemplateId);
              setEdit(null);
            }}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={FIELD_LABEL}>To</span>
          <select
            aria-label="To"
            className={CONTROL}
            value={recipient.personaId ?? ''}
            onChange={(e) => setRecipientOverride(e.target.value)}
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {personaOptionLabel(p)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Subject</span>
        <input
          aria-label="Subject"
          className={CONTROL}
          value={text.subject}
          onChange={(e) => setEdit({ ...text, subject: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>Message</span>
        <textarea
          aria-label="Message"
          rows={12}
          className={TEXTAREA}
          value={text.body}
          onChange={(e) => setEdit({ ...text, body: e.target.value })}
        />
      </label>

      {edited ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-3.5"
            onClick={() => setEdit(null)}
          >
            Reset to template
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="text-[13px] text-muted-foreground">
          Template: {TEMPLATES.find((t) => t.id === templateId)?.label}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" className="h-10 px-3.5" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-3.5"
            onClick={() => save('draft')}
          >
            Save as draft
          </Button>
          <Button type="button" className="h-10 px-3.5" onClick={() => save('sent')}>
            Send
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{NO_EMAIL_NOTE}</p>
    </section>
  );
}
