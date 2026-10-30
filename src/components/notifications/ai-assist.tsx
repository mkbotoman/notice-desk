'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { DRAFT_INSTRUCTION_MAX, type DraftRequest, type DraftText } from '@/lib/ai/draft';
import { CONTROL, FIELD_LABEL } from './shared';

export const AI_UNAVAILABLE = 'AI unavailable, your draft is unchanged';
const AI_BUSY = 'Drafting with AI, please wait';
const AI_READY = 'AI draft ready to review';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; draft: DraftText };

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** Anything but a well-formed success is "unavailable": the person's own text stays as it is. */
async function requestDraft(request: DraftRequest, signal: AbortSignal): Promise<DraftText | null> {
  try {
    const res = await fetch('/api/ai/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) return null;
    const { source, subject, body } = data as Record<string, unknown>;
    return source === 'ai' && isText(subject) && isText(body) ? { subject, body } : null;
  } catch {
    return null;
  }
}

/**
 * Offers a model rewrite of the message, with an optional note on what should change. It only runs
 * when they click, shows the result beside their text, and applies it only when they say so.
 */
export function AiAssist({
  build,
  onUse,
}: {
  /** The allowlisted request for the current text and note, and whether redaction changed them. */
  build: (instruction: string) => { request: DraftRequest; removed: boolean };
  onUse: (draft: DraftText) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [removed, setRemoved] = useState(false);
  const [instruction, setInstruction] = useState('');
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = async () => {
    let built;
    try {
      built = build(instruction);
    } catch {
      setState({ kind: 'unavailable' });
      return;
    }
    setRemoved(built.removed);
    setState({ kind: 'loading' });
    controller.current?.abort();
    controller.current = new AbortController();
    const draft = await requestDraft(built.request, controller.current.signal);
    if (controller.current.signal.aborted) return;
    setState(draft ? { kind: 'ready', draft } : { kind: 'unavailable' });
  };

  const status =
    state.kind === 'loading' ? AI_BUSY : state.kind === 'unavailable' ? AI_UNAVAILABLE : '';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-navy-line bg-navy-soft/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-[1_1_240px] text-[13px] text-gray-700">
          Sends the case facts (tenant, property, stage, dates, amount, owner team), your text and
          your note to the AI. No case notes or guarantor details.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-10 px-3.5"
          disabled={state.kind === 'loading'}
          onClick={run}
        >
          <Sparkles aria-hidden />
          Draft with AI
        </Button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>What should change? (optional)</span>
        <input
          aria-label="What should change?"
          className={CONTROL}
          maxLength={DRAFT_INSTRUCTION_MAX}
          placeholder="For example: shorter, or friendlier"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
      </label>

      <p role="status" aria-live="polite" className="text-sm font-semibold text-gray-700">
        {state.kind === 'ready' ? AI_READY : status}
      </p>
      {removed && state.kind !== 'idle' && state.kind !== 'loading' ? (
        <p className="text-[13px] text-warning">
          Sensitive-looking text was removed before sending.
        </p>
      ) : null}

      {state.kind === 'ready' ? (
        <section
          aria-label="AI draft"
          className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="navy">AI-assisted</Chip>
            <h3 className="text-sm font-bold text-navy-deep">
              AI draft: check it before you use it
            </h3>
          </div>
          <div>
            <p className={FIELD_LABEL}>Subject</p>
            <p className="text-sm break-words">{state.draft.subject}</p>
          </div>
          <div>
            <p className={FIELD_LABEL}>Message</p>
            <p className="text-sm break-words whitespace-pre-wrap">{state.draft.body}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-3.5"
              onClick={() => setState({ kind: 'idle' })}
            >
              Discard
            </Button>
            <Button
              type="button"
              className="h-10 px-3.5"
              onClick={() => {
                onUse(state.draft);
                setState({ kind: 'idle' });
              }}
            >
              Use this draft
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
