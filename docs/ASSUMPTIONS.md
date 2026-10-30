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
