/**
 * Exact-value credential scan.
 *
 * Reads every secret out of `.env.spike.local` (gitignored) and requires each one
 * to have ZERO occurrences — in git-tracked files at HEAD, and in the FULL history
 * of this phase's commits, because a value removed in a later commit is still
 * published by the earlier one.
 *
 * Exact values, not patterns: a pattern scan tells you a string looked
 * secret-shaped, which is a different question from whether THIS account's secret
 * is in the repo. Sibling check: `scan-identifiers.mjs`, which covers the wider
 * class of provider-minted identifiers that are not credentials at all.
 *
 * Usage:
 *   node scripts/spikes/webhook/scan-credentials.mjs [--base <sha>]
 *
 * Exit code 1 on any hit.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, '.env.spike.local');
const baseIndex = process.argv.indexOf('--base');
const BASE = baseIndex === -1 ? 'main' : process.argv[baseIndex + 1];

if (!existsSync(ENV_FILE)) {
  console.error('no .env.spike.local — cannot scan for exact values');
  process.exit(2);
}

const env = {};
for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

/**
 * Every key whose value must never appear. `ZOOM_LICENSED_HOST_EMAIL` is scanned
 * but reported separately: it is FNE's published institutional address, present in
 * ~20 unrelated repo files that predate this branch, so it is a declared
 * non-finding rather than a leak. Everything else is a hard failure.
 */
const SECRET_KEYS = [
  'ZOOM_S2S_ACCOUNT_ID',
  'ZOOM_S2S_CLIENT_ID',
  'ZOOM_S2S_CLIENT_SECRET',
  'ZOOM_WEBHOOK_SECRET_TOKEN',
  'ZOOM_SDK_CLIENT_ID',
  'ZOOM_SDK_CLIENT_SECRET',
];
const DECLARED_PUBLIC_KEYS = ['ZOOM_LICENSED_HOST_EMAIL'];

function grepTracked(value) {
  try {
    return execFileSync('git', ['grep', '-n', '-I', '-F', '--', value], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString('utf8')
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    if (err.status === 1) return [];
    throw err;
  }
}

/** Searches the phase's commit range, so a value deleted later is still caught. */
function grepHistory(value, range) {
  try {
    // -S with no --pickaxe-regex is a fixed-string search, which is what we want.
    return execFileSync('git', ['log', '-S', value, '--oneline', range], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString('utf8')
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    if (err.status === 1) return [];
    throw err;
  }
}

const range = `${BASE}..HEAD`;
const commitCount = execFileSync('git', ['rev-list', '--count', range], { cwd: ROOT })
  .toString('utf8')
  .trim();
const trackedCount = execFileSync('git', ['ls-files'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  .toString('utf8')
  .split('\n')
  .filter(Boolean).length;

console.log('=== EXACT-VALUE CREDENTIAL SCAN ===');
console.log(`env file            : .env.spike.local (gitignored)`);
console.log(`values scanned      : ${SECRET_KEYS.length} secret + ${DECLARED_PUBLIC_KEYS.length} declared-public`);
console.log(`tracked files @HEAD : ${trackedCount}`);
console.log(`history range       : ${range} (${commitCount} commits)`);
console.log('');

let failures = 0;
for (const key of SECRET_KEYS) {
  const value = env[key];
  if (!value) {
    console.log(`  ${key.padEnd(26)} (absent from env — not scanned)`);
    continue;
  }
  const tracked = grepTracked(value);
  const history = grepHistory(value, range);
  const ok = tracked.length === 0 && history.length === 0;
  if (!ok) failures += 1;
  console.log(`  ${key.padEnd(26)} ${ok ? 'CLEAN' : 'LEAK'}  tracked=${tracked.length} commits=${history.length}`);
  for (const t of tracked) console.log(`      @HEAD  ${t.split(':').slice(0, 2).join(':')}`);
  for (const h of history) console.log(`      commit ${h}`);
}

console.log('');
for (const key of DECLARED_PUBLIC_KEYS) {
  const value = env[key];
  if (!value) continue;
  const tracked = grepTracked(value);
  const phaseFiles = tracked.filter((line) => {
    const file = line.split(':')[0];
    return (
      file.startsWith('__tests__/lib/zoom/') ||
      file.startsWith('lib/zoom/') ||
      file.startsWith('scripts/spikes/') ||
      file.startsWith('docs/planning/zoom') ||
      file.startsWith('pages/api/meet/') ||
      file.startsWith('pages/meet/')
    );
  });
  console.log(`  ${key.padEnd(26)} DECLARED PUBLIC (FNE's published contact address)`);
  console.log(`      total tracked occurrences   : ${tracked.length} (pre-existing, unrelated files)`);
  console.log(`      inside Zoom-phase artifacts : ${phaseFiles.length}  <- must be 0`);
  for (const f of phaseFiles) console.log(`         ${f.split(':').slice(0, 2).join(':')}`);
  if (phaseFiles.length > 0) failures += 1;
}

console.log(failures === 0 ? '\nPASS — no credential value in any tracked file or phase commit.' : '\nFAIL');
process.exit(failures === 0 ? 0 : 1);
