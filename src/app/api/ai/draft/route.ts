import { DraftRequestSchema, createDraftHandler } from '@/lib/ai/draft';
import { generate } from '@/lib/ai/gateway';
import { createAiRoute } from '@/lib/ai/route';

export const POST = createAiRoute({
  schema: DraftRequestSchema,
  handle: createDraftHandler(generate),
});
