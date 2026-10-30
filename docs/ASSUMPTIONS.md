# Assumptions

One line each, tagged with the workstream ID, e.g. `- [WS-1B] ...`. Feeds the short note.

- [M0] Business days exclude weekends and US federal holidays only. The holiday list is one config file; California dates can be added later.
- [M0] A cure period starts the day after the notice is sent (day 1 is the next day).
- [M0] "Due this week" is a rolling 7 days from asOf. The weekly summary keeps its own Mon–Fri windows.
- [M0] The default asOf is the data export date, with today one click away.
- [M0] Asset managers can add updates and hand cases back to Legal; property managers are read-only.
- [M0] An unparseable cure period becomes `unknown` (shown as "deadline missing"), distinct from `none`.
- [M0] Personas are not security. The seed ships to the browser and `?as=` can switch persona, so `can()` shapes the UI only. Deployment Protection is the access control.
