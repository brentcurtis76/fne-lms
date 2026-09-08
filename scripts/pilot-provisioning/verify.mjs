import { canonicalJson, sha256, syntheticMarker, validateFrequencyConfigShape } from './manifest.mjs';
import { attestSchema } from './schema-attestation.mjs';
import { attestOwnedSnapshot, childColumns, expectedStateDigest, inspect, isQaLikeName, readUntouchedCounts, rowMatches } from './preflight.mjs';

/**
 * Read-only verification of an applied manifest. Every failure is collected;
 * `ok` is true only when the observed configuration is exactly the approved
 * one and its canonical digest equals the digest the manifest predicts.
 */

const CHILD_TABLES = Object.freeze([
  ['objectives', 'assessment_objectives'],
  ['modules', 'assessment_modules'],
  ['indicators', 'assessment_indicators'],
  ['expectations', 'assessment_year_expectations'],
  ['yearWeights', 'assessment_entity_year_weights'],
]);

function project(row, columns) {
  const out = {};
  for (const column of columns) {
    const value = row[column];
    out[column] = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) && column === 'weight' ? Number(value) : value ?? null;
  }
  return out;
}

export async function runVerify({ store, manifest, target, schemaExpectation }) {
  const failures = [];
  // R10: the schema must be the attested one, or nothing observed can be trusted.
  const schema = await attestSchema(store, schemaExpectation);
  if (!schema.ok) return result(false, schema.stops, manifest, target, null, null, null, schema);
  const inspection = await inspect(store, manifest);
  failures.push(...inspection.problems);
  if (!inspection.state) return result(false, failures, manifest, target, null, null, null, schema);
  const { state, templatesById, gradeTemplates, children, snapshots, migrationPlan, school } = inspection;
  const ownedIds = new Set(state.templates.map((t) => t.id));

  // School
  if (!school) failures.push(`schools ${state.schoolId}: missing`);
  else if (manifest.mode === 'synthetic' && (school.name !== state.school.name || school.tenant_kind !== 'qa')) {
    failures.push(`schools ${state.schoolId}: not the synthetic school`);
  }

  // Templates published at the expected version, with their snapshot
  const observedTemplates = [];
  const observedSnapshots = [];
  for (const desired of state.templates) {
    const row = templatesById.get(desired.id);
    if (!row) {
      failures.push(`assessment_templates ${desired.key}: missing`);
      continue;
    }
    if (row.status !== 'published' || row.is_archived !== false || row.version !== desired.published_version) {
      failures.push(`assessment_templates ${desired.key}: expected published ${desired.published_version}, found ${row.status}/${row.version}/archived=${row.is_archived}`);
    }
    if (!rowMatches(desired, row, ['area', 'grade_id', 'name', 'description', 'scoring_config'])) {
      failures.push(`assessment_templates ${desired.key}: drifted from the manifest`);
    }
    const snap = snapshots.filter((s) => s.template_id === desired.id && s.version === desired.published_version);
    // R8: the persisted payload must equal the deterministic expected one (volatile fields excluded).
    const attestation = attestOwnedSnapshot({ state, gradeRows: inspection.gradeRows, snapshots, templateKey: desired.key });
    failures.push(...attestation.failures);
    observedTemplates.push({
      id: row.id,
      area: row.area,
      grade_id: row.grade_id,
      name: row.name,
      description: row.description ?? null,
      scoring_config: row.scoring_config,
      status: row.status,
      version: row.version,
      is_archived: row.is_archived,
    });
    if (snap.length === 1) observedSnapshots.push({ template_id: desired.id, version: snap[0].version, contentDigest: attestation.digest });
  }

  // Per grade: exactly the approved eligible set, no QA/archived eligible
  for (const grade of manifest.grades) {
    const gradeId = inspection.gradeIdByKey.get(grade.key);
    const eligible = gradeTemplates.filter((t) => t.grade_id === gradeId && t.status === 'published' && t.is_archived === false);
    const expected = state.templates.filter((t) => t.grade_id === gradeId).map((t) => t.id).sort();
    const found = eligible.map((t) => t.id).sort();
    if (canonicalJson(expected) !== canonicalJson(found)) {
      failures.push(`grade ${grade.key}: eligible template set differs from the approved set (${found.length} found, ${expected.length} approved)`);
    }
    const qaEligible = eligible.filter((t) => !ownedIds.has(t.id) && isQaLikeName(t.name));
    if (qaEligible.length > 0) failures.push(`grade ${grade.key}: ${qaEligible.length} QA/demo-named eligible template(s)`);
  }

  // Children present and exact; frequency config complete; expectations complete
  const observedChildren = {};
  for (const [stateKey, table] of CHILD_TABLES) {
    const columns = childColumns(table);
    observedChildren[stateKey] = [];
    for (const desired of state[stateKey]) {
      const row = children[table].get(desired.id);
      if (!row) {
        failures.push(`${table} ${desired.id}: missing`);
        continue;
      }
      if (!rowMatches(desired, row, columns)) failures.push(`${table} ${desired.id}: drifted from the manifest`);
      observedChildren[stateKey].push({ id: row.id, ...project(row, columns) });
    }
  }
  for (const indicator of state.indicators) {
    const row = children.assessment_indicators.get(indicator.id);
    if (row?.category === 'frecuencia' && validateFrequencyConfigShape(row.frequency_config).length > 0) {
      failures.push(`assessment_indicators ${indicator.code}: incomplete frequency_config`);
    }
  }
  const expectationRows = [...children.assessment_year_expectations.values()];
  const gradesByKey = new Map(manifest.grades.map((g) => [g.key, g]));
  const templateKeyById = new Map(state.templates.map((t) => [t.id, t.key]));
  const manifestTemplates = new Map(manifest.templates.map((t) => [t.key, t]));
  const moduleById = new Map(state.modules.map((m) => [m.id, m]));
  for (const indicator of state.indicators) {
    const templateKey = templateKeyById.get(moduleById.get(indicator.module_id).template_id);
    const dual = gradesByKey.get(manifestTemplates.get(templateKey).gradeKey).isAlwaysGt === false;
    const has = (type) => expectationRows.some((e) => e.indicator_id === indicator.id && e.generation_type === type);
    if (!has('GT')) failures.push(`assessment_year_expectations ${indicator.code}: GT expectation missing`);
    if (dual && !has('GI')) failures.push(`assessment_year_expectations ${indicator.code}: GI expectation missing`);
  }

  // Migration plan complete
  const observedPlan = [];
  for (const desired of state.migrationPlan) {
    const row = migrationPlan.find((r) => r.year_number === desired.year_number && r.grade_id === desired.grade_id);
    if (!row) failures.push(`ab_migration_plan year ${desired.year_number} grade ${desired.grade_id}: missing`);
    else if (row.generation_type !== desired.generation_type) failures.push(`ab_migration_plan year ${desired.year_number} grade ${desired.grade_id}: generation_type differs`);
    else observedPlan.push({ school_id: row.school_id, year_number: row.year_number, grade_id: row.grade_id, generation_type: row.generation_type });
  }

  const untouched = await readUntouchedCounts(store, { schoolId: state.schoolId, snapshotIds: snapshots.map((s) => s.id) });

  const observedDigest = sha256(
    canonicalJson({
      school: school && manifest.mode === 'synthetic' ? { id: school.id, name: school.name, tenant_kind: school.tenant_kind } : null,
      templates: observedTemplates,
      objectives: observedChildren.objectives,
      modules: observedChildren.modules,
      indicators: observedChildren.indicators,
      expectations: observedChildren.expectations,
      yearWeights: observedChildren.yearWeights,
      migrationPlan: observedPlan,
      snapshots: observedSnapshots,
    }),
  );
  const expectedDigest = expectedStateDigest(state, inspection.gradeRows);
  if (observedDigest !== expectedDigest) failures.push('canonical post-apply digest does not match the manifest prediction');

  return result(failures.length === 0, failures, manifest, target, observedDigest, expectedDigest, untouched, schema, observedSnapshots);
}

function result(ok, failures, manifest, target, observedDigest, expectedDigest, untouchedCounts = null, schema = null, snapshots = null) {
  return Object.freeze({
    stage: 'verify',
    ok,
    readOnly: true,
    ...syntheticMarker(manifest),
    manifest: { version: manifest.manifestVersion, mode: manifest.mode, digest: manifest.digest },
    target: { name: target.targetName, projectRef: target.projectRef, environmentClass: target.environmentClass },
    schemaAttestation: schema ? { ok: schema.ok, digest: schema.digest } : null,
    failures,
    observedDigest,
    expectedDigest,
    snapshots,
    untouchedCounts,
  });
}
