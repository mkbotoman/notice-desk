import Link from 'next/link';

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** The value as words, e.g. "$14,178" or "4 cases". */
  valueText: string;
  /** Extra words after the value, e.g. "2 overdue". */
  detail?: string;
  /** The part of `value` drawn in the warning colour; the number in `detail` carries it for text. */
  flagged?: number;
  href?: string;
}

const pct = (n: number, max: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`;

/** Horizontal bars with the label and value as text, so no number depends on colour or hover. */
export function BarList({ rows }: { rows: BarRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li
          key={row.key}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
        >
          <span className="min-w-0 text-sm break-words text-gray-700">
            {row.href ? (
              <Link
                href={row.href}
                className="font-semibold text-navy hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {row.label}
              </Link>
            ) : (
              row.label
            )}
          </span>
          <svg
            aria-hidden="true"
            focusable="false"
            className="order-last col-span-2 h-3 w-full sm:order-none sm:col-span-1"
          >
            <rect width="100%" height="100%" rx="3" className="fill-muted" />
            <rect width={pct(row.value, max)} height="100%" rx="3" className="fill-navy/60" />
            {row.flagged ? (
              <rect width={pct(row.flagged, max)} height="100%" rx="3" className="fill-danger" />
            ) : null}
          </svg>
          <span className="text-right text-sm font-semibold whitespace-nowrap tabular-nums">
            {row.valueText}
            {row.detail ? (
              <span className="font-normal text-muted-foreground"> · {row.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
