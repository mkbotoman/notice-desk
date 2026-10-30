/**
 * AI runs through the Vercel AI Gateway: a plain `provider/model` string, no provider SDK.
 * On a Vercel deployment the gateway authenticates with the project's OIDC token and bills the
 * team's gateway credit, so no key is needed there. Locally, `vercel env pull` provides a
 * short-lived token, or set AI_GATEWAY_API_KEY. Model ids must come from
 * https://ai-gateway.vercel.sh/v1/models.
 */
export const DEFAULT_AI_MODEL = 'anthropic/claude-haiku-5.5';

/** A few sentences of text: cheap, fast and plenty. Override with AI_GATEWAY_MODEL. */
export function aiModelId(env: Record<string, string | undefined> = process.env): string {
  return env.AI_GATEWAY_MODEL?.trim() || DEFAULT_AI_MODEL;
}

export const AI_TIMEOUT_MS = 20_000;
export const AI_MAX_OUTPUT_TOKENS = 600;
/** Largest request body an AI route will read, in bytes. */
export const AI_MAX_BODY_BYTES = 24_000;
