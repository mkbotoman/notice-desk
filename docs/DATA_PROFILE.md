# Data profile

Facts about the four source CSVs, measured on 2026-10-30. No raw rows. The SSN column was never loaded
into the profiler; only its shape counts were taken, in a separate pass that kept no values.

| File           | Rows | Notes                                                    |
| -------------- | ---- | -------------------------------------------------------- |
| properties.csv | 21   | Clean. All keys unique.                                  |
| leases.csv     | 174  | Two leases point at unknown properties.                  |
| notices.csv    | 37   | One notice per lease. Every `lease_id` exists in leases. |
| coi_status.csv | 150  | One row per tenant + property.                           |

The latest date anywhere in the data (`date_sent` and `updates`) is **2026-10-13**. That is the
default asOf (`meta.dataAsOf`).

## properties.csv

- `property_id` `P-001`…`P-021`. `type` is Title Case: Retail 13, Industrial 5, Office 3.
- Six states, not only California: CA 7, CO 4, AZ 4, NV 3, UT 2, ID 1.
- `fund`: "Income REIT" 13, "Fund II" 8.
- Asset managers: 3 distinct names. Property managers: 4 distinct names. One manager per property, no blanks.
- `acquired_date` is ISO everywhere. `sq_ft` is an integer everywhere.

## leases.csv

- `lease_id` `L-0001`-style, unique. 76 raw tenant strings.
- `property_id`: 23 distinct values; `P-099` and `P-100` (one lease each, `L-0273`, `L-0274`) are not in properties. Neither has COI rows or notices.
- `lease_status`: Current 159, Holdover 14, Terminated 1. All 14 holdovers have an end date before 2026-10-14.
- Dates: ISO `YYYY-MM-DD` (132 per column) or `MM/DD/YYYY` (42 per column). In the slash dates the first part never exceeds 12 (84 values), so they are month-first. Years are always 4 digits. No lease ends before it starts.
- `monthly_rent` and `ar_balance`: plain decimals (`4100.00`), no `$`, commas, parentheses or text. No negatives, no zero rents.
- `ar_aging`: Current 138, 31-60 16, 90+ 9, 61-90 8, **0-30 3**. Spelling `0-30` is not in the plan's alias list.
- Aging against balance (m = balance ÷ rent): Current is always m = 0 (all 138); 0-30 and 31-60 are always m = 1.00; 61-90 is always m = 2.00; 90+ is m = 3.00 to 6.00 (median 3.00). So **m = 1.00 occurs under both 0-30 and 31-60.**
- `watchlist_reasons`: 23 non-blank, `;`-separated, 14 distinct combinations drawn from 6 reasons.
- One suite is double-booked: two different tenants on the same property + suite, both Current.
- 74 tenants after name resolution; 72 of them hold more than one lease (max 3).

## notices.csv

- Columns: 17, including `guarantor_ssn`, which is present on all 37 rows as three-two-four digit groups with dashes. Every row also has a guarantor name. No SSN-shaped value appears in any other column.
- `stage`: Notice to Cure 14, Default 7, Non-Compliant 5, Collections 4, Cured 4, Closed 3. Spellings are already clean.
- `status` is **not an enum of the stage**: 14 workflow values ("Hold per AM", "Payment Sent", "With Outside Counsel", …). No stage/status contradictions found.
- `type_of_default`: Monetary 30, Insurance 5, **Breach 2**.
- `owner`: Legal 25, **AM 12**.
- `date_sent`: ISO; blank on 5 rows, all Non-Compliant. Range 2026-02-12 to 2026-10-12.
- `cure_period`: "5 business days" 8, "10 business days" 7, "15 days" 5, "10 days" 5, "5 days" 3, "30 days" 1, "No cure date" 3, blank 5 (the same 5 Non-Compliant rows). **14 values give a day count with no unit.**
- **`lender_notice`** is three-valued: "No" 26, "Yes, notice only" 6, "Yes, consent & notice" 5.
- **`legal_fees` is text, not money:** "Yes" 10, "Yes, Section 18.4" 6, "Yes, Section 11.1" 5, "Lease does not permit legal fees" 6, "LL indemnified against damages from default" 5; blank 5.
- `amount_owed`: 28 numeric, 7 blank, 2 the text "Pending". Every numeric value equals the lease `ar_balance` exactly: no drift in this extract.
- `case_no`: 4 values, all shaped `NN-NNN-NNN`.
- `property_name` differs from the lease's property on 7 notices (abbreviations, e.g. a truncated suffix or initials): 4 distinct aliases.
- `tenant_name` agrees with the lease's tenant on all 37.
- `updates`: 30 non-blank cells. Every cell starts with a date. Entries are separated by `"; "`, each shaped `M/D/YY - text`, in chronological order (1 entry in 15 cells, 2 in 6, 3 in 9). Two-digit years. Dates run 2026-02-24 to 2026-10-13. The first update falls 4 to 23 days after `date_sent`.

## coi_status.csv

- `coi_status`: Current 106, Expiring 18, Expired 14, **Non-Compliant 12**.
- `expires_on` is ISO on every row, 2026-07-17 to 2027-09-10.
- Against 2026-10-13: Expired is always in the past (14); Current is always more than 30 days out (106); Expiring is within 30 days on 16 rows and **more than 30 days out on 2**; Non-Compliant is always more than 30 days out (12), so it is a different condition from expiry.
- All 150 tenant + property pairs match at least one lease; 5 pairs match several leases. 155 of 174 leases have a COI row, so **19 leases have none**.

## Tenant names

76 raw spellings across the files, 74 after normalizing case, punctuation and entity suffixes. Exactly one group merges (three spellings of one fitness tenant, matching the brief's example). No two different normalized names are within edit distance 2.
