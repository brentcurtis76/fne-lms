#!/usr/bin/env node
// Runs the browser test files CI skips, one file at a time, each on the plain seeded database (snapshot "seed"),
// with the same settings scripts/ci/e2e-local.sh gives a spec named on its command line (CI=1, no retries, one
// worker, the production build served by Playwright itself). Writes what passed and what did not.
//
//   node scripts/redesign/harness/specs-baseline.mjs              all skipped files → docs/plan/redesign/harness/specs-baseline.json
//   node scripts/redesign/harness/specs-baseline.mjs --again      run the files that had a failure once more; a test that
//                                                                 fails in one run and passes in the other is marked "unsteady"
//   node scripts/redesign/harness/specs-baseline.mjs --compare    run everything again and list what is WORSE than the kept list
//   node scripts/redesign/harness/specs-baseline.mjs tests/e2e/x.spec.ts …   only these files (with --compare: compare only these)
//
// Later phases compare against this list, not against "all green".
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, STATE, stack } from './lib.mjs';

const OUT = join(ROOT, 'docs', 'plan', 'redesign', 'harness', 'specs-baseline.json');
const args = process.argv.slice(2);
const again = args.includes('--again'); const compare = args.includes('--compare');
const named = args.filter((a) => !a.startsWith('--'));
const STACK = join(ROOT, 'scripts/redesign/harness/stack.sh');
const st = stack();

function allSpecs(dir = join(ROOT, 'tests')) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...allSpecs(p)); else if (f.endsWith('.spec.ts')) out.push(p.slice(ROOT.length + 1));
  }
  return out.sort();
}
const mandatory = new Set(execFileSync('node', ['scripts/ci/e2e-mandatory.mjs', '--list'], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\s+/));
const skipped = allSpecs().filter((f) => !mandatory.has(f));

// The settings e2e-local.sh gives a spec (its CI_ENV plus CI=1 and the explicit-run marks), in a scrubbed environment.
const ciEnv = {
  NEXT_PUBLIC_SUPABASE_URL: st.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: st.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: st.SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: st.DB_URL, ZOOM_MODE: 'mock', CRON_SECRET: 'e2e-synthetic-cron-secret-not-a-real-credential',
  NEXT_PUBLIC_BASE_URL: `http://localhost:${st.APP_PORT}`, FEATURE_ZOOM_MEETINGS: 'true', NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS: 'true',
};
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG || 'C.UTF-8', TMPDIR: process.env.TMPDIR || '/tmp',
  CI: '1', E2E_PORT: st.APP_PORT, E2E_LOCAL_EXPLICIT: '1', E2E_LOCAL_PROJECT_ID: st.PROJECT_ID, ...ciEnv,
};

function flatten(suite, file, out, path = []) {
  for (const s of suite.suites || []) flatten(s, file, out, s.title && s.title !== file && !s.title.endsWith('.spec.ts') ? [...path, s.title] : path);
  for (const spec of suite.specs || []) {
    const results = spec.tests.flatMap((t) => t.results.map((r) => r.status));
    const status = spec.tests.every((t) => t.status === 'skipped') ? 'skipped' : spec.ok ? 'passed' : (results.includes('timedOut') ? 'timedOut' : 'failed');
    out[[...path, spec.title].join(' › ')] = status;
  }
}

function runFile(file) {
  execFileSync(STACK, ['restore', 'seed', 'none'], { stdio: 'ignore' });
  const report = join(STATE, 'spec-report.json');
  rmSync(report, { force: true });
  const t0 = Date.now();
  const r = spawnSync('npx', ['playwright', 'test', file, '--project=chromium', '--retries=0', '--reporter=json'], {
    cwd: ROOT, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: report }, encoding: 'utf8', timeout: 25 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const tests = {};
  let note = null;
  if (existsSync(report)) {
    const j = JSON.parse(readFileSync(report, 'utf8'));
    for (const s of j.suites || []) flatten(s, file, tests);
    if ((j.errors || []).length) note = String(j.errors[0].message || '').split('\n')[0].slice(0, 200);
  } else note = r.error ? `did not finish: ${r.error.message}` : `no report (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().split('\n').slice(-1)[0].slice(0, 200)}`;
  if (!Object.keys(tests).length && !note) note = 'no tests ran (the file may be left out by the Playwright settings)';
  return { tests, note, seconds: Math.round((Date.now() - t0) / 1000) };
}

// Several specs read .env.local directly; e2e-local.sh writes it for the run and removes it afterwards. So do we.
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) { console.error('Refusing: .env.local exists in the checkout.'); process.exit(2); }
writeFileSync(envFile, `${Object.entries(ciEnv).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { flag: 'wx' });
let kept = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
try {
  execFileSync(STACK, ['unserve'], { stdio: 'ignore' });
  let files = named.length ? named : skipped;
  if (again) {
    if (!kept) throw new Error('nothing kept yet; run without --again first');
    files = (named.length ? named : Object.keys(kept.files)).filter((f) => kept.files[f].note || Object.values(kept.files[f].tests).some((s) => s === 'failed' || s === 'timedOut'));
  }
  const fresh = {};
  for (const [i, f] of files.entries()) {
    process.stdout.write(`[${i + 1}/${files.length}] ${f} … `);
    fresh[f] = runFile(f);
    const c = Object.values(fresh[f].tests);
    console.log(`${c.filter((s) => s === 'passed').length} passed, ${c.filter((s) => s === 'failed' || s === 'timedOut').length} failed, ${c.filter((s) => s === 'skipped').length} skipped${fresh[f].note ? ` — ${fresh[f].note}` : ''} (${fresh[f].seconds} s)`);
  }
  if (compare) {
    if (!kept) throw new Error('nothing kept to compare with');
    const worse = [];
    for (const [f, now] of Object.entries(fresh)) {
      const before = kept.files[f]; if (!before) { worse.push(`${f}: not in the kept list`); continue; }
      for (const [t, was] of Object.entries(before.tests)) {
        const is = now.tests[t];
        if (was === 'passed' && is !== 'passed') worse.push(`${f} › ${t}: passed before, now ${is || 'missing'}`);
      }
    }
    console.log(worse.length ? `\nWORSE than the kept list (${worse.length}):\n  ${worse.join('\n  ')}` : '\nNO WORSE than the kept list.');
    process.exitCode = worse.length ? 1 : 0;
  } else {
    if (again) {
      for (const [f, now] of Object.entries(fresh)) {
        const before = kept.files[f];
        for (const [t, is] of Object.entries(now.tests)) {
          const was = before.tests[t];
          if (was !== undefined && was !== is && [was, is].includes('passed')) before.tests[t] = 'unsteady';
        }
        if (before.note && !now.note && Object.keys(now.tests).length) { before.note = null; before.tests = { ...now.tests, ...before.tests }; }
      }
      kept.rerunOfFailures = new Date().toISOString();
    } else {
      kept = kept && named.length ? kept : { files: {} };
      Object.assign(kept.files, fresh);
      kept.ran = new Date().toISOString();
    }
    kept.commit = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    kept.builtCommit = existsSync(join(STATE, 'built-commit')) ? readFileSync(join(STATE, 'built-commit'), 'utf8').trim() : null;
    kept.how = 'each file alone, on the plain seeded database (snapshot seed), CI=1, no retries, one worker';
    const totals = { passed: 0, failed: 0, timedOut: 0, skipped: 0, unsteady: 0 };
    for (const f of Object.values(kept.files)) for (const s of Object.values(f.tests)) totals[s] += 1;
    kept.totals = totals;
    kept.files = Object.fromEntries(Object.entries(kept.files).sort());
    mkdirSync(join(ROOT, 'docs/plan/redesign/harness'), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(kept, null, 1)}\n`);
    console.log(`\nKept in ${OUT}: ${JSON.stringify(totals)}`);
  }
} finally {
  rmSync(envFile, { force: true });
}
