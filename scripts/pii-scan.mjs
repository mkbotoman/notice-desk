// Fails if any tracked or untracked-but-not-ignored file, or the built client bundle, contains
// something shaped like an SSN. Reports file:line only; the matched text is never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// \b\d{3}-?\d{2}-?\d{4}\b, minus values embedded in a longer token or a decimal
// (SVG path coordinates like 0.000116771 otherwise match).
export const SSN_PATTERN = /(?<![\w.])\d{3}-?\d{2}-?\d{4}(?!\w|\.\d)/;

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.pdf',
]);
const SKIP_FILES = new Set(['pnpm-lock.yaml']);
const MAX_BYTES = 5_000_000;

/** 1-based line numbers of lines matching the SSN pattern. */
export function findSsnLines(text) {
  const lines = [];
  text.split('\n').forEach((line, i) => {
    if (SSN_PATTERN.test(line)) lines.push(i + 1);
  });
  return lines;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function candidateFiles(root) {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const built = ['.next/static', '.next/server']
    .map((d) => path.join(root, d))
    .filter(existsSync)
    .flatMap(walk)
    .map((f) => path.relative(root, f));
  return [...new Set([...listed, ...built])];
}

/** Returns [{ file, lines }] for every file with a match that is not allowlisted. */
export function scan(root, allowlist = []) {
  const allowed = new Set(allowlist.map((a) => a.path));
  const hits = [];
  for (const file of candidateFiles(root)) {
    if (allowed.has(file) || SKIP_FILES.has(path.basename(file))) continue;
    if (SKIP_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const full = path.join(root, file);
    if (!existsSync(full) || statSync(full).size > MAX_BYTES) continue;
    const lines = findSsnLines(readFileSync(full, 'utf8'));
    if (lines.length) hits.push({ file, lines });
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const allowlistPath = path.join(root, 'scripts', 'pii-allowlist.json');
  const allowlist = existsSync(allowlistPath)
    ? JSON.parse(readFileSync(allowlistPath, 'utf8'))
    : [];
  const hits = scan(root, allowlist);
  if (hits.length) {
    console.error('PII scan failed: SSN-shaped values found (values not shown).');
    for (const { file, lines } of hits) console.error(`  ${file}: line ${lines.join(', ')}`);
    process.exit(1);
  }
  console.log('PII scan clean.');
}
