import { generate } from '@/lib/ai/gateway';
import { createAiRoute } from '@/lib/ai/route';
import { NarrativePayloadSchema, createNarrativeHandler } from '@/lib/ai/narrative';

export const POST = createAiRoute({
  schema: NarrativePayloadSchema,
  handle: createNarrativeHandler(generate),
});
