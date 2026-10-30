import type { CaseDeadlineStatus } from '@/domain/deadline';
import type { Cents, ISODate, IssueType, Stage, Team } from '@/domain/types';

/**
 * The weekly summary as data. It is serialisable (strings, numbers, booleans, arrays, plain
 * objects) and is the only input M4's narrative step may use: every figure a narrative can quote
 * is a field here, and nothing outside it. It deliberately holds no guarantor names, no
 * free-text case notes, no SSNs and no contact details: tenant, property, suite, stage, issue
 * type, dates, deadlines, amounts, and the owner team or person.
 */
export interface WeekSummary {
  /** The as-of date; the last day of the window. */
  asOf: ISODate;
  /** First day of the window (asOf minus 6 days). Both ends are inclusive. */
  weekStart: ISODate;
  /** "Notice Desk weekly summary, week ending Tue, Oct 13". */
  subject: string;
  /** Label of the persona the summary was built for. */
  viewer: string;
  /** `portfolio` for Legal and the Founder, `own_properties` for an asset manager. */
  scope: 'portfolio' | 'own_properties';
  counts: SummaryCounts;
  /** Cases sent in the window, or opened in the app in the window. Oldest first. */
  newCases: NewCase[];
  /** Every stage change recorded in the window. Oldest first. Often empty. */
  stageChanges: StageChange[];
  /** The stage changes that ended in Cured or Closed. */
  curedOrClosed: StageChange[];
  /** Open Notice to Cure cases past their cure date at the as-of date, most urgent first. */
  overdue: SummaryCase[];
  /** Open cases whose cure date is today or within the next 7 days, soonest first. */
  dueSoon: SummaryCase[];
  /** Open cases with asset management, grouped by the property's asset manager. */
  waitingOnAssetManagement: AssetManagerGroup[];
  /** Open cases with Legal, most urgent first. */
  waitingOnLegal: SummaryCase[];
  money: MoneyLine;
}

export interface SummaryCounts {
  /** Cases the viewer can see, open or finished. 0 means there is nothing to report. */
  inScope: number;
  open: number;
  overdue: number;
  dueSoon: number;
  waitingOnLegal: number;
  waitingOnAssetManagement: number;
  newCases: number;
  stageChanges: number;
  curedOrClosed: number;
}

/** One case, reduced to the facts a summary may state. */
export interface SummaryCase {
  caseId: string;
  tenant: string;
  /** Null when the notice could not be matched to a property. */
  property: string | null;
  suite: string | null;
  /** The case's stage now. */
  stage: Stage;
  issueType: IssueType;
  owner: Team;
  /** "Legal", the asset manager's name, or "Asset management" when no one is on file. */
  ownerName: string;
  /** The cure date; null unless the case is in Notice to Cure with a readable deadline. */
  deadline: ISODate | null;
  /** Days from the as-of date to the deadline; negative when overdue. */
  daysUntilDeadline: number | null;
  deadlineStatus: CaseDeadlineStatus;
  /** The lease's live balance in cents; null when unknown. */
  arCents: Cents | null;
}

export interface NewCase extends SummaryCase {
  /** The date the notice was sent, or the day the case was opened in the app. */
  date: ISODate;
}

export interface StageChange extends SummaryCase {
  /** The effective date of the change. */
  date: ISODate;
  from: Stage;
  to: Stage;
  /** Display name of who recorded it ("Import" for imported data). */
  actor: string;
}

export interface AssetManagerGroup {
  /** Null when the property has no asset manager on file. */
  person: string | null;
  cases: SummaryCase[];
  /** How many of `cases` are past their cure date. */
  overdue: number;
}

/**
 * There is no AR history in the data, so there is no "movement": only today's balance.
 * `historyAvailable` stays false until the data carries balances over time.
 */
export interface MoneyLine {
  /** Sum of live lease balances over the open cases in view; one lease counts once. */
  liveArCents: Cents;
  openCases: number;
  /** Open cases whose lease or balance is unknown; they add nothing to the total. */
  casesWithoutBalance: number;
  historyAvailable: false;
}
