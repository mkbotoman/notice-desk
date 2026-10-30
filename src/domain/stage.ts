import type { Case, CaseEvent, Stage, Team } from './types';

const TRANSITIONS: Record<Stage, readonly Stage[]> = {
  non_compliant: ['notice_to_cure'],
  notice_to_cure: ['cured', 'default'],
  default: ['collections', 'closed'],
  collections: ['closed'],
  cured: [],
  closed: [],
};

export function allowedTransitions(stage: Stage): readonly Stage[] {
  return TRANSITIONS[stage];
}

export function isTerminal(stage: Stage): boolean {
  return TRANSITIONS[stage].length === 0;
}

export class IllegalEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalEventError';
  }
}

/** Whose court the case is in. Finished cases are with nobody. */
export function waitingOn(c: Case): Team | null {
  return isTerminal(c.stage) ? null : c.owner;
}

/** Returns the case after one event, or throws if the event doesn't fit the case's state. */
export function applyEvent(c: Case, event: CaseEvent): Case {
  if (event.caseId !== c.id) {
    throw new IllegalEventError(`Event ${event.id} belongs to ${event.caseId}, not ${c.id}`);
  }
  switch (event.type) {
    case 'stage_changed': {
      const { from, to } = event.payload;
      if (from !== c.stage) {
        throw new IllegalEventError(`Case ${c.id} is ${c.stage}, not ${from}`);
      }
      if (!TRANSITIONS[from].includes(to)) {
        throw new IllegalEventError(`Case ${c.id} cannot move from ${from} to ${to}`);
      }
      return { ...c, stage: to };
    }
    case 'owner_changed': {
      const { from, to } = event.payload;
      if (isTerminal(c.stage)) {
        throw new IllegalEventError(`Case ${c.id} is ${c.stage}; its owner can't change`);
      }
      if (from !== c.owner) {
        throw new IllegalEventError(`Case ${c.id} is owned by ${c.owner}, not ${from}`);
      }
      if (to === from) {
        throw new IllegalEventError(`Case ${c.id} is already owned by ${to}`);
      }
      return { ...c, owner: to };
    }
    default:
      return c;
  }
}

/** Current state = the base case with its events applied in order. */
export function replayCase(base: Case, events: readonly CaseEvent[]): Case {
  return events.reduce(applyEvent, base);
}

export function compareEvents(a: CaseEvent, b: CaseEvent): number {
  return a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
}
