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

## Pass 3: merged M3 (notifications, analytics, data quality, watchlist, weekly summary)

No Critical findings and no data exposure. The weekly summary's HTML escaping is complete (every
dynamic string is escaped and only appears as element text); notification text has no guarantor,
SSN or note fields; every new page is gated by `can()`; opened watchlist cases are valid. Not
checked: the app in a browser, chart accessibility beyond the e2e tests.

| #   | Severity | Finding                                                                                                                                 | Status                                                                                            |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | High     | The automatic-notification hook used the as-of picker's date, so previewing a later date created permanent drafts.                      | Fixed: drafts are judged against the data date only. Test added (a later date adds none).         |
| 2   | High     | Two tabs each logged their own "drafted" event (random event ids).                                                                      | Fixed: the event id is fixed by the notification id and the event is skipped if it exists.        |
| 3   | Medium   | Dismissing a draft was unaudited.                                                                                                       | Fixed: new `notification_dismissed` event (contract change), logged and shown in the case log.    |
| 4   | Medium   | A save failure could leave a draft with no event, silently.                                                                             | Fixed: the event is written first; a failure is warned (ids only) and retried on the next change. |
| 5   | Medium   | The analytics activity chart bucketed by recorded time; the summary by effective date.                                                  | Fixed: both use the effective date.                                                               |
| 6   | Medium   | Domain code imports `lib`; the watchlist imports from case-list and tenant folders; `LEGAL_PERSONA_ID` is declared twice.               | Open (listed in `NEXT_STEPS.md`): harmless today.                                                 |
| 7   | Low      | A stage-change draft is addressed to the person who made the change.                                                                    | Open.                                                                                             |
| 8   | Low      | Insurance drafts attach to the lease's first open (else first) case, and `expiring` then `expired` make two drafts for one certificate. | Open; recorded in the assumptions.                                                                |
| 9   | Low      | Stale comment in `weeklyActivity`.                                                                                                      | Open.                                                                                             |
| 10  | Low      | Outbox browser tests could not tell 22 drafts from 44.                                                                                  | Fixed: an exact first-load count, stable across a reload.                                         |

## Pass 4: merged M4 (AI narrative and notification assist)

No Critical findings. Routes are behind the password gate; the model is only called from button
handlers; schemas are strict at every depth; no `dangerouslySetInnerHTML` on AI text; every failure
path degrades to the template. Not checked by the reviewer: any live gateway call.

| #   | Severity | Finding                                                                                                                                                                                                     | Status                                                                                                                                                                                                                       |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | SSN and account redaction was ASCII-only: full-width digits, zero-width characters, line breaks, dot or en-dash separators and single-spaced digits all got through (and `checkDraft` shared the weakness). | Fixed: text is Unicode-normalized and invisible characters removed before matching; flexible separators and spaced digits are caught. A test for each bypass.                                                                |
| 2   | High     | The number guard pooled every figure in the data, so "13 cases" passed because the as-of date contains 13.                                                                                                  | Fixed: dates are judged as dates and their pieces no longer count as permission; a wrong date is rejected. Spelled-out numbers and false claims with no figure still can't be caught, so the UI says to read before sending. |
| 3   | Medium   | The server trusted client-supplied tenant, property, suite and stage text.                                                                                                                                  | Fixed: stage and issue type are enums; other facts are normalized and redacted on the server.                                                                                                                                |
| 4   | Medium   | Model output could carry links or email addresses.                                                                                                                                                          | Fixed: any address not in the data rejects the reply.                                                                                                                                                                        |
| 5   | Medium   | Weak rate limiting (per instance, spoofable key, unbounded map).                                                                                                                                            | Partly fixed: a global cap across callers and pruning of old keys. Still per server instance; noted.                                                                                                                         |
| 6   | Medium   | SDK default of two retries meant one click could bill three attempts.                                                                                                                                       | Fixed: no retries.                                                                                                                                                                                                           |
| 7   | Low      | The body-size cap ran after reading the body.                                                                                                                                                               | Fixed: Content-Length is checked first.                                                                                                                                                                                      |
| 8   | Low      | The `formal` tone is unreachable from the UI.                                                                                                                                                               | Open: only internal recipients exist today.                                                                                                                                                                                  |
| 9   | Low      | The model id could not be verified.                                                                                                                                                                         | Checked against the gateway's live model list (it exists). No live call has succeeded yet: the team is on the gateway free tier.                                                                                             |

## Review note outside the passes: notification recipients

The user found that the outbox addressed messages to the person viewing it. Recipients could only
be Legal (the viewer) or an asset manager; a property manager was never possible. Fixed: the default
is the property's own property manager, then its asset manager; never the viewer.

## Requirements review note: stage moves

The user re-read the brief ("move a case to its next stage ... changes survive a refresh") and
found the app looked text-only. Stage moves existed but only on the case page, and moving a case to
Notice to Cure never recorded a send date or cure period, so a case advanced or opened in the app
could never get a deadline: the brief's central point. Fixed: the move now asks for both, previews
the deadline, and is offered on the case list and the inbox as well.

## Hardening pass (M5)

Four parts: a persona-by-page access grid, a privacy audit of everything the app ships, a cold
review by the independent reviewer agent, and a keyboard and contrast pass.

**Access grid** (`tests/e2e/persona-grid.spec.ts`). Four personas (Legal, Founder, an asset manager,
a property manager) against all nine pages: each opens what it may and shows the blocked panel for
the rest, with no script errors, and the navigation lists exactly the pages it may open. A property
manager sees only their property's cases, an out-of-scope or unknown case reveals no tenant details,
and only Legal and the Founder see a guarantor on a case.

**Privacy audit.** `pnpm scan:ssn` (`scripts/ssn-exact-scan.mjs`) reads every guarantor SSN from the
raw notices file and searches for each exact value, with and without dashes, in every tracked file,
the whole built output and every commit in git history. It prints locations only, never a value, and
skips when the raw file is not on the machine. Result: clean. The shape-based `pnpm scan:pii` stays
in `pnpm check`. Findings, all documented rather than changed:

- Guarantor names are in the seed and reach every viewer's browser (already a known limitation).
- One guarantor in the sample data shares a name with a property manager, so hiding the guarantor
  field would not hide that name. A real build would key people by id, not name.
- The data-quality report holds record ids, tenant names and counts; it holds no guarantor data.

**Cold review** (reviewer agent, changes since `cf7f223`). No critical or high findings.

| #   | Severity | Finding                                                                                           | What was done                                                                                                                            |
| --- | -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium   | The composer threw away edits and an accepted AI draft when To changed.                           | Edits are kept and a note says so, as in the saved-draft view.                                                                           |
| 2   | Medium   | Tenant wording named a balance for insurance cases and on cured or closed cases.                  | The balance appears only for a payment issue that is still open.                                                                         |
| 3   | Medium   | Tenant wording could print "not set" for a missing deadline or fit the wrong stage.               | Neutral wording when there is no deadline; a warning in the composer when a deadline message is chosen for a case not in Notice to Cure. |
| 4   | Low      | Closing-tag stripping in the AI prompt could be bypassed with spacing or Unicode.                 | All angle brackets are removed from person-supplied text.                                                                                |
| 5   | Low      | The "What should change?" note counts as a source of figures, so a typed amount passes the guard. | By design: the sender is trusted staff and sees the result before using it. Documented in ASSUMPTIONS.                                   |
| 6   | Low      | The To list included people who cannot see the case.                                              | Limited to people who can view the case (plus whoever is already chosen).                                                                |
| 7   | Low      | Rebuilding a pre-recipe draft whose event is missing falls back to current values.                | Test added for the fallback. Saved drafts re-render with the current balance, not the original.                                          |

**Keyboard and contrast** (`tests/e2e/accessibility.spec.ts`). axe-core (WCAG 2.1 A and AA, which
includes colour contrast) over every page in light and dark themes as Legal, and over each other
persona's pages. Two kinds of problem, both fixed: the property filter and the stage link in the
inbox's trouble table had accessible names that did not contain their visible text. Keyboard:
Tab order starts in the navigation, every stop shows a focus indicator, and the composer can be
filled in without a mouse.
