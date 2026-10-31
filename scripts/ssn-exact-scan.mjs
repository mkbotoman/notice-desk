// Looks for the exact guarantor SSNs from data/raw/notices.csv anywhere they could leak: tracked
// files, the built output, and every commit in git history. Prints counts and locations only,
// never a value. Skips quietly when the raw file is not on this machine.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const root = process.cwd();
const rawPath = path.join(root, 'data/raw/notices.csv');
if (!existsSync(rawPath)) {
  console.log('ssn-exact-scan: data/raw/notices.csv not present, skipped.');
  process.exit(0);
}

const rows = parse(readFileSync(rawPath, 'utf8'), { columns: true, skip_empty_lines: true });
const values = [...new Set(rows.map((r) => String(r.guarantor_ssn ?? '').trim()).filter(Boolean))];
const needles = new Set();
for (const v of values) {
  const digits = v.replace(/\D/g, '');
  needles.add(v);
  if (digits.length === 9) {
    needles.add(digits);
    needles.add(`${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`);
  }
}
const list = [...needles];
console.log(
  `ssn-exact-scan: checking ${values.length} distinct values (${list.length} spellings).`,
);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
const hits = [];

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);
const built = existsSync('.next') ? walk('.next').map((f) => path.relative(root, f)) : [];
const files = [...new Set([...tracked, ...built])].filter((f) => !f.startsWith('data/raw/'));
for (const f of files) {
  let text;
  try {
    text = readFileSync(path.join(root, f), 'latin1');
  } catch {
    continue;
  }
  if (list.some((n) => text.includes(n))) hits.push(`file ${f}`);
}

for (const n of list) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--all', '-F', `-S${n}`, '--format=%h', '--', '.', ':!data/raw'],
      {
        encoding: 'utf8',
      },
    ).trim();
    if (out) hits.push(`history commits ${out.split('\n').join(',')}`);
  } catch {
    // no match
  }
}

if (hits.length) {
  console.error(`FOUND exact SSN values in:\n${[...new Set(hits)].join('\n')}`);
  process.exit(1);
}
console.log(`ssn-exact-scan: clean (${files.length} files, ${built.length} built, full history).`);
