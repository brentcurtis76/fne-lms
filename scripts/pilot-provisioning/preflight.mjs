import { buildDesiredState, canonicalJson, sha256, syntheticMarker } from './manifest.mjs';
import { attestSchema } from './schema-attestation.mjs';
import { attestSnapshotContent, buildExpectedSnapshot, snapshotDigest } from './snapshot.mjs';

/**
 * Read-only preflight. Produces the plan the operator reviews before `apply`
 * and the inspection the other stages reuse. Nothing here writes.
 *
 * Every stop condition is collected (not thrown) so the operator sees the
 * whole picture in one run; `plan.ok` is false when any stop or conflict
 * exists and `apply` refuses on that.
 */

export const REQUIRED_COLUMNS = Object.freeze({
  schools: ['id', 'name', 'tenant_kind'],
  ab_grades: ['id', 'name', 'sort_order', 'is_always_gt'],
  ab_migration_plan: ['id', 'school_id', 'year_number', 'grade_id', 'generation_type'],
  assessment_templates: ['id', 'area', 'grade_id', 'version', 'name', 'description', 'status', 'is_archived', 'scoring_config'],
  assessment_template_snapshots: ['id', 'template_id', 'version', 'snapshot_data', 'created_at'],
  assessment_objectives: ['id', 'template_id', 'name', 'description', 'display_order', 'weight'],
  assessment_modules: ['id', 'template_id', 'objective_id', 'name', 'description', 'instructions', 'display_order', 'weight'],
  assessment_indicators: [
    'id', 'module_id', 'code', 'name', 'description', 'category', 'frequency_config', 'frequency_unit_options',
    'level_0_descriptor', 'level_1_descriptor', 'level_2_descriptor', 'level_3_descriptor', 'level_4_descriptor',
    'detalle_options', 'evaluation_guidance', 'display_order', 'weight',
  ],
  assessment_year_expectations: [
    'id', 'template_id', 'indicator_id', 'generation_type', 'tolerance',
    'year_1_expected', 'year_2_expected', 'year_3_expected', 'year_4_expected', 'year_5_expected',
    'year_1_expected_unit', 'year_2_expected_unit', 'year_3_expected_unit', 'year_4_expected_unit', 'year_5_expected_unit',
  ],
  assessment_entity_year_weights: ['id', 'template_id', 'entity_type', 'entity_id', 'year', 'weight'],
  assessment_instances: ['id', 'template_snapshot_id', 'school_id'],
  school_course_structure: ['id', 'school_id'],
  school_course_docente_assignments: ['id', 'course_structure_id'],
  school_transversal_context: ['id', 'school_id'],
  profiles: ['id', 'school_id'],
  user_roles: ['id', 'school_id'],
});

/** Tables the provisioner reads for counts only and never writes, in any mode. */
export const UNTOUCHED_TABLES = Object.freeze([
  'auth.users',
  'profiles',
  'user_roles',
  'assessment_instances',
  'assessment_instance_assignees',
  'assessment_responses',
  'school_course_structure',
  'school_course_docente_assignments',
  'school_transversal_context',
]);

const CHILD_TABLES = Object.freeze([
  ['objectives', 'assessment_objectives'],
  ['modules', 'assessment_modules'],
  ['indicators', 'assessment_indicators'],
  ['expectations', 'assessment_year_expectations'],
  ['yearWeights', 'assessment_entity_year_weights'],
]);

const QA_NAME_RE = /(\bqa\b|\bdemo\b|\bprueba\b|\btest\b|\[sint[eé]tico\])/i;

function comparable(expected, actual) {
  if (typeof expected === 'number' && typeof actual === 'string' && actual.trim() !== '') {
    const n = Number(actual);
    return Number.isFinite(n) ? n : actual;
  }
  if (expected && typeof expected === 'object') return canonicalJson(actual);
  return actual;
}

/** True when every manifest-declared column of `expected` matches `actual`. */
export function rowMatches(expected, actual, columns) {
  for (const column of columns) {
    const e = expected[column];
    const a = comparable(e, actual?.[column]);
    if (e && typeof e === 'object') {
      if (canonicalJson(e) !== a) return false;
    } else if (typeof e === 'number') {
      if (a !== e) return false;
    } else if ((e ?? null) !== (a ?? null)) return false;
  }
  return true;
}

export function childColumns(table) {
  return REQUIRED_COLUMNS[table].filter((c) => c !== 'id');
}

const TEMPLATE_STATIC_COLUMNS = ['area', 'grade_id', 'name', 'description', 'scoring_config'];

export function isQaLikeName(name) {
  return QA_NAME_RE.test(String(name ?? ''));
}

/**
 * Resolves manifest grades to canonical ab_grades rows. Every grade must map
 * to exactly one row by sort_order whose name and is_always_gt match.
 */
export function mapGrades(manifest, gradeRows) {
  const gradeIdByKey = new Map();
  const problems = [];
  for (const grade of manifest.grades) {
    const matches = gradeRows.filter((row) => row.sort_order === grade.sortOrder);
    if (matches.length !== 1) {
      problems.push(`grade ${grade.key}: expected exactly one ab_grades row with sort_order ${grade.sortOrder}, found ${matches.length}`);
      continue;
    }
    const row = matches[0];
    const before = problems.length;
    if (row.name !== grade.expectedName) problems.push(`grade ${grade.key}: ab_grades name differs from expectedName`);
    if (row.is_always_gt !== grade.isAlwaysGt) problems.push(`grade ${grade.key}: ab_grades is_always_gt differs from manifest`);
    if (problems.length === before) gradeIdByKey.set(grade.key, row.id);
  }
  return { gradeIdByKey, problems };
}

/** Counts of the rows this tooling must never create, for before/after comparison. */
export async function readUntouchedCounts(store, { schoolId, snapshotIds }) {
  const courses = await store.readRows('school_course_structure', 'school_id', [schoolId], ['id', 'school_id']);
  const courseIds = courses.map((c) => c.id);
  return {
    instancesOnOwnedSnapshots: snapshotIds.length ? await store.countRows('assessment_instances', 'template_snapshot_id', snapshotIds) : 0,
    instancesOnSchool: await store.countRows('assessment_instances', 'school_id', [schoolId]),
    courseStructures: courses.length,
    docenteAssignments: courseIds.length ? await store.countRows('school_course_docente_assignments', 'course_structure_id', courseIds) : 0,
    transversalContexts: await store.countRows('school_transversal_context', 'school_id', [schoolId]),
    profilesOnSchool: await store.countRows('profiles', 'school_id', [schoolId]),
    userRolesOnSchool: await store.countRows('user_roles', 'school_id', [schoolId]),
  };
}

/**
 * Shared read-back: resolves grades, builds the desired state and reads every
 * owned or conflicting row. Used by preflight, verify and reset.
 */
export async function inspect(store, manifest) {
  const problems = [];
  const gradeRows = await store.readGrades();
  const mapped = mapGrades(manifest, gradeRows);
  problems.push(...mapped.problems);
  if (mapped.gradeIdByKey.size !== manifest.grades.length) {
    return { problems, gradeIdByKey: mapped.gradeIdByKey, state: null };
  }
  const state = buildDesiredState(manifest, mapped.gradeIdByKey);
  const gradeIds = [...new Set(state.templates.map((t) => t.grade_id))];
  const ownedTemplateIds = new Set(state.templates.map((t) => t.id));

  const gradeTemplates = await store.readTemplatesByGrades(gradeIds);
  const templatesById = new Map(gradeTemplates.map((t) => [t.id, t]));
  const owned = await store.readRows('assessment_templates', 'id', [...ownedTemplateIds], REQUIRED_COLUMNS.assessment_templates);
  for (const row of owned) templatesById.set(row.id, row);

  const children = {};
  for (const [stateKey, table] of CHILD_TABLES) {
    const ids = state[stateKey].map((r) => r.id);
    const rows = await store.readRows(table, 'id', ids, REQUIRED_COLUMNS[table]);
    children[table] = new Map(rows.map((r) => [r.id, r]));
  }
  // R8: the snapshot PAYLOAD is read, not just its identifiers.
  const snapshots = await store.readRows(
    'assessment_template_snapshots',
    'template_id',
    [...ownedTemplateIds],
    ['id', 'template_id', 'version', 'snapshot_data', 'created_at'],
  );
  const migrationPlan = await store.readMigrationPlan(state.schoolId);
  const school = await store.readSchool(state.schoolId);

  return {
    problems,
    gradeIdByKey: mapped.gradeIdByKey,
    gradeRows,
    state,
    gradeTemplates,
    templatesById,
    children,
    snapshots,
    migrationPlan,
    school,
  };
}

/** The ab_grades row (name, is_always_gt) an owned template's snapshot must carry. */
export function gradeRowForTemplate(state, gradeRows, templateKey) {
  const template = state.templates.find((t) => t.key === templateKey);
  return gradeRows.find((g) => g.id === template?.grade_id) ?? null;
}

/**
 * R8: attests the persisted snapshot_data of one owned template against the
 * deterministic expected published payload. Returns the failures (empty when
 * the content is exactly the approved one) and the canonical content digest.
 */
export function attestOwnedSnapshot({ state, gradeRows, snapshots, templateKey }) {
  const template = state.templates.find((t) => t.key === templateKey);
  const rows = snapshots.filter((s) => s.template_id === template.id && s.version === template.published_version);
  if (rows.length !== 1) {
    return { failures: [`assessment_template_snapshots ${templateKey}: expected exactly one snapshot at ${template.published_version}, found ${rows.length}`], digest: null };
  }
  const gradeRow = gradeRowForTemplate(state, gradeRows, templateKey);
  const expected = buildExpectedSnapshot(state, templateKey, gradeRow);
  const verdict = attestSnapshotContent({ row: rows[0], expected, templateId: template.id });
  return {
    failures: verdict.failures.map((f) => `assessment_template_snapshots ${templateKey}: ${f}`),
    digest: verdict.digest,
  };
}

/**
 * The canonical digest of the configuration `apply` leaves behind (owned
 * rows, published). R8: the projection carries the content digest of every
 * expected published snapshot, so the prediction is over the payloads, not
 * just their identifiers.
 */
export function expectedStateDigest(state, gradeRows) {
  const projection = {
    school: state.school,
    templates: state.templates.map((t) => ({
      id: t.id,
      area: t.area,
      grade_id: t.grade_id,
      name: t.name,
      description: t.description,
      scoring_config: t.scoring_config,
      status: 'published',
      version: t.published_version,
      is_archived: false,
    })),
    objectives: state.objectives,
    modules: state.modules,
    indicators: state.indicators,
    expectations: state.expectations,
    yearWeights: state.yearWeights,
    migrationPlan: state.migrationPlan,
    snapshots: state.templates.map((t) => ({
      template_id: t.id,
      version: t.published_version,
      contentDigest: snapshotDigest(buildExpectedSnapshot(state, t.key, gradeRowForTemplate(state, gradeRows, t.key))),
    })),
  };
  return sha256(canonicalJson(projection));
}

export async function runPreflight({ store, manifest, target, schemaExpectation }) {
  const stops = [];
  const conflicts = [];
  const warnings = [];
  const creates = {};
  const updates = {};
  const skips = {};
  const bump = (bucket, table, n = 1) => {
    bucket[table] = (bucket[table] ?? 0) + n;
  };

  // R10: versioned schema attestation FIRST. Nothing else is trusted until
  // the database proves it holds exactly the attested objects.
  const schemaAttestation = await attestSchema(store, schemaExpectation);
  stops.push(...schemaAttestation.stops);
  const schemaSummary = { attestation: { ok: schemaAttestation.ok, digest: schemaAttestation.digest, expectedDigest: schemaExpectation?.expectedDigest ?? null } };

  if (manifest.target !== target.targetName) stops.push('manifest target does not match the guarded target');
  if (manifest.environmentClass !== target.environmentClass) stops.push('manifest environment class does not match the guarded target');
  if (manifest.approved !== true) stops.push(`manifest ${manifest.manifestVersion} is not approved`);
  if (manifest.mode === 'realPilot' && target.environmentClass !== 'production') stops.push('realPilot mode requires the production-class target');
  if (manifest.mode === 'synthetic' && target.environmentClass !== 'staging') stops.push('synthetic mode requires the staging-class target');

  // Schema probes (read-only)
  const schema = { ...schemaSummary };
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const probe = await store.probeColumns(table, columns);
    schema[table] = probe.ok ? 'ok' : 'missing';
    if (!probe.ok) stops.push(`schema: ${table} lacks a required column or is unreadable (${probe.error ?? 'unknown'})`);
  }
  if (stops.length > 0) {
    return finish({ ok: false, manifest, target, stops, conflicts, warnings, creates, updates, skips, schema });
  }

  const inspection = await inspect(store, manifest);
  stops.push(...inspection.problems);
  if (!inspection.state) {
    return finish({ ok: false, manifest, target, stops, conflicts, warnings, creates, updates, skips, schema });
  }
  const { state, templatesById, gradeTemplates, children, snapshots, migrationPlan, school } = inspection;

  // School
  if (manifest.mode === 'synthetic') {
    if (!school) bump(creates, 'schools');
    else if (school.name !== state.school.name || school.tenant_kind !== 'qa') {
      conflicts.push(`schools ${state.schoolId}: exists but is not the synthetic school (name or tenant_kind differ)`);
    } else bump(skips, 'schools');
  } else if (!school) {
    stops.push(`schools ${state.schoolId}: pilot school does not exist`);
  } else if (school.tenant_kind && school.tenant_kind !== 'client') {
    stops.push(`schools ${state.schoolId}: pilot school tenant_kind is ${school.tenant_kind}, not client`);
  } else if (isQaLikeName(school.name)) {
    stops.push(`schools ${state.schoolId}: pilot school name looks like a QA/demo tenant`);
  }

  // Templates
  const ownedIds = new Set(state.templates.map((t) => t.id));
  const publishNeeded = [];
  for (const desired of state.templates) {
    const existing = templatesById.get(desired.id);
    if (existing) {
      if (existing.is_archived) {
        stops.push(`assessment_templates ${desired.key}: owned template is archived`);
        continue;
      }
      if (!rowMatches(desired, existing, TEMPLATE_STATIC_COLUMNS)) {
        conflicts.push(`assessment_templates ${desired.key}: owned row drifted from the manifest`);
        continue;
      }
      if (existing.status === 'published' && existing.version === desired.published_version) {
        bump(skips, 'assessment_templates');
        const snap = snapshots.find((s) => s.template_id === desired.id && s.version === desired.published_version);
        if (!snap) stops.push(`assessment_template_snapshots ${desired.key}: published template has no snapshot for its version`);
        // R8: an already-published owned template must carry EXACTLY the approved payload.
        else stops.push(...attestOwnedSnapshot({ state, gradeRows: inspection.gradeRows, snapshots, templateKey: desired.key }).failures);
      } else if (existing.status === 'draft' && existing.version === desired.draft_version) {
        publishNeeded.push(desired.key);
        bump(updates, 'assessment_templates');
      } else {
        conflicts.push(`assessment_templates ${desired.key}: unexpected status/version ${existing.status}/${existing.version}`);
      }
    } else {
      const collisions = gradeTemplates.filter(
        (t) =>
          !ownedIds.has(t.id) &&
          t.grade_id === desired.grade_id &&
          t.area === desired.area &&
          (t.version === desired.draft_version || t.version === desired.published_version || t.name === desired.name),
      );
      if (collisions.length > 0) {
        conflicts.push(`assessment_templates ${desired.key}: ${collisions.length} foreign template(s) collide on (area, grade, version|name)`);
        continue;
      }
      bump(creates, 'assessment_templates');
      publishNeeded.push(desired.key);
      bump(updates, 'assessment_templates');
    }
  }

  // Per-grade eligibility picture
  for (const grade of manifest.grades) {
    const gradeId = inspection.gradeIdByKey.get(grade.key);
    const eligible = gradeTemplates.filter((t) => t.grade_id === gradeId && t.status === 'published' && t.is_archived === false);
    const foreignEligible = eligible.filter((t) => !ownedIds.has(t.id));
    if (foreignEligible.length > 0) {
      conflicts.push(`grade ${grade.key}: ${foreignEligible.length} published non-archived template(s) not owned by this manifest`);
    }
    const qaLike = gradeTemplates.filter((t) => t.grade_id === gradeId && !ownedIds.has(t.id) && isQaLikeName(t.name));
    if (qaLike.length > 0) {
      const eligibleQa = qaLike.filter((t) => t.status === 'published' && t.is_archived === false);
      if (eligibleQa.length > 0) stops.push(`grade ${grade.key}: ${eligibleQa.length} eligible QA/demo-named template(s) present`);
      else warnings.push(`grade ${grade.key}: ${qaLike.length} non-eligible QA/demo-named template(s) present`);
    }
    const archived = gradeTemplates.filter((t) => t.grade_id === gradeId && t.is_archived === true);
    if (archived.length > 0) warnings.push(`grade ${grade.key}: ${archived.length} archived template(s) present (ignored)`);
    const byArea = new Map();
    for (const t of eligible) byArea.set(t.area, (byArea.get(t.area) ?? 0) + 1);
    for (const [area, n] of byArea) if (n > 1) conflicts.push(`grade ${grade.key}: ${n} eligible templates for area ${area} (duplicate)`);
  }

  // Children
  for (const [stateKey, table] of CHILD_TABLES) {
    const existing = children[table];
    const columns = childColumns(table);
    for (const desired of state[stateKey]) {
      const row = existing.get(desired.id);
      if (!row) bump(creates, table);
      else if (rowMatches(desired, row, columns)) bump(skips, table);
      else conflicts.push(`${table} ${desired.id}: owned row drifted from the manifest`);
    }
  }
  bump(creates, 'assessment_template_snapshots', publishNeeded.length);

  // Migration plan
  for (const desired of state.migrationPlan) {
    const row = migrationPlan.find((r) => r.year_number === desired.year_number && r.grade_id === desired.grade_id);
    if (!row) bump(creates, 'ab_migration_plan');
    else if (row.generation_type === desired.generation_type) bump(skips, 'ab_migration_plan');
    else conflicts.push(`ab_migration_plan year ${desired.year_number} grade ${desired.grade_id}: existing generation_type differs`);
  }
  const manifestGradeIds = new Set(state.migrationPlan.map((r) => r.grade_id));
  const extra = migrationPlan.filter(
    (r) => manifestGradeIds.has(r.grade_id) && !state.migrationPlan.some((d) => d.year_number === r.year_number && d.grade_id === r.grade_id),
  );
  if (extra.length > 0) warnings.push(`ab_migration_plan: ${extra.length} existing entries for manifest grades beyond the manifest years`);

  const untouched = await readUntouchedCounts(store, { schoolId: state.schoolId, snapshotIds: snapshots.map((s) => s.id) });
  for (const persona of manifest.rehearsalPersonas ?? []) {
    warnings.push(`rehearsal persona ${persona.role} is documented only; this tooling creates no users`);
  }

  const ok = stops.length === 0 && conflicts.length === 0;
  return finish({
    ok, manifest, target, stops, conflicts, warnings, creates, updates, skips, schema,
    extra: {
      gradeMapping: Object.fromEntries(inspection.gradeIdByKey),
      publishNeeded,
      untouchedCounts: untouched,
      expectedStateDigest: expectedStateDigest(state, inspection.gradeRows),
    },
  });
}

function finish({ ok, manifest, target, stops, conflicts, warnings, creates, updates, skips, schema, extra = {} }) {
  return Object.freeze({
    ok,
    stage: 'preflight',
    readOnly: true,
    ...syntheticMarker(manifest),
    manifest: { version: manifest.manifestVersion, mode: manifest.mode, digest: manifest.digest },
    target: { name: target.targetName, projectRef: target.projectRef, environmentClass: target.environmentClass },
    schema,
    plan: { creates, updates, skips },
    conflicts,
    stops,
    warnings,
    untouchedTables: [...UNTOUCHED_TABLES],
    ...extra,
  });
}
