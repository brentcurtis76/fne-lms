import { canonicalJson, sha256 } from './manifest.mjs';

/**
 * Snapshot CONTENT attestation (review remediation R8).
 *
 * preflight / verify used to read snapshot rows without `snapshot_data` and
 * hashed identifiers (template_id, version) only, so a stale, foreign or
 * tampered payload passed. This module reproduces, field by field, the
 * payload the shared publication service writes
 * (lib/services/assessment-builder/publishTemplate.ts, `snapshotData`) from
 * the rows the manifest owns, so the provisioner can compare the persisted
 * `snapshot_data` against a deterministic expectation and hash it.
 *
 * VOLATILE FIELDS (the only ones excluded from the comparison and the digest):
 *   - `published_at`         — wall-clock time of the publication
 *   - `published_by`         — the actor id passed to the service (nil-actor
 *                              or --actor; a pending product decision)
 *   - `template.created_at`  — the template row's insertion time
 * plus ONE normalisation: the entries of `yearWeights[year].{objectives,
 * modules,indicators}` are sorted by id, because the service groups them from
 * an unordered SELECT. Everything else — including the absence of a key the
 * service never emits — must match exactly.
 *
 * __tests__/scripts/pilot-provisioning/snapshot-parity.test.ts runs the REAL
 * TypeScript service over the same rows and asserts equality with
 * buildSnapshotFromRows, so this reproduction cannot drift silently.
 */

export const VOLATILE_SNAPSHOT_FIELDS = Object.freeze(['published_at', 'published_by', 'template.created_at']);

/** Mirrors lib/services/assessment-builder/indicatorCategoryColumns.ts. */
function categoryScopedColumns(indicator) {
  const isRubric = indicator.category === 'profundidad';
  const isFrequency = indicator.category === 'frecuencia';
  const isDetalle = indicator.category === 'detalle';
  return {
    frequency_config: isFrequency ? indicator.frequency_config ?? null : null,
    frequency_unit_options: isFrequency ? indicator.frequency_unit_options ?? null : null,
    level_0_descriptor: isRubric ? indicator.level_0_descriptor ?? null : null,
    level_1_descriptor: isRubric ? indicator.level_1_descriptor ?? null : null,
    level_2_descriptor: isRubric ? indicator.level_2_descriptor ?? null : null,
    level_3_descriptor: isRubric ? indicator.level_3_descriptor ?? null : null,
    level_4_descriptor: isRubric ? indicator.level_4_descriptor ?? null : null,
    detalle_options: isDetalle ? indicator.detalle_options ?? null : null,
  };
}

function expectationData(exp) {
  return {
    year_1_expected: exp.year_1_expected ?? null,
    year_1_expected_unit: exp.year_1_expected_unit ?? null,
    year_2_expected: exp.year_2_expected ?? null,
    year_2_expected_unit: exp.year_2_expected_unit ?? null,
    year_3_expected: exp.year_3_expected ?? null,
    year_3_expected_unit: exp.year_3_expected_unit ?? null,
    year_4_expected: exp.year_4_expected ?? null,
    year_4_expected_unit: exp.year_4_expected_unit ?? null,
    year_5_expected: exp.year_5_expected ?? null,
    year_5_expected_unit: exp.year_5_expected_unit ?? null,
    tolerance: exp.tolerance ?? null,
  };
}

const byDisplayOrder = (a, b) => a.display_order - b.display_order;

/**
 * The snapshot payload the publish service produces for these rows. Pure and
 * deterministic; `published_at` / `published_by` / `template.created_at` are
 * emitted only when provided (the parity test provides them, verify does not).
 */
export function buildSnapshotFromRows({ template, grade, objectives, modules, indicators, expectations, yearWeights, actorId, publishedAt }) {
  const isAlwaysGT = grade?.is_always_gt ?? true;
  const requiresDualExpectations = !isAlwaysGT;

  const gt = new Map();
  const gi = new Map();
  for (const exp of expectations ?? []) {
    const data = expectationData(exp);
    if ((exp.generation_type || 'GT') === 'GT') gt.set(exp.indicator_id, data);
    else gi.set(exp.indicator_id, data);
  }

  const sortedModules = [...(modules ?? [])].sort(byDisplayOrder);
  const sortedIndicators = [...(indicators ?? [])].sort(byDisplayOrder);
  const sortedObjectives = [...(objectives ?? [])].sort(byDisplayOrder);

  const indicatorSnapshot = (indicator) => {
    const out = {
      id: indicator.id,
      code: indicator.code,
      name: indicator.name,
      description: indicator.description ?? null,
      category: indicator.category,
      ...categoryScopedColumns(indicator),
      display_order: indicator.display_order,
      weight: indicator.weight,
      expectations_gt: gt.get(indicator.id) || null,
      expectations_gi: requiresDualExpectations ? gi.get(indicator.id) || null : null,
      expectations: gt.get(indicator.id) || null,
    };
    // The service reads `indicator.sub_questions`, a column that does not
    // exist on assessment_indicators: undefined, dropped by JSON.
    if (indicator.sub_questions !== undefined) out.sub_questions = indicator.sub_questions;
    return out;
  };
  const moduleSnapshot = (module) => ({
    id: module.id,
    name: module.name,
    description: module.description ?? null,
    instructions: module.instructions ?? null,
    display_order: module.display_order,
    weight: module.weight,
    objective_id: module.objective_id || null,
    indicators: sortedIndicators.filter((i) => i.module_id === module.id).map(indicatorSnapshot),
  });

  const grouped = {};
  for (const row of yearWeights ?? []) {
    const year = Number(row.year);
    if (!grouped[year]) grouped[year] = { objectives: [], modules: [], indicators: [] };
    const entry = { id: row.entity_id, weight: Number(row.weight) };
    if (row.entity_type === 'objective') grouped[year].objectives.push(entry);
    else if (row.entity_type === 'module') grouped[year].modules.push(entry);
    else if (row.entity_type === 'indicator') grouped[year].indicators.push(entry);
  }
  // The service groups from an unordered SELECT; the canonical form sorts
  // every bucket by id (see canonicalizeObservedSnapshot) so do it here too.
  for (const bucket of Object.values(grouped)) {
    for (const list of ['objectives', 'modules', 'indicators']) bucket[list].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  const snapshot = {
    template: {
      id: template.id,
      name: template.name,
      description: template.description ?? null,
      area: template.area,
      grade_id: template.grade_id,
      grade_name: grade?.name,
      is_always_gt: isAlwaysGT,
      requires_dual_expectations: requiresDualExpectations,
      scoring_config: template.scoring_config,
    },
    objectives: sortedObjectives.map((objective) => ({
      id: objective.id,
      name: objective.name,
      description: objective.description ?? null,
      display_order: objective.display_order,
      weight: objective.weight,
      modules: sortedModules.filter((m) => m.objective_id === objective.id).map(moduleSnapshot),
    })),
    modules: sortedModules.map(moduleSnapshot),
  };
  if (Object.keys(grouped).length > 0) snapshot.yearWeights = grouped;
  if (template.created_at !== undefined) snapshot.template.created_at = template.created_at;
  if (publishedAt !== undefined) snapshot.published_at = publishedAt;
  if (actorId !== undefined) snapshot.published_by = actorId;
  return snapshot;
}

/** The expected published payload for one owned template of the desired state, volatile fields excluded. */
export function buildExpectedSnapshot(state, templateKey, gradeRow) {
  const template = state.templates.find((t) => t.key === templateKey);
  if (!template) throw new Error(`unknown template key ${templateKey}`);
  const moduleIds = new Set(state.modules.filter((m) => m.template_id === template.id).map((m) => m.id));
  return buildSnapshotFromRows({
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      area: template.area,
      grade_id: template.grade_id,
      scoring_config: template.scoring_config,
    },
    grade: gradeRow,
    objectives: state.objectives.filter((o) => o.template_id === template.id),
    modules: state.modules.filter((m) => m.template_id === template.id),
    indicators: state.indicators.filter((i) => moduleIds.has(i.module_id)),
    expectations: state.expectations.filter((e) => e.template_id === template.id),
    yearWeights: state.yearWeights.filter((w) => w.template_id === template.id),
  });
}

const NUMERIC_STRING_RE = /^-?\d+(\.\d+)?$/;

/**
 * Canonical form of an OBSERVED snapshot_data: the volatile fields removed,
 * the yearWeights entries sorted by id, and numeric strings coerced to numbers
 * wherever the EXPECTED payload carries a number at the same path (PostgREST
 * may serialise numeric columns as strings). Nothing else is touched, so an
 * extra key, a missing key or a changed value stays visible.
 */
export function canonicalizeObservedSnapshot(observed, expected) {
  if (!observed || typeof observed !== 'object' || Array.isArray(observed)) return observed;
  // JSON round-trip: what the database holds (undefined keys are dropped).
  const clone = JSON.parse(JSON.stringify(observed));
  delete clone.published_at;
  delete clone.published_by;
  if (clone.template && typeof clone.template === 'object') delete clone.template.created_at;
  if (clone.yearWeights && typeof clone.yearWeights === 'object') {
    for (const bucket of Object.values(clone.yearWeights)) {
      if (!bucket || typeof bucket !== 'object') continue;
      for (const list of ['objectives', 'modules', 'indicators']) {
        if (Array.isArray(bucket[list])) bucket[list].sort((a, b) => String(a?.id).localeCompare(String(b?.id)));
      }
    }
  }
  return coerceAgainst(clone, expected);
}

function coerceAgainst(actual, expected) {
  if (typeof expected === 'number' && typeof actual === 'string' && NUMERIC_STRING_RE.test(actual)) return Number(actual);
  if (Array.isArray(expected) && Array.isArray(actual)) return actual.map((item, i) => coerceAgainst(item, expected[i]));
  if (expected && typeof expected === 'object' && actual && typeof actual === 'object' && !Array.isArray(actual)) {
    const out = {};
    for (const [key, value] of Object.entries(actual)) out[key] = coerceAgainst(value, expected[key]);
    return out;
  }
  return actual;
}

/** Paths at which two canonical payloads differ (empty when identical). */
export function snapshotDifferences(observed, expected, path = '') {
  const differences = [];
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (Array.isArray(expected) || Array.isArray(observed)) {
    if (!Array.isArray(expected) || !Array.isArray(observed) || expected.length !== observed.length) {
      differences.push(path || '$');
      return differences;
    }
    expected.forEach((item, i) => differences.push(...snapshotDifferences(observed[i], item, `${path}[${i}]`)));
    return differences;
  }
  if (isObject(expected) || isObject(observed)) {
    if (!isObject(expected) || !isObject(observed)) {
      differences.push(path || '$');
      return differences;
    }
    const keys = new Set([...Object.keys(expected), ...Object.keys(observed)]);
    for (const key of [...keys].sort()) {
      const next = path ? `${path}.${key}` : key;
      if (!(key in expected) || !(key in observed)) differences.push(next);
      else differences.push(...snapshotDifferences(observed[key], expected[key], next));
    }
    return differences;
  }
  if (canonicalJson(observed) !== canonicalJson(expected)) differences.push(path || '$');
  return differences;
}

export function snapshotDigest(canonicalSnapshot) {
  return sha256(canonicalJson(canonicalSnapshot));
}

/**
 * Full check of one persisted snapshot row against the expectation for its
 * template: the payload must be an object whose template id is the owned
 * template (a foreign or copied payload fails here first), and every
 * non-volatile field must match. Returns the observed canonical digest.
 */
export function attestSnapshotContent({ row, expected, templateId }) {
  const failures = [];
  const data = row?.snapshot_data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, failures: ['snapshot_data is missing or not an object'], digest: null };
  }
  if (data.template?.id !== templateId) {
    failures.push(`snapshot_data.template.id is not the owned template (foreign or stale payload)`);
  }
  const canonical = canonicalizeObservedSnapshot(data, expected);
  const differences = snapshotDifferences(canonical, expected);
  if (differences.length > 0) failures.push(`snapshot_data differs from the expected published payload at ${differences.slice(0, 8).join(', ')}${differences.length > 8 ? ', …' : ''}`);
  return { ok: failures.length === 0, failures, digest: snapshotDigest(canonical) };
}
