import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { v5 as uuidv5 } from 'uuid';

/**
 * Pilot provisioning manifests: load, validate, lint for PII/credentials, and
 * digest. Pure module (no network). A manifest never carries a UUID, an email
 * outside a reserved non-delivering domain, a URL, a credential, a RUT, a birth
 * date, or a key named like a secret; `lintManifestSafety` refuses all of them
 * regardless of mode.
 *
 * Identifiers are DERIVED, never written into the manifest: every owned row id
 * is uuidv5(`<manifestVersion>:<kind>:<key>`) under a namespace that is itself
 * derived from the manifest version, so re-running the same manifest addresses
 * the same rows and a different manifest version can never collide with them.
 */

export const ROOT_NAMESPACE = '2f0c6f0e-6d1e-5a3b-9d0a-4e7c2a7f1b55';
export const MODES = Object.freeze(['synthetic', 'realPilot']);
export const INDICATOR_CATEGORIES = Object.freeze(['cobertura', 'frecuencia', 'profundidad', 'traspaso', 'detalle']);
export const FREQUENCY_UNITS = Object.freeze(['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año']);
export const GENERATION_TYPES = Object.freeze(['GT', 'GI']);
export const ENTITY_TYPES = Object.freeze(['objective', 'module', 'indicator']);
export const RESERVED_EMAIL_DOMAINS = Object.freeze(['example.com', 'example.net', 'example.org']);
export const RESERVED_EMAIL_TLDS = Object.freeze(['.test', '.invalid', '.example']);
/** Manifest paths whose ISO date strings are expected (scenario clock, approval stamp). */
const DATE_ALLOWED_KEYS = new Set(['scenarioEpoch', 'approvedAt']);

export const MODE_RULES = Object.freeze({
  synthetic: Object.freeze({ target: 'staging', environmentClass: 'staging' }),
  realPilot: Object.freeze({ target: 'realPilot', environmentClass: 'production' }),
});

/**
 * R11: the conspicuous non-production marker every stage result and audit
 * record carries for a synthetic manifest, so no output of the rehearsal
 * can be mistaken for real-pilot or production evidence.
 */
export const SYNTHETIC_OUTPUT_MARKER = '[SINTÉTICO — NO PRODUCCIÓN] datos de ensayo, no son evidencia de piloto real';

export function syntheticMarker(manifest) {
  if (manifest?.mode === 'synthetic') {
    return { synthetic: true, notProduction: true, marker: SYNTHETIC_OUTPUT_MARKER };
  }
  return { synthetic: false };
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => key !== '_comment')
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Canonical digest: sha256 over the sorted-key JSON with every `_comment` and the digest itself removed. */
export function digestManifest(manifest) {
  const { digest: _ignored, ...rest } = manifest;
  return sha256(canonicalJson(rest));
}

export function namespaceFor(manifestVersion) {
  return uuidv5(`pilot-provisioning:${manifestVersion}`, ROOT_NAMESPACE);
}

export function idFor(manifestVersion, kind, key) {
  return uuidv5(`${manifestVersion}:${kind}:${key}`, namespaceFor(manifestVersion));
}

/** Mirrors the publish service: minor + 1, patch reset. */
export function publishedVersionFor(draftVersion) {
  const parts = String(draftVersion || '1.0.0').split('.').map(Number);
  parts[1] = (parts[1] || 0) + 1;
  parts[2] = 0;
  return parts.join('.');
}

// ---------------------------------------------------------------------------
// Safety lint
// ---------------------------------------------------------------------------

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/;
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/;
const SECRET_KEY_RE = /(password|passwd|secret|token|api[_-]?key|apikey|service[_-]?role|private[_-]?key|credential)/i;
const BIRTH_KEY_RE = /(birth|nacimiento|fecha_nac|dob\b)/i;
const CREDENTIAL_VALUE_PREFIXES = ['ey' + 'J', 'sb_', 'postgres://', 'postgresql://'];
const PROHIBITED_TERMS = ['estudiante', 'alumno', 'alumna', 'apoderado', 'apoderada', 'menor de edad'];

export function isReservedEmail(email) {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (RESERVED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  return RESERVED_EMAIL_TLDS.some((tld) => domain.endsWith(tld));
}

function walk(value, path, visit) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      visit.key(key, path ? `${path}.${key}` : key);
      walk(nested, path ? `${path}.${key}` : key, visit);
    }
    return;
  }
  visit.leaf(value, path);
}

/**
 * Returns the list of safety findings (empty when clean). Findings never echo
 * the offending value, only the manifest path and the rule.
 */
export function lintManifestSafety(manifest) {
  const findings = [];
  walk(manifest, '', {
    key(key, path) {
      if (SECRET_KEY_RE.test(key)) findings.push({ path, rule: 'secret-named-key' });
      if (BIRTH_KEY_RE.test(key)) findings.push({ path, rule: 'birth-date-key' });
    },
    leaf(value, path) {
      if (typeof value !== 'string') return;
      const lower = value.toLowerCase();
      for (const prefix of CREDENTIAL_VALUE_PREFIXES) {
        if (value.includes(prefix)) findings.push({ path, rule: 'credential-shaped-value' });
      }
      if (value.includes('://')) findings.push({ path, rule: 'url-value' });
      if (UUID_RE.test(value)) findings.push({ path, rule: 'uuid-value' });
      if (RUT_RE.test(value)) findings.push({ path, rule: 'rut-shaped-value' });
      const leafKey = path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? '';
      if (ISO_DATE_RE.test(value) && !DATE_ALLOWED_KEYS.has(leafKey)) findings.push({ path, rule: 'date-value' });
      for (const match of value.matchAll(EMAIL_RE)) {
        if (!isReservedEmail(match[0])) findings.push({ path, rule: 'non-reserved-email' });
      }
      for (const term of PROHIBITED_TERMS) {
        if (lower.includes(term)) findings.push({ path, rule: `prohibited-term:${term}` });
      }
    },
  });
  return findings;
}

export function assertManifestSafety(manifest) {
  const findings = lintManifestSafety(manifest);
  if (findings.length > 0) {
    const summary = findings.map((f) => `${f.path} (${f.rule})`).join('; ');
    throw new Error(`refusing manifest: safety lint failed: ${summary}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

const isInt = (v) => Number.isSafeInteger(v);
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

/**
 * The frequency contract as the platform enforces it at publish
 * (lib/services/assessment-builder/frequencyConfig.ts validateFrequencyConfig)
 * and at response time (parseSnapshotFrequencyConfig): known keys only, text
 * `type` if present, finite min < max, finite step > 0 that fits inside
 * max - min, an exact platform unit, and a non-empty allowed_units list of
 * exact platform units containing the unit. This file is plain ESM loaded by
 * bare node, so the rule is restated here; parity with the TypeScript rule
 * is pinned by __tests__/fixtures/frequency-config-contract.ts (Codex round
 * 2, finding A). `min < max` is exact; the step-fits comparison uses the same
 * tolerance as `frequencyTolerance` in frequencyConfig.ts (round 4, finding
 * R5-2): FREQUENCY_TOLERANCE_ULPS units in the last place of the largest
 * operand — representation error only — so a decimal boundary such as step
 * 0.2 in 0.1..0.3 (`0.3 - 0.1 === 0.19999999999999998`) is accepted by every
 * side while no step difference a double can express is swallowed.
 */
const FREQUENCY_CONFIG_KEYS = Object.freeze(['type', 'min', 'max', 'step', 'unit', 'allowed_units']);
export const FREQUENCY_TOLERANCE_ULPS = 8;

const ULP_VIEW = new DataView(new ArrayBuffer(8));

/** Unit in the last place of |x| (see frequencyConfig.ts `ulp`). */
export function ulp(x) {
  const a = Math.abs(x);
  if (!Number.isFinite(a)) return Number.NaN;
  if (a === 0) return Number.MIN_VALUE;
  ULP_VIEW.setFloat64(0, a);
  const exponent = (ULP_VIEW.getUint32(0) >>> 20) & 0x7ff;
  if (exponent === 0) return Number.MIN_VALUE;
  return Math.pow(2, exponent - 1023 - 52);
}

export function frequencyTolerance(...operands) {
  let scale = 0;
  for (const v of operands) {
    const a = Math.abs(v);
    if (a > scale) scale = a;
  }
  return FREQUENCY_TOLERANCE_ULPS * ulp(scale);
}

export function validateFrequencyConfigShape(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['frequency_config missing'];
  const unknownKey = Object.keys(config).find((k) => !FREQUENCY_CONFIG_KEYS.includes(k));
  if (unknownKey !== undefined) errors.push(`unknown key ${unknownKey}`);
  if (config.type !== undefined && config.type !== null && typeof config.type !== 'string') errors.push('type must be text');
  const minOk = isFiniteNumber(config.min);
  const maxOk = isFiniteNumber(config.max);
  const stepOk = isFiniteNumber(config.step);
  if (!minOk) errors.push('min must be a number');
  if (!maxOk) errors.push('max must be a number');
  const rangeOk = minOk && maxOk && config.min < config.max; // strict and exact (R5-2)
  if (minOk && maxOk && !rangeOk) errors.push('min must be < max');
  if (!stepOk || config.step <= 0) errors.push('step must be > 0');
  if (rangeOk && stepOk && config.step > 0 && config.step - (config.max - config.min) > frequencyTolerance(config.min, config.max, config.step)) {
    errors.push('step must fit inside max - min');
  }
  if (!FREQUENCY_UNITS.includes(config.unit)) errors.push('unit must be a known frequency unit');
  const allowed = config.allowed_units;
  if (!Array.isArray(allowed) || allowed.length === 0 || !allowed.every((u) => FREQUENCY_UNITS.includes(u))) {
    errors.push('allowed_units must be a non-empty list of known units');
  } else if (FREQUENCY_UNITS.includes(config.unit) && !allowed.includes(config.unit)) {
    errors.push('unit must be in allowed_units');
  }
  return errors;
}

function validateExpectation(exp, label, errors, { requiresUnit }) {
  if (!exp || typeof exp !== 'object') {
    errors.push(`${label}: expectation missing`);
    return;
  }
  if (!Array.isArray(exp.expected) || exp.expected.length !== 5 || !exp.expected.every((n) => isInt(n) && n >= 0)) {
    errors.push(`${label}: expected must list five non-negative integers (years 1-5)`);
  }
  if (exp.tolerance !== undefined && (!isInt(exp.tolerance) || exp.tolerance < 0 || exp.tolerance > 2)) {
    errors.push(`${label}: tolerance must be 0..2`);
  }
  if (requiresUnit && !FREQUENCY_UNITS.includes(exp.unit)) errors.push(`${label}: unit must be a known frequency unit`);
  if (!requiresUnit && exp.unit !== undefined && exp.unit !== null) errors.push(`${label}: unit only applies to frecuencia`);
}

export function computeExpectedCounts(manifest) {
  const counts = {
    templates: 0,
    objectives: 0,
    modules: 0,
    indicators: 0,
    expectations: 0,
    yearWeights: 0,
    snapshots: 0,
    migrationPlanEntries: 0,
  };
  const gradesByKey = new Map((manifest.grades ?? []).map((g) => [g.key, g]));
  for (const template of manifest.templates ?? []) {
    counts.templates += 1;
    counts.snapshots += 1;
    counts.yearWeights += (template.yearWeights ?? []).length;
    const grade = gradesByKey.get(template.gradeKey);
    const dual = grade ? grade.isAlwaysGt === false : false;
    for (const objective of template.objectives ?? []) {
      counts.objectives += 1;
      for (const module of objective.modules ?? []) {
        counts.modules += 1;
        for (const _indicator of module.indicators ?? []) {
          counts.indicators += 1;
          counts.expectations += dual ? 2 : 1;
        }
      }
    }
  }
  for (const grade of manifest.grades ?? []) counts.migrationPlanEntries += (grade.migrationPlan ?? []).length;
  return counts;
}

/** Returns the list of shape errors (empty when valid). Does not lint safety. */
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['manifest must be an object'];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!isNonEmptyString(manifest.manifestVersion) || !/^[a-z0-9][a-z0-9.-]*$/.test(manifest.manifestVersion)) {
    errors.push('manifestVersion must be a lowercase slug');
  }
  if (!MODES.includes(manifest.mode)) errors.push('mode must be synthetic or realPilot');
  const rule = MODE_RULES[manifest.mode];
  if (rule) {
    if (manifest.target !== rule.target) errors.push(`target must be ${rule.target} for mode ${manifest.mode}`);
    if (manifest.environmentClass !== rule.environmentClass) {
      errors.push(`environmentClass must be ${rule.environmentClass} for mode ${manifest.mode}`);
    }
  }
  if (typeof manifest.approved !== 'boolean') errors.push('approved must be boolean');
  if (!isNonEmptyString(manifest.scenarioEpoch) || Number.isNaN(Date.parse(manifest.scenarioEpoch))) {
    errors.push('scenarioEpoch must be an ISO timestamp');
  }

  if (manifest.mode === 'synthetic') {
    if (!isNonEmptyString(manifest.syntheticMarker)) errors.push('syntheticMarker is required in synthetic mode');
    const school = manifest.syntheticSchool;
    if (!school || typeof school !== 'object') {
      errors.push('syntheticSchool is required in synthetic mode');
    } else {
      if (!isInt(school.id) || school.id <= 0) errors.push('syntheticSchool.id must be a positive integer');
      if (!isNonEmptyString(school.name) || !school.name.startsWith(manifest.syntheticMarker ?? ' ')) {
        errors.push('syntheticSchool.name must start with the synthetic marker');
      }
      if (school.tenantKind !== 'qa') errors.push('syntheticSchool.tenantKind must be qa');
    }
    if ('pilotSchoolId' in manifest) errors.push('pilotSchoolId is not allowed in synthetic mode');
    for (const [index, persona] of (manifest.rehearsalPersonas ?? []).entries()) {
      const label = `rehearsalPersonas[${index}]`;
      if (!isNonEmptyString(persona?.role)) errors.push(`${label}: role missing`);
      if (!isNonEmptyString(persona?.displayName)) errors.push(`${label}: displayName missing`);
      if (!isNonEmptyString(persona?.email) || !isReservedEmail(persona.email)) {
        errors.push(`${label}: email must be on a reserved non-delivering domain`);
      }
      if (persona?.createdByThisTooling !== false) {
        errors.push(`${label}: createdByThisTooling must be false (this tooling never creates users)`);
      }
    }
  } else if (manifest.mode === 'realPilot') {
    if (manifest.pilotSchoolId === null || manifest.pilotSchoolId === undefined) {
      errors.push('pilotSchoolId is null: the pilot school has not been decided');
    } else if (!isInt(manifest.pilotSchoolId) || manifest.pilotSchoolId <= 0) {
      errors.push('pilotSchoolId must be a positive integer');
    }
    if ('syntheticSchool' in manifest) errors.push('syntheticSchool is not allowed in realPilot mode');
    if ('rehearsalPersonas' in manifest) errors.push('rehearsalPersonas are not allowed in realPilot mode');
  }

  // Grades
  const grades = manifest.grades;
  const gradeKeys = new Set();
  if (!Array.isArray(grades) || grades.length === 0) {
    errors.push('grades must be a non-empty list');
  } else {
    for (const [index, grade] of grades.entries()) {
      const label = `grades[${index}]`;
      if (!isNonEmptyString(grade?.key) || !KEY_RE.test(grade.key)) errors.push(`${label}: key invalid`);
      else if (gradeKeys.has(grade.key)) errors.push(`${label}: duplicate key`);
      else gradeKeys.add(grade.key);
      if (!isInt(grade?.sortOrder) || grade.sortOrder <= 0) errors.push(`${label}: sortOrder must be a positive integer`);
      if (!isNonEmptyString(grade?.expectedName)) errors.push(`${label}: expectedName missing`);
      if (typeof grade?.isAlwaysGt !== 'boolean') errors.push(`${label}: isAlwaysGt must be boolean`);
      if (!GENERATION_TYPES.includes(grade?.generationType)) errors.push(`${label}: generationType must be GT or GI`);
      const plan = grade?.migrationPlan;
      if (!Array.isArray(plan) || plan.length === 0) {
        errors.push(`${label}: migrationPlan must be a non-empty list`);
      } else {
        const years = new Set();
        for (const entry of plan) {
          if (!isInt(entry?.yearNumber) || entry.yearNumber < 1 || entry.yearNumber > 5) {
            errors.push(`${label}: migrationPlan yearNumber must be 1..5`);
          } else if (years.has(entry.yearNumber)) {
            errors.push(`${label}: migrationPlan duplicate yearNumber`);
          } else years.add(entry.yearNumber);
          if (!GENERATION_TYPES.includes(entry?.generationType)) errors.push(`${label}: migrationPlan generationType invalid`);
        }
      }
    }
  }

  // Templates
  const templates = manifest.templates;
  const templateKeys = new Set();
  const naturalKeys = new Set();
  const gradesCovered = new Set();
  if (!Array.isArray(templates) || templates.length === 0) {
    errors.push('templates must be a non-empty list');
  } else {
    const gradesByKey = new Map((grades ?? []).map((g) => [g?.key, g]));
    for (const [tIndex, template] of templates.entries()) {
      const label = `templates[${tIndex}]`;
      if (!isNonEmptyString(template?.key) || !KEY_RE.test(template.key)) errors.push(`${label}: key invalid`);
      else if (templateKeys.has(template.key)) errors.push(`${label}: duplicate key`);
      else templateKeys.add(template.key);
      const grade = gradesByKey.get(template?.gradeKey);
      if (!grade) errors.push(`${label}: gradeKey does not reference a manifest grade`);
      else gradesCovered.add(grade.key);
      if (!isNonEmptyString(template?.area) || !/^[a-z_]+$/.test(template.area)) errors.push(`${label}: area invalid`);
      if (!isNonEmptyString(template?.name)) errors.push(`${label}: name missing`);
      if (manifest.mode === 'synthetic' && isNonEmptyString(template?.name) && !template.name.startsWith(manifest.syntheticMarker ?? ' ')) {
        errors.push(`${label}: name must start with the synthetic marker`);
      }
      if (!isNonEmptyString(template?.draftVersion) || !VERSION_RE.test(template.draftVersion)) {
        errors.push(`${label}: draftVersion must be semver-like`);
      }
      if (template?.scoringConfig !== undefined && (typeof template.scoringConfig !== 'object' || template.scoringConfig === null)) {
        errors.push(`${label}: scoringConfig must be an object`);
      }
      const natural = `${template?.area}|${template?.gradeKey}|${template?.draftVersion}`;
      if (naturalKeys.has(natural)) errors.push(`${label}: duplicate (area, grade, version) natural key`);
      naturalKeys.add(natural);

      const dual = grade ? grade.isAlwaysGt === false : false;
      const entityKeys = new Set();
      const objectives = template?.objectives;
      if (!Array.isArray(objectives) || objectives.length === 0) {
        errors.push(`${label}: objectives must be a non-empty list`);
        continue;
      }
      let indicatorCount = 0;
      for (const [oIndex, objective] of objectives.entries()) {
        const oLabel = `${label}.objectives[${oIndex}]`;
        if (!isNonEmptyString(objective?.key) || !KEY_RE.test(objective.key) || entityKeys.has(objective.key)) {
          errors.push(`${oLabel}: key invalid or duplicate`);
        } else entityKeys.add(objective.key);
        if (!isNonEmptyString(objective?.name)) errors.push(`${oLabel}: name missing`);
        if (!isFiniteNumber(objective?.weight) || objective.weight < 0) errors.push(`${oLabel}: weight invalid`);
        const modules = objective?.modules;
        if (!Array.isArray(modules) || modules.length === 0) {
          errors.push(`${oLabel}: modules must be a non-empty list`);
          continue;
        }
        for (const [mIndex, module] of modules.entries()) {
          const mLabel = `${oLabel}.modules[${mIndex}]`;
          if (!isNonEmptyString(module?.key) || !KEY_RE.test(module.key) || entityKeys.has(module.key)) {
            errors.push(`${mLabel}: key invalid or duplicate`);
          } else entityKeys.add(module.key);
          if (!isNonEmptyString(module?.name)) errors.push(`${mLabel}: name missing`);
          if (!isFiniteNumber(module?.weight) || module.weight < 0 || module.weight > 10) errors.push(`${mLabel}: weight invalid`);
          const indicators = module?.indicators;
          if (!Array.isArray(indicators) || indicators.length === 0) {
            errors.push(`${mLabel}: indicators must be a non-empty list`);
            continue;
          }
          for (const [iIndex, indicator] of indicators.entries()) {
            indicatorCount += 1;
            const iLabel = `${mLabel}.indicators[${iIndex}]`;
            if (!isNonEmptyString(indicator?.key) || !KEY_RE.test(indicator.key) || entityKeys.has(indicator.key)) {
              errors.push(`${iLabel}: key invalid or duplicate`);
            } else entityKeys.add(indicator.key);
            if (!isNonEmptyString(indicator?.code)) errors.push(`${iLabel}: code missing`);
            if (!isNonEmptyString(indicator?.name)) errors.push(`${iLabel}: name missing`);
            if (!INDICATOR_CATEGORIES.includes(indicator?.category)) errors.push(`${iLabel}: category invalid`);
            if (!isFiniteNumber(indicator?.weight) || indicator.weight < 0 || indicator.weight > 10) errors.push(`${iLabel}: weight invalid`);
            const isFrequency = indicator?.category === 'frecuencia';
            if (isFrequency) {
              for (const problem of validateFrequencyConfigShape(indicator.frequencyConfig)) {
                errors.push(`${iLabel}: frequencyConfig ${problem}`);
              }
            } else if (indicator?.frequencyConfig !== undefined) {
              errors.push(`${iLabel}: frequencyConfig only applies to frecuencia`);
            }
            if (indicator?.category === 'profundidad') {
              const descriptors = indicator.levelDescriptors;
              if (!Array.isArray(descriptors) || descriptors.length !== 5 || !descriptors.every(isNonEmptyString)) {
                errors.push(`${iLabel}: profundidad requires five level descriptors`);
              }
            } else if (indicator?.levelDescriptors !== undefined) {
              errors.push(`${iLabel}: levelDescriptors only apply to profundidad`);
            }
            if (indicator?.category === 'detalle') {
              if (!Array.isArray(indicator.detalleOptions) || indicator.detalleOptions.length === 0 || !indicator.detalleOptions.every(isNonEmptyString)) {
                errors.push(`${iLabel}: detalle requires non-empty detalleOptions`);
              }
            } else if (indicator?.detalleOptions !== undefined) {
              errors.push(`${iLabel}: detalleOptions only apply to detalle`);
            }
            const expectations = indicator?.expectations;
            if (!expectations || typeof expectations !== 'object') {
              errors.push(`${iLabel}: expectations missing`);
            } else {
              validateExpectation(expectations.GT, `${iLabel}: GT`, errors, { requiresUnit: isFrequency });
              if (dual) validateExpectation(expectations.GI, `${iLabel}: GI`, errors, { requiresUnit: isFrequency });
              else if (expectations.GI !== undefined) errors.push(`${iLabel}: GI expectations only apply to non-always-GT grades`);
            }
          }
        }
      }
      if (indicatorCount === 0) errors.push(`${label}: at least one indicator is required`);
      for (const [wIndex, weight] of (template?.yearWeights ?? []).entries()) {
        const wLabel = `${label}.yearWeights[${wIndex}]`;
        if (!isInt(weight?.year) || weight.year < 1 || weight.year > 5) errors.push(`${wLabel}: year must be 1..5`);
        if (!ENTITY_TYPES.includes(weight?.entityType)) errors.push(`${wLabel}: entityType invalid`);
        if (!entityKeys.has(weight?.entityKey)) errors.push(`${wLabel}: entityKey does not reference a template entity`);
        if (!isFiniteNumber(weight?.weight) || weight.weight < 0) errors.push(`${wLabel}: weight invalid`);
      }
    }
    for (const key of gradeKeys) {
      if (!gradesCovered.has(key)) errors.push(`grade ${key} has no template`);
    }
  }

  // Declared counts must equal the derived counts, so the manifest author states the invariants.
  const derived = computeExpectedCounts(manifest);
  if (!manifest.expectedCounts || typeof manifest.expectedCounts !== 'object') {
    errors.push('expectedCounts missing');
  } else if (canonicalJson(manifest.expectedCounts) !== canonicalJson(derived)) {
    errors.push(`expectedCounts mismatch: declared ${canonicalJson(manifest.expectedCounts)} derived ${canonicalJson(derived)}`);
  }

  return errors;
}

export function assertManifestShape(manifest) {
  const errors = validateManifest(manifest);
  if (errors.length > 0) throw new Error(`refusing manifest: ${errors.join('; ')}`);
  return true;
}

/** Parse + shape + safety; returns the frozen manifest with its canonical digest attached. */
export function loadManifest(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return prepareManifest(parsed);
}

export function prepareManifest(parsed) {
  assertManifestSafety(parsed);
  assertManifestShape(parsed);
  return deepFreeze({ ...parsed, digest: digestManifest(parsed) });
}

// ---------------------------------------------------------------------------
// Desired state (row model)
// ---------------------------------------------------------------------------

const DEFAULT_SCORING_CONFIG = Object.freeze({
  default_weights: { module: 1.0, indicator: 1.0 },
  level_thresholds: { advanced: 62.5, emerging: 12.5, developing: 37.5, consolidated: 87.5 },
});

function expectationRow(manifestVersion, templateId, indicatorId, indicatorKey, generationType, exp, isFrequency) {
  const row = {
    id: idFor(manifestVersion, 'expectation', `${indicatorKey}:${generationType}`),
    template_id: templateId,
    indicator_id: indicatorId,
    generation_type: generationType,
    tolerance: exp.tolerance ?? 1,
  };
  for (let year = 1; year <= 5; year += 1) {
    row[`year_${year}_expected`] = exp.expected[year - 1];
    row[`year_${year}_expected_unit`] = isFrequency ? exp.unit : null;
  }
  return row;
}

/**
 * Builds every row the manifest owns, keyed by table, given the resolved
 * ab_grades ids. Pure. `gradeIdByKey` comes from preflight's grade mapping.
 */
export function buildDesiredState(manifest, gradeIdByKey) {
  const v = manifest.manifestVersion;
  const schoolId = manifest.mode === 'synthetic' ? manifest.syntheticSchool.id : manifest.pilotSchoolId;
  const state = {
    schoolId,
    school:
      manifest.mode === 'synthetic'
        ? { id: schoolId, name: manifest.syntheticSchool.name, tenant_kind: manifest.syntheticSchool.tenantKind }
        : null,
    templates: [],
    objectives: [],
    modules: [],
    indicators: [],
    expectations: [],
    yearWeights: [],
    migrationPlan: [],
  };

  const gradesByKey = new Map(manifest.grades.map((g) => [g.key, g]));
  for (const grade of manifest.grades) {
    const gradeId = gradeIdByKey.get(grade.key);
    if (!isInt(gradeId)) throw new Error(`grade ${grade.key} has no resolved ab_grades id`);
    for (const entry of grade.migrationPlan) {
      state.migrationPlan.push({
        school_id: schoolId,
        year_number: entry.yearNumber,
        grade_id: gradeId,
        generation_type: entry.generationType,
      });
    }
  }

  for (const template of manifest.templates) {
    const grade = gradesByKey.get(template.gradeKey);
    const gradeId = gradeIdByKey.get(template.gradeKey);
    const templateId = idFor(v, 'template', template.key);
    const dual = grade.isAlwaysGt === false;
    state.templates.push({
      id: templateId,
      key: template.key,
      area: template.area,
      grade_id: gradeId,
      name: template.name,
      description: template.description ?? null,
      draft_version: template.draftVersion,
      published_version: publishedVersionFor(template.draftVersion),
      scoring_config: template.scoringConfig ?? DEFAULT_SCORING_CONFIG,
    });
    const entityIds = new Map();
    let objectiveOrder = 0;
    for (const objective of template.objectives) {
      objectiveOrder += 1;
      const objectiveId = idFor(v, 'objective', `${template.key}:${objective.key}`);
      entityIds.set(objective.key, { type: 'objective', id: objectiveId });
      state.objectives.push({
        id: objectiveId,
        template_id: templateId,
        name: objective.name,
        description: objective.description ?? null,
        display_order: objectiveOrder,
        weight: objective.weight,
      });
      let moduleOrder = 0;
      for (const module of objective.modules) {
        moduleOrder += 1;
        const moduleId = idFor(v, 'module', `${template.key}:${module.key}`);
        entityIds.set(module.key, { type: 'module', id: moduleId });
        state.modules.push({
          id: moduleId,
          template_id: templateId,
          objective_id: objectiveId,
          name: module.name,
          description: module.description ?? null,
          instructions: module.instructions ?? null,
          display_order: moduleOrder,
          weight: module.weight,
        });
        let indicatorOrder = 0;
        for (const indicator of module.indicators) {
          indicatorOrder += 1;
          const indicatorId = idFor(v, 'indicator', `${template.key}:${indicator.key}`);
          entityIds.set(indicator.key, { type: 'indicator', id: indicatorId });
          const isFrequency = indicator.category === 'frecuencia';
          const isRubric = indicator.category === 'profundidad';
          const descriptors = isRubric ? indicator.levelDescriptors : [null, null, null, null, null];
          state.indicators.push({
            id: indicatorId,
            module_id: moduleId,
            code: indicator.code,
            name: indicator.name,
            description: indicator.description ?? null,
            category: indicator.category,
            frequency_config: isFrequency ? indicator.frequencyConfig : null,
            frequency_unit_options: isFrequency ? indicator.frequencyConfig.allowed_units : null,
            level_0_descriptor: descriptors[0],
            level_1_descriptor: descriptors[1],
            level_2_descriptor: descriptors[2],
            level_3_descriptor: descriptors[3],
            level_4_descriptor: descriptors[4],
            detalle_options: indicator.category === 'detalle' ? indicator.detalleOptions : null,
            evaluation_guidance: indicator.evaluationGuidance ?? null,
            display_order: indicatorOrder,
            weight: indicator.weight,
          });
          state.expectations.push(
            expectationRow(v, templateId, indicatorId, `${template.key}:${indicator.key}`, 'GT', indicator.expectations.GT, isFrequency),
          );
          if (dual) {
            state.expectations.push(
              expectationRow(v, templateId, indicatorId, `${template.key}:${indicator.key}`, 'GI', indicator.expectations.GI, isFrequency),
            );
          }
        }
      }
    }
    for (const weight of template.yearWeights ?? []) {
      const entity = entityIds.get(weight.entityKey);
      if (!entity || entity.type !== weight.entityType) {
        throw new Error(`year weight entity ${weight.entityKey} is not a ${weight.entityType} of template ${template.key}`);
      }
      state.yearWeights.push({
        id: idFor(v, 'year-weight', `${template.key}:${weight.entityKey}:${weight.year}`),
        template_id: templateId,
        entity_type: weight.entityType,
        entity_id: entity.id,
        year: weight.year,
        weight: weight.weight,
      });
    }
  }

  return deepFreeze(state);
}

/** Every uuid the manifest owns, per table, for reset and foreign-reference checks. */
export function ownedIds(state) {
  return {
    assessment_templates: state.templates.map((r) => r.id),
    assessment_objectives: state.objectives.map((r) => r.id),
    assessment_modules: state.modules.map((r) => r.id),
    assessment_indicators: state.indicators.map((r) => r.id),
    assessment_year_expectations: state.expectations.map((r) => r.id),
    assessment_entity_year_weights: state.yearWeights.map((r) => r.id),
  };
}
