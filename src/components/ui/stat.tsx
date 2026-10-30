import type { ReactNode } from 'react';
import Link from 'next/link';
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
  href,
}: {
  value: ReactNode;
  label: string;
  detail?: string;
  tone?: keyof typeof TONES;
  /** Makes the whole card a link, for example to the list it counts. */
  href?: string;
}) {
  const className = cn(
    'flex min-w-0 flex-col gap-1 rounded-xl border bg-card px-4 py-4',
    TONES[tone].card,
    href &&
      'no-underline transition-colors hover:bg-navy-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  );
  const body = (
    <>
      <span
        className={cn('text-2xl font-bold break-words tabular-nums sm:text-3xl', TONES[tone].value)}
      >
        {value}
      </span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
