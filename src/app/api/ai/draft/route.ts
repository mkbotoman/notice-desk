import { DraftRequestSchema, createDraftHandler } from '@/lib/ai/draft';
import { generate } from '@/lib/ai/gateway';
import { createAiRoute } from '@/lib/ai/route';

// A model call takes several seconds; don't depend on the platform's default limit.
export const maxDuration = 30;

export const POST = createAiRoute({
  schema: DraftRequestSchema,
  handle: createDraftHandler(generate),
});
