import type {
  DataQualityAction,
  DataQualityFile,
  DataQualityIssue,
  DataQualitySeverity,
} from '@/domain/types';

export interface IssueInput {
  ruleId: string;
  severity: DataQualitySeverity;
  file: DataQualityFile;
  rowRef: string;
  field: string;
  message: string;
  action: DataQualityAction;
  before?: string;
  after?: string;
}

/** Collects issues in a stable order. Values passed as before/after must be non-sensitive. */
export class IssueLog {
  private readonly items: DataQualityIssue[] = [];

  add(issue: IssueInput): void {
    this.items.push({ ...issue });
  }

  all(): DataQualityIssue[] {
    return [...this.items].sort(
      (a, b) =>
        a.ruleId.localeCompare(b.ruleId) ||
        a.file.localeCompare(b.file) ||
        a.rowRef.localeCompare(b.rowRef, undefined, { numeric: true }) ||
        a.field.localeCompare(b.field),
    );
  }

  count(ruleId: string): number {
    return this.items.filter((i) => i.ruleId === ruleId).length;
  }
}
