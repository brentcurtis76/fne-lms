import { ownedIds, syntheticMarker } from './manifest.mjs';
import { attestOwnedSnapshot, inspect, readUntouchedCounts } from './preflight.mjs';
import { attestSchema, referencingEdges } from './schema-attestation.mjs';

/**
 * Synthetic-only, manifest-scoped reset. Deletes ONLY rows whose ids the
 * manifest derives (plus the snapshots the publish service created for those
 * templates and the migration-plan rows of the synthetic school on manifest
 * grades) and refuses when anything outside the manifest references them.
 * There is no generic remote wipe and no realPilot reset: the function throws
 * before touching the store when the manifest is not synthetic.
 */

/**
 * R9: the foreign-key graph under the tables the reset deletes from, as
 * [child, column, parent, on_delete], copied from the live catalog
 * (pg_constraint) of the migrated database. ANY row in a child table that
 * references an owned parent and is not itself manifest-owned blocks the
 * reset — CASCADE would delete it, SET NULL would mutate it, RESTRICT /
 * NO ACTION would fail mid-way. The list is cross-checked at run time
 * against the attested graph (pilot_schema_attestation): an edge the catalog
 * has and this list lacks (or vice versa) refuses the reset.
 */
export const RESET_PARENT_TABLES = Object.freeze([
  'schools',
  'ab_migration_plan',
  'assessment_templates',
  'assessment_template_snapshots',
  'assessment_objectives',
  'assessment_modules',
  'assessment_indicators',
  'assessment_sub_questions',
  'assessment_year_expectations',
  'assessment_entity_year_weights',
]);

export const CASCADE_EDGES = Object.freeze([
  // child, column, parent, on_delete
  ['assessment_sub_questions', 'indicator_id', 'assessment_indicators', 'CASCADE'],
  ['assessment_year_expectations', 'indicator_id', 'assessment_indicators', 'CASCADE'],
  ['assessment_indicators', 'module_id', 'assessment_modules', 'CASCADE'],
  ['assessment_modules', 'objective_id', 'assessment_objectives', 'CASCADE'],
  ['assessment_sub_questions', 'parent_question_id', 'assessment_sub_questions', 'CASCADE'],
  ['assessment_instances', 'template_snapshot_id', 'assessment_template_snapshots', 'RESTRICT'],
  ['assessment_context_questions', 'template_id', 'assessment_templates', 'CASCADE'],
  ['assessment_demo_access', 'template_id', 'assessment_templates', 'CASCADE'],
  ['assessment_entity_year_weights', 'template_id', 'assessment_templates', 'CASCADE'],
  ['assessment_modules', 'template_id', 'assessment_templates', 'CASCADE'],
  ['assessment_objectives', 'template_id', 'assessment_templates', 'CASCADE'],
  ['assessment_template_snapshots', 'template_id', 'assessment_templates', 'RESTRICT'],
  ['assessment_year_expectations', 'template_id', 'assessment_templates', 'CASCADE'],
  ['ab_migration_plan', 'school_id', 'schools', 'CASCADE'],
  ['assessment_assignments', 'school_id', 'schools', 'CASCADE'],
  ['assessment_instances', 'school_id', 'schools', 'SET NULL'],
  ['assessment_submissions', 'school_id', 'schools', 'NO ACTION'],
  ['assignment_instances', 'school_id', 'schools', 'NO ACTION'],
  ['clientes', 'school_id', 'schools', 'SET NULL'],
  ['consultant_assignments', 'school_id', 'schools', 'SET NULL'],
  ['consultor_sessions', 'school_id', 'schools', 'NO ACTION'],
  ['context_general_responses', 'school_id', 'schools', 'NO ACTION'],
  ['dev_role_sessions', 'school_id', 'schools', 'SET NULL'],
  ['generations', 'school_id', 'schools', 'CASCADE'],
  ['group_assignment_groups', 'school_id', 'schools', 'NO ACTION'],
  ['growth_communities', 'school_id', 'schools', 'CASCADE'],
  ['learning_paths', 'school_id', 'schools', 'SET NULL'],
  ['licitaciones', 'school_id', 'schools', 'NO ACTION'],
  ['profiles', 'school_id', 'schools', 'NO ACTION'],
  ['program_enrollments', 'school_id', 'schools', 'NO ACTION'],
  ['red_escuelas', 'school_id', 'schools', 'CASCADE'],
  ['school_change_history', 'school_id', 'schools', 'NO ACTION'],
  ['school_course_structure', 'school_id', 'schools', 'CASCADE'],
  ['school_plan_completion_status', 'school_id', 'schools', 'NO ACTION'],
  ['school_transversal_context', 'school_id', 'schools', 'CASCADE'],
  ['session_hour_overrides', 'school_id', 'schools', 'NO ACTION'],
  ['session_meetings_public', 'school_id', 'schools', 'NO ACTION'],
  ['supervisor_auditorias', 'school_id', 'schools', 'NO ACTION'],
  ['tractor_signups', 'school_id', 'schools', 'NO ACTION'],
  ['transformation_assessments', 'school_id', 'schools', 'SET NULL'],
  ['user_roles', 'school_id', 'schools', 'CASCADE'],
  ['zoom_attendance', 'school_id', 'schools', 'NO ACTION'],
]);

const edgeKey = (e) => `${e.parent}|${e.child}|${e.column}|${e.onDelete}`;

/** The static graph as edge objects, sorted like referencingEdges(). */
export function staticEdges() {
  return CASCADE_EDGES
    .map(([child, column, parent, onDelete]) => ({ child, column, parent, onDelete }))
    .sort((a, b) => `${a.parent}|${a.child}|${a.column}`.localeCompare(`${b.parent}|${b.child}|${b.column}`));
}

/** Edges present in one graph and not the other (either direction). */
export function edgeGraphDifferences(attested) {
  const a = new Set(attested.map(edgeKey));
  const s = new Set(staticEdges().map(edgeKey));
  return {
    unknownInCatalog: [...a].filter((k) => !s.has(k)).sort(),
    missingFromCatalog: [...s].filter((k) => !a.has(k)).sort(),
  };
}

/**
 * Walks every edge whose parent holds manifest-owned ids and refuses when a
 * child row is not itself manifest-owned. Owned child tables are checked by
 * id (their own rows are then parents in turn — the whole subtree is
 * covered because every owned descendant id is manifest-derived); tables the
 * manifest never owns are counted (head count, no content). Returns the
 * blocking findings; an empty list means every descendant is owned.
 */
export async function inventoryDescendants(store, owned) {
  const findings = [];
  for (const [child, column, parent, onDelete] of CASCADE_EDGES) {
    const parentIds = owned[parent] ?? [];
    if (parentIds.length === 0) continue;
    if (owned[child]) {
      const rows = await store.readRows(child, column, parentIds, ['id', column]);
      const ownedSet = new Set(owned[child]);
      const foreign = rows.filter((r) => !ownedSet.has(r.id));
      if (foreign.length > 0) findings.push({ table: child, via: column, parent, onDelete, rows: foreign.length });
    } else {
      const n = await store.countReferencing(child, column, parentIds);
      if (n > 0) findings.push({ table: child, via: column, parent, onDelete, rows: n });
    }
  }
  return findings;
}

/**
 * Finding 4: the snapshot gate of the reset. For every owned template PRESENT
 * in the store, exactly one snapshot at the expected published version must
 * exist and attest (content, template id, version). Every snapshot on owned
 * templates that is not one of those attested rows is "extra" and refuses
 * too. Returns the attested ids (the only ones a reset may delete) and the
 * problems (empty when the gate passes). Pure: no store access.
 */
export function attestSnapshotsForReset({ state, gradeRows, templatesById, snapshots }) {
  const problems = [];
  const attestedIds = [];
  for (const template of state.templates) {
    if (!templatesById.has(template.id)) continue; // never applied: nothing to attest, nothing to delete
    const rows = snapshots.filter((s) => s.template_id === template.id);
    const atVersion = rows.filter((s) => s.version === template.published_version);
    if (atVersion.length !== 1) {
      problems.push(
        `assessment_template_snapshots ${template.key}: expected exactly one snapshot at ${template.published_version}, found ${atVersion.length}` +
          (atVersion.length > 1 ? ' (duplicate same-version snapshots)' : ' (missing)'),
      );
      continue;
    }
    const verdict = attestOwnedSnapshot({ state, gradeRows, snapshots, templateKey: template.key });
    if (verdict.failures.length > 0) {
      problems.push(...verdict.failures);
      continue;
    }
    attestedIds.push(atVersion[0].id);
  }
  const attested = new Set(attestedIds);
  const extra = snapshots.filter((s) => !attested.has(s.id));
  if (extra.length > 0) {
    problems.push(`${extra.length} snapshot(s) on owned templates are not the attested expected-version snapshot (extra or other-version rows; not created by this manifest)`);
  }
  return { attestedIds, problems };
}

export function assertResettable(manifest) {
  if (manifest?.mode !== 'synthetic') {
    throw new Error('refusing pilot reset: only synthetic manifests can be reset (realPilot mode has no reset)');
  }
  return true;
}

export async function runReset({ store, manifest, target, schemaExpectation, now = () => new Date() }) {
  assertResettable(manifest);
  if (target.environmentClass !== 'staging') throw new Error('refusing pilot reset: target is not staging-class');
  const startedAt = now().toISOString();
  const lockName = `pilot:${manifest.manifestVersion}:${manifest.digest.slice(0, 16)}`;
  await store.acquireLock(lockName);
  try {
    // R10: the schema must be the attested one before anything is read or deleted.
    const schema = await attestSchema(store, schemaExpectation);
    if (!schema.ok) throw new Error(`refusing pilot reset: ${schema.stops.join('; ')}`);
    const attestedEdges = referencingEdges(await store.readSchemaAttestation(), RESET_PARENT_TABLES);
    const graphDiff = edgeGraphDifferences(attestedEdges);
    if (graphDiff.unknownInCatalog.length > 0 || graphDiff.missingFromCatalog.length > 0) {
      throw new Error(
        `refusing pilot reset: the foreign-key graph under the reset parents differs from CASCADE_EDGES ` +
          `(unknown in catalog: ${graphDiff.unknownInCatalog.length}, missing from catalog: ${graphDiff.missingFromCatalog.length}); ` +
          `update reset.mjs from the attested graph before resetting`,
      );
    }

    const inspection = await inspect(store, manifest);
    if (inspection.problems.length > 0 || !inspection.state) {
      throw new Error(`refusing pilot reset: ${inspection.problems.join('; ')}`);
    }
    const { state, snapshots, school, migrationPlan } = inspection;
    const owned = ownedIds(state);
    const snapshotIds = snapshots.map((s) => s.id);

    // Foreign references: anything that hangs off owned rows or the synthetic school stops the reset.
    const refs = await readUntouchedCounts(store, { schoolId: state.schoolId, snapshotIds });
    const blocking = Object.entries(refs).filter(([, n]) => n > 0);
    if (blocking.length > 0) {
      throw new Error(`refusing pilot reset: foreign rows reference manifest-owned data (${blocking.map(([k, n]) => `${k}=${n}`).join(', ')})`);
    }
    if (school && (school.name !== state.school.name || school.tenant_kind !== 'qa')) {
      throw new Error(`refusing pilot reset: school ${state.schoolId} is not the synthetic school`);
    }
    // Codex round 1 (finding 4): before ANY snapshot is deleted, every owned
    // template that exists in the store must hold EXACTLY ONE snapshot at its
    // expected published version, and that snapshot's content must attest
    // against the deterministic expected payload (R8). A missing snapshot, a
    // duplicate at the same version, an extra snapshot at another version, a
    // stale / foreign / tampered payload — each refuses the whole reset, and
    // nothing is deleted. Only the attested ids are ever deleted.
    const attestation = attestSnapshotsForReset({ state, gradeRows: inspection.gradeRows, templatesById: inspection.templatesById, snapshots });
    if (attestation.problems.length > 0) {
      throw new Error(`refusing pilot reset: ${attestation.problems.join('; ')}`);
    }
    const attestedSnapshotIds = attestation.attestedIds;

    // R9: recursive descendant inventory over the attested foreign-key graph.
    const manifestGradeIdSet = new Set(state.migrationPlan.map((r) => r.grade_id));
    const ownedPlanIds = migrationPlan
      .filter((r) => manifestGradeIdSet.has(r.grade_id) && state.migrationPlan.some((d) => d.year_number === r.year_number && d.grade_id === r.grade_id))
      .map((r) => r.id);
    const ownedGraph = {
      ...owned,
      assessment_template_snapshots: attestedSnapshotIds,
      ab_migration_plan: ownedPlanIds,
      schools: school ? [state.schoolId] : [],
    };
    const descendants = await inventoryDescendants(store, ownedGraph);
    if (descendants.length > 0) {
      const summary = descendants.map((d) => `${d.table}.${d.via}->${d.parent}=${d.rows} [${d.onDelete}]`).join(', ');
      throw new Error(`refusing pilot reset: rows not owned by the manifest depend on owned rows (${summary})`);
    }

    const deleted = {};
    const del = async (table, column, values) => {
      deleted[table] = (deleted[table] ?? 0) + (values.length ? await store.deleteRows(table, column, values) : 0);
    };
    await del('assessment_entity_year_weights', 'id', owned.assessment_entity_year_weights);
    await del('assessment_year_expectations', 'id', owned.assessment_year_expectations);
    await del('assessment_template_snapshots', 'id', attestedSnapshotIds);
    await del('assessment_indicators', 'id', owned.assessment_indicators);
    await del('assessment_modules', 'id', owned.assessment_modules);
    await del('assessment_objectives', 'id', owned.assessment_objectives);
    await del('assessment_templates', 'id', owned.assessment_templates);
    const manifestGradeIds = new Set(state.migrationPlan.map((r) => r.grade_id));
    const planIds = migrationPlan
      .filter((r) => manifestGradeIds.has(r.grade_id) && state.migrationPlan.some((d) => d.year_number === r.year_number && d.grade_id === r.grade_id))
      .map((r) => r.id);
    await del('ab_migration_plan', 'id', planIds);
    if (school) {
      const remainingPlan = (await store.readMigrationPlan(state.schoolId)).length;
      if (remainingPlan > 0) throw new Error('refusing pilot reset: synthetic school still has migration-plan rows outside the manifest');
      await del('schools', 'id', [state.schoolId]);
    }

    // Nothing owned may remain
    const after = await inspect(store, manifest);
    const remaining = after.state.templates.filter((t) => after.templatesById.has(t.id)).length;
    if (remaining > 0 || after.school) throw new Error('pilot reset: owned rows remain after delete');

    return Object.freeze({
      stage: 'reset',
      ok: true,
      ...syntheticMarker(manifest),
      manifest: { version: manifest.manifestVersion, mode: manifest.mode, digest: manifest.digest },
      target: { name: target.targetName, projectRef: target.projectRef, environmentClass: target.environmentClass },
      schemaAttestation: { digest: schema.digest, ok: true },
      startedAt,
      finishedAt: now().toISOString(),
      deleted,
      descendantsChecked: CASCADE_EDGES.length,
    });
  } finally {
    await store.releaseLock(lockName);
  }
}
