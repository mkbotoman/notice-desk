'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Guard } from '@/components/shell/guard';
import { PageHeader } from '@/components/shell/page-header';
import { LoadingState } from '@/components/shell/states';
import { Button } from '@/components/ui/button';
import { buildWeekSummary } from '@/domain/summary/build';
import { renderHtml, renderPlainText } from '@/domain/summary/render';
import { buildNarrativePayload } from '@/lib/ai/narrative';
import { weekdayDate } from '@/lib/format';
import { useAsOf, usePersona } from '@/lib/persona/context';
import { useLookups } from '@/store/lookups';
import { useStoreState } from '@/store/react';
import { copyRichText } from './clipboard';
import { NarrativePanel } from './narrative-panel';

type View = 'email' | 'text';
const VIEWS: { id: View; label: string }[] = [
  { id: 'email', label: 'Email view' },
  { id: 'text', label: 'Plain text' },
];

const CONFIRM_MS = 4000;

function SummaryBody() {
  const { persona, personas } = usePersona();
  const { asOf } = useAsOf();
  const { cases, eventsByCase, hydrated } = useStoreState();
  const refs = useLookups();
  const [view, setView] = useState<View>('email');
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const summary = useMemo(
    () =>
      buildWeekSummary({
        persona,
        asOf,
        cases,
        events: [...eventsByCase.values()].flat(),
        refs,
        actorNames: {
          import: 'Import',
          ...Object.fromEntries(personas.map((p) => [p.id, p.label])),
        },
      }),
    [persona, personas, asOf, cases, eventsByCase, refs],
  );
  const payload = useMemo(() => buildNarrativePayload(summary), [summary]);
  // The accepted paragraph belongs to one week, viewer and set of figures: any change drops it.
  const narrativeKey = useMemo(
    () => `${persona.id}|${JSON.stringify(payload)}`,
    [persona.id, payload],
  );
  const [accepted, setAccepted] = useState<{ key: string; text: string } | null>(null);
  const narrative = accepted?.key === narrativeKey ? accepted.text : undefined;
  const text = useMemo(() => renderPlainText(summary, narrative), [summary, narrative]);
  const html = useMemo(() => renderHtml(summary, narrative), [summary, narrative]);

  if (!hydrated) return <LoadingState label="Loading the weekly summary" />;

  const copy = async () => {
    const ok = await copyRichText(text, html);
    setStatus(ok ? 'Copied' : "Couldn't copy. Select the text and copy it by hand.");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), CONFIRM_MS);
  };

  return (
    <div className="flex flex-col gap-5">
      <NarrativePanel
        key={narrativeKey}
        payload={payload}
        onIncludedChange={(next) =>
          setAccepted(next === undefined ? null : { key: narrativeKey, text: next })
        }
      />
      <div className="flex flex-wrap items-start gap-5">
        <article
          aria-label="Summary preview"
          className="min-w-0 flex-[999_1_32rem] overflow-hidden rounded-xl border bg-card"
        >
          <div className="flex flex-col gap-1 border-b bg-surface px-4 py-4 sm:px-6">
            <span className="text-xs font-semibold text-gray-600">Subject</span>
            <span className="text-[15px] font-semibold break-words" data-testid="summary-subject">
              {summary.subject}
            </span>
          </div>
          <div className="px-4 py-5 sm:px-6">
            {view === 'email' ? (
              <div
                data-testid="summary-email"
                className="max-w-3xl break-words"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <pre
                data-testid="summary-text"
                className="max-w-3xl font-sans text-sm leading-relaxed break-words whitespace-pre-wrap"
              >
                {text}
              </pre>
            )}
          </div>
        </article>

        <aside
          aria-label="Copy options"
          className="flex min-w-0 flex-[1_1_16rem] flex-col gap-3 rounded-xl border bg-card p-5 lg:max-w-xs"
        >
          <h2 className="text-base font-bold text-navy-deep">Send it your way</h2>
          <div role="group" aria-label="Summary format" className="flex gap-2">
            {VIEWS.map((v) => (
              <Button
                key={v.id}
                variant={view === v.id ? 'default' : 'outline'}
                aria-pressed={view === v.id}
                className="h-10 flex-1 px-3"
                onClick={() => setView(v.id)}
              >
                {v.label}
              </Button>
            ))}
          </div>
          <Button className="h-10 px-3.5 font-semibold" onClick={copy}>
            Copy
          </Button>
          <p
            role="status"
            aria-live="polite"
            className="min-h-5 text-sm font-semibold text-success"
          >
            {status}
          </p>
          <p className="text-xs leading-normal text-gray-700">
            Copies the plain text, plus the formatted version where your browser allows it, ready to
            paste into an email. It covers the 7 days ending {weekdayDate(asOf)} and only the cases
            you can see.
          </p>
        </aside>
      </div>
    </div>
  );
}

export function WeeklySummary() {
  return (
    <>
      <PageHeader
        title="Weekly summary"
        subtitle="Ready to paste into an email. Scoped to what the viewer can see."
      />
      <Guard requires="view_analytics">
        <SummaryBody />
      </Guard>
    </>
  );
}
