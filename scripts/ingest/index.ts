// Usage: pnpm ingest
// Reads data/raw/*.csv, writes data/seed/*.json and data/reports/data-quality.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DataQualityReportSchema } from '@/domain/schemas';
import { ingest } from './ingest';

const root = process.cwd();
const rawDir = path.join(root, 'data', 'raw');
const seedDir = path.join(root, 'data', 'seed');
const reportDir = path.join(root, 'data', 'reports');

const write = (file: string, value: unknown) =>
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

async function main() {
  const read = (name: string) => readFile(path.join(rawDir, name), 'utf8');
  const { seed, issues } = ingest({
    properties: await read('properties.csv'),
    leases: await read('leases.csv'),
    notices: await read('notices.csv'),
    coi: await read('coi_status.csv'),
  });
  DataQualityReportSchema.parse(issues);

  await mkdir(seedDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });
  const { meta, ...collections } = seed;
  await write(path.join(seedDir, 'meta.json'), meta);
  for (const [name, value] of Object.entries(collections)) {
    await write(path.join(seedDir, `${name}.json`), value);
  }
  await write(path.join(reportDir, 'data-quality.json'), issues);

  // Counts only: no row contents are ever printed.
  const byRule = new Map<string, number>();
  for (const issue of issues) byRule.set(issue.ruleId, (byRule.get(issue.ruleId) ?? 0) + 1);
  console.log(
    `Ingested ${seed.properties.length} properties, ${seed.tenants.length} tenants, ` +
      `${seed.leases.length} leases, ${seed.cases.length} cases, ${seed.events.length} events, ` +
      `${seed.coi.length} COI records. Data date ${meta.dataAsOf}.`,
  );
  console.log(`Issues: ${issues.length}`);
  for (const [rule, count] of [...byRule].sort()) console.log(`  ${rule}: ${count}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Ingest failed');
  process.exit(1);
});
