import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Seed } from '@/domain/schemas';
import type { CaseEvent, Notification } from '@/domain/types';
import { readSeedDir } from '@/lib/seed';
import { makeCase, makeEvent } from '@/test/factories';
import { EventSourcedStore } from './case-store';
import { hashString } from './hash';
import { LocalStoragePersistence, MemoryPersistence, STORAGE_KEY } from './persistence';

let seed: Seed;
beforeAll(async () => {
  seed = await readSeedDir(path.join(process.cwd(), 'data', 'seed', 'fixture'));
});

const toDefault = (caseId: string, id = 'E-test-1'): CaseEvent =>
  makeEvent({
    id,
    caseId,
    at: '2026-10-20T10:00:00.000Z',
    type: 'stage_changed',
    payload: { from: 'notice_to_cure', to: 'default' },
  });

const notification = (over: Partial<Notification> = {}): Notification => ({
  id: 'NT-1',
  caseId: 'N-001',
  trigger: 'manual',
  dedupeKey: 'NT-1',
  recipientPersonaId: null,
  recipientLabel: 'Legal',
  subject: 'Subject',
  body: 'Body',
  source: 'manual',
  status: 'draft',
  createdAt: '2026-10-20T10:00:00.000Z',
  ...over,
});

const newStore = (persistence = new MemoryPersistence()) => ({
  persistence,
  store: new EventSourcedStore(seed, persistence),
});

describe('reads', () => {
  it('starts as the seed, with cases and their imported history', () => {
    const { store } = newStore();
    expect(store.getCases()).toHaveLength(seed.cases.length);
    expect(store.getCase('N-001')?.stage).toBe('notice_to_cure');
    expect(store.getCase('nope')).toBeUndefined();
    expect(store.getEvents('N-001').map((e) => e.id)).toEqual(['EV-N-001-1', 'EV-N-001-2']);
    expect(store.getEvents('N-002')).toEqual([]);
    expect(store.getSeed()).toBe(seed);
    expect(store.getNotifications()).toEqual([]);
  });
});

describe('append', () => {
  it('replays a stage change and keeps the seed untouched', () => {
    const { store } = newStore();
    store.append(toDefault('N-001'));
    expect(store.getCase('N-001')?.stage).toBe('default');
    expect(seed.cases.find((c) => c.id === 'N-001')?.stage).toBe('notice_to_cure');
    expect(store.getEvents('N-001').at(-1)?.id).toBe('E-test-1');
  });

  it('changes the owner', () => {
    const { store } = newStore();
    store.append(
      makeEvent({
        id: 'E-test-2',
        caseId: 'N-001',
        at: '2026-10-20T10:00:00.000Z',
        type: 'owner_changed',
        payload: { from: 'legal', to: 'asset_management' },
      }),
    );
    expect(store.getCase('N-001')?.owner).toBe('asset_management');
  });

  it.each([
    ['an illegal transition', () => toDefault('N-005')],
    ['an event for an unknown case', () => toDefault('N-404')],
    ['a malformed event', () => ({ ...toDefault('N-001'), payload: {} }) as never],
  ])('rejects %s and leaves state unchanged', (_label, make) => {
    const { store, persistence } = newStore();
    const before = store.getState();
    expect(() => store.append(make())).toThrow();
    expect(store.getState()).toBe(before);
    expect(persistence.value).toBeNull();
  });

  it('rejects a repeated event id', () => {
    const { store } = newStore();
    store.append(makeEvent({ id: 'E-dup', caseId: 'N-001' }));
    expect(() => store.append(makeEvent({ id: 'E-dup', caseId: 'N-001' }))).toThrow(/Duplicate/);
  });

  it('rejects a history that would no longer replay when an earlier event is inserted', () => {
    const { store } = newStore();
    store.append(toDefault('N-001'));
    const earlier = { ...toDefault('N-001', 'E-test-early'), at: '2026-01-01T00:00:00.000Z' };
    expect(() => store.append(earlier)).toThrow();
    expect(store.getCase('N-001')?.stage).toBe('default');
  });
});

describe('openCase', () => {
  const opened = () =>
    makeCase({ id: 'N-900', leaseId: 'L-006', propertyId: 'P-03', stage: 'non_compliant' });
  const openedEvent = (over: Record<string, unknown> = {}) =>
    makeEvent({ id: 'E-open', caseId: 'N-900', type: 'case_opened', ...over });

  it('adds the case and logs how it was opened', () => {
    const { store } = newStore();
    store.openCase(opened(), openedEvent());
    expect(store.getCase('N-900')?.stage).toBe('non_compliant');
    expect(store.getEvents('N-900').map((e) => e.type)).toEqual(['case_opened']);
  });

  it('refuses the wrong event, an invalid case, and a duplicate id', () => {
    const { store } = newStore();
    expect(() => store.openCase(opened(), openedEvent({ type: 'note' }))).toThrow(/case_opened/);
    expect(() => store.openCase(opened(), openedEvent({ caseId: 'N-901' }))).toThrow(/case_opened/);
    expect(() => store.openCase({ ...opened(), stage: 'x' } as never, openedEvent())).toThrow();
    expect(() =>
      store.openCase(makeCase({ id: 'N-001', leaseId: 'L-001' }), openedEvent({ caseId: 'N-001' })),
    ).toThrow(/Duplicate case/);
    expect(store.getCases()).toHaveLength(seed.cases.length);
  });
});

describe('notifications', () => {
  it('adds, then replaces by id', () => {
    const { store } = newStore();
    store.upsertNotification(notification());
    store.upsertNotification(notification({ status: 'sent', sentAt: '2026-10-21T10:00:00.000Z' }));
    store.upsertNotification(notification({ id: 'NT-2', dedupeKey: 'NT-2' }));
    expect(store.getNotifications().map((n) => [n.id, n.status])).toEqual([
      ['NT-1', 'sent'],
      ['NT-2', 'draft'],
    ]);
  });

  it('rejects an invalid notification', () => {
    const { store } = newStore();
    expect(() => store.upsertNotification({ ...notification(), status: 'x' } as never)).toThrow();
  });
});

describe('persistence', () => {
  it('survives a reload: a fresh store with the same storage sees the same state', () => {
    const { store, persistence } = newStore();
    store.hydrate();
    store.append(toDefault('N-001'));
    store.upsertNotification(notification());

    const reloaded = new EventSourcedStore(seed, persistence);
    expect(reloaded.getCase('N-001')?.stage).toBe('notice_to_cure');
    reloaded.hydrate();
    expect(reloaded.getCase('N-001')?.stage).toBe('default');
    expect(reloaded.getNotifications()).toHaveLength(1);
    expect(reloaded.getState().hydrated).toBe(true);
  });

  it('discards a save made against a different seed', () => {
    const { store, persistence } = newStore();
    store.append(toDefault('N-001'));
    const other = { ...seed, meta: { ...seed.meta, dataAsOf: '2026-01-01' } };
    const reloaded = new EventSourcedStore(other, persistence);
    reloaded.hydrate();
    expect(reloaded.getCase('N-001')?.stage).toBe('notice_to_cure');
    expect(persistence.value).toBeNull();
  });

  it.each([
    ['garbage', 'not json at all'],
    ['wrong version', { v: 99 }],
  ])('discards a save that is %s', (_label, value) => {
    const persistence = new MemoryPersistence();
    persistence.value = value;
    const store = new EventSourcedStore(seed, persistence);
    store.hydrate();
    expect(store.getCases()).toHaveLength(seed.cases.length);
    expect(persistence.value).toBeNull();
  });

  it('discards a save whose history no longer replays', () => {
    const { store, persistence } = newStore();
    store.append(toDefault('N-001'));
    const saved = structuredClone(persistence.value) as { events: CaseEvent[] };
    saved.events[0] = toDefault('N-005');
    persistence.value = saved;
    const reloaded = new EventSourcedStore(seed, persistence);
    reloaded.hydrate();
    expect(reloaded.getCase('N-001')?.stage).toBe('notice_to_cure');
    expect(persistence.value).toBeNull();
  });

  it('hydrates only once', () => {
    const { store, persistence } = newStore();
    store.hydrate();
    store.append(toDefault('N-001'));
    const load = vi.spyOn(persistence, 'load');
    store.hydrate();
    expect(load).not.toHaveBeenCalled();
  });

  it('reset restores the seed and clears saved state', () => {
    const { store, persistence } = newStore();
    store.append(toDefault('N-001'));
    store.upsertNotification(notification());
    store.reset();
    expect(store.getCase('N-001')?.stage).toBe('notice_to_cure');
    expect(store.getNotifications()).toEqual([]);
    expect(persistence.value).toBeNull();
  });
});

describe('subscribe', () => {
  it('notifies on change, gives a new snapshot, and stops after unsubscribe', () => {
    const { store } = newStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getState();
    store.append(toDefault('N-001'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).not.toBe(before);
    expect(store.getState()).toBe(store.getState());
    store.reset();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('LocalStoragePersistence', () => {
  const fakeStorage = () => {
    const data = new Map<string, string>();
    return {
      data,
      api: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    };
  };

  it('round-trips through storage', () => {
    const { data, api } = fakeStorage();
    const persistence = new LocalStoragePersistence(() => api);
    const store = new EventSourcedStore(seed, persistence);
    store.append(toDefault('N-001'));
    expect(data.has(STORAGE_KEY)).toBe(true);
    const reloaded = new EventSourcedStore(seed, new LocalStoragePersistence(() => api));
    reloaded.hydrate();
    expect(reloaded.getCase('N-001')?.stage).toBe('default');
    persistence.clear();
    expect(data.has(STORAGE_KEY)).toBe(false);
  });

  it('returns null for empty or corrupt storage', () => {
    const { data, api } = fakeStorage();
    const persistence = new LocalStoragePersistence(() => api);
    expect(persistence.load()).toBeNull();
    data.set(STORAGE_KEY, '{not json');
    expect(persistence.load()).toBeNull();
  });

  it('keeps working when storage is unavailable or throws', () => {
    const none = new LocalStoragePersistence(() => undefined);
    expect(none.load()).toBeNull();
    const boom = () => {
      throw new Error('blocked');
    };
    const blocked = new LocalStoragePersistence(() => ({
      getItem: boom,
      setItem: boom,
      removeItem: boom,
    }));
    expect(blocked.load()).toBeNull();
    expect(() =>
      blocked.save({ v: 1, seedHash: 'x', events: [], openedCases: [], notifications: [] }),
    ).not.toThrow();
    expect(() => blocked.clear()).not.toThrow();
    expect(() => none.clear()).not.toThrow();
    expect(() =>
      none.save({ v: 1, seedHash: 'x', events: [], openedCases: [], notifications: [] }),
    ).not.toThrow();
  });

  it('has no storage on the server', () => {
    expect(new LocalStoragePersistence().load()).toBeNull();
  });
});

describe('hashString', () => {
  it('is stable and sensitive to change', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('')).toHaveLength(8);
  });
});
