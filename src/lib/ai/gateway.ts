import { generateText, type LanguageModel } from 'ai';
import { AI_MAX_OUTPUT_TOKENS, AI_TIMEOUT_MS, aiModelId } from './config';

/**
 * `unavailable` covers everything the caller can't fix: no credentials, no credit, an outage, a
 * refusal or empty output. The caller's job is the same for all of them: use the template.
 */
export type AiResult =
  { ok: true; text: string; model: string } | { ok: false; reason: 'timeout' | 'unavailable' };

export interface GenerateInput {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
}

export type Generator = (input: GenerateInput) => Promise<AiResult>;

export interface GeneratorOptions {
  /** Defaults to the configured gateway model. Pass a mock model in tests. */
  model?: LanguageModel;
  timeoutMs?: number;
}

/**
 * Never throws and never logs a prompt or a response: only the outcome. Keeping prompts out of
 * logs is a privacy requirement, not a nicety.
 */
export function createGenerator(options: GeneratorOptions = {}): Generator {
  const model = options.model ?? aiModelId();
  const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;
  const label = typeof model === 'string' ? model : 'custom';

  return async ({ system, prompt, maxOutputTokens }) => {
    try {
      const { text } = await generateText({
        model,
        system,
        prompt,
        maxOutputTokens: maxOutputTokens ?? AI_MAX_OUTPUT_TOKENS,
        temperature: 0.3,
        // One click is one billed attempt: no automatic retries.
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(timeoutMs),
      });
      const trimmed = text.trim();
      if (trimmed === '') return fail('unavailable');
      return { ok: true, text: trimmed, model: label };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      return fail(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unavailable');
    }
  };
}

function fail(reason: 'timeout' | 'unavailable'): AiResult {
  console.warn('AI request did not complete:', reason);
  return { ok: false, reason };
}

export const generate: Generator = (input) => createGenerator()(input);
