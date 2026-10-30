'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { templateNarrative, type NarrativePayload } from '@/lib/ai/narrative';

type Origin = 'standard' | 'ai' | 'fallback';

const ORIGIN_LABELS: Record<Origin, string> = {
  standard: 'Standard summary',
  ai: 'AI draft: check it before you send',
  fallback: 'AI unavailable, used the standard summary',
};

interface AiReply {
  source: 'ai' | 'template';
  text: string;
}

async function requestNarrative(payload: NarrativePayload): Promise<AiReply | null> {
  try {
    const res = await fetch('/api/ai/narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) return null;
    const { source, text } = body as Partial<AiReply>;
    return (source === 'ai' || source === 'template') && typeof text === 'string' && text.trim()
      ? { source, text }
      : null;
  } catch {
    return null;
  }
}

/**
 * The paragraph that opens the summary. It starts as the standard (template) text and the model
 * is only called from the button. Nothing reaches the email until the person accepts it, and the
 * parent drops this component's state (by key) whenever the week, viewer or data change.
 */
export function NarrativePanel({
  payload,
  onIncludedChange,
}: {
  payload: NarrativePayload;
  onIncludedChange: (text: string | undefined) => void;
}) {
  const standard = templateNarrative(payload);
  const [text, setText] = useState(standard);
  const [origin, setOrigin] = useState<Origin>('standard');
  const [accepted, setAccepted] = useState(false);
  const [working, setWorking] = useState(false);

  const publish = (nextText: string, nextAccepted: boolean) =>
    onIncludedChange(nextAccepted && nextText.trim() ? nextText : undefined);

  const write = async () => {
    setWorking(true);
    const reply = await requestNarrative(payload);
    setWorking(false);
    setText(reply?.source === 'ai' ? reply.text : standard);
    setOrigin(reply?.source === 'ai' ? 'ai' : 'fallback');
    setAccepted(false);
    publish('', false);
  };

  const edit = (next: string) => {
    setText(next);
    publish(next, accepted);
  };

  const accept = (next: boolean) => {
    setAccepted(next);
    publish(text, next);
  };

  const useStandard = () => {
    setText(standard);
    setOrigin('standard');
    setAccepted(false);
    publish('', false);
  };

  return (
    <section aria-label="What changed this week" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-navy-deep">What changed this week</h2>
        <Button
          variant="outline"
          className="h-10 px-3.5 font-semibold"
          disabled={working}
          onClick={write}
        >
          {working ? 'Writing…' : 'Write with AI'}
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2">
          <Chip tone={origin === 'ai' ? 'navy' : 'gray'} className="whitespace-normal">
            {ORIGIN_LABELS[origin]}
          </Chip>
          {accepted ? <Chip tone="success">In the email</Chip> : null}
        </div>
        <textarea
          aria-label="Paragraph for the email"
          value={text}
          onChange={(e) => edit(e.target.value)}
          rows={5}
          className="w-full resize-y rounded-lg border border-input bg-background p-3 text-[15px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap items-center gap-2">
          {accepted ? (
            <Button variant="outline" className="h-10 px-3.5" onClick={() => accept(false)}>
              Remove from email
            </Button>
          ) : (
            <Button className="h-10 px-3.5 font-semibold" onClick={() => accept(true)}>
              Use this paragraph
            </Button>
          )}
          {origin === 'standard' ? null : (
            <Button variant="ghost" className="h-10 px-3.5" onClick={useStandard}>
              Back to standard summary
            </Button>
          )}
        </div>
        <p className="text-xs leading-normal text-gray-700">
          The AI sees only counts, tenant, property, suite, stage, issue type, owner team, dates and
          amounts from this summary: no people, notes or guarantors. Only a paragraph you use goes
          into the copied email.
        </p>
      </div>
    </section>
  );
}
