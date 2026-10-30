import { Chip } from '@/components/ui/chip';
import type { CaseDeadline } from '@/domain/deadline';
import type { Stage, Team } from '@/domain/types';
import { DEADLINE_TONES, STAGE_LABELS, STAGE_TONES, TEAM_LABELS, describeDays } from '@/lib/format';

export function StageChip({ stage }: { stage: Stage }) {
  return <Chip tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Chip>;
}

/** Whose court the case is in. Pass null for a finished case. */
export function OwnerChip({ owner }: { owner: Team | null }) {
  if (owner === null) return <Chip tone="gray">Finished</Chip>;
  return <Chip tone={owner === 'legal' ? 'navy' : 'outline'}>{TEAM_LABELS[owner]}</Chip>;
}

/** "20 days overdue", "in 2 days", or "Deadline missing", coloured by urgency. */
export function DeadlineChip({ deadline }: { deadline: CaseDeadline }) {
  if (deadline.status === 'missing') return <Chip tone="warning">Deadline missing</Chip>;
  if (deadline.daysUntil === null || deadline.status === 'none') return null;
  return <Chip tone={DEADLINE_TONES[deadline.status]}>{describeDays(deadline.daysUntil)}</Chip>;
}
