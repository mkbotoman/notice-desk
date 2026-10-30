import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  danger: { card: 'border-danger-line', value: 'text-danger' },
  warning: { card: 'border-warning-line', value: 'text-warning' },
  neutral: { card: 'border-border', value: 'text-navy' },
} as const;

/** A headline number with a label and one line of detail. */
export function Stat({
  value,
  label,
  detail,
  tone = 'neutral',
}: {
  value: ReactNode;
  label: string;
  detail?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div
      className={cn('flex flex-col gap-1 rounded-xl border bg-card px-4 py-4', TONES[tone].card)}
    >
      <span className={cn('text-3xl font-bold tabular-nums', TONES[tone].value)}>{value}</span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}
