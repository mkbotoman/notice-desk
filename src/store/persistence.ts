import { z } from 'zod';
import { CaseEventSchema, CaseSchema, NotificationSchema } from '@/domain/schemas';

/** Bump when the persisted shape changes; older saves are then discarded. */
export const PERSISTED_VERSION = 1;

export const PersistedSchema = z.strictObject({
  v: z.literal(PERSISTED_VERSION),
  seedHash: z.string(),
  events: z.array(CaseEventSchema),
  openedCases: z.array(CaseSchema),
  notifications: z.array(NotificationSchema),
});
export type Persisted = z.infer<typeof PersistedSchema>;

export interface Persistence {
  /** Raw saved value, or null. Validation happens in the store. */
  load(): unknown;
  save(value: Persisted): void;
  clear(): void;
}

export const STORAGE_KEY = 'notice-desk:state';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Browser storage can be missing, full or blocked; none of that may break the app. */
export class LocalStoragePersistence implements Persistence {
  constructor(private readonly getStorage: () => StorageLike | undefined = defaultStorage) {}

  load(): unknown {
    try {
      const raw = this.getStorage()?.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  save(value: Persisted): void {
    try {
      this.getStorage()?.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Out of space or blocked: the session still works, it just won't survive a refresh.
    }
  }

  clear(): void {
    try {
      this.getStorage()?.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear if storage is unavailable.
    }
  }
}

function defaultStorage(): StorageLike | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

export class MemoryPersistence implements Persistence {
  value: unknown = null;
  load(): unknown {
    return this.value;
  }
  save(value: Persisted): void {
    this.value = structuredClone(value);
  }
  clear(): void {
    this.value = null;
  }
}
