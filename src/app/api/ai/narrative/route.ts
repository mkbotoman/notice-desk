import { generate } from '@/lib/ai/gateway';
import { createAiRoute } from '@/lib/ai/route';
import { NarrativePayloadSchema, createNarrativeHandler } from '@/lib/ai/narrative';

// A model call takes several seconds; don't depend on the platform's default limit.
export const maxDuration = 30;

export const POST = createAiRoute({
  schema: NarrativePayloadSchema,
  handle: createNarrativeHandler(generate),
});
