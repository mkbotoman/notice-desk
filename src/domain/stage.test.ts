import { describe, expect, it } from 'vitest';
import { makeCase, makeEvent } from '@/test/factories';
import { STAGES, type Stage } from './types';
import {
  allowedTransitions,
  applyEvent,
  compareEvents,
  IllegalEventError,
  isTerminal,
  replayCase,
  waitingOn,
} from './stage';

const stageChange = (from: Stage, to: Stage) =>
  makeEvent({ type: 'stage_changed', payload: { from, to } });
const ownerChange = (from: string, to: string) =>
  makeEvent({ type: 'owner_changed', payload: { from, to } });

describe('stage machine', () => {
  it('allows exactly the transitions in the brief', () => {
    expect(allowedTransitions('non_compliant')).toEqual(['notice_to_cure']);
    expect(allowedTransitions('notice_to_cure')).toEqual(['cured', 'default']);
    expect(allowedTransitions('default')).toEqual(['collections', 'closed']);
    expect(allowedTransitions('collections')).toEqual(['closed']);
    expect(allowedTransitions('cured')).toEqual([]);
    expect(allowedTransitions('closed')).toEqual([]);
  });

  it('knows which stages are terminal', () => {
    expect(STAGES.filter(isTerminal)).toEqual(['cured', 'closed']);
  });

  it('applies every legal transition', () => {
    for (const from of STAGES) {
      for (const to of allowedTransitions(from)) {
        const next = applyEvent(makeCase({ stage: from }), stageChange(from, to));
        expect(next.stage).toBe(to);
      }
    }
  });

  it('rejects every illegal transition', () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        if (allowedTransitions(from).includes(to)) continue;
        expect(() => applyEvent(makeCase({ stage: from }), stageChange(from, to))).toThrow(
          IllegalEventError,
        );
      }
    }
  });

  it('rejects a stage change recorded against a different current stage', () => {
    expect(() =>
      applyEvent(makeCase({ stage: 'default' }), stageChange('notice_to_cure', 'cured')),
    ).toThrow(/is default, not notice_to_cure/);
  });
});

describe('owner changes', () => {
  it('moves the case to the other team', () => {
    expect(applyEvent(makeCase(), ownerChange('legal', 'asset_management')).owner).toBe(
      'asset_management',
    );
  });

  it('rejects a stale from, a no-op, and any change on a finished case', () => {
    expect(() => applyEvent(makeCase(), ownerChange('asset_management', 'legal'))).toThrow(
      /owned by legal/,
    );
    expect(() => applyEvent(makeCase(), ownerChange('legal', 'legal'))).toThrow(/already owned/);
    expect(() =>
      applyEvent(makeCase({ stage: 'closed' }), ownerChange('legal', 'asset_management')),
    ).toThrow(/can't change/);
  });
});

describe('applyEvent', () => {
  it('leaves the case unchanged for notes and other bookkeeping events', () => {
    const c = makeCase();
    expect(applyEvent(c, makeEvent())).toBe(c);
    expect(applyEvent(c, makeEvent({ type: 'case_opened' }))).toBe(c);
  });

  it('rejects an event for another case', () => {
    expect(() => applyEvent(makeCase(), makeEvent({ caseId: 'N-2' }))).toThrow(/belongs to N-2/);
  });

  it('does not mutate the case it was given', () => {
    const c = makeCase();
    applyEvent(c, stageChange('notice_to_cure', 'default'));
    expect(c.stage).toBe('notice_to_cure');
  });
});

describe('replayCase and ordering', () => {
  it('applies events in order', () => {
    const events = [stageChange('notice_to_cure', 'default'), stageChange('default', 'closed')];
    expect(replayCase(makeCase(), events).stage).toBe('closed');
  });

  it('fails when the history is out of order', () => {
    const events = [stageChange('default', 'closed'), stageChange('notice_to_cure', 'default')];
    expect(() => replayCase(makeCase(), events)).toThrow(IllegalEventError);
  });

  it('sorts by time, then by id', () => {
    const early = makeEvent({ id: 'E-b', at: '2026-10-14T08:00:00.000Z' });
    const lateA = makeEvent({ id: 'E-a', at: '2026-10-14T09:00:00.000Z' });
    const lateB = makeEvent({ id: 'E-b', at: '2026-10-14T09:00:00.000Z' });
    expect([lateB, lateA, early].sort(compareEvents).map((e) => e.id + e.at.slice(11, 13))).toEqual(
      ['E-b08', 'E-a09', 'E-b09'],
    );
  });
});

describe('waitingOn', () => {
  it('names the owner of an open case and nobody for a finished one', () => {
    expect(waitingOn(makeCase({ owner: 'asset_management' }))).toBe('asset_management');
    expect(waitingOn(makeCase({ owner: 'legal' }))).toBe('legal');
    expect(waitingOn(makeCase({ stage: 'cured' }))).toBeNull();
  });
});
