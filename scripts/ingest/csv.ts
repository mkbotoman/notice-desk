import { parse } from 'csv-parse/sync';

export type Row = Record<string, string>;

export interface ParsedCsv {
  rows: Row[];
  /** 1-based data row numbers are `index + 1`; the header is not a row. */
  columns: string[];
}

/**
 * Parses a CSV, and removes the named sensitive columns at the parser boundary: their values are
 * reduced to a `<column>__present` flag inside `on_record` and never stored on the row.
 */
export function parseCsv(text: string, sensitiveColumns: readonly string[] = []): ParsedCsv {
  let columns: string[] = [];
  const rows = parse(text, {
    bom: true,
    columns: (header: string[]) => {
      columns = header.map((h) => h.trim());
      return columns;
    },
    skip_empty_lines: true,
    relax_column_count: true,
    trim: false,
    on_record: (record: Row): Row => {
      for (const column of columns) record[column] ??= '';
      for (const column of sensitiveColumns) {
        record[`${column}__present`] = (record[column] ?? '').trim() === '' ? '' : '1';
        delete record[column];
      }
      return record;
    },
  }) as Row[];
  return { rows, columns: columns.filter((c) => !sensitiveColumns.includes(c)) };
}
