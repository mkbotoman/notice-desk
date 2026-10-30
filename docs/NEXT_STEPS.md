# Next steps

What is deliberately not done yet, and why. Update this as items are built or dropped.

## In the mocks, not built: the data isn't there

Left out so the app doesn't invent numbers. Each needs a data source first.

- **AR history chart** on the tenant view (monthly AR bars). The export has one balance per lease, no history. Needs a monthly AR snapshot from the accounting system.
- **"Cases, last 12 months"** on the tenant view. The app shows open cases instead; a rolling history needs closed-case dates, which the sheet doesn't carry.
- **"Legal is asking" box** on the inbox. Needs a place to record a request from Legal to an asset manager (a new event type) before it can be shown.
- **"Legal fees to date" as a dollar figure** on case detail. The sheet holds what the lease says about fees ("Yes, Section 18.4"), not an amount. Needs the fees ledger.
- **"Default since Oct 9" / "Opened Oct 26" lines** on the case list. Cases carry no date for when they changed stage or opened. Needs stage-change dates captured from now on (the app records them for new changes) or an import of history.
- **Lease term and a due-date chip** on tenant lease cards, and an **AR column** in the inbox's "In trouble" table. Cheap once the case pages settle; skipped to avoid divergent wording.

## Left out of M3

- **Notifications:** draft insurance notices for a tenant with no case (needs a nullable case on a notification, or an insurance-specific event); an "external tenant letter" recipient; template "Insert" chips. "Refine with AI" comes with M4.
- **Watchlist:** a "Dismiss" button with a reason (needs somewhere to store it), and an asset-manager column.
- **Analytics:** a property filter and "last 8 weeks" / "last 12 months" windows from the mock; a shared chart-colour token in `globals.css` (single-series bars use the brand navy, which is darker than the chart guidance prefers).
- **Weekly summary:** the AI paragraph and "Regenerate" (M4), a week selector (the as-of date sets the week), and a "handed over this week" section from owner-change events.
- **Structure:** `src/domain/summary` imports formatting from `src/lib`, and the watchlist imports from the case-list and tenant folders; move the shared pieces into `src/lib` when convenient.

## Open review items

From `docs/REVIEW.md`; none block use.

- Unify the event, actor and insurance wording that the case-detail and tenant pages each wrote.
- Announce a completed hand-back to assistive technology (the row disappears, so its message is lost).
- Close the property filter on Escape and on an outside click.
- Browser tests that derive per-persona expectations from the seed: add literal expectations for a few personas.
- "In trouble" lists leases only; show open cases that have no lease.
- A calendar-day deadline that lands on a weekend or holiday is not rolled forward.
- Two browser tabs overwrite each other's saved changes (no cross-tab sync).
- The password gate has no rate limiting.
- Bank-account redaction needs a keyword; add space-separated and tax-id forms if such text ever appears.

## Product

- **Guarantor names are in the page for every persona** (see `docs/DATA_INVENTORY.md`). A real build serves them from an authenticated, role-checked API.
- **A real backend.** Everything a user changes lives in their browser. The leadership memo covers where the data should live long term.
- **Email.** Notifications are drafted and marked sent but never emailed (out of scope in the brief).

## Remaining plan milestones

- **M3:** notifications and the outbox, analytics, the data-quality page and watchlist, the weekly summary.
- **M4:** AI drafting and the summary narrative, with the allowlist and the no-key fallback.
- **M5:** persona-by-page browser coverage, a privacy audit of the built output, a cold review against the brief, a keyboard and contrast pass.
- **M6:** final deploy, README for reviewers with persona deep links, the short note and demo script.
