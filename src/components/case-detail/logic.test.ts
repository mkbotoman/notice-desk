import { describe, expect, it } from 'vitest';
import { cureDeadlineDetail } from '@/domain/deadline';
import type { Persona } from '@/domain/types';
import { formatCents } from '@/lib/format';
import { makeCase, makeEvent } from '@/test/factories';
import {
  actorLabel,
  availableActions,
  balanceDelta,
  deadlineRule,
  describeEvent,
  newestFirst,
  ownerButtonLabel,
  stageSteps,
} from './logic';

const persona = (over: Partial<Persona>): Persona => ({
  id: 'p',
  label: 'P',
  kind: 'legal',
  personId: null,
  team: null,
  scopePropertyIds: 'all',
  ...over,
});
const maya = persona({ id: 'maya', label: 'Maya', kind: 'legal', team: 'legal' });
const founder = persona({ id: 'founder', label: 'Founder', kind: 'founder' });
const lena = persona({
  id: 'am-lena',
  label: 'Lena Brooks',
  kind: 'asset_manager',
  team: 'asset_management',
  scopePropertyIds: ['P-1'],
});
const pm = persona({
  id: 'pm-x',
  label: 'Pat',
  kind: 'property_manager',
  scopePropertyIds: ['P-1'],
});

describe('stageSteps', () => {
  it('marks earlier steps done, the current one, and later ones next', () => {
    expect(stageSteps('notice_to_cure').map((s) => s.state)).toEqual([
      'done',
      'current',
      'next',
      'next',
      'next',
    ]);
    expect(stageSteps('non_compliant')[0].state).toBe('current');
  });

  it('puts cured and closed on the last step under their own name', () => {
    const cured = stageSteps('cured');
    expect(cured.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'current']);
    expect(cured[4].label).toBe('Cured');
    expect(stageSteps('closed')[4].label).toBe('Closed');
    expect(stageSteps('collections')[4].label).toBe('Cured / Closed');
  });
});

describe('deadlineRule', () => {
  const rule = (over = {}) => {
    const c = makeCase(over);
    return deadlineRule(c, cureDeadlineDetail(c.dateSent, c.curePeriod));
  };

  it('explains N-001: business days that skip Columbus Day', () => {
    expect(rule()).toBe(
      '10 business days from Mon, Sep 28 gives Tue, Oct 13. Skips weekends and Columbus Day (Mon, Oct 12). Day 1 is the day after the notice was sent.',
    );
  });

  it('omits the holiday clause when none was skipped, and weekends for calendar days', () => {
    expect(
      rule({ dateSent: '2026-08-03', curePeriod: { kind: 'days', n: 5, unit: 'business' } }),
    ).toBe(
      '5 business days from Mon, Aug 3 gives Mon, Aug 10. Skips weekends. Day 1 is the day after the notice was sent.',
    );
    expect(rule({ curePeriod: { kind: 'days', n: 10, unit: 'calendar' } })).toBe(
      '10 calendar days from Mon, Sep 28 gives Thu, Oct 8. Day 1 is the day after the notice was sent.',
    );
  });

  it('says why there is no deadline', () => {
    expect(rule({ curePeriod: { kind: 'none' } })).toMatch(/no cure date/);
    expect(rule({ curePeriod: { kind: 'unknown' } })).toMatch(/could not be read/);
    expect(rule({ dateSent: null })).toMatch(/No send date/);
  });

  it('does not blame a missing send date when the send date is too old to count from', () => {
    const old = rule({ dateSent: '2019-12-20' });
    expect(old).toMatch(/before 2021/);
    expect(old).not.toMatch(/No send date/);
  });
});

describe('describeEvent', () => {
  it('writes sentences for stage and owner changes', () => {
    const stage = describeEvent(
      makeEvent({ type: 'stage_changed', payload: { from: 'notice_to_cure', to: 'default' } }),
    );
    expect(stage.summary).toBe('Moved from Notice to Cure to Default');
    const owner = describeEvent(
      makeEvent({ type: 'owner_changed', payload: { from: 'legal', to: 'asset_management' } }),
    );
    expect(owner.summary).toBe('Owner changed from Legal to Asset Management');
  });

  it('keeps notes as text and labels the other kinds', () => {
    const note = describeEvent(makeEvent({ note: '<b>hi</b>' }));
    expect(note).toMatchObject({ kind: 'Update', summary: null, note: '<b>hi</b>' });
    expect(describeEvent(makeEvent({ type: 'imported_note' })).kind).toBe('Imported');
    expect(describeEvent(makeEvent({ type: 'case_opened' })).summary).toBe('Case opened');
    expect(
      describeEvent(makeEvent({ type: 'notification_drafted', payload: { notificationId: 'x' } }))
        .summary,
    ).toBe('Notification drafted');
    expect(
      describeEvent(makeEvent({ type: 'notification_sent', payload: { notificationId: 'x' } }))
        .summary,
    ).toBe('Notification sent');
  });
});

describe('newestFirst', () => {
  it('orders by business date, then recorded time, then id, without mutating', () => {
    const a = makeEvent({ id: 'a', effectiveDate: '2026-10-01', at: '2026-10-20T00:00:00.000Z' });
    const b = makeEvent({ id: 'b', effectiveDate: '2026-10-05', at: '2026-10-05T00:00:00.000Z' });
    const c = makeEvent({ id: 'c', effectiveDate: '2026-10-05', at: '2026-10-05T01:00:00.000Z' });
    const d = makeEvent({ id: 'd', effectiveDate: '2026-10-05', at: '2026-10-05T01:00:00.000Z' });
    const input = [a, b, c, d];
    expect(newestFirst(input).map((e) => e.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(input.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('actorLabel', () => {
  it('maps imports and personas, and tolerates unknown ids', () => {
    expect(actorLabel('import', [maya])).toBe("Imported from Legal's sheet");
    expect(actorLabel('maya', [maya, lena])).toBe('Maya · Legal');
    expect(actorLabel('am-lena', [maya, lena])).toBe('Lena Brooks · Asset manager');
    expect(actorLabel('ghost', [maya])).toBe('Unknown person');
  });
});

describe('availableActions', () => {
  it('lets Legal advance, hand over, update, draft and see the guarantor', () => {
    const a = availableActions(maya, makeCase());
    expect(a).toEqual({
      advanceTo: ['cured', 'default'],
      ownerTo: 'asset_management',
      addUpdate: true,
      draftNotification: true,
      viewGuarantor: true,
    });
    expect(availableActions(maya, makeCase({ owner: 'asset_management' })).ownerTo).toBe('legal');
  });

  it('offers no transitions or owner change on a finished case', () => {
    const a = availableActions(maya, makeCase({ stage: 'closed' }));
    expect(a.advanceTo).toEqual([]);
    expect(a.ownerTo).toBeNull();
  });

  it('lets an asset manager hand back only her own, in-scope cases', () => {
    const mine = availableActions(lena, makeCase({ owner: 'asset_management' }));
    expect(mine).toMatchObject({ advanceTo: [], ownerTo: 'legal', addUpdate: true });
    expect(mine.draftNotification).toBe(false);
    expect(mine.viewGuarantor).toBe(false);
    expect(availableActions(lena, makeCase({ owner: 'legal' })).ownerTo).toBeNull();
    const elsewhere = availableActions(
      lena,
      makeCase({ owner: 'asset_management', propertyId: 'P-9' }),
    );
    expect(elsewhere.ownerTo).toBeNull();
    expect(elsewhere.addUpdate).toBe(false);
  });

  it('gives read-only personas nothing; the founder only sees the guarantor', () => {
    expect(availableActions(pm, makeCase())).toEqual({
      advanceTo: [],
      ownerTo: null,
      addUpdate: false,
      draftNotification: false,
      viewGuarantor: false,
    });
    expect(availableActions(founder, makeCase())).toMatchObject({
      advanceTo: [],
      addUpdate: false,
      viewGuarantor: true,
    });
  });
});

describe('ownerButtonLabel', () => {
  it('words the button by who is acting', () => {
    expect(ownerButtonLabel(maya, 'asset_management')).toBe('Hand to Asset Management');
    expect(ownerButtonLabel(maya, 'legal')).toBe('Take back to Legal');
    expect(ownerButtonLabel(lena, 'legal')).toBe('Hand back to Legal');
  });
});

describe('balanceDelta', () => {
  it('compares the live balance with the notice amount', () => {
    expect(balanceDelta(1845000, 2190000, formatCents)).toEqual({
      text: '+$3,450 since notice',
      tone: 'warning',
    });
    expect(balanceDelta(2190000, 1845000, formatCents)).toEqual({
      text: '-$3,450 since notice',
      tone: 'success',
    });
    expect(balanceDelta(100, 100, formatCents)?.tone).toBe('gray');
    expect(balanceDelta(null, 100, formatCents)).toBeNull();
    expect(balanceDelta(100, null, formatCents)).toBeNull();
  });
});
