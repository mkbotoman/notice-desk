import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Persona } from '@/domain/types';
import { readSeedDir } from '@/lib/seed';
import { buildPersonas } from './personas';
import { ASOF_KEY, PERSONA_KEY, PrefsStore } from './prefs';

const DATA_DATE = '2026-10-13';
let personas: Persona[];
beforeAll(async () => {
  const seed = await readSeedDir(path.join(process.cwd(), 'data', 'seed', 'fixture'));
  personas = buildPersonas(seed);
});

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    api: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  };
}

const make = (saved: Record<string, string> = {}, search = '') => {
  const { data, api } = fakeStorage(saved);
  const store = new PrefsStore(
    personas,
    DATA_DATE,
    () => api,
    () => search,
  );
  return { store, data };
};

describe('PrefsStore defaults', () => {
  it('starts as Maya on the data date', () => {
    const { store } = make();
    expect(store.getSnapshot()).toEqual({ personaId: 'maya', asOf: DATA_DATE });
    expect(store.getServerSnapshot()).toEqual({ personaId: 'maya', asOf: DATA_DATE });
  });

  it('returns the same snapshot object until something changes', () => {
    const { store } = make();
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});

describe('saved choices', () => {
  it('restores a saved persona and asOf', () => {
    const { store } = make({
      [PERSONA_KEY]: 'am-lena-park',
      [ASOF_KEY]: JSON.stringify({ asOf: '2026-10-30', base: DATA_DATE }),
    });
    expect(store.getSnapshot()).toEqual({ personaId: 'am-lena-park', asOf: '2026-10-30' });
  });

  it('ignores a saved persona that no longer exists, and an asOf saved against another data date', () => {
    const { store } = make({
      [PERSONA_KEY]: 'someone-who-left',
      [ASOF_KEY]: JSON.stringify({ asOf: '2026-10-30', base: '2026-01-01' }),
    });
    expect(store.getSnapshot()).toEqual({ personaId: 'maya', asOf: DATA_DATE });
  });

  it('ignores corrupt saved asOf', () => {
    expect(make({ [ASOF_KEY]: '{nope' }).store.getSnapshot().asOf).toBe(DATA_DATE);
    expect(make({ [ASOF_KEY]: JSON.stringify({ base: DATA_DATE }) }).store.getSnapshot().asOf).toBe(
      DATA_DATE,
    );
  });

  it('copes with storage that is missing or throws', () => {
    const none = new PrefsStore(
      personas,
      DATA_DATE,
      () => undefined,
      () => '',
    );
    expect(none.getSnapshot().personaId).toBe('maya');
    none.setPersona('founder');
    expect(none.getSnapshot().personaId).toBe('founder');

    const boom = () => {
      throw new Error('blocked');
    };
    const blocked = new PrefsStore(
      personas,
      DATA_DATE,
      () => ({ getItem: boom, setItem: boom, removeItem: boom }),
      () => '',
    );
    expect(blocked.getSnapshot()).toEqual({ personaId: 'maya', asOf: DATA_DATE });
    blocked.setPersona('founder');
    expect(blocked.getSnapshot().personaId).toBe('founder');
  });
});

describe('deep links', () => {
  it('applies ?as= and ?asOf= before the first read, and saves them', () => {
    const { store, data } = make({}, '?as=founder&asOf=2026-11-02');
    expect(store.getSnapshot()).toEqual({ personaId: 'founder', asOf: '2026-11-02' });
    expect(data.get(PERSONA_KEY)).toBe('founder');
    expect(JSON.parse(data.get(ASOF_KEY)!)).toEqual({ asOf: '2026-11-02', base: DATA_DATE });
  });

  it('lets the URL win over a saved choice', () => {
    const { store } = make({ [PERSONA_KEY]: 'am-lena-park' }, '?as=pm-priya-shah');
    expect(store.getSnapshot().personaId).toBe('pm-priya-shah');
  });

  it('ignores an unknown persona or an invalid date in the URL', () => {
    const { store } = make({ [PERSONA_KEY]: 'founder' }, '?as=nobody&asOf=2026-02-30');
    expect(store.getSnapshot()).toEqual({ personaId: 'founder', asOf: DATA_DATE });
  });

  it('applies a later link click through applyParams', () => {
    const { store } = make();
    store.applyParams('am-omar-reyes', null);
    expect(store.getSnapshot().personaId).toBe('am-omar-reyes');
    store.applyParams(null, '2026-12-01');
    expect(store.getSnapshot()).toEqual({ personaId: 'am-omar-reyes', asOf: '2026-12-01' });
  });
});

describe('changes', () => {
  it('sets and persists the persona, ignoring unknown ids', () => {
    const { store, data } = make();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setPersona('am-lena-park');
    store.setPersona('nobody');
    store.setPersona('am-lena-park');
    expect(store.getSnapshot().personaId).toBe('am-lena-park');
    expect(data.get(PERSONA_KEY)).toBe('am-lena-park');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setPersona('founder');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sets asOf, and clears the saved value when it returns to the data date', () => {
    const { store, data } = make();
    store.setAsOf('2026-10-30');
    expect(store.getSnapshot().asOf).toBe('2026-10-30');
    expect(data.has(ASOF_KEY)).toBe(true);
    store.setAsOf(null);
    expect(store.getSnapshot().asOf).toBe(DATA_DATE);
    expect(data.has(ASOF_KEY)).toBe(false);
    store.setAsOf('not a date');
    expect(store.getSnapshot().asOf).toBe(DATA_DATE);
  });

  it('can change before anything has read it', () => {
    const { store } = make({}, '');
    store.setPersona('founder');
    expect(store.getSnapshot().personaId).toBe('founder');
  });
});
