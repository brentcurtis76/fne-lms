#!/usr/bin/env node
/**
 * T2 — the mandatory e2e spec list, and the guard that keeps it honest.
 *
 * A green e2e gate must mean "these specs ran and passed", never "these specs
 * were skipped". Playwright reports a skipped test as a success, so CI runs this
 * guard over the JSON report afterwards and fails if a mandatory spec is missing
 * from the report, contributed no tests, or had any test skipped.
 *
 * Usage:
 *   node scripts/ci/e2e-mandatory.mjs --list                    # spec paths, space separated
 *   node scripts/ci/e2e-mandatory.mjs --check <results.json>    # fail on missing/skipped
 */
import { readFileSync } from 'node:fs';

/** Every spec the e2e gate must actually execute. Add to this list, never trim it. */
export const MANDATORY_SPECS = [
  'tests/e2e/smoke.spec.ts',
  'tests/e2e/ci-fixture.spec.ts',
  // Z1c — the Zoom/session authorization surface. Each family defends a different half of
  // it: who may open a session, what is allowed inside the payload, and what survives into
  // an artifact that leaves the platform.
  'tests/e2e/zoom-join-authz.spec.ts',
  'tests/e2e/session-disclosure.spec.ts',
  'tests/e2e/session-ical.spec.ts',
  // Z1c-4 — proves ZOOM_MODE=mock actually holds: a registered job driven through the
  // running server on the fake adapter, with negative controls showing the proof fails
  // without it and that neither failure path can emit an outbound Zoom request.
  'tests/e2e/zoom-mock-mode.spec.ts',
  'tests/e2e/pasantias-page.spec.ts',
  // A6a r3: `components/Footer.tsx` is shared by every public marketing page, so
  // its heading levels are a cross-page contract. CI runs only the specs on this
  // list, which means a guard that is not on it is a guard that never runs.
  'tests/e2e/footer-heading-order.spec.ts',
  // A6b — the lead form: what the browser posts (strict boolean consent, no
  // marketing opt-in unless clicked), that a failed client validation sends
  // nothing, and that a server error loses none of the visitor's answers.
  'tests/e2e/pasantias-form.spec.ts',
  // A8 — the admin triage surface over pasantias_leads: that an admin reaches it
  // and sees a lead, and that both halves of the /admin/* gate still deny.
  'tests/e2e/pasantias-leads-admin.spec.ts',
];

/** The JSON report nests suites; flatten to one entry per spec. */
function collectSpecs(suites, out = []) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      out.push({ file: (spec.file || suite.file || '').replace(/\\/g, '/'), spec });
    }
    collectSpecs(suite.suites, out);
  }
  return out;
}

function isSkipped(test) {
  if (test.status === 'skipped') return true;
  if ((test.annotations || []).some((a) => a.type === 'skip' || a.type === 'fixme')) return true;
  const results = test.results || [];
  return results.length > 0 && results.every((r) => r.status === 'skipped');
}

function check(reportPath) {
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    console.error(`[e2e-mandatory] cannot read Playwright JSON report at ${reportPath}: ${error.message}`);
    return 1;
  }

  const specs = collectSpecs(report.suites);
  const failures = [];

  for (const mandatory of MANDATORY_SPECS) {
    // Report paths are relative to the Playwright rootDir, so match by suffix.
    const matches = specs.filter(({ file }) => file === mandatory || mandatory.endsWith(`/${file}`) || file.endsWith(mandatory));

    if (matches.length === 0) {
      failures.push(`${mandatory}: absent from the report — it did not run`);
      continue;
    }

    let executed = 0;
    for (const { spec } of matches) {
      for (const test of spec.tests || []) {
        if (isSkipped(test)) {
          failures.push(`${mandatory}: skipped test "${spec.title}"`);
        } else {
          executed += 1;
        }
      }
    }

    if (executed === 0 && !failures.some((f) => f.startsWith(`${mandatory}:`))) {
      failures.push(`${mandatory}: contributed no executed tests`);
    }
  }

  if (failures.length > 0) {
    console.error('[e2e-mandatory] FAILED — mandatory specs must run, not skip:');
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }

  console.log(`[e2e-mandatory] OK — ${MANDATORY_SPECS.length} mandatory spec(s) ran with no skips`);
  return 0;
}

function main(argv) {
  const [mode, arg] = argv;

  if (mode === '--list') {
    process.stdout.write(`${MANDATORY_SPECS.join(' ')}\n`);
    return 0;
  }

  if (mode === '--check') {
    if (!arg) {
      console.error('[e2e-mandatory] --check needs a path to the Playwright JSON report');
      return 1;
    }
    return check(arg);
  }

  console.error('[e2e-mandatory] usage: --list | --check <results.json>');
  return 1;
}

process.exit(main(process.argv.slice(2)));
