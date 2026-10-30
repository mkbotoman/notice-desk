import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { cacheLife } from 'next/cache';
import { DataQualityReportSchema } from '@/domain/schemas';
import type { DataQualityIssue } from '@/domain/types';

const REPORT_PATH = path.join(process.cwd(), 'data', 'reports', 'data-quality.json');

/** The ingest report, or an empty list when `pnpm ingest` hasn't run (the fixture has none). */
export async function readReport(file: string = REPORT_PATH): Promise<DataQualityIssue[]> {
  const exists = await access(file).then(
    () => true,
    () => false,
  );
  if (!exists) return [];
  return DataQualityReportSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

export async function loadReport(): Promise<DataQualityIssue[]> {
  'use cache';
  cacheLife('max');
  return readReport();
}
