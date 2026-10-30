/**
 * AI runs through the Vercel AI Gateway: a plain `provider/model` string, no provider SDK.
 * On a Vercel deployment the gateway authenticates with the project's OIDC token and bills the
 * team's gateway credit, so no key is needed there. Locally, `vercel env pull` provides a
 * short-lived token, or set AI_GATEWAY_API_KEY. Model ids must come from
 * https://ai-gateway.vercel.sh/v1/models.
 */
export const DEFAULT_AI_MODEL = 'google/gemini-2.5-flash';

/**
 * Chosen because the team's free gateway tier can use it (Anthropic models need paid credit,
 * and are refused with a 403 until it is added). Once paid credit is on the team, set
 * AI_GATEWAY_MODEL to a Claude model, for example one from https://ai-gateway.vercel.sh/v1/models.
 * Tested over ten real narrative runs: all ten passed the output checks.
 */
export function aiModelId(env: Record<string, string | undefined> = process.env): string {
  return env.AI_GATEWAY_MODEL?.trim() || DEFAULT_AI_MODEL;
}

export const AI_TIMEOUT_MS = 20_000;
/**
 * Generous on purpose: a "thinking" model spends part of this on hidden reasoning, and a cap that
 * is too tight cuts the visible text off mid-sentence. A cut-off reply is rejected, not shown.
 */
export const AI_MAX_OUTPUT_TOKENS = 4000;
/** Largest request body an AI route will read, in bytes. */
export const AI_MAX_BODY_BYTES = 24_000;
