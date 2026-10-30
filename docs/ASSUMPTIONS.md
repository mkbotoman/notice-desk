# Assumptions

One line each, tagged with the workstream ID, e.g. `- [WS-1B] ...`. Feeds the short note.

- [M0] Business days exclude weekends and US federal holidays only. The holiday list is one config file; California dates can be added later.
- [M0] A cure period starts the day after the notice is sent (day 1 is the next day).
- [M0] "Due this week" is a rolling 7 days from asOf. The weekly summary keeps its own Mon–Fri windows.
- [M0] The default asOf is the data export date, with today one click away.
- [M0] Asset managers can add updates and hand cases back to Legal; property managers are read-only.
- [M0] An unparseable cure period becomes `unknown` (shown as "deadline missing"), distinct from `none`.
- [M0] Personas are not security. The seed ships to the browser and `?as=` can switch persona, so `can()` shapes the UI only. Deployment Protection is the access control.
- [M0] The deployed site sits behind a shared password (`ACCESS_PASSWORD` in Vercel env, enforced by `src/proxy.ts`), because reviewers won't have Vercel accounts. It is a gate, not user auth: one shared secret, no rate limiting, and the signed-in cookie lasts 7 days. Build assets under `/_next/static` stay public and contain no seed data. With no password set, production returns 503.
- [M0] The PII scan checks source, seed and rendered HTML/RSC payloads for dashed and bare nine-digit SSN shapes, but built JS and source maps only for the dashed form. Minified code contains bare nine-digit runs inside lookup tables, so the bare form there is noise. WS-5B should add an exact-value check against the local raw SSNs.
- [WS-1A] The default asOf is 2026-10-13, the latest date anywhere in the data (`date_sent` and `updates`).
- [WS-1A] A cure period such as "10 days" with no unit means calendar days; the data also contains "10 business days" side by side. 15 notices are affected.
- [WS-1A] `Breach` maps to `other_lease_term`, `AM` to the asset-management team, `0-30` to `1_30`, `Current` lease status to `active`, `Current` COI status to `valid`.
- [WS-1A] A text `amount_owed` ("Pending") becomes null and is flagged. `legal_fees` is lease-provision text and is kept verbatim as `legalFeesTerms`; `lender_notice` is a three-way enum; `status` is kept verbatim as `workflowStatus`.
- [WS-1A] COI status is stored as exported; the effective status (expired / expiring / valid) is computed from `expiresOn` at the current asOf, so moving the asOf control stays consistent. `Non-Compliant` is its own status, not expiry.
- [WS-1A] A lease with no row in the COI tool gets a synthesized `missing` COI record and counts as an insurance signal on the watchlist (decided by Maureen).
- [WS-1A] Leases pointing at properties that don't exist are kept with a null property, flagged, and shown under "Unknown property" (decided by Maureen). They are visible only to personas with all-property scope.
- [WS-1A] DQ-AR infers only a floor: the best aging the balance allows. It flags understated aging (error) and a zero balance with non-current aging (stale, warning). Overstated aging is not flagged, because partial payments lower the balance. Real data: zero flags.
- [WS-1A] A second lease on the same property and suite is flagged (rule DQ-SUITE, warning); both leases are kept.
- [WS-1B] A cure deadline is only "overdue" or "due this week" while the case is in Notice to Cure. In Default and Collections the cure period has already ended by definition, so those show the deadline as history and carry no overdue flag.
