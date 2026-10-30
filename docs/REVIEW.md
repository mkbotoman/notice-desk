# Independent review

Findings from an independent, read-only reviewer agent, with what was done about each. The
reviewer is defined in `.claude/agents/reviewer.md`.

## Pass 1: main at `197201e` (M0, M1 and the shared M2 foundations)

Typecheck, lint, 353 tests and the coverage thresholds passed. Not checked: browser tests, a
complete PII scan of the built bundle, a line-by-line read of the ingest file, visual drift.

| #   | Severity | Finding                                                                                                                      | Status                                                                                                                                                                              |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | `scripts/pii-scan.mjs` crashed with `EISDIR` when git listed a nested worktree directory, so the CI gate could not complete. | Fixed: non-files are skipped; `.claude/worktrees/` is gitignored and excluded from tsc, ESLint, Prettier and Vitest.                                                                |
| 2   | High     | Guarantor names are in the shared seed and the prerendered HTML, so any persona can read them via view-source.               | Documented in `docs/DATA_INVENTORY.md`. Accepted for sample data; the real fix is a server-side, role-checked API. Left open on purpose.                                            |
| 3   | Medium   | `safeNextPath` open redirect: `/\t/evil.com` and `/\n/evil.com` pass the check.                                              | Fixed: control characters and backslashes are rejected; tests added.                                                                                                                |
| 4   | Medium   | A pre-2021 `date_sent` with a business-day cure, or an absurd day count, threw and took down every page.                     | Fixed: no deadline instead of a crash (shown as "deadline missing"); cure periods over 365 days read as unreadable; tests added.                                                    |
| 5   | Medium   | `DATA_INVENTORY.md` was a stub.                                                                                              | Fixed.                                                                                                                                                                              |
| 6   | Medium   | `parseMoney` stripped hyphens anywhere, so `2026-10-13` parsed as money.                                                     | Fixed: only a leading minus or wrapping parentheses mean negative; tests added.                                                                                                     |
| 7   | Medium   | Tenant and lease data (including guarantor names) is committed in `data/seed/`.                                              | Accepted. The data is made up and the user chose to commit and deploy it behind the password gate. No SSN appears anywhere in git history (the reviewer checked all 37 raw values). |
| 8   | Low      | Two browser tabs overwrite each other's saved changes (no `storage` listener).                                               | Open. Fine for a single-user demo; note for the short note.                                                                                                                         |
| 9   | Low      | Event ids used a 4-character `Math.random` suffix.                                                                           | Fixed: `crypto.randomUUID`.                                                                                                                                                         |
| 10  | Low      | Account-number redaction misses space-separated numbers and numbers with no keyword; tax ids aren't redacted.                | Open. No such text exists in this data; the SSN path is strict.                                                                                                                     |
| 11  | Low      | `PrefsStore.getSnapshot` can notify listeners while loading.                                                                 | Open. Harmless today (no listeners exist yet at first read); revisit if it ever causes a warning.                                                                                   |
| 12  | Low      | A calendar-day deadline that lands on a weekend or holiday is not rolled forward.                                            | Open; to be recorded in the assumptions. Leases usually say what happens.                                                                                                           |
| 13  | Low      | `?as=` lets anyone past the gate pick any persona.                                                                           | Documented; the gate is the access control.                                                                                                                                         |
| 14  | Low      | Gate: no rate limiting; one static token per password.                                                                       | Documented; accepted for sample data. Cookie flags and constant-time comparison are sound.                                                                                          |
| 15  | Low      | The `cn` package is niche; components import it directly.                                                                    | Verified published by the shadcn maintainer. Left as generated by the shadcn CLI.                                                                                                   |
| –   | Medium   | "Today (MMM d)" label could mismatch on hydration (build date vs browser date).                                              | Fixed: printed only after hydration.                                                                                                                                                |

Checked and sound: business-day counting and holiday observance, the as-of rule, the no-overdue-
after-Notice-to-Cure rule, the stage machine, store replay and rollback, validated persistence,
`can()`, absence of `dangerouslySetInnerHTML` and inline styles, the CSV parser dropping the SSN
column, the CI workflow, gate cookie flags and constant-time comparison.

## Pass 2: merged M2 (case list, case detail, tenant view, inbox)

No Critical or High findings. Typecheck, lint, 416 tests, coverage thresholds, build and 58 browser
tests passed. All four pages use the same domain functions for overdue, due this week, open and
waiting-on, and the headline counts agree (8, 4, 30, 21). Scope and permission checks hold on every
page; guarantor names render only behind `view_guarantor`; notes and names render as text; no new
inline styles, contract changes or edits outside lanes. Not checked: visual drift, real keyboard and
screen-reader behaviour, behaviour on the deployed host.

| #   | Severity | Finding                                                                                              | Status                                              |
| --- | -------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Medium   | The case list showed "Changed since notice" on a case with no lease (no live balance).               | Fixed.                                              |
| 2   | Medium   | "In trouble" omits open cases that have no lease.                                                    | Documented as lease-only; the real data has none.   |
| 3   | Medium   | The deadline sentence said "no send date" when the send date was before the holiday calendar begins. | Fixed; test added.                                  |
| 4   | Low      | Event wording, actor labels and insurance wording drifted between the case-detail and tenant pages.  | Open: unify in `src/lib` before M3 adds more pages. |
| 5   | Low      | Case detail's update form let an invalid date through to a raw validation error.                     | Fixed: a plain message.                             |
| 6   | Low      | After a hand-back the row disappears, so its confirmation isn't announced to assistive technology.   | Open.                                               |
| 7   | Low      | Name variants crossed property scope.                                                                | Fixed: only all-property personas see them.         |
| 8   | Low      | Property filter doesn't close on Escape; stat-card active state is a ring only.                      | Open (the first is recorded as an assumption).      |
| 9   | Low      | Some browser tests derive per-persona expectations from the seed through the same scoping rules.     | Open; headline counts are asserted as literals.     |
