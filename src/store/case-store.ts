import { compareEvents, replayCase } from '@/domain/stage';
import { CaseEventSchema, CaseSchema, NotificationSchema, type Seed } from '@/domain/schemas';
import type { Case, CaseEvent, Notification } from '@/domain/types';
import { hashString } from './hash';
import { PERSISTED_VERSION, PersistedSchema, type Persistence } from './persistence';

/** Immutable. A new object is created on every change, so it works as a React snapshot. */
export interface StoreState {
  cases: Case[];
  eventsByCase: ReadonlyMap<string, CaseEvent[]>;
  notifications: Notification[];
  /** True once saved state has been read from the browser. */
  hydrated: boolean;
}

export interface CaseStore {
  getSeed(): Seed;
  getState(): StoreState;
  getCases(): Case[];
  getCase(id: string): Case | undefined;
  /** Oldest first. */
  getEvents(caseId: string): CaseEvent[];
  /** Throws if the event doesn't fit the case; state is unchanged when it does. */
  append(event: CaseEvent): void;
  /** Creates a case through the log: the case plus its `case_opened` event, together. */
  openCase(newCase: Case, event: CaseEvent): void;
  getNotifications(): Notification[];
  upsertNotification(notification: Notification): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

/**
 * Current state is the seed with appended events replayed over it. The seed is never mutated;
 * only the appended events, newly opened cases and notifications are saved.
 */
export class EventSourcedStore implements CaseStore {
  readonly seedHash: string;
  private appended: CaseEvent[] = [];
  private opened: Case[] = [];
  private notifications: Notification[] = [];
  private hydrated = false;
  private state: StoreState;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly seed: Seed,
    private readonly persistence: Persistence,
  ) {
    this.seedHash = hashString(JSON.stringify(seed));
    this.state = this.compute();
  }

  /** Loads saved state. Anything stale or invalid is discarded rather than trusted. */
  hydrate(): void {
    if (this.hydrated) return;
    const saved = PersistedSchema.safeParse(this.persistence.load());
    if (saved.success && saved.data.seedHash === this.seedHash) {
      this.appended = saved.data.events;
      this.opened = saved.data.openedCases;
      this.notifications = saved.data.notifications;
      try {
        this.state = this.compute();
      } catch {
        this.appended = [];
        this.opened = [];
        this.notifications = [];
        this.persistence.clear();
        this.state = this.compute();
      }
    } else {
      this.persistence.clear();
    }
    this.hydrated = true;
    this.state = this.compute();
    this.emit();
  }

  getSeed(): Seed {
    return this.seed;
  }

  getState(): StoreState {
    return this.state;
  }

  getCases(): Case[] {
    return this.state.cases;
  }

  getCase(id: string): Case | undefined {
    return this.state.cases.find((c) => c.id === id);
  }

  getEvents(caseId: string): CaseEvent[] {
    return this.state.eventsByCase.get(caseId) ?? [];
  }

  getNotifications(): Notification[] {
    return this.state.notifications;
  }

  append(event: CaseEvent): void {
    const valid = CaseEventSchema.parse(event);
    this.commit({ appended: [...this.appended, valid] });
  }

  openCase(newCase: Case, event: CaseEvent): void {
    const validCase = CaseSchema.parse(newCase);
    const validEvent = CaseEventSchema.parse(event);
    if (validEvent.type !== 'case_opened' || validEvent.caseId !== validCase.id) {
      throw new Error(`Opening ${validCase.id} needs a case_opened event for that case`);
    }
    this.commit({ opened: [...this.opened, validCase], appended: [...this.appended, validEvent] });
  }

  upsertNotification(notification: Notification): void {
    const valid = NotificationSchema.parse(notification);
    const exists = this.notifications.some((n) => n.id === valid.id);
    const notifications = exists
      ? this.notifications.map((n) => (n.id === valid.id ? valid : n))
      : [...this.notifications, valid];
    this.commit({ notifications });
  }

  reset(): void {
    this.appended = [];
    this.opened = [];
    this.notifications = [];
    this.persistence.clear();
    this.state = this.compute();
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Applies a change only if the resulting history replays cleanly. */
  private commit(change: {
    appended?: CaseEvent[];
    opened?: Case[];
    notifications?: Notification[];
  }): void {
    const previous = { a: this.appended, o: this.opened, n: this.notifications };
    this.appended = change.appended ?? this.appended;
    this.opened = change.opened ?? this.opened;
    this.notifications = change.notifications ?? this.notifications;
    try {
      this.state = this.compute();
    } catch (error) {
      this.appended = previous.a;
      this.opened = previous.o;
      this.notifications = previous.n;
      throw error;
    }
    this.persistence.save({
      v: PERSISTED_VERSION,
      seedHash: this.seedHash,
      events: this.appended,
      openedCases: this.opened,
      notifications: this.notifications,
    });
    this.emit();
  }

  private compute(): StoreState {
    const baseCases = [...this.seed.cases, ...this.opened];
    const known = new Set(baseCases.map((c) => c.id));
    if (known.size !== baseCases.length) throw new Error('Duplicate case id');

    const events = [...this.seed.events, ...this.appended].sort(compareEvents);
    const ids = new Set<string>();
    const eventsByCase = new Map<string, CaseEvent[]>();
    for (const event of events) {
      if (ids.has(event.id)) throw new Error(`Duplicate event id ${event.id}`);
      ids.add(event.id);
      if (!known.has(event.caseId)) throw new Error(`Event ${event.id} is for an unknown case`);
      eventsByCase.set(event.caseId, [...(eventsByCase.get(event.caseId) ?? []), event]);
    }
    const cases = baseCases.map((c) => replayCase(c, eventsByCase.get(c.id) ?? []));
    return { cases, eventsByCase, notifications: this.notifications, hydrated: this.hydrated };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
