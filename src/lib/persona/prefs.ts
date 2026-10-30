import type { Persona, ISODate } from '@/domain/types';
import { resolveAsOf } from './asof';
import { LEGAL_PERSONA_ID, resolvePersonaId } from './personas';

export const PERSONA_KEY = 'notice-desk:persona';
export const ASOF_KEY = 'notice-desk:asof';

export interface Prefs {
  personaId: string;
  asOf: ISODate;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Who is viewing, and as of when. Lives outside React so it can be read synchronously on the
 * client's first render: a deep link or a saved choice never flashes the default persona.
 * Server and hydration render use the defaults; the client snapshot is loaded lazily.
 */
export class PrefsStore {
  private snapshot: Prefs;
  private loaded = false;
  private readonly listeners = new Set<() => void>();
  private readonly defaults: Prefs;

  constructor(
    private readonly personas: readonly Persona[],
    readonly defaultAsOf: ISODate,
    private readonly getStorage: () => StorageLike | undefined,
    private readonly getSearch: () => string,
  ) {
    this.defaults = { personaId: LEGAL_PERSONA_ID, asOf: defaultAsOf };
    this.snapshot = this.defaults;
  }

  getServerSnapshot = (): Prefs => this.defaults;

  getSnapshot = (): Prefs => {
    if (!this.loaded) this.load();
    return this.snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setPersona(personaId: string): void {
    if (!this.personas.some((p) => p.id === personaId)) return;
    this.update({ ...this.current(), personaId });
  }

  /** Pass null to go back to the data date. */
  setAsOf(asOf: ISODate | null): void {
    this.update({ ...this.current(), asOf: resolveAsOf(this.defaultAsOf, asOf) });
  }

  /** Applies ?as= and ?asOf= from a URL. Invalid values are ignored. */
  applyParams(as: string | null, asOf: string | null): void {
    const current = this.current();
    this.update({
      personaId: resolvePersonaId(this.personas, as, current.personaId),
      asOf: resolveAsOf(current.asOf, asOf),
    });
  }

  private current(): Prefs {
    return this.getSnapshot();
  }

  private load(): void {
    this.loaded = true;
    const storage = this.getStorage();
    const savedPersona = read(storage, PERSONA_KEY);
    const savedAsOf = readAsOf(storage, this.defaultAsOf);
    this.snapshot = {
      personaId: resolvePersonaId(this.personas, savedPersona),
      asOf: resolveAsOf(this.defaultAsOf, savedAsOf),
    };
    const params = new URLSearchParams(this.getSearch());
    const as = params.get('as');
    const asOf = params.get('asOf');
    if (as || asOf) this.applyParams(as, asOf);
  }

  private update(next: Prefs): void {
    const previous = this.snapshot;
    if (previous.personaId === next.personaId && previous.asOf === next.asOf) return;
    this.loaded = true;
    this.snapshot = next;
    this.persist(next);
    for (const listener of this.listeners) listener();
  }

  private persist(prefs: Prefs): void {
    const storage = this.getStorage();
    try {
      storage?.setItem(PERSONA_KEY, prefs.personaId);
      if (prefs.asOf === this.defaultAsOf) storage?.removeItem(ASOF_KEY);
      else storage?.setItem(ASOF_KEY, JSON.stringify({ asOf: prefs.asOf, base: this.defaultAsOf }));
    } catch {
      // Storage blocked or full: the choice still applies for this session.
    }
  }
}

function read(storage: StorageLike | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** A saved asOf only counts if it was saved against the same data date. */
function readAsOf(storage: StorageLike | undefined, defaultAsOf: ISODate): string | null {
  try {
    const parsed = JSON.parse(read(storage, ASOF_KEY) ?? 'null') as {
      asOf?: string;
      base?: string;
    } | null;
    return parsed?.base === defaultAsOf ? (parsed.asOf ?? null) : null;
  } catch {
    return null;
  }
}
