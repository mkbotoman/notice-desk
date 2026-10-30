import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TableColumn {
  label: string;
  numeric?: boolean;
}

/** The text equivalent of a chart: the same numbers, readable by anyone. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: TableColumn[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b bg-surface">
            {columns.map((c) => (
              <th
                key={c.label}
                scope="col"
                className={cn(
                  'px-3 py-2 text-xs font-semibold whitespace-nowrap text-muted-foreground',
                  c.numeric ? 'text-right' : 'text-left',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b last:border-b-0">
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={cn('px-3 py-2', columns[i].numeric && 'text-right tabular-nums')}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One chart with its plain-language reading, an honest statement of what dates it covers, and
 * the data table behind it. A card with no `table` shows `empty` instead of a chart.
 */
export function ChartCard({
  id,
  title,
  tells,
  coverage,
  empty,
  table,
  tableOpen,
  children,
}: {
  id: string;
  title: string;
  /** One line: what this chart tells you. */
  tells: string;
  coverage?: string;
  empty?: string;
  table?: { caption: string; columns: TableColumn[]; rows: ReactNode[][] };
  /** Show the table in place of a chart, for data that is only a table. */
  tableOpen?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      data-testid={`chart-${id}`}
      aria-labelledby={`chart-${id}-title`}
      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h3 id={`chart-${id}-title`} className="text-base font-bold text-navy-deep">
          {title}
        </h3>
        <p className="text-sm text-gray-700">{tells}</p>
        {coverage ? <p className="text-xs text-muted-foreground">{coverage}</p> : null}
      </div>
      {empty || !table ? (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : tableOpen ? (
        <div className="rounded-lg border">
          <DataTable {...table} />
        </div>
      ) : (
        <>
          {children}
          <details>
            <summary className="w-fit cursor-pointer rounded text-sm font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Data table
            </summary>
            <div className="mt-2 rounded-lg border">
              <DataTable {...table} />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
