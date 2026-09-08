import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runApply } from '../../../scripts/pilot-provisioning/apply.mjs';
import { buildDesiredState, idFor, loadManifest, prepareManifest } from '../../../scripts/pilot-provisioning/manifest.mjs';
import { runPreflight } from '../../../scripts/pilot-provisioning/preflight.mjs';
import { assertResettable, attestSnapshotsForReset, runReset } from '../../../scripts/pilot-provisioning/reset.mjs';
import { WRITE_TABLES, DELETE_TABLES } from '../../../scripts/pilot-provisioning/store.mjs';
import { runVerify } from '../../../scripts/pilot-provisioning/verify.mjs';
import { createFakeStore, fakeSchemaAttestation, fakeSchemaExpectation, type FakeStore } from './fake-store';
import { computeSchemaDigest } from '../../../scripts/pilot-provisioning/schema-attestation.mjs';

const SYNTHETIC = resolve(__dirname, '../../../config/pilot-manifests/pc-pilot-synthetic-v1.json');
const manifest = loadManifest(SYNTHETIC);
const schemaExpectation = fakeSchemaExpectation();
const V = manifest.manifestVersion;

const stagingTarget = Object.freeze({
  targetName: 'staging',
  projectRef: 'abcdefghijklmnopqrst',
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  environmentClass: 'staging',
  keyEnv: 'PILOT_STAGING_SERVICE_ROLE_KEY',
  keyShape: 'opaque',
});
const productionTarget = Object.freeze({ ...stagingTarget, targetName: 'realPilot', projectRef: 'zyxwvutsrqponmlkjihg', environmentClass: 'production' });

const NEVER_WRITTEN = [
  'assessment_instances',
  'assessment_instance_assignees',
  'assessment_responses',
  'school_course_structure',
  'school_course_docente_assignments',
  'school_transversal_context',
  'profiles',
  'user_roles',
];

function state() {
  return buildDesiredState(manifest, new Map([['1_basico', 5], ['5_basico', 9]]));
}

function writtenTables(store: FakeStore) {
  return [...new Set(store.writes.map((w) => w.table))];
}

async function applyOnce(store: FakeStore) {
  return runApply({ store, manifest, target: stagingTarget, schemaExpectation, operator: 'operator-one' });
}

/** A real-pilot manifest built from the synthetic one (same instruments, real-mode envelope). */
function realManifest(overrides: Record<string, unknown> = {}) {
  const raw = JSON.parse(JSON.stringify(manifest));
  delete raw.digest;
  delete raw.syntheticSchool;
  delete raw.syntheticMarker;
  delete raw.rehearsalPersonas;
  raw.manifestVersion = 'pc-pilot-test-v1';
  raw.mode = 'realPilot';
  raw.target = 'realPilot';
  raw.environmentClass = 'production';
  raw.pilotSchoolId = 4242;
  raw.templates[0].name = 'Evaluación 1° Básico';
  raw.templates[1].name = 'Aprendizaje 5° Básico';
  return prepareManifest({ ...raw, ...overrides });
}

describe('pilot provisioning stages (synthetic rehearsal)', () => {
  it('preflight on an empty staging plans every create, touches nothing and is read-only', async () => {
    const store = createFakeStore();
    const plan = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(true);
    expect(plan.readOnly).toBe(true);
    expect(plan.plan.creates).toEqual({
      schools: 1,
      assessment_templates: 2,
      assessment_objectives: 2,
      assessment_modules: 2,
      assessment_indicators: 6,
      assessment_year_expectations: 9,
      assessment_entity_year_weights: 3,
      assessment_template_snapshots: 2,
      ab_migration_plan: 4,
    });
    expect(plan.plan.updates).toEqual({ assessment_templates: 2 });
    expect(plan.publishNeeded).toEqual(['eva-1b', 'apr-5b']);
    expect(plan.gradeMapping).toEqual({ '1_basico': 5, '5_basico': 9 });
    expect(plan.stops).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.untouchedTables).toContain('assessment_instances');
    expect(plan.warnings.join('\n')).toMatch(/creates no users/);
    expect(store.writes).toEqual([]);
    expect(JSON.stringify(plan)).not.toMatch(/sb_|ey[J]|@example\.com/);
  });

  it('first apply creates the expected configuration and publishes through the store service hook', async () => {
    const store = createFakeStore();
    const result = await applyOnce(store);
    expect(result.ok).toBe(true);
    expect(result.noop).toBe(false);
    expect(result.created).toEqual({
      schools: 1,
      assessment_templates: 2,
      assessment_objectives: 2,
      assessment_modules: 2,
      assessment_indicators: 6,
      assessment_year_expectations: 9,
      assessment_entity_year_weights: 3,
      ab_migration_plan: 4,
    });
    expect(result.published.map((p) => p.key)).toEqual(['eva-1b', 'apr-5b']);
    expect(store.publishCalls).toEqual([idFor(V, 'template', 'eva-1b'), idFor(V, 'template', 'apr-5b')]);
    expect(store.rows('assessment_template_snapshots')).toHaveLength(2);
    expect(store.rows('assessment_templates').every((t) => t.status === 'published' && t.version === '1.1.0')).toBe(true);
    expect(store.rows('schools')[0]).toMatchObject({ id: 900001, name: '[SINTÉTICO] Colegio Piloto', tenant_kind: 'qa' });
    expect(result.verify.ok).toBe(true);
    expect(result.verify.observedDigest).toBe(result.verify.expectedDigest);
    expect(store.lockEvents).toEqual([`acquire:pilot:${V}:${manifest.digest.slice(0, 16)}`, `release:pilot:${V}:${manifest.digest.slice(0, 16)}`]);
  });

  it('never marks a template published by direct write and never writes users, instances, assignments or courses', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const directPublish = store.writes.filter(
      (w) => w.table === 'assessment_templates' && w.rows.some((r) => r.status === 'published' || r.published_at),
    );
    expect(directPublish).toEqual([]);
    expect(store.writes.filter((w) => w.table === 'assessment_template_snapshots')).toEqual([]);
    for (const table of NEVER_WRITTEN) {
      expect(writtenTables(store)).not.toContain(table);
      expect(store.rows(table)).toEqual([]);
      expect(WRITE_TABLES).not.toContain(table);
      expect(DELETE_TABLES).not.toContain(table);
    }
  });

  it('second apply is a no-op with the same digest, and verify passes', async () => {
    const store = createFakeStore();
    const first = await applyOnce(store);
    const writesAfterFirst = store.writes.length;
    const second = await applyOnce(store);
    expect(second.noop).toBe(true);
    expect(second.created).toEqual({});
    expect(second.published).toEqual([]);
    expect(store.writes.length).toBe(writesAfterFirst);
    expect(store.publishCalls).toHaveLength(2);
    expect(second.verify.observedDigest).toBe(first.verify.observedDigest);
    const verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(verify.ok).toBe(true);
    expect(verify.failures).toEqual([]);
    const plan = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.plan.creates).toEqual({ assessment_template_snapshots: 0 });
    expect(plan.plan.updates).toEqual({});
    expect(plan.plan.skips.assessment_templates).toBe(2);
  });

  it('resumes an interrupted apply: drafts left behind are published, nothing is duplicated', async () => {
    const store = createFakeStore();
    const s = state();
    store.put('schools', s.school);
    store.put('assessment_templates', {
      id: s.templates[0].id, area: 'evaluacion', grade_id: 5, version: '1.0.0', name: s.templates[0].name,
      description: s.templates[0].description, status: 'draft', is_archived: false, scoring_config: s.templates[0].scoring_config,
    });
    const plan = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(true);
    expect(plan.plan.creates.assessment_templates).toBe(1);
    expect(plan.plan.updates.assessment_templates).toBe(2);
    const result = await applyOnce(store);
    expect(result.created.assessment_templates).toBe(1);
    expect(result.published).toHaveLength(2);
    expect(store.rows('assessment_templates')).toHaveLength(2);
  });

  it('fails closed on a conflicting foreign-owned template for the same area and grade', async () => {
    const store = createFakeStore();
    store.put('assessment_templates', {
      id: 'foreign-1', area: 'evaluacion', grade_id: 5, version: '1.1.0', name: 'Evaluación de otro equipo',
      status: 'published', is_archived: false, scoring_config: {},
    });
    const plan = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(false);
    expect(plan.conflicts.join('\n')).toMatch(/eva-1b: 1 foreign template\(s\) collide/);
    expect(plan.conflicts.join('\n')).toMatch(/grade 1_basico: 1 published non-archived template\(s\) not owned/);
    await expect(applyOnce(store)).rejects.toThrow(/refusing pilot apply: preflight is not clean/);
    expect(store.writes).toEqual([]);
  });

  it('fails closed when an owned row drifted from the manifest', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const template = store.rows('assessment_templates')[0];
    store.put('assessment_templates', { ...template, name: '[SINTÉTICO] renombrado a mano' });
    const plan = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(false);
    expect(plan.conflicts.join('\n')).toMatch(/owned row drifted/);
    const verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(verify.ok).toBe(false);
    expect(verify.failures.join('\n')).toMatch(/drifted from the manifest/);
  });

  it('stops on archived owned templates and on eligible QA/demo templates', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const owned = store.rows('assessment_templates')[0];
    store.put('assessment_templates', { ...owned, is_archived: true });
    const archived = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(archived.ok).toBe(false);
    expect(archived.stops.join('\n')).toMatch(/owned template is archived/);
    const verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(verify.failures.join('\n')).toMatch(/archived=true/);

    const qa = createFakeStore();
    qa.put('assessment_templates', {
      id: 'qa-1', area: 'convivencia', grade_id: 9, version: '1.1.0', name: 'Plantilla QA demo', status: 'published', is_archived: false, scoring_config: {},
    });
    const plan = await runPreflight({ store: qa, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(false);
    expect(plan.stops.join('\n')).toMatch(/grade 5_basico: 1 eligible QA\/demo-named template\(s\)/);
    await expect(runApply({ store: qa, manifest, target: stagingTarget, schemaExpectation, operator: 'operator-one' })).rejects.toThrow(/preflight is not clean/);
  });

  it('stops when a grade does not map to a canonical ab_grades row', async () => {
    const renamed = createFakeStore({ grades: [{ id: 5, name: 'Primero', sort_order: 5, is_always_gt: true }, { id: 9, name: '5° Básico', sort_order: 9, is_always_gt: false }] });
    const plan = await runPreflight({ store: renamed, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(false);
    expect(plan.stops.join('\n')).toMatch(/grade 1_basico: ab_grades name differs/);

    const missing = createFakeStore({ grades: [{ id: 5, name: '1° Básico', sort_order: 5, is_always_gt: true }] });
    const plan2 = await runPreflight({ store: missing, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan2.stops.join('\n')).toMatch(/grade 5_basico: expected exactly one ab_grades row/);

    const flipped = createFakeStore({ grades: [{ id: 5, name: '1° Básico', sort_order: 5, is_always_gt: false }, { id: 9, name: '5° Básico', sort_order: 9, is_always_gt: false }] });
    const plan3 = await runPreflight({ store: flipped, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan3.stops.join('\n')).toMatch(/is_always_gt differs/);
  });

  it('stops on a missing required column and reports the table without secrets', async () => {
    const store = createFakeStore({ missingColumns: { schools: ['tenant_kind'] } });
    const plan = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(false);
    expect(plan.schema.schools).toBe('missing');
    expect(plan.stops.join('\n')).toMatch(/schema: schools lacks a required column/);
  });

  it('verify fails on a missing snapshot, expectation, migration-plan entry or frequency config', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const s = state();

    const snapshotId = store.rows('assessment_template_snapshots')[0].id;
    store.tables.get('assessment_template_snapshots')!.delete(snapshotId);
    let verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(verify.ok).toBe(false);
    expect(verify.failures.join('\n')).toMatch(/expected exactly one snapshot/);
    const plan = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan.stops.join('\n')).toMatch(/published template has no snapshot/);

    const fresh = createFakeStore();
    await applyOnce(fresh);
    fresh.tables.get('assessment_year_expectations')!.delete(s.expectations[0].id);
    verify = await runVerify({ store: fresh, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(verify.failures.join('\n')).toMatch(/assessment_year_expectations .*: missing/);
    expect(verify.failures.join('\n')).toMatch(/GT expectation missing/);

    const plan2 = createFakeStore();
    await applyOnce(plan2);
    const entry = plan2.rows('ab_migration_plan')[0];
    plan2.tables.get('ab_migration_plan')!.delete(entry.id);
    verify = await runVerify({ store: plan2, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(verify.failures.join('\n')).toMatch(/ab_migration_plan year 1 grade 5: missing/);

    const freq = createFakeStore();
    await applyOnce(freq);
    const indicator = freq.rows('assessment_indicators').find((i) => i.category === 'frecuencia')!;
    freq.put('assessment_indicators', { ...indicator, frequency_config: { unit: 'semana' } });
    verify = await runVerify({ store: freq, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(verify.failures.join('\n')).toMatch(/incomplete frequency_config/);
    expect(verify.failures.join('\n')).toMatch(/canonical post-apply digest does not match/);
  });

  it('refuses to publish when the publish service refuses (frequency gate) and leaves no snapshot', async () => {
    const store = createFakeStore();
    const s = state();
    store.put('schools', s.school);
    // Pre-seed a draft whose frecuencia indicator matches the manifest except for a broken config
    store.put('assessment_templates', {
      id: s.templates[0].id, area: 'evaluacion', grade_id: 5, version: '1.0.0', name: s.templates[0].name,
      description: s.templates[0].description, status: 'draft', is_archived: false, scoring_config: s.templates[0].scoring_config,
    });
    for (const o of s.objectives.filter((r) => r.template_id === s.templates[0].id)) store.put('assessment_objectives', { ...o });
    for (const m of s.modules.filter((r) => r.template_id === s.templates[0].id)) store.put('assessment_modules', { ...m });
    const drifted = s.indicators.filter((i) => s.modules.some((m) => m.id === i.module_id && m.template_id === s.templates[0].id));
    for (const i of drifted) store.put('assessment_indicators', { ...i });
    // Break the config through the store after preflight would have accepted the row shape
    const original = store.publishTemplate;
    store.publishTemplate = async (id: string) => {
      const frequency = store.rows('assessment_indicators').find((i) => i.category === 'frecuencia' && i.module_id === drifted[0].module_id)!;
      store.put('assessment_indicators', { ...frequency, frequency_config: { unit: 'semana' } });
      return original(id);
    };
    await expect(applyOnce(store)).rejects.toThrow(/publication of eva-1b was refused by the publish service/);
    expect(store.rows('assessment_template_snapshots')).toEqual([]);
    expect(store.rows('assessment_templates').find((t) => t.id === s.templates[0].id)!.status).toBe('draft');
  });

  it('synthetic reset deletes only manifest-owned rows and leaves foreign rows in place', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    store.put('assessment_templates', {
      id: 'foreign-other-grade', area: 'evaluacion', grade_id: 6, version: '1.1.0', name: 'Instrumento de otro nivel',
      status: 'published', is_archived: false, scoring_config: {},
    });
    store.put('assessment_template_snapshots', { id: 'foreign-snap', template_id: 'foreign-other-grade', version: '1.1.0', snapshot_data: {}, created_at: 'x' });
    store.put('ab_migration_plan', { school_id: 777, year_number: 1, grade_id: 5, generation_type: 'GT' });

    const result = await runReset({ store, manifest, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(result.ok).toBe(true);
    expect(result.deleted).toEqual({
      assessment_entity_year_weights: 3,
      assessment_year_expectations: 9,
      assessment_template_snapshots: 2,
      assessment_indicators: 6,
      assessment_modules: 2,
      assessment_objectives: 2,
      assessment_templates: 2,
      ab_migration_plan: 4,
      schools: 1,
    });
    expect(store.rows('assessment_templates').map((t) => t.id)).toEqual(['foreign-other-grade']);
    expect(store.rows('assessment_template_snapshots').map((s) => s.id)).toEqual(['foreign-snap']);
    expect(store.rows('ab_migration_plan').map((r) => r.school_id)).toEqual([777]);
    expect(store.rows('schools')).toEqual([]);
    for (const w of store.writes.filter((x) => x.op === 'delete')) {
      expect(DELETE_TABLES).toContain(w.table);
    }
  });

  it('synthetic reset refuses when foreign rows reference owned data', async () => {
    const withInstance = createFakeStore();
    await applyOnce(withInstance);
    withInstance.put('assessment_instances', { template_snapshot_id: withInstance.rows('assessment_template_snapshots')[0].id, school_id: 900001 });
    await expect(runReset({ store: withInstance, manifest, target: stagingTarget, schemaExpectation, schemaExpectation })).rejects.toThrow(/refusing pilot reset: foreign rows reference manifest-owned data \(instancesOnOwnedSnapshots=1/);
    expect(withInstance.writes.filter((w) => w.op === 'delete')).toEqual([]);

    const withProfile = createFakeStore();
    await applyOnce(withProfile);
    withProfile.put('profiles', { school_id: 900001 });
    await expect(runReset({ store: withProfile, manifest, target: stagingTarget, schemaExpectation, schemaExpectation })).rejects.toThrow(/profilesOnSchool=1/);

    const withForeignSnapshot = createFakeStore();
    await applyOnce(withForeignSnapshot);
    withForeignSnapshot.put('assessment_template_snapshots', { template_id: idFor(V, 'template', 'eva-1b'), version: '1.2.0', snapshot_data: {}, created_at: 'x' });
    await expect(runReset({ store: withForeignSnapshot, manifest, target: stagingTarget, schemaExpectation, schemaExpectation })).rejects.toThrow(/not the attested expected-version snapshot .*not created by this manifest/);
    expect(withForeignSnapshot.writes.filter((w) => w.op === 'delete')).toEqual([]);

    const wrongClass = createFakeStore();
    await expect(runReset({ store: wrongClass, manifest, target: productionTarget, schemaExpectation, schemaExpectation })).rejects.toThrow(/target is not staging-class/);
  });
});

describe('pilot provisioning stages (real pilot)', () => {
  it('has no reset in realPilot mode, before any store access', async () => {
    const real = realManifest();
    expect(() => assertResettable(real)).toThrow(/realPilot mode has no reset/);
    const store = createFakeStore();
    await expect(runReset({ store, manifest: real, target: productionTarget, schemaExpectation, schemaExpectation })).rejects.toThrow(/only synthetic manifests can be reset/);
    expect(store.lockEvents).toEqual([]);
    expect(store.writes).toEqual([]);
  });

  it('preflight refuses an unapproved real manifest and a missing or QA-like pilot school', async () => {
    const unapproved = realManifest({ approved: false });
    const store = createFakeStore({ seed: { schools: [{ id: 4242, name: 'Colegio piloto real', tenant_kind: 'client' }] } });
    const plan = await runPreflight({ store, manifest: unapproved, target: productionTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(false);
    expect(plan.stops.join('\n')).toMatch(/is not approved/);

    const approved = realManifest();
    const noSchool = await runPreflight({ store: createFakeStore(), manifest: approved, target: productionTarget, schemaExpectation, schemaExpectation });
    expect(noSchool.stops.join('\n')).toMatch(/pilot school does not exist/);
    expect(noSchool.plan.creates.schools).toBeUndefined();

    const qaSchool = createFakeStore({ seed: { schools: [{ id: 4242, name: 'Colegio QA', tenant_kind: 'qa' }] } });
    const qaPlan = await runPreflight({ store: qaSchool, manifest: approved, target: productionTarget, schemaExpectation, schemaExpectation });
    expect(qaPlan.stops.join('\n')).toMatch(/tenant_kind is qa, not client/);
  });

  it('applies approved configuration only: no school, user, course or instance rows are created', async () => {
    const real = realManifest();
    const store = createFakeStore({ seed: { schools: [{ id: 4242, name: 'Colegio piloto real', tenant_kind: 'client' }] } });
    const result = await runApply({ store, manifest: real, target: productionTarget, schemaExpectation, operator: 'operator-one' });
    expect(result.ok).toBe(true);
    expect(result.created.schools).toBeUndefined();
    expect(result.created.assessment_templates).toBe(2);
    expect(result.created.ab_migration_plan).toBe(4);
    expect(store.rows('ab_migration_plan').every((r) => r.school_id === 4242)).toBe(true);
    for (const table of NEVER_WRITTEN) expect(store.rows(table)).toEqual([]);
    expect(store.rows('schools')).toHaveLength(1);
    const second = await runApply({ store, manifest: real, target: productionTarget, schemaExpectation, operator: 'operator-one' });
    expect(second.noop).toBe(true);
    expect((await runVerify({ store, manifest: real, target: productionTarget, schemaExpectation, schemaExpectation })).ok).toBe(true);
  });

  it('refuses a synthetic manifest against the production-class target and vice versa', async () => {
    const plan = await runPreflight({ store: createFakeStore(), manifest, target: productionTarget, schemaExpectation, schemaExpectation });
    expect(plan.ok).toBe(false);
    expect(plan.stops.join('\n')).toMatch(/synthetic mode requires the staging-class target/);
    const real = realManifest();
    const plan2 = await runPreflight({ store: createFakeStore(), manifest: real, target: stagingTarget, schemaExpectation, schemaExpectation });
    expect(plan2.stops.join('\n')).toMatch(/realPilot mode requires the production-class target/);
  });
});

describe('snapshot content attestation (R8)', () => {
  it('verify reads snapshot_data, compares it with the deterministic expected payload and digests the content', async () => {
    const store = createFakeStore();
    const first = await applyOnce(store);
    const verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation });
    expect(verify.ok).toBe(true);
    expect(verify.snapshots).toHaveLength(2);
    for (const snap of verify.snapshots!) expect(snap.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    // The stored payload carries the volatile fields; the digest ignores them.
    const stored = store.rows('assessment_template_snapshots')[0];
    expect(stored.snapshot_data.published_at).toBeDefined();
    expect(stored.snapshot_data.published_by).toBeDefined();
    expect(first.verify.observedDigest).toBe(verify.observedDigest);
  });

  it('a deterministic rerun after reset + apply yields the same content digests and the same state digest', async () => {
    const store = createFakeStore();
    const a = await applyOnce(store);
    await runReset({ store, manifest, target: stagingTarget, schemaExpectation });
    const b = await applyOnce(store);
    expect(b.verify.observedDigest).toBe(a.verify.observedDigest);
    expect(b.verify.snapshots!.map((x: any) => x.contentDigest)).toEqual(a.verify.snapshots!.map((x: any) => x.contentDigest));
  });

  it('a tampered snapshot payload fails verify and stops preflight, naming the path — nothing is repaired silently', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const snap = store.rows('assessment_template_snapshots')[0];
    const tampered = structuredClone(snap.snapshot_data);
    tampered.objectives[0].modules[0].indicators[0].weight = 99;
    store.put('assessment_template_snapshots', { ...snap, snapshot_data: tampered });

    const verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation });
    expect(verify.ok).toBe(false);
    expect(verify.failures.join('\n')).toMatch(/snapshot_data differs from the expected published payload at objectives\[0\]\.modules\[0\]\.indicators\[0\]\.weight/);
    expect(verify.failures.join('\n')).toMatch(/canonical post-apply digest does not match/);

    const preflight = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation });
    expect(preflight.ok).toBe(false);
    expect(preflight.stops.join('\n')).toMatch(/snapshot_data differs/);
    await expect(applyOnce(store)).rejects.toThrow(/preflight is not clean/);
  });

  it('a stale (missing expectations) or foreign (other template id) payload fails verify', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const snap = store.rows('assessment_template_snapshots')[0];
    const stale = structuredClone(snap.snapshot_data);
    delete stale.objectives[0].modules[0].indicators[0].expectations_gt;
    store.put('assessment_template_snapshots', { ...snap, snapshot_data: stale });
    expect((await runVerify({ store, manifest, target: stagingTarget, schemaExpectation })).ok).toBe(false);

    const foreign = structuredClone(snap.snapshot_data);
    foreign.template.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    store.put('assessment_template_snapshots', { ...snap, snapshot_data: foreign });
    const verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation });
    expect(verify.ok).toBe(false);
    expect(verify.failures.join('\n')).toMatch(/foreign or stale payload/);
  });

  it('a snapshot without payload (identifiers only, the old blind spot) fails verify', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const snap = store.rows('assessment_template_snapshots')[0];
    store.put('assessment_template_snapshots', { ...snap, snapshot_data: null });
    const verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation });
    expect(verify.ok).toBe(false);
    expect(verify.failures.join('\n')).toMatch(/snapshot_data is missing or not an object/);
  });
});

describe('cascade-aware synthetic reset (R9)', () => {
  it('refuses when a descendant the old inventory never saw hangs off an owned parent (sub-question under an owned indicator)', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const indicator = store.rows('assessment_indicators')[0];
    store.put('assessment_sub_questions', { id: 'sq-foreign', indicator_id: indicator.id, question_text: 'x' });
    await expect(runReset({ store, manifest, target: stagingTarget, schemaExpectation })).rejects.toThrow(
      /rows not owned by the manifest depend on owned rows \(assessment_sub_questions\.indicator_id->assessment_indicators=1 \[CASCADE\]\)/,
    );
    expect(store.writes.filter((w) => w.op === 'delete')).toEqual([]);
    expect(store.rows('assessment_sub_questions')).toHaveLength(1);
  });

  it.each([
    ['a demo-access grant on an owned template', 'assessment_demo_access', (store: FakeStore) => ({ template_id: store.rows('assessment_templates')[0].id, user_id: 'u' }), /assessment_demo_access\.template_id->assessment_templates=1 \[CASCADE\]/],
    ['a context question on an owned template', 'assessment_context_questions', (store: FakeStore) => ({ template_id: store.rows('assessment_templates')[0].id }), /assessment_context_questions\.template_id->assessment_templates=1 \[CASCADE\]/],
    ['a generation on the synthetic school (cascade)', 'generations', () => ({ school_id: 900001 }), /generations\.school_id->schools=1 \[CASCADE\]/],
    ['a zoom attendance row on the synthetic school (no action)', 'zoom_attendance', () => ({ school_id: 900001 }), /zoom_attendance\.school_id->schools=1 \[NO ACTION\]/],
    ['a consultant assignment on the synthetic school (set null)', 'consultant_assignments', () => ({ school_id: 900001 }), /consultant_assignments\.school_id->schools=1 \[SET NULL\]/],
  ])('refuses %s and deletes nothing', async (_label, table, row, pattern) => {
    const store = createFakeStore();
    await applyOnce(store);
    store.put(table, row(store));
    await expect(runReset({ store, manifest, target: stagingTarget, schemaExpectation })).rejects.toThrow(pattern);
    expect(store.writes.filter((w) => w.op === 'delete')).toEqual([]);
  });

  it('a foreign indicator inserted under an OWNED module is detected by id, not just by count', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const module = store.rows('assessment_modules')[0];
    store.put('assessment_indicators', { id: 'ind-foreign', module_id: module.id, code: 'X', name: 'Foreign', category: 'cobertura', display_order: 99, weight: 1 });
    await expect(runReset({ store, manifest, target: stagingTarget, schemaExpectation })).rejects.toThrow(/assessment_indicators\.module_id->assessment_modules=1 \[CASCADE\]/);
  });

  it('with nothing foreign the reset deletes the owned subtree only, and the modelled cascades destroy nothing else', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    store.put('schools', { id: 4242, name: 'Otra escuela', tenant_kind: 'client' });
    store.put('generations', { id: 'gen-other', school_id: 4242 });
    const result = await runReset({ store, manifest, target: stagingTarget, schemaExpectation });
    expect(result.ok).toBe(true);
    expect(result.descendantsChecked).toBeGreaterThan(30);
    const cascaded = store.writes.filter((w: any) => w.cascadedFrom);
    // Every explicit delete happened bottom-up, so the modelled cascades had nothing left to remove.
    expect(cascaded).toEqual([]);
    expect(store.rows('generations')).toHaveLength(1);
    expect(store.rows('schools').map((s) => s.id)).toEqual([4242]);
  });

  it('refuses when the attested foreign-key graph differs from CASCADE_EDGES (an edge the tooling does not know)', async () => {
    const drifted = fakeSchemaAttestation();
    drifted.referencing_foreign_keys.push({ name: 'new_child_school_id_fkey', child: 'new_child', columns: ['school_id'], parent: 'schools', ref_columns: ['id'], on_delete: 'CASCADE', on_update: 'NO ACTION' });
    const store = createFakeStore({ schemaAttestation: drifted });
    const expectation = fakeSchemaExpectation(drifted);
    await applyOnce(store).catch(() => undefined);
    await expect(runReset({ store, manifest, target: stagingTarget, schemaExpectation: expectation })).rejects.toThrow(/foreign-key graph under the reset parents differs from CASCADE_EDGES \(unknown in catalog: 1/);
  });
});

describe('reset snapshot attestation gate (Codex round 1, finding 4)', () => {
  const reset = (store: FakeStore) => runReset({ store, manifest, target: stagingTarget, schemaExpectation });
  const deletes = (store: FakeStore) => store.writes.filter((w) => w.op === 'delete' || w.op === 'set-null');

  it('a DUPLICATE same-version snapshot on an owned template refuses the reset with zero deletion', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const snap = store.rows('assessment_template_snapshots')[0];
    store.put('assessment_template_snapshots', { ...snap, id: 'dup-same-version' });
    const before = store.rows('assessment_template_snapshots').length;

    await expect(reset(store)).rejects.toThrow(/expected exactly one snapshot at .* found 2 \(duplicate same-version snapshots\)/);
    expect(deletes(store)).toEqual([]);
    expect(store.rows('assessment_template_snapshots')).toHaveLength(before);
    expect(store.rows('assessment_templates')).toHaveLength(2);
  });

  it('a TAMPERED snapshot payload refuses the reset with zero deletion', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const snap = store.rows('assessment_template_snapshots')[0];
    const tampered = structuredClone(snap.snapshot_data);
    tampered.objectives[0].modules[0].indicators[0].weight = 99;
    store.put('assessment_template_snapshots', { ...snap, snapshot_data: tampered });

    await expect(reset(store)).rejects.toThrow(/snapshot_data differs from the expected published payload at objectives\[0\]\.modules\[0\]\.indicators\[0\]\.weight/);
    expect(deletes(store)).toEqual([]);
  });

  it('a MISSING snapshot (published template without its expected-version row) refuses the reset', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const snap = store.rows('assessment_template_snapshots')[0];
    store.tables.get('assessment_template_snapshots')!.delete(snap.id);

    await expect(reset(store)).rejects.toThrow(/expected exactly one snapshot at .* found 0 \(missing\)/);
    expect(deletes(store)).toEqual([]);
  });

  it('a STALE payload (expectations dropped) and a FOREIGN payload (other template id) both refuse the reset', async () => {
    const stale = createFakeStore();
    await applyOnce(stale);
    const s1 = stale.rows('assessment_template_snapshots')[0];
    stale.put('assessment_template_snapshots', { ...s1, snapshot_data: { ...structuredClone(s1.snapshot_data), yearExpectations: {} } });
    await expect(reset(stale)).rejects.toThrow(/refusing pilot reset: assessment_template_snapshots/);
    expect(deletes(stale)).toEqual([]);

    const foreign = createFakeStore();
    await applyOnce(foreign);
    const [a, b] = foreign.rows('assessment_template_snapshots');
    foreign.put('assessment_template_snapshots', { ...a, snapshot_data: structuredClone(b.snapshot_data) });
    await expect(reset(foreign)).rejects.toThrow(/not the owned template \(foreign or stale payload\)/);
    expect(deletes(foreign)).toEqual([]);
  });

  it('the gate is pure and reports the attested ids only when every owned template attests', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const inspection = await (await import('../../../scripts/pilot-provisioning/preflight.mjs')).inspect(store, manifest);
    const verdict = attestSnapshotsForReset({
      state: inspection.state,
      gradeRows: inspection.gradeRows,
      templatesById: inspection.templatesById,
      snapshots: inspection.snapshots,
    });
    expect(verdict.problems).toEqual([]);
    expect(verdict.attestedIds.sort()).toEqual(store.rows('assessment_template_snapshots').map((s) => s.id).sort());

    // A never-applied template needs no snapshot: nothing to attest, nothing to delete.
    const empty = createFakeStore();
    const emptyInspection = await (await import('../../../scripts/pilot-provisioning/preflight.mjs')).inspect(empty, manifest);
    const emptyVerdict = attestSnapshotsForReset({
      state: emptyInspection.state,
      gradeRows: emptyInspection.gradeRows,
      templatesById: emptyInspection.templatesById,
      snapshots: emptyInspection.snapshots,
    });
    expect(emptyVerdict).toEqual({ attestedIds: [], problems: [] });
  });

  it('with every snapshot attested the reset deletes exactly the attested ids and nothing else', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const attested = store.rows('assessment_template_snapshots').map((s) => s.id).sort();
    store.put('assessment_template_snapshots', { id: 'foreign-snap', template_id: 'foreign-template', version: '1.1.0', snapshot_data: {}, created_at: 'x' });

    const result = await reset(store);
    expect(result.ok).toBe(true);
    expect(result.deleted.assessment_template_snapshots).toBe(attested.length);
    const deletedSnapshotIds = store.writes
      .filter((w) => w.op === 'delete' && w.table === 'assessment_template_snapshots')
      .flatMap((w) => w.rows.map((r) => r.id))
      .sort();
    expect(deletedSnapshotIds).toEqual(attested);
    expect(store.rows('assessment_template_snapshots').map((s) => s.id)).toEqual(['foreign-snap']);
  });
});

describe('versioned schema attestation (R10)', () => {
  it('preflight, verify and reset stop on a digest mismatch and name the drifted section', async () => {
    const store = createFakeStore();
    await applyOnce(store);
    const drifted = fakeSchemaAttestation();
    drifted.tables.find((t: any) => t.name === 'assessment_templates').policies = [];
    const driftedStore = createFakeStore({ schemaAttestation: drifted, seed: Object.fromEntries([...store.tables].map(([k, v]) => [k, [...v.values()]])) });

    const preflight = await runPreflight({ store: driftedStore, manifest, target: stagingTarget, schemaExpectation });
    expect(preflight.ok).toBe(false);
    expect(preflight.stops[0]).toMatch(/schema attestation: digest .* does not match the expected .*\(drift in: table:assessment_templates\)/);
    expect(preflight.schema.attestation.ok).toBe(false);

    const verify = await runVerify({ store: driftedStore, manifest, target: stagingTarget, schemaExpectation });
    expect(verify.ok).toBe(false);
    expect(verify.failures[0]).toMatch(/schema attestation: digest/);
    expect(verify.observedDigest).toBeNull();

    await expect(runReset({ store: driftedStore, manifest, target: stagingTarget, schemaExpectation })).rejects.toThrow(/refusing pilot reset: schema attestation: digest/);
    expect(driftedStore.writes.filter((w) => w.op === 'delete')).toEqual([]);
    await expect(runApply({ store: driftedStore, manifest, target: stagingTarget, operator: 'operator-one', schemaExpectation })).rejects.toThrow(/schema attestation/);
  });

  it('stops when the attestation function is unavailable (missing or not granted) and when no expectation is configured', async () => {
    const unavailable = createFakeStore({ schemaAttestationError: 'permission denied for function pilot_schema_attestation' });
    const preflight = await runPreflight({ store: unavailable, manifest, target: stagingTarget, schemaExpectation });
    expect(preflight.ok).toBe(false);
    expect(preflight.stops[0]).toMatch(/schema attestation: unavailable \(permission denied for function pilot_schema_attestation\)/);

    const noExpectation = await runPreflight({ store: createFakeStore(), manifest, target: stagingTarget } as any);
    expect(noExpectation.ok).toBe(false);
    expect(noExpectation.stops[0]).toMatch(/no expectation is configured/);
    await expect(runReset({ store: createFakeStore(), manifest, target: stagingTarget } as any)).rejects.toThrow(/no expectation is configured/);
  });

  it('stops on a missing required table / function and on another attestation version', async () => {
    const missing = fakeSchemaAttestation();
    missing.missing_tables = ['assessment_sub_questions'];
    missing.missing_functions = ['save_transversal_context'];
    const preflight = await runPreflight({ store: createFakeStore({ schemaAttestation: missing }), manifest, target: stagingTarget, schemaExpectation });
    expect(preflight.stops).toEqual(expect.arrayContaining([
      'schema attestation: required table assessment_sub_questions is missing',
      'schema attestation: required function save_transversal_context is missing',
    ]));

    const other = fakeSchemaAttestation();
    other.attestation_version = 2;
    const versioned = await runPreflight({ store: createFakeStore({ schemaAttestation: other }), manifest, target: stagingTarget, schemaExpectation });
    expect(versioned.stops[0]).toMatch(/attestation_version 2 differs from expected 1/);
  });

  it('a matching attestation passes and its digest is reported on every stage', async () => {
    const store = createFakeStore();
    const preflight = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation });
    expect(preflight.schema.attestation).toEqual({ ok: true, digest: schemaExpectation.expectedDigest, expectedDigest: schemaExpectation.expectedDigest });
    const apply = await applyOnce(store);
    expect(apply.schemaAttestation.ok).toBe(true);
    expect(apply.verify.schemaAttestation).toEqual({ ok: true, digest: schemaExpectation.expectedDigest });
    const reset = await runReset({ store, manifest, target: stagingTarget, schemaExpectation });
    expect(reset.schemaAttestation).toEqual({ ok: true, digest: schemaExpectation.expectedDigest });
    expect(computeSchemaDigest(fakeSchemaAttestation())).toBe(schemaExpectation.expectedDigest);
  });
});

describe('non-production marker (R11)', () => {
  it('every synthetic stage result carries the conspicuous marker; a real-pilot result does not', async () => {
    const store = createFakeStore();
    const preflight = await runPreflight({ store, manifest, target: stagingTarget, schemaExpectation });
    const apply = await applyOnce(store);
    const verify = await runVerify({ store, manifest, target: stagingTarget, schemaExpectation });
    const reset = await runReset({ store, manifest, target: stagingTarget, schemaExpectation });
    for (const r of [preflight, apply, verify, reset]) {
      expect(r).toMatchObject({ synthetic: true, notProduction: true, marker: expect.stringContaining('[SINTÉTICO — NO PRODUCCIÓN]') });
    }
    const realStore = createFakeStore({ seed: { schools: [{ id: 4242, name: 'Escuela Real', tenant_kind: 'client' }] } });
    const real = await runPreflight({ store: realStore, manifest: realManifest(), target: productionTarget, schemaExpectation });
    expect(real).toMatchObject({ synthetic: false });
    expect((real as any).marker).toBeUndefined();
  });
});
