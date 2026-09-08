import { canonicalJson, syntheticMarker } from './manifest.mjs';
import { childColumns, inspect, readUntouchedCounts, rowMatches, runPreflight } from './preflight.mjs';
import { runVerify } from './verify.mjs';

/**
 * Idempotent apply. Refuses unless preflight is clean, then creates only the
 * rows preflight planned, in dependency order, and publishes every owned
 * draft through the shared publication service (`store.publishTemplate`).
 * A template is NEVER marked published by a direct table write here.
 *
 * Restartable: every step re-reads before it writes, so an interrupted run
 * resumes where it stopped and a second run of a completed manifest is a
 * no-op with the same digest.
 */

const ORDER = Object.freeze([
  ['objectives', 'assessment_objectives'],
  ['modules', 'assessment_modules'],
  ['indicators', 'assessment_indicators'],
  ['expectations', 'assessment_year_expectations'],
  ['yearWeights', 'assessment_entity_year_weights'],
]);

function templateInsertRow(desired) {
  return {
    id: desired.id,
    area: desired.area,
    grade_id: desired.grade_id,
    version: desired.draft_version,
    name: desired.name,
    description: desired.description,
    status: 'draft',
    is_archived: false,
    scoring_config: desired.scoring_config,
  };
}

function stripKey(row) {
  const { key: _key, draft_version: _d, published_version: _p, ...rest } = row;
  return rest;
}

export async function runApply({ store, manifest, target, operator, schemaExpectation, now = () => new Date() }) {
  const startedAt = now().toISOString();
  const lockName = `pilot:${manifest.manifestVersion}:${manifest.digest.slice(0, 16)}`;
  await store.acquireLock(lockName);
  try {
    const preflight = await runPreflight({ store, manifest, target, schemaExpectation });
    if (!preflight.ok) {
      throw new Error(
        `refusing pilot apply: preflight is not clean: ${[...preflight.stops, ...preflight.conflicts].join('; ')}`,
      );
    }
    const before = preflight.untouchedCounts;
    const created = {};
    const published = [];
    const bump = (table, n = 1) => {
      created[table] = (created[table] ?? 0) + n;
    };

    const inspection = await inspect(store, manifest);
    const { state } = inspection;

    // 1. Synthetic school (never in realPilot: the school must pre-exist there)
    if (manifest.mode === 'synthetic' && !inspection.school) {
      bump('schools', await store.insertRows('schools', [state.school]));
    }

    // 2. Draft templates
    const missingTemplates = state.templates.filter((t) => !inspection.templatesById.has(t.id));
    if (missingTemplates.length > 0) {
      bump('assessment_templates', await store.insertRows('assessment_templates', missingTemplates.map(templateInsertRow)));
    }

    // 3. Children, dependency order
    for (const [stateKey, table] of ORDER) {
      const existing = inspection.children[table];
      const missing = state[stateKey].filter((row) => !existing.has(row.id));
      for (const row of state[stateKey]) {
        const current = existing.get(row.id);
        if (current && !rowMatches(row, current, childColumns(table))) {
          throw new Error(`refusing pilot apply: ${table} ${row.id} drifted between preflight and apply`);
        }
      }
      if (missing.length > 0) bump(table, await store.insertRows(table, missing.map(stripKey)));
    }

    // 4. Publish through the shared service
    const afterInsert = await inspect(store, manifest);
    for (const desired of state.templates) {
      const row = afterInsert.templatesById.get(desired.id);
      if (!row) throw new Error(`refusing pilot apply: template ${desired.key} vanished before publication`);
      if (row.status === 'published' && row.version === desired.published_version) continue;
      if (row.status !== 'draft' || row.version !== desired.draft_version) {
        throw new Error(`refusing pilot apply: template ${desired.key} is ${row.status}/${row.version}, cannot publish`);
      }
      const result = await store.publishTemplate(desired.id);
      if (!result || result.ok !== true) {
        throw new Error(`pilot apply: publication of ${desired.key} was refused by the publish service: ${result?.error ?? 'unknown'}`);
      }
      if (result.newVersion !== desired.published_version) {
        throw new Error(`pilot apply: publish service produced version ${result.newVersion}, manifest expects ${desired.published_version}`);
      }
      published.push({ key: desired.key, version: result.newVersion, warnings: result.warnings ?? [] });
    }

    // 5. Migration plan (natural key school/year/grade)
    const plan = await store.readMigrationPlan(state.schoolId);
    const missingPlan = state.migrationPlan.filter(
      (d) => !plan.some((r) => r.year_number === d.year_number && r.grade_id === d.grade_id),
    );
    if (missingPlan.length > 0) bump('ab_migration_plan', await store.insertRows('ab_migration_plan', missingPlan));

    // 6. Nothing outside the plan moved
    const snapshotsNow = await store.readRows('assessment_template_snapshots', 'template_id', state.templates.map((t) => t.id), ['id', 'template_id', 'version']);
    const after = await readUntouchedCounts(store, { schoolId: state.schoolId, snapshotIds: snapshotsNow.map((s) => s.id) });
    const comparableBefore = { ...before, instancesOnOwnedSnapshots: undefined };
    const comparableAfter = { ...after, instancesOnOwnedSnapshots: undefined };
    if (canonicalJson(comparableBefore) !== canonicalJson(comparableAfter) || after.instancesOnOwnedSnapshots !== before.instancesOnOwnedSnapshots) {
      throw new Error('pilot apply: a table outside the plan changed during apply (instances/assignments/courses/users)');
    }

    // 7. Verify
    const verify = await runVerify({ store, manifest, target, schemaExpectation });
    if (!verify.ok) throw new Error(`pilot apply: post-apply verification failed: ${verify.failures.join('; ')}`);

    return Object.freeze({
      stage: 'apply',
      ok: true,
      ...syntheticMarker(manifest),
      schemaAttestation: preflight.schema?.attestation ?? null,
      manifest: { version: manifest.manifestVersion, mode: manifest.mode, digest: manifest.digest },
      target: { name: target.targetName, projectRef: target.projectRef, environmentClass: target.environmentClass },
      operator,
      startedAt,
      finishedAt: now().toISOString(),
      created,
      published,
      noop: Object.keys(created).length === 0 && published.length === 0,
      untouchedCounts: { before, after },
      verify,
    });
  } finally {
    await store.releaseLock(lockName);
  }
}
