# Data model

What the Notice Desk stores, how the records relate, where each field comes from, and what is worked out rather than stored. All people and companies are made up. A browsable version of this page is published as an artifact; this file is the source in the repository.

Counts are at the data date, 2026-10-13: 21 properties, 74 tenants, 174 leases, 37 cases, 54 imported notes, 169 insurance records, 187 data-quality entries.

## How data moves

1. Four CSV exports (properties, leases, notices, insurance) go through `scripts/ingest/`, which applies the DQ rules and writes JSON seed files plus a data-quality report. The raw files are never committed.
2. The app loads the seed JSON on the server and gives it to the page.
3. Anything a person does in the app is appended as an event (or saved as a notification) in the browser's storage. The current state of a case is the seed case with its events replayed in order.

## Relationships

- Property → Person (assetManagerId, propertyManagerId)
- Lease → Property (nullable), Lease → Tenant
- CoiRecord → Tenant, Property (nullable), and leaseIds[] → Lease
- Case → Lease (nullable), Tenant; propertyId is copied from the lease
- CaseEvent → Case; Notification → Case; Guarantor → Case (one per case)
- notification_* events point back to a Notification by payload.notificationId

## Person

Someone who manages a property. Built from the manager names in the properties file.

Stored in: people.json. Key: id.

| Field | Type                                 | Rules                                                         |
| ----- | ------------------------------------ | ------------------------------------------------------------- |
| id    | string                               | Primary key built from the name, for example PER-lena-brooks. |
| name  | string                               | Display name as exported.                                     |
| roles | asset_manager \| property_manager [] | One person can hold both roles.                               |

## Property

A building the fund owns. 21 at the data date.

Stored in: properties.json. Key: id.

| Field                     | Type                                    | Rules                                                                         |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| id                        | string                                  | Primary key, from property_id.                                                |
| name                      | string                                  | Canonical name. Other spellings seen in the notices file are kept in aliases. |
| aliases                   | string []                               | Names the notices file used for this property (rule DQ-PROP).                 |
| type                      | retail \| industrial \| office \| other |                                                                               |
| city, state, market, fund | string                                  |                                                                               |
| assetManagerId            | string \| null                          | Foreign key to Person.                                                        |
| propertyManagerId         | string \| null                          | Foreign key to Person.                                                        |
| sqFt                      | integer \| null                         |                                                                               |
| acquiredDate              | ISO date \| null                        |                                                                               |

## Tenant

A business that rents space. The source files carry no tenant id, so ingest derives one. 74 at the data date.

Stored in: tenants.json. Key: id.

| Field        | Type      | Rules                                                                             |
| ------------ | --------- | --------------------------------------------------------------------------------- |
| id           | string    | Primary key built from the normalized name, for example T-alpine-animal-hospital. |
| displayName  | string    | The most common spelling across the files.                                        |
| nameVariants | string [] | Every other spelling that resolved to this tenant (rule DQ-TENANT).               |

## Lease

One tenant in one suite. The live balance lives here. 174 at the data date.

Stored in: leases.json. Key: id.

| Field              | Type                                                    | Rules                                                                                                              |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| id                 | string                                                  | Primary key, from lease_id.                                                                                        |
| propertyId         | string \| null                                          | Foreign key to Property. Null when the source names a property that does not exist (DQ-ORPHAN). The lease is kept. |
| tenantId           | string                                                  | Foreign key to Tenant.                                                                                             |
| suite              | string \| null                                          |                                                                                                                    |
| sqFt               | integer \| null                                         |                                                                                                                    |
| status             | active \| expired \| terminated \| holdover \| unknown  |                                                                                                                    |
| startDate, endDate | ISO date \| null                                        | A lease that ends before it starts is flagged (DQ-DATE).                                                           |
| monthlyRent        | integer cents \| null                                   | Never negative.                                                                                                    |
| arBalance          | integer cents \| null                                   | The live amount owed. May be negative (a tenant credit).                                                           |
| arAgingRecorded    | current \| 1_30 \| 31_60 \| 61_90 \| 90_plus \| unknown | As exported.                                                                                                       |
| arAgingImplied     | same set \| null                                        | The best aging the balance allows (see Derived values). Null when rent is missing or zero.                         |
| watchlistReasons   | string []                                               | As exported; the app also computes its own watchlist.                                                              |

## CoiRecord

A certificate of insurance. One record can cover several leases. 169 at the data date, 19 of them created by ingest for leases the insurance tool has no row for.

Stored in: coi.json. Key: (tenantId, propertyId).

| Field      | Type                                                                | Rules                                                                      |
| ---------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| tenantId   | string                                                              | Foreign key to Tenant.                                                     |
| propertyId | string \| null                                                      | Foreign key to Property. Null for a row with no property (DQ-ORPHAN).      |
| leaseIds   | string []                                                           | The leases this certificate is matched to.                                 |
| status     | valid \| expiring \| expired \| non_compliant \| missing \| unknown | As exported. missing with no expiry is created by ingest (DQ-COI-MISSING). |
| expiresOn  | ISO date \| null                                                    |                                                                            |

## Case

One notice, from first warning to resolution. 37 at the data date. A case is a starting state plus events (see Events).

Stored in: cases.json. Key: id.

| Field              | Type                                                                         | Rules                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| id                 | string                                                                       | Primary key, from notice_id.                                                                                                     |
| leaseId            | string \| null                                                               | Foreign key to Lease. Null for an orphan notice (DQ-ORPHAN).                                                                     |
| tenantId           | string                                                                       | Foreign key to Tenant.                                                                                                           |
| propertyId         | string \| null                                                               | Taken from the lease, so it is null when the lease has none. Used for access scope.                                              |
| stage              | non_compliant \| notice_to_cure \| default \| collections \| cured \| closed | Changes only through a stage_changed event.                                                                                      |
| issueType          | monetary \| insurance \| other_lease_term                                    |                                                                                                                                  |
| dateSent           | ISO date \| null                                                             | When the notice went out. Counting starts the next day.                                                                          |
| curePeriod         | {days, n, unit} \| {none} \| {unknown}                                       | unknown means present but unreadable, or missing on a Notice to Cure. It is shown as "deadline missing" instead of sorting last. |
| owner              | legal \| asset_management                                                    | Whose court the case is in.                                                                                                      |
| amountOwedAtNotice | integer cents \| null                                                        | A snapshot from Legal's sheet. The live figure is Lease.arBalance.                                                               |
| legalFeesTerms     | string \| null                                                               | The lease wording, verbatim (for example "Yes, Section 18.4"). The data has no dollar figure.                                    |
| lenderNotice       | none \| notice_only \| consent_and_notice \| null                            |                                                                                                                                  |
| workflowStatus     | string \| null                                                               | Legal's working status, verbatim (for example "Hold per AM"). Not the stage.                                                     |
| courtCaseNo        | string \| null                                                               |                                                                                                                                  |
| guarantorName      | string \| null                                                               | Joined from guarantors.json when the data loads. Never an SSN.                                                                   |
| hasGuarantor       | boolean                                                                      | The only guarantor field kept on the case itself.                                                                                |

## CaseEvent

An append-only record of something that happened to a case. 54 imported notes at the data date.

Stored in: events.json (imported) + browser storage (made in the app). Key: id.

| Field          | Type                                                                                                                                          | Rules                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| id             | string                                                                                                                                        | Primary key.                                                                                                 |
| caseId         | string                                                                                                                                        | Foreign key to Case.                                                                                         |
| type           | case_opened \| imported_note \| note \| stage_changed \| owner_changed \| notification_drafted \| notification_sent \| notification_dismissed |                                                                                                              |
| at             | ISO datetime                                                                                                                                  | When it was recorded. Events replay in this order, then by id.                                               |
| effectiveDate  | ISO date                                                                                                                                      | When it happened for the business.                                                                           |
| actorPersonaId | string \| "import"                                                                                                                            | Who did it. "import" marks the source sheet's history, which never raises notifications.                     |
| note           | string \| absent                                                                                                                              | Free text, redacted for SSN-shaped values before it is saved.                                                |
| payload        | depends on type                                                                                                                               | stage_changed: {from, to, notice?}. owner_changed: {from, to}. notification_*: {notificationId}. Others: {}. |

## Notification

An outbox message about a case. Raised automatically by a trigger or written by hand.

Stored in: browser storage. Key: id.

| Field                              | Type                                                                                                | Rules                                                                                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                                 | string                                                                                              | Primary key. Automatic ones are NF-<dedupeKey>.                                                                                                                                                                                                   |
| caseId                             | string                                                                                              | Foreign key to Case.                                                                                                                                                                                                                              |
| trigger                            | deadline_approaching \| deadline_passed \| stage_changed \| owner_changed \| coi_expiring \| manual |                                                                                                                                                                                                                                                   |
| dedupeKey                          | string                                                                                              | Unique. Stops one trigger firing twice. Deadline triggers: <caseId>:<trigger>:<deadline>. Stage and owner changes: the event id. Insurance: coi:<tenant>:<property>:<status>:<expiry>. A dismissed draft keeps its key, so it does not come back. |
| recipientPersonaId, recipientLabel | string \| null, string                                                                              | The person it is addressed to. Defaults to the property's property manager, never the viewer.                                                                                                                                                     |
| subject, body                      | string                                                                                              | Plain text. Neither may be blank when saved.                                                                                                                                                                                                      |
| source                             | template \| ai_draft \| manual                                                                      | template while the text is exactly what the template produced.                                                                                                                                                                                    |
| status                             | draft \| sent \| dismissed                                                                          | Only a draft can change. Sending adds to the case log; no email leaves the app.                                                                                                                                                                   |
| createdAt, sentAt                  | ISO datetime                                                                                        | sentAt only when sent.                                                                                                                                                                                                                            |
| recipe                             | {template, stage?, previousStage?, owner?, deadline?, coi?} \| absent                               | What the draft was made from, so it can be rewritten for a different reader. Older drafts have none and are rebuilt from the trigger and event.                                                                                                   |

## Guarantor

A person who guarantees a lease. Held apart from the case so one person can be removed without touching anything else.

Stored in: guarantors.json. Key: caseId.

| Field  | Type   | Rules                                                                                                      |
| ------ | ------ | ---------------------------------------------------------------------------------------------------------- |
| caseId | string | Foreign key to Case. Unique.                                                                               |
| name   | string | Shown only with the view_guarantor permission. The SSN is dropped at the CSV parser and is stored nowhere. |

## DataQualityIssue

One fix or flag made during ingest. 187 at the data date. Regenerated on every ingest.

Stored in: data/reports/data-quality.json. Key: none (a list).

| Field                    | Type                                   | Rules                                                                |
| ------------------------ | -------------------------------------- | -------------------------------------------------------------------- |
| ruleId                   | string                                 | For example DQ-DATE, DQ-ORPHAN.                                      |
| severity                 | error \| warning \| info               |                                                                      |
| file                     | properties \| leases \| notices \| coi | Which export it came from.                                           |
| rowRef, field            | string                                 | A record id or row number and the field. Never a raw row.            |
| action                   | fixed \| flagged \| dropped            | fixed: repaired. flagged: kept, needs a human. dropped: row removed. |
| message, before?, after? | string                                 | before and after hold only the changed value, and never an SSN.      |

## Source columns to fields

| File           | Column                                           | Becomes                                             | What happens                                                                                                                   |
| -------------- | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| properties.csv | property_id                                      | Property.id                                         | Duplicate keys keep the most complete row (DQ-DUP).                                                                            |
|                | name, type, city, state, market, fund            | Property.*                                          | Type spellings mapped to the four values (DQ-ENUM).                                                                            |
|                | asset_manager, property_manager                  | Person, Property.assetManagerId / propertyManagerId | Names become Person rows with an id built from the name (PER-...); the same name in both columns is one Person with two roles. |
|                | sq_ft, acquired_date                             | Property.sqFt, acquiredDate                         | Dates to ISO (DQ-DATE).                                                                                                        |
| leases.csv     | lease_id                                         | Lease.id                                            |                                                                                                                                |
|                | property_id                                      | Lease.propertyId                                    | Unknown property: kept as null (DQ-ORPHAN).                                                                                    |
|                | tenant_name                                      | Tenant (derived), Lease.tenantId                    | Names resolve to one Tenant (DQ-TENANT).                                                                                       |
|                | suite, sq_ft, lease_status, start_date, end_date | Lease.*                                             | Same suite twice on one property is flagged (DQ-SUITE).                                                                        |
|                | monthly_rent, ar_balance                         | Lease.monthlyRent, arBalance                        | $ and commas to cents (DQ-MONEY).                                                                                              |
|                | ar_aging                                         | Lease.arAgingRecorded                               | Plus arAgingImplied, computed (DQ-AR).                                                                                         |
|                | watchlist_reasons                                | Lease.watchlistReasons                              | Split on semicolons.                                                                                                           |
| notices.csv    | notice_id                                        | Case.id                                             |                                                                                                                                |
|                | lease_id                                         | Case.leaseId, propertyId, tenantId                  | Unknown lease: leaseId null, flagged (DQ-ORPHAN). The lease's property wins over property_name (DQ-PROP).                      |
|                | tenant_name, property_name                       | Case.tenantId; Property.aliases                     | A differing property_name is recorded as an alias.                                                                             |
|                | stage, status                                    | Case.stage, workflowStatus                          | A status naming an end state that disagrees with the stage is flagged; the stage wins (DQ-STAGE).                              |
|                | type_of_default                                  | Case.issueType                                      |                                                                                                                                |
|                | date_sent, cure_period                           | Case.dateSent, curePeriod                           | Free text parsed ("10 business days"); no unit means calendar days (DQ-CURE).                                                  |
|                | lender_notice, legal_fees, owner                 | Case.lenderNotice, legalFeesTerms, owner            |                                                                                                                                |
|                | amount_owed                                      | Case.amountOwedAtNotice                             | Compared with the live balance (DQ-AMOUNT).                                                                                    |
|                | case_no                                          | Case.courtCaseNo                                    |                                                                                                                                |
|                | guarantor_name                                   | Guarantor.name; Case.hasGuarantor                   | Name moves to its own file.                                                                                                    |
|                | guarantor_ssn                                    | nothing                                             | Dropped at the parser. Only the has-a-guarantor flag survives.                                                                 |
|                | updates                                          | CaseEvent (imported_note)                           | "M/D/YY - text; M/D/YY - text" split into one event per note (DQ-NOTE). SSN-shaped text is redacted (DQ-PII).                  |
| coi_status.csv | tenant_name, property_id                         | CoiRecord.tenantId, propertyId                      |                                                                                                                                |
|                | coi_status, expires_on                           | CoiRecord.status, expiresOn                         | Status checked against the date (DQ-COI). Leases with no row get a missing record (DQ-COI-MISSING).                            |

## Derived values

None of these are stored; they are computed from the stored fields and the as-of date.

**Tenant resolution.** The files have no tenant id. Names are compared after lower-casing and dropping punctuation and entity words such as LLC and Inc. Names that match become one Tenant, with an id built from the normalized name. The most common spelling (the longer one on a tie) is the displayName and the rest go in nameVariants. Names that are close but not equal are not merged; they are flagged for a person to review. When a notice names a different tenant than its lease, the lease's tenant is used.

**Cure deadline.** dateSent plus the cure period, counted from the day after the notice was sent. Calendar days count every day. Business days skip weekends and US federal holidays only. No dateSent, or a none or unknown period, gives no deadline.

**Overdue and due this week.** Only for cases in Notice to Cure. Overdue: the deadline is before the as-of date. Due this week: today through the next 7 days (a rolling window). Default and Collections are never "overdue". A Notice to Cure with an unreadable period is "deadline missing".

**As-of date.** Every date-dependent figure is computed against one as-of date. It defaults to the data date (2026-10-13) and can be changed from the header or with ?asOf=.

**Effective COI status.** valid, expiring and expired are recomputed from expiresOn and the as-of date: expired if the date has passed, expiring within 30 days. non_compliant, missing and unknown pass through unchanged. Expired, non_compliant and missing count as an insurance problem.

**AR aging floor (DQ-AR).** With n monthly charges open, the oldest is at least n minus 1 months old, because the newest may have just been billed. balance divided by rent: up to 1.2 is current, up to 2.2 is 31 to 60, up to 3.2 is 61 to 90, above is 90 plus. It can prove the recorded aging is understated, never overstated. Null with no rent or a credit.

**Non-compliant on rent.** Recorded aging of 31 to 60 days or worse.

**Waiting on.** The case owner while the case is open; nobody once it is cured or closed.

**Current case.** The starting case from the seed, with its events applied in order. An event that does not fit the case's state (wrong from-stage, illegal move) is rejected.

**Access scope.** Legal and the Founder see everything. An asset manager or property manager sees the properties they manage. A case with no property is visible only to personas with all-property scope.

## Stage rules

| From           | To                  | Notes                                                                       |
| -------------- | ------------------- | --------------------------------------------------------------------------- |
| non_compliant  | notice_to_cure      | Records dateSent and curePeriod from the move. Only this move carries them. |
| notice_to_cure | cured, default      |                                                                             |
| default        | collections, closed |                                                                             |
| collections    | closed              |                                                                             |
| cured, closed  | nothing             | Terminal. The owner can no longer change.                                   |

## Notifications

| Trigger              | Fires when                                                                                                                                                       | Dedupe key                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| deadline_approaching | A Notice to Cure whose deadline is within 3 business days (including the as-of date).                                                                            | one per case and deadline        |
| deadline_passed      | A Notice to Cure whose deadline is before the as-of date.                                                                                                        | one per case and deadline        |
| stage_changed        | A stage change made in the app. Imported history never counts.                                                                                                   | the event id                     |
| owner_changed        | An owner change made in the app.                                                                                                                                 | the event id                     |
| coi_expiring         | A certificate that is expiring or expired as of the as-of date. Attached to the lease's open case, else the tenant's first case; none if the tenant has no case. | tenant, property, status, expiry |

The wording follows who the message is addressed to:

- **Legal (Maya)**: The internal Notice Desk email, with the original wording.
- **Property manager**: A note asking them to pass on a message addressed to the tenant. Polite and factual; no legal advice or threats.
- **Asset manager**: What changed and what is theirs to do.
- **Founder**: A short heads-up with the numbers.

## If this moved to a database

A suggested relational shape. Money is integer cents everywhere; dates are `date`, instants are `timestamptz`.

| Table        | Key                         | Columns and constraints                                                                                                                                                                                                                                      |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| property     | id text PK                  | asset_manager_id, property_manager_id text NULL FK person(id); type check in (retail, industrial, office, other)                                                                                                                                             |
| tenant       | id text PK                  | display_name text NOT NULL; name_variants stored in tenant_alias(tenant_id FK, name, UNIQUE(name))                                                                                                                                                           |
| lease        | id text PK                  | property_id text NULL FK property(id); tenant_id text NOT NULL FK tenant(id); monthly_rent_cents bigint NULL check >= 0; ar_balance_cents bigint NULL (credits allowed); start_date, end_date date NULL                                                      |
| coi_record   | id bigint PK                | tenant_id NOT NULL FK; property_id NULL FK; status check in the six values; expires_on date NULL; lease links in coi_lease(coi_id, lease_id) UNIQUE                                                                                                          |
| case         | id text PK                  | lease_id NULL FK; tenant_id NOT NULL FK; stage check in the six values; owner check in (legal, asset_management); date_sent date NULL; cure_kind, cure_days, cure_unit with check (cure_days only when kind = days); amount_owed_at_notice_cents bigint NULL |
| case_event   | id text PK                  | case_id text NOT NULL FK; type check; at timestamptz NOT NULL; effective_date date NOT NULL; actor text NOT NULL; payload jsonb NOT NULL. Insert-only: no update or delete grants; index (case_id, at, id)                                                   |
| notification | id text PK                  | case_id NOT NULL FK; dedupe_key text NOT NULL UNIQUE; status check; recipient_person_id NULL; recipe jsonb NULL; sent_at set only when status = sent                                                                                                         |
| guarantor    | case_id text PK FK case(id) | name text NOT NULL; separate table and role so one person can be erased and access is audited                                                                                                                                                                |

## Privacy

See `docs/DATA_INVENTORY.md` for the full table. In short: the guarantor SSN is never stored; the guarantor name is in its own file; the data-quality report holds ids and counts, never raw rows; notes typed in the app are redacted for SSN-shaped text before saving.

## Limits

- There is no stage history or balance history in the data, so nothing can be trended on either. Only notice dates and work done in the app have dates.
- Changes made in the app live in one browser's storage, keyed by a hash of the data. They are not shared between people and are lost when that storage is cleared or "Reset demo data" is used.
- Guarantor names reach every viewer's browser, because the prototype has no server-side data layer. The permission check hides them in the interface only. A real build would serve them from an API that checks the caller's role.
- Personas are chosen by whoever passes the shared password; there are no accounts.
- The tenant is inferred from the spelling of a name. Names that match after normalizing are merged, so two different businesses that normalize to the same name would merge, and one business under two unrelated names would split. Near-identical names that do not match are flagged, not merged.
- Legal fees are the lease's own wording, not an amount.
- The cure period is free text in the source. A bare number is read as calendar days (14 cases on the real export).
