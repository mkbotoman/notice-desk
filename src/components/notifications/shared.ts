import { format, parseISO } from 'date-fns';
import type { ChipTone } from '@/components/ui/chip';
import type { ISODateTime, NotificationTrigger } from '@/domain/types';

export const CONTROL =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

export const TEXTAREA =
  'w-full rounded-lg border border-input bg-card px-3 py-3 font-sans text-base leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

export const FIELD_LABEL = 'text-[13px] font-semibold text-gray-700';

export const TRIGGER_TONES: Record<NotificationTrigger, ChipTone> = {
  deadline_approaching: 'warning',
  deadline_passed: 'danger',
  stage_changed: 'navy',
  owner_changed: 'navy',
  coi_expiring: 'warning',
  manual: 'gray',
};

export const formatWhen = (iso: ISODateTime) => format(parseISO(iso), 'MMM d, h:mm a');

export const newManualId = () =>
  `NF-manual-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;

export type Mode =
  { kind: 'idle' } | { kind: 'compose'; caseId: string | null } | { kind: 'view'; id: string };

/** "N-001 · Brightside Fitness LLC · Harbor Commons" for a case id. */
export type CaseLabeler = (caseId: string) => string;

export const AUDIENCE_HINT = {
  internal: 'Notice Desk email to Legal: the internal wording.',
  property:
    'Email to the property manager, with a message for the tenant that they can pass on. Change To to switch wording.',
} as const;
