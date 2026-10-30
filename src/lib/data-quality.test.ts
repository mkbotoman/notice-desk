import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DataQualityIssue } from '@/domain/types';
import { indexIssues, issuesNeedingReview } from './data-quality-context';
import { readReport } from './data-quality';

const issue = (over: Partial<DataQualityIssue>): DataQualityIssue => ({
  ruleId: 'DQ-X',
  severity: 'warning',
  file: 'leases',
  rowRef: 'L-1',
  field: 'f',
  message: 'm',
  action: 'flagged',
  ...over,
});

describe('readReport', () => {
  it('returns an empty list when there is no report', async () => {
    expect(await readReport(path.join(tmpdir(), 'no-such-report.json'))).toEqual([]);
  });

  it('reads and validates a report, and rejects a malformed one', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'nd-report-'));
    const good = path.join(dir, 'good.json');
    await writeFile(good, JSON.stringify([issue({})]));
    expect(await readReport(good)).toHaveLength(1);
    const bad = path.join(dir, 'bad.json');
    await writeFile(bad, JSON.stringify([{ ruleId: 'x' }]));
    await expect(readReport(bad)).rejects.toThrow();
  });

  it('reads the committed report', async () => {
    expect((await readReport()).length).toBeGreaterThan(0);
  });
});

describe('indexIssues and issuesNeedingReview', () => {
  const all = [
    issue({ rowRef: 'L-1', severity: 'info', action: 'fixed' }),
    issue({ rowRef: 'L-1', severity: 'warning' }),
    issue({ rowRef: 'N-1', severity: 'error' }),
    issue({ rowRef: 'N-2', severity: 'info' }),
  ];
  const byRef = indexIssues(all);

  it('groups issues by the record they refer to', () => {
    expect(byRef.get('L-1')).toHaveLength(2);
    expect(byRef.get('nope')).toBeUndefined();
  });

  it('keeps only warnings and errors, across several records, ignoring null and unknown refs', () => {
    expect(
      issuesNeedingReview(byRef, 'L-1', 'N-1', 'N-2', null, 'zzz').map((i) => i.severity),
    ).toEqual(['warning', 'error']);
  });
});
