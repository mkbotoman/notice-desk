# Raw source data

Place the four CSVs exactly as delivered in this folder:

- `properties.csv`
- `leases.csv`
- `notices.csv`
- `coi_status.csv`

Everything here except this file is gitignored. `notices.csv` contains guarantor SSNs, so these
files must never be committed, pasted into prompts, or copied elsewhere. `pnpm ingest` reads them
and writes cleaned JSON to `data/seed/`, with the SSN column dropped.
