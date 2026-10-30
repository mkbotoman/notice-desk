# Notice Desk

A prototype for Meridian Peak Equity's Legal team to track tenants who have broken their lease, from
first warning to resolution. Built for the CIRE candidate pack. All people and data are made up.

Live: https://noticedesk.site (behind a shared password; ask Maureen for it).

## Run it locally

You need Node 24 and pnpm 10.

```bash
corepack enable
corepack prepare pnpm@10.18.3 --activate   # once, if `pnpm -v` fails
pnpm install
pnpm dev                                   # http://localhost:3000
```

With no data in place the app runs on a small hand-built fixture (`data/seed/fixture/`), so this is
enough to click around. The access password is only enforced in production builds.

### Use the real data

1. Put the four CSVs in `data/raw/`, named exactly:
   `properties.csv`, `leases.csv`, `notices.csv`, `coi_status.csv`.
2. Run `pnpm ingest`. It writes cleaned JSON to `data/seed/` and the data-quality report to
   `data/reports/data-quality.json`, and prints issue counts per rule (never row contents).
3. Restart `pnpm dev`. The app prefers `data/seed/` over the fixture when it exists.

`data/raw/` is gitignored and must stay that way: `notices.csv` contains guarantor SSNs. Ingest drops
that column at the CSV parser and redacts SSN-shaped text everywhere else. Delete `data/seed/*.json`
(not `fixture/`) to go back to the fixture.

### Run a production build

```bash
ACCESS_PASSWORD=choose-something pnpm build && ACCESS_PASSWORD=choose-something pnpm start
```

A production build with no `ACCESS_PASSWORD` returns 503 for every page, on purpose.

## Scripts

| Command                        | What it does                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `pnpm dev` / `build` / `start` | Next.js dev server, production build, production server                        |
| `pnpm check`                   | Typecheck, lint, tests and the PII scan: what CI runs, minus the build         |
| `pnpm test`                    | Unit tests (Vitest). `test:coverage` adds coverage and enforces the thresholds |
| `pnpm test:e2e`                | Playwright tests (they build and start the app themselves)                     |
| `pnpm ingest`                  | Raw CSVs to `data/seed/` and `data/reports/`                                   |
| `pnpm scan:pii`                | Fails on SSN-shaped values in tracked files, the seed and the built output     |
| `pnpm format`                  | Prettier                                                                       |

## Layout

```
src/domain/    Types, Zod schemas, deadlines, stage machine, permissions. Pure and fully tested.
src/store/     Event-sourced case store with localStorage persistence.
src/lib/       Seed loading, personas, shared-password gate.
src/app/       Next.js routes. /gate is the password page.
scripts/ingest CSV ingest and the data-quality rules.
data/          raw/ (gitignored), seed/ (cleaned JSON), reports/ (data-quality.json).
docs/          Data profile, assumptions, AI usage log, data-quality rules.
```

Start with `docs/DATA_PROFILE.md` for what the source data looks like and `docs/ASSUMPTIONS.md` for
the calls made about it.

## Things worth knowing

- **Dates are calendar dates.** Cure deadlines count from the day after a notice is sent. Business
  days skip weekends and US federal holidays. "Due this week" means the next 7 days.
- **The app's "today" is a setting.** It defaults to the date of the data export (2026-10-13), not
  the real current date. Change it from the date chip in the header.
- **Changes live in your browser.** There is no backend. Actions are saved to localStorage and
  "Reset demo data" restores the seed.
- **Personas are not logins.** Switching persona changes what the UI shows; it does not protect
  data, because the seed is loaded in the browser. The password gate is the access control.
