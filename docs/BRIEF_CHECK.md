# The brief, line by line

A cold read of `CIRE CTO Candidate Pack.pdf` against the running app (checked on the live site on
2026-10-30). Status: **done**, **partial**, **not done**.

## The problem (sections 1 to 4)

| Brief                                                                     | Status  | Where                                                                                       |
| ------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| Cure dates are worked out by hand                                         | done    | Calculated deadline with the rule shown, business days skip weekends and federal holidays   |
| Asset managers can't tell if a case is waiting on them or Legal           | done    | "Waiting on" chip on every row, the inbox, stat cards                                       |
| One tenant, several leases, each at a different stage                     | done    | Tenant page: a card per lease with its own stage                                            |
| Amounts owed drift from the accounting system                             | done    | Live balance shown beside the amount at notice, "Changed since notice"                      |
| Teams chase each other for updates                                        | done    | Add update (Legal and asset managers), notifications, the inbox                             |
| Maya: see what's overdue or due this week                                 | done    | Case list groups and stat cards (8 overdue, 4 due this week at the data date)               |
| Maya: move cases forward, keep a clean history                            | done    | Stage moves (case page, list rows, inbox rows), activity log                                |
| Lena: which of her tenants are in trouble, what's waiting on her          | done    | Inbox: "Waiting on you" and "In trouble"                                                    |
| Monday morning: under a minute to see overdue, due this week, whose court | partial | The case list answers it; the home page is an overview with a property rollup, not the list |
| Read-only access for a founder or property manager in their area          | done    | Founder (all), property managers (own properties), no action buttons                        |

## How a case moves (section 5)

| Brief                                                                              | Status                                                         |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Stages and allowed moves, including Cured/Closed as terminal                       | done (stage machine, 100% branch coverage)                     |
| Non-Compliant triggers: rent 31-60+, insurance expired, other term broken          | done (watchlist signals; "other lease term" is opened by hand) |
| Cure deadline = date sent + cure period, calendar or business days, some have none | done, including capturing both when a notice is sent           |

## What to build (section 6)

| Must have                                                                                                                    | Status      | Notes                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Case list: open cases sorted by deadline, overdue and due-this-week stand out, filter by stage, owner, property              | done        |                                                                                                                                |
| Case detail: tenant, property, lease, stage, problem, date sent, cure period, calculated deadline, amount, owner, update log | done        |                                                                                                                                |
| Actions: next stage, change owner, dated update                                                                              | done        |                                                                                                                                |
| Automatic and manual notifications, customizable before sending                                                              | done        | Automatic ones are raised when the app is open (no backend)                                                                    |
| Changes survive a refresh                                                                                                    | done        | Browser storage; "Reset demo data" restores                                                                                    |
| Tenant view                                                                                                                  | done        |                                                                                                                                |
| Analytics: trends for individual tenants and the Legal team                                                                  | **partial** | Team trends are limited by the data (no stage history). There is no single-tenant trend: tenants are ranked against each other |
| Nice: flag leases that look Non-Compliant with no case                                                                       | done        | Watchlist, with one-click Open case                                                                                            |
| Nice: weekly summary Maya can paste into an email                                                                            | done        | Plain text and HTML copy                                                                                                       |
| Out of scope: logins, backend, email, mobile                                                                                 | respected   | Shared password gate and personas only; mobile layout built anyway                                                             |
| AI only where it earns its place                                                                                             | done        | Narrative and notification assist, both with fallbacks; verified live                                                          |

## Data (section 7)

| Brief                                                            | Status      | Where                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expect mess; sensible calls; write down assumptions; explain how | done        | `docs/DATA_PROFILE.md`, `DATA_QUALITY_RULES.md`, `ASSUMPTIONS.md`, the Data quality page                                                                                                           |
| A scalable format that can tie into other parts of the business  | **partial** | Normalized entities with stable ids exist (`src/domain/types.ts`, `data/seed/`); there is no short data-model document explaining them and how they map to the accounting system and portfolio hub |
| Sensitive data handled as in production                          | **partial** | SSN dropped at the parser, redacted from free text, scanned in CI, inventory written. Guarantor names still reach every viewer's browser (`docs/DATA_INVENTORY.md`)                                |

## What to send back (section 8)

| Deliverable                                                | Status                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| The prototype: live link and repo with setup steps         | done (noticedesk.site behind a shared password; README)          |
| One-page memo for leadership                               | **not done** (deferred at the start; it is a stated deliverable) |
| Short note: what built, cut, assumptions, another week     | **not done** (to draft from these docs)                          |
| How AI coding tools were used and what was checked by hand | done, `docs/AI_LOG.md` (update at the end)                       |

## How it will be judged (section 9) and the live session (section 10)

| Item                                                          | Status                                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Core flow works                                               | done                                                                                      |
| Mess handled and explained                                    | done                                                                                      |
| Maya can use it without deep training                         | **not tested**: no keyboard, contrast or first-use walkthrough yet                        |
| Scoped well ("a finished core beats a half-built everything") | judgment call: everything in the brief is built; the note should say plainly what was cut |
| 15-minute demo                                                | **not done**: no demo script or reviewer deep-link list yet                               |
