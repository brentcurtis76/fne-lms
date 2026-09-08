/**
 * Pilot provisioning proof on REAL local Postgres (review remediation R8,
 * R9, R10): the four stages run through the Supabase-JS store against the
 * loopback stack (PostgREST + the real publish service under `node --import
 * tsx`), never through the target guard — that guard refuses loopback by
 * design and is unit-tested on its own; this script asserts the loopback
 * host itself and refuses anything else.
 *
 * What it proves, in order:
 *   1. schema attestation on a fresh reset matches the committed expectation
 *      (config/pilot-schema-attestation.json) and a wrong expectation stops
 *      preflight, verify and reset (drift path, R10);
 *   2. preflight → apply → verify on the synthetic manifest; a second apply is
 *      a no-op with the same digest; verify attests the snapshot CONTENT
 *      (R8) — and a tampered snapshot_data row fails verify until restored;
 *   3. cascade-owned descendants: a sub-question under an owned indicator
 *      (a row the old inventory never saw) and an instance on an owned
 *      snapshot each make the reset refuse with nothing deleted (R9);
 *   4. with nothing foreign the reset removes exactly the owned subtree, and
 *      a fresh apply reproduces the same digests (deterministic rerun);
 *   5. the failure audit path of the CLI is exercised separately by Vitest.
 *
 * Synthetic data only. The script seeds the two ab_grades rows the synthetic
 * manifest needs when they are absent and removes them again; it leaves the
 * database as it found it. Run with `npm run test:pilot-reset-cascade`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import { runApply } from '../pilot-provisioning/apply.mjs';
import { loadManifest } from '../pilot-provisioning/manifest.mjs';
import { runPreflight } from '../pilot-provisioning/preflight.mjs';
import { runReset } from '../pilot-provisioning/reset.mjs';
import { loadSchemaAttestationConfig } from '../pilot-provisioning/schema-attestation.mjs';
import { createSupabaseStore } from '../pilot-provisioning/store.mjs';
import { runVerify } from '../pilot-provisioning/verify.mjs';

const PROOF_TAG = 'pilot-reset-cascade';
const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

function fail(message) {
  console.error(`\n✗ FAIL [${PROOF_TAG}]: ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}
function ok(message) {
  console.log(`  ✓ ${message}`);
}

/** Loopback API URL and service key from the running local stack (never printed). */
function localStack() {
  const out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', cwd: REPO_ROOT });
  const get = (key) => out.match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))?.[1];
  const url = get('API_URL');
  const key = get('SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('supabase status did not expose API_URL / SERVICE_ROLE_KEY — is the local stack running?');
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`refusing non-loopback API host "${host}"`);
  return { url, key };
}

async function main() {
  const { url, key } = localStack();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const service = await import(pathToFileURL(resolve(REPO_ROOT, 'lib/services/assessment-builder/publishTemplate.ts')).href);
  const lockDir = mkdtempSync(join(tmpdir(), 'pilot-proof-'));
  const store = createSupabaseStore({ client, publishTemplate: service.publishTemplate, actorId: '00000000-0000-0000-0000-000000000000', lockDir });
  const manifest = loadManifest(resolve(REPO_ROOT, 'config/pilot-manifests/pc-pilot-synthetic-v1.json'));
  const schemaExpectation = loadSchemaAttestationConfig(REPO_ROOT);
  const target = Object.freeze({ targetName: 'staging', projectRef: 'loopbackproofnotareal', environmentClass: 'staging', supabaseUrl: url });
  const stages = { store, manifest, target, schemaExpectation };

  const seededGrades = [];
  const raw = async (table) => client.from(table);
  const must = async (promise, what) => {
    const { data, error } = await promise;
    if (error) fail(`${what}: ${error.message}`);
    return data;
  };

  try {
    // Fixture grades the synthetic manifest resolves by sort_order.
    for (const grade of manifest.grades) {
      const existing = await must((await raw('ab_grades')).select('id,name,is_always_gt').eq('sort_order', grade.sortOrder), 'read ab_grades');
      if (existing.length === 0) {
        const id = 990000 + grade.sortOrder;
        await must((await raw('ab_grades')).insert({ id, name: grade.expectedName, sort_order: grade.sortOrder, is_always_gt: grade.isAlwaysGt }), 'seed ab_grades');
        seededGrades.push(id);
      }
    }
    console.log(`[${PROOF_TAG}] loopback stack accepted; ${seededGrades.length} ab_grades fixture row(s) seeded`);

    // Leave nothing from an earlier interrupted run.
    const stale = await runPreflight(stages);
    if (Object.keys(stale.plan.skips).length > 0 || Object.keys(stale.plan.updates).length > 0) {
      await runReset(stages);
      ok('cleaned up owned rows left by an earlier run');
    }

    console.log('\n[1] schema attestation (R10)');
    const preflight = await runPreflight(stages);
    if (!preflight.schema.attestation.ok) fail(`attestation did not match on a fresh reset: ${preflight.stops.join('; ')}`);
    if (preflight.schema.attestation.digest !== schemaExpectation.expectedDigest) fail('attestation digest differs from the committed expectation');
    ok(`attestation digest ${preflight.schema.attestation.digest.slice(0, 16)}… matches config/pilot-schema-attestation.json`);
    const wrong = { ...schemaExpectation, expectedDigest: 'f'.repeat(64) };
    const drift = await runPreflight({ ...stages, schemaExpectation: wrong });
    if (drift.ok || !drift.stops[0].includes('schema attestation: digest')) fail('preflight did not stop on a wrong expectation');
    const driftVerify = await runVerify({ ...stages, schemaExpectation: wrong });
    if (driftVerify.ok || !driftVerify.failures[0].includes('schema attestation')) fail('verify did not stop on a wrong expectation');
    let driftReset = null;
    await runReset({ ...stages, schemaExpectation: wrong }).catch((e) => { driftReset = e; });
    if (!driftReset || !driftReset.message.includes('schema attestation')) fail('reset did not stop on a wrong expectation');
    ok('a wrong expectation stops preflight, verify and reset (no bypass)');
    if (!preflight.ok) fail(`preflight is not clean on the fresh database: ${[...preflight.stops, ...preflight.conflicts].join('; ')}`);

    console.log('\n[2] apply → verify → apply again (R8 content attestation, idempotence)');
    const first = await runApply({ ...stages, operator: 'proof-operator' });
    if (!first.ok || first.noop) fail('first apply did not create the configuration');
    if (first.published.length !== manifest.templates.length) fail(`published ${first.published.length}, expected ${manifest.templates.length}`);
    const verify1 = await runVerify(stages);
    if (!verify1.ok) fail(`verify after apply failed: ${verify1.failures.join('; ')}`);
    if (!verify1.snapshots.every((s) => /^[0-9a-f]{64}$/.test(s.contentDigest))) fail('verify did not digest the snapshot content');
    ok(`first apply published ${first.published.length} template(s); verify attested ${verify1.snapshots.length} snapshot payload(s)`);
    const second = await runApply({ ...stages, operator: 'proof-operator' });
    if (!second.noop) fail('second apply was not a no-op');
    if (second.verify.observedDigest !== verify1.observedDigest) fail('second apply changed the observed digest');
    ok('second apply is a no-op with the same digest');

    // Tamper: mutate a persisted snapshot payload.
    const ownedTemplateIds = (await must((await raw('assessment_templates')).select('id').eq('grade_id', 990005), 'read templates')).map((t) => t.id);
    const snapRows = await must((await raw('assessment_template_snapshots')).select('id,snapshot_data').in('template_id', ownedTemplateIds), 'read snapshots');
    if (snapRows.length === 0) fail('no owned snapshot found for tampering');
    const victim = snapRows[0];
    const tampered = structuredClone(victim.snapshot_data);
    tampered.objectives[0].modules[0].indicators[0].weight = 99;
    await must((await raw('assessment_template_snapshots')).update({ snapshot_data: tampered }).eq('id', victim.id), 'tamper snapshot');
    const tamperedVerify = await runVerify(stages);
    if (tamperedVerify.ok || !tamperedVerify.failures.some((f) => f.includes('snapshot_data differs') && f.includes('weight'))) {
      fail(`verify accepted a tampered snapshot payload: ${tamperedVerify.failures.join('; ')}`);
    }
    const tamperedPreflight = await runPreflight(stages);
    if (tamperedPreflight.ok) fail('preflight accepted a tampered snapshot payload');
    await must((await raw('assessment_template_snapshots')).update({ snapshot_data: victim.snapshot_data }).eq('id', victim.id), 'restore snapshot');
    const restored = await runVerify(stages);
    if (!restored.ok || restored.observedDigest !== verify1.observedDigest) fail('restored snapshot does not verify back to the original digest');
    ok('a tampered snapshot_data fails verify and preflight; restoring it verifies again with the same digest');

    console.log('\n[3] cascade-owned descendants block the reset (R9)');
    const indicator = (await must((await raw('assessment_indicators')).select('id').in('module_id',
      (await must((await raw('assessment_modules')).select('id').in('template_id', ownedTemplateIds), 'read modules')).map((m) => m.id)).limit(1), 'read indicator'))[0];
    const subQuestion = await must((await raw('assessment_sub_questions')).insert({
      indicator_id: indicator.id, question_text: 'Sub-pregunta sintética de prueba', question_type: 'text', trigger_condition: {}, display_order: 1,
    }).select('id').single(), 'insert sub-question');
    let refused = null;
    await runReset(stages).catch((e) => { refused = e; });
    if (!refused || !refused.message.includes('assessment_sub_questions.indicator_id->assessment_indicators=1 [CASCADE]')) {
      fail(`reset did not refuse the cascade-owned sub-question: ${refused?.message}`);
    }
    const stillThere = await must((await raw('assessment_sub_questions')).select('id').eq('id', subQuestion.id), 'reread sub-question');
    if (stillThere.length !== 1) fail('the refused reset deleted the sub-question');
    const templatesAfter = await must((await raw('assessment_templates')).select('id').in('id', ownedTemplateIds), 'reread templates');
    if (templatesAfter.length !== ownedTemplateIds.length) fail('the refused reset deleted owned templates');
    await must((await raw('assessment_sub_questions')).delete().eq('id', subQuestion.id), 'remove sub-question');
    ok('a sub-question under an owned indicator refuses the reset and nothing is deleted');

    const instance = await must((await raw('assessment_instances')).insert({ template_snapshot_id: victim.id, school_id: null, transformation_year: 1, status: 'archived' }).select('id').single(), 'insert instance');
    refused = null;
    await runReset(stages).catch((e) => { refused = e; });
    if (!refused || !/instancesOnOwnedSnapshots=1|assessment_instances\.template_snapshot_id->assessment_template_snapshots=1/.test(refused.message)) {
      fail(`reset did not refuse the instance on an owned snapshot: ${refused?.message}`);
    }
    await must((await raw('assessment_instances')).delete().eq('id', instance.id), 'remove instance');
    ok('an assessment instance on an owned snapshot refuses the reset');

    console.log('\n[3b] snapshot attestation gate of the reset (Codex round 1, finding 4)');
    // Duplicate SAME-VERSION snapshot: the real database refuses it outright
    // (unique (template_id, version)), so the reset gate's duplicate branch can
    // only be reached on a store without that constraint (fake-store proof in
    // stages.test.ts). Here the proof is the constraint itself.
    const victimRow = (await must((await raw('assessment_template_snapshots')).select('id,template_id,version,snapshot_data').eq('id', victim.id), 'reread victim'))[0];
    const dupAttempt = await (await raw('assessment_template_snapshots')).insert({
      template_id: victimRow.template_id, version: victimRow.version, snapshot_data: victimRow.snapshot_data,
    }).select('id');
    if (!dupAttempt.error || dupAttempt.error.code !== '23505') {
      fail(`the database accepted a duplicate same-version snapshot (expected 23505): ${dupAttempt.error?.code ?? 'no error'}`);
    }
    const snapshotsBefore = (await must((await raw('assessment_template_snapshots')).select('id').in('template_id', ownedTemplateIds), 'count snapshots')).length;
    ok('a duplicate same-version snapshot is impossible at the database (23505 on assessment_template_snapshots_template_id_version_key)');

    // EXTRA other-version snapshot on an owned template: refuse, delete nothing.
    const extra = await must((await raw('assessment_template_snapshots')).insert({
      template_id: victimRow.template_id, version: '9.9.9', snapshot_data: victimRow.snapshot_data,
    }).select('id').single(), 'insert extra other-version snapshot');
    refused = null;
    await runReset(stages).catch((e) => { refused = e; });
    if (!refused || !/not the attested expected-version snapshot/.test(refused.message)) {
      fail(`reset did not refuse the extra other-version snapshot: ${refused?.message}`);
    }
    const snapshotsAfterExtra = (await must((await raw('assessment_template_snapshots')).select('id').in('template_id', ownedTemplateIds), 'recount snapshots')).length;
    if (snapshotsAfterExtra !== snapshotsBefore + 1) fail('the refused reset deleted a snapshot (extra case)');
    const templatesAfterExtra = await must((await raw('assessment_templates')).select('id').in('id', ownedTemplateIds), 'reread templates after extra refusal');
    if (templatesAfterExtra.length !== ownedTemplateIds.length) fail('the refused reset deleted owned templates');
    await must((await raw('assessment_template_snapshots')).delete().eq('id', extra.id), 'remove extra snapshot');
    ok('an extra other-version snapshot on an owned template refuses the reset and zero rows are deleted');

    // Tampered payload: refuse, delete nothing.
    await must((await raw('assessment_template_snapshots')).update({ snapshot_data: tampered }).eq('id', victim.id), 'tamper snapshot again');
    refused = null;
    await runReset(stages).catch((e) => { refused = e; });
    if (!refused || !/snapshot_data differs/.test(refused.message)) fail(`reset did not refuse the tampered snapshot: ${refused?.message}`);
    const snapshotsAfterTamper = (await must((await raw('assessment_template_snapshots')).select('id').in('template_id', ownedTemplateIds), 'recount after tamper')).length;
    if (snapshotsAfterTamper !== snapshotsBefore) fail('the refused reset deleted a snapshot (tamper case)');
    await must((await raw('assessment_template_snapshots')).update({ snapshot_data: victim.snapshot_data }).eq('id', victim.id), 'restore snapshot again');
    ok('a tampered snapshot payload refuses the reset and zero rows are deleted');

    console.log('\n[4] clean reset and deterministic rerun');
    const reset = await runReset(stages);
    if (!reset.ok) fail('reset did not succeed with nothing foreign');
    const remaining = await must((await raw('assessment_templates')).select('id').in('id', ownedTemplateIds), 'reread templates after reset');
    if (remaining.length !== 0) fail('owned templates survived the reset');
    const school = await must((await raw('schools')).select('id').eq('id', manifest.syntheticSchool.id), 'reread school');
    if (school.length !== 0) fail('the synthetic school survived the reset');
    ok(`reset removed the owned subtree (${Object.entries(reset.deleted).map(([t, n]) => `${t}=${n}`).join(', ')})`);
    const again = await runApply({ ...stages, operator: 'proof-operator' });
    if (again.verify.observedDigest !== verify1.observedDigest) fail('re-apply after reset produced a different digest');
    if (JSON.stringify(again.verify.snapshots.map((s) => s.contentDigest)) !== JSON.stringify(verify1.snapshots.map((s) => s.contentDigest))) fail('re-apply produced different snapshot content digests');
    ok('re-apply after reset reproduces the same state and snapshot content digests');
    await runReset(stages);
    ok('final reset left no owned rows behind');

    console.log(`\n✓ PASS [${PROOF_TAG}] (synthetic data only; loopback stack)`);
  } finally {
    for (const id of seededGrades) {
      await (await raw('ab_grades')).delete().eq('id', id);
    }
    rmSync(lockDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  if (process.exitCode !== 1) {
    console.error(`\n✗ FAIL [${PROOF_TAG}]: ${error.message}\n`);
    process.exitCode = 1;
  }
});
