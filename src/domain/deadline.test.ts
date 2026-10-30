import { describe, expect, it } from 'vitest';
import { makeCase } from '@/test/factories';
import {
  caseDeadline,
  cureDeadline,
  cureDeadlineDetail,
  deadlineStatus,
  DUE_SOON_DAYS,
} from './deadline';

const biz = (n: number) => ({ kind: 'days', n, unit: 'business' }) as const;
const cal = (n: number) => ({ kind: 'days', n, unit: 'calendar' }) as const;

describe('cureDeadline', () => {
  it('adds calendar days starting the day after the notice', () => {
    expect(cureDeadline('2026-10-09', cal(10))).toBe('2026-10-19');
    expect(cureDeadlineDetail('2026-10-09', cal(10))?.skippedHolidays).toEqual([]);
  });

  it('skips weekends and Columbus Day for 10 business days from 2026-09-28', () => {
    const detail = cureDeadlineDetail('2026-09-28', biz(10));
    expect(detail?.deadline).toBe('2026-10-13');
    expect(detail?.skippedHolidays.map((h) => h.name)).toEqual(['Columbus Day']);
  });

  it('starts counting on the next business day when sent on a Friday or a weekend', () => {
    expect(cureDeadline('2026-10-02', biz(1))).toBe('2026-10-05');
    expect(cureDeadline('2026-10-03', biz(1))).toBe('2026-10-05');
  });

  it('skips Thanksgiving', () => {
    const detail = cureDeadlineDetail('2026-11-24', biz(3));
    expect(detail?.deadline).toBe('2026-11-30');
    expect(detail?.skippedHolidays.map((h) => h.date)).toEqual(['2026-11-26']);
  });

  it('skips an observed holiday that falls in the previous year, across New Year', () => {
    const detail = cureDeadlineDetail('2027-12-29', biz(2));
    expect(detail?.deadline).toBe('2028-01-03');
    expect(detail?.skippedHolidays.map((h) => h.date)).toEqual(['2027-12-31']);
  });

  it('is null when there is nothing to calculate', () => {
    expect(cureDeadline(null, biz(10))).toBeNull();
    expect(cureDeadline('2026-09-28', { kind: 'none' })).toBeNull();
    expect(cureDeadline('2026-09-28', { kind: 'unknown' })).toBeNull();
  });
});

describe('deadlineStatus', () => {
  const asOf = '2026-10-14';

  it('treats a deadline today as due, not overdue', () => {
    expect(deadlineStatus('2026-10-13', asOf)).toBe('overdue');
    expect(deadlineStatus('2026-10-14', asOf)).toBe('due_this_week');
  });

  it('uses a rolling window of DUE_SOON_DAYS', () => {
    expect(DUE_SOON_DAYS).toBe(7);
    expect(deadlineStatus('2026-10-21', asOf)).toBe('due_this_week');
    expect(deadlineStatus('2026-10-22', asOf)).toBe('upcoming');
  });

  it('is none without a deadline', () => {
    expect(deadlineStatus(null, asOf)).toBe('none');
  });
});

describe('caseDeadline', () => {
  const asOf = '2026-10-14';

  it('flags a live notice by how late it is', () => {
    expect(caseDeadline(makeCase(), asOf)).toEqual({
      deadline: '2026-10-13',
      status: 'overdue',
      daysUntil: -1,
    });
    const soon = caseDeadline(makeCase({ dateSent: '2026-10-09', curePeriod: cal(10) }), asOf);
    expect(soon).toMatchObject({ deadline: '2026-10-19', status: 'due_this_week', daysUntil: 5 });
  });

  it('reports a missing deadline when the cure period is unreadable or has no send date', () => {
    expect(caseDeadline(makeCase({ curePeriod: { kind: 'unknown' } }), asOf).status).toBe(
      'missing',
    );
    expect(caseDeadline(makeCase({ dateSent: null }), asOf)).toEqual({
      deadline: null,
      status: 'missing',
      daysUntil: null,
    });
  });

  it('has no status for a notice with no cure date', () => {
    expect(caseDeadline(makeCase({ curePeriod: { kind: 'none' } }), asOf).status).toBe('none');
  });

  it('shows the deadline as history, with no flag, once the case is past Notice to Cure', () => {
    for (const stage of ['non_compliant', 'default', 'collections', 'cured', 'closed'] as const) {
      expect(caseDeadline(makeCase({ stage }), asOf).status).toBe('none');
    }
    expect(caseDeadline(makeCase({ stage: 'default' }), asOf).deadline).toBe('2026-10-13');
  });
});
