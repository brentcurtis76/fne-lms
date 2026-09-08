/**
 * The ONE frequency_config contract, as a case table shared by every
 * producer and consumer test (Codex round 2, finding A):
 *
 *   - producer:  validateFrequencyConfig (publish service, builder editor)
 *   - consumer:  parseSnapshotFrequencyConfig (docente responses API)
 *   - manifest:  validateFrequencyConfigShape (pilot provisioning)
 *
 * A MODERN config (anything carrying a constraint field) is acceptable to
 * all three or to none of them. The table pins that equivalence so the
 * producer can never publish an instrument the consumer refuses (422) and
 * the manifest can never provision one either.
 *
 * Legacy / absent shapes are NOT in this table: they are unconstrained for
 * the consumer and unpublishable for the producer by design (see
 * `LEGACY_CASES`).
 */
export interface FrequencyContractCase {
  label: string;
  config: unknown;
  /** true → publishable, parseable and manifest-valid; false → refused by all three. */
  valid: boolean;
}

const BASE = { type: 'count', min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana', 'mes'] };

export const FREQUENCY_CONTRACT_CASES: FrequencyContractCase[] = [
  // ── accepted ──────────────────────────────────────────────────────────────
  { label: 'the reference config', config: BASE, valid: true },
  { label: 'no descriptive type key', config: { min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana'] }, valid: true },
  { label: 'a step exactly equal to the range (boundary)', config: { ...BASE, min: 0, max: 1, step: 1, unit: 'dia', allowed_units: ['dia'] }, valid: true },
  { label: 'a step equal to a wide range (boundary)', config: { ...BASE, min: 0, max: 10, step: 10 }, valid: true },
  { label: 'a fractional step that fits', config: { ...BASE, min: 0, max: 1, step: 0.25 }, valid: true },
  { label: 'a negative min', config: { ...BASE, min: -5, max: 5, step: 1 }, valid: true },
  { label: 'every platform unit as default with itself allowed', config: { ...BASE, unit: 'año', allowed_units: ['año'] }, valid: true },
  { label: 'all six platform units allowed', config: { ...BASE, unit: 'trimestre', allowed_units: ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año'] }, valid: true },

  // ── accepted: decimal boundaries (Codex round 3, finding 2) ───────────────
  // 0.3 - 0.1 === 0.19999999999999998 in IEEE 754; the contract compares with a scaled tolerance.
  { label: 'the Codex decimal boundary: step 0.2 in a 0.1..0.3 range', config: { type: 'count', min: 0.1, max: 0.3, step: 0.2, unit: 'dia', allowed_units: ['dia'] }, valid: true },
  { label: 'a decimal step equal to a decimal range (0.7..1.0, step 0.3)', config: { ...BASE, min: 0.7, max: 1.0, step: 0.3 }, valid: true },
  { label: 'a decimal step equal to a wide decimal range (1.1..3.3, step 2.2)', config: { ...BASE, min: 1.1, max: 3.3, step: 2.2 }, valid: true },
  { label: 'a decimal step that fits several times (0..0.9, step 0.3)', config: { ...BASE, min: 0, max: 0.9, step: 0.3 }, valid: true },
  { label: 'a large-magnitude decimal boundary (1000.1..1000.3, step 0.2)', config: { ...BASE, min: 1000.1, max: 1000.3, step: 0.2 }, valid: true },

  // ── refused: decimal neighbours of the boundary (beyond the tolerance) ────
  { label: 'a decimal step one part-in-a-million wider than the range', config: { ...BASE, min: 0.1, max: 0.3, step: 0.2000002 }, valid: false },
  { label: 'a decimal step twice the decimal range', config: { ...BASE, min: 0.1, max: 0.3, step: 0.4 }, valid: false },
  { label: 'a decimal range one hundredth narrower than the step', config: { ...BASE, min: 0.1, max: 0.29, step: 0.2 }, valid: false },
  { label: 'a decimal step one ULP-scale too wide is still the boundary (0.2 vs 0.3 - 0.1)', config: { ...BASE, min: 0.1, max: 0.3, step: 0.2 }, valid: true },

  // ── narrow ranges and large magnitudes (Codex round 4, finding R5-2) ──────
  // `min < max` is exact and the step-fits tolerance is a few ULP of the operands, so no
  // magnitude floor can refuse a legitimate narrow range and no relative slack can accept a
  // step that a double distinguishes from the range.
  { label: 'the Codex narrow range: 0..1e-10 with step 1e-11', config: { ...BASE, min: 0, max: 1e-10, step: 1e-11, unit: 'dia', allowed_units: ['dia'] }, valid: true },
  { label: 'a narrow range whose step equals it (0..1e-10, step 1e-10)', config: { ...BASE, min: 0, max: 1e-10, step: 1e-10 }, valid: true },
  { label: 'a narrow range with a step just too wide (0..1e-10, step 1.1e-10)', config: { ...BASE, min: 0, max: 1e-10, step: 1.1e-10 }, valid: false },
  { label: 'a tiny range whose min and max differ by 1e-12 (step fits)', config: { ...BASE, min: 0.3, max: 0.3 + 1e-12, step: 1e-12 }, valid: true },
  { label: 'a tiny range whose min and max differ by 1e-12 (step 0.1 does not fit)', config: { ...BASE, min: 0.3, max: 0.3 + 1e-12, step: 0.1 }, valid: false },
  { label: 'the Codex large-magnitude integer grid (0..1000000010, step 1)', config: { ...BASE, min: 0, max: 1000000010, step: 1, unit: 'dia', allowed_units: ['dia'] }, valid: true },
  { label: 'a large-magnitude range whose step equals it (0..1e9, step 1e9)', config: { ...BASE, min: 0, max: 1e9, step: 1e9 }, valid: true },
  { label: 'a large-magnitude range with a step one unit too wide (0..1e9, step 1e9 + 1)', config: { ...BASE, min: 0, max: 1e9, step: 1e9 + 1 }, valid: false },
  { label: 'a large-magnitude range with a step half a unit too wide (0..1e9, step 1e9 + 0.5)', config: { ...BASE, min: 0, max: 1e9, step: 1e9 + 0.5 }, valid: false },
  { label: 'a large-magnitude decimal boundary (1e6 + 0.1 .. 1e6 + 0.3, step 0.2)', config: { ...BASE, min: 1000000.1, max: 1000000.3, step: 0.2 }, valid: true },
  { label: 'a large-magnitude decimal step one ten-millionth too wide (1e6 + 0.1 .. 1e6 + 0.3, step 0.2000001)', config: { ...BASE, min: 1000000.1, max: 1000000.3, step: 0.2000001 }, valid: false },
  { label: 'min equal to max at large magnitude', config: { ...BASE, min: 1e9, max: 1e9, step: 1 }, valid: false },
  { label: 'min above max by one ULP at large magnitude', config: { ...BASE, min: 1e9 + 2 ** -23, max: 1e9, step: 1 }, valid: false },
  { label: 'min below max by one ULP at large magnitude (step fits)', config: { ...BASE, min: 1e9, max: 1e9 + 2 ** -23, step: 2 ** -23 }, valid: true },

  // ── refused: the Codex round-2 example and its neighbours ─────────────────
  { label: 'the Codex example: step 2 in a 0..1 range', config: { type: 'count', min: 0, max: 1, step: 2, unit: 'dia', allowed_units: ['dia'] }, valid: false },
  { label: 'a step one unit wider than the range', config: { ...BASE, min: 0, max: 10, step: 11 }, valid: false },
  { label: 'a step marginally wider than the range', config: { ...BASE, min: 0, max: 1, step: 1.0001 }, valid: false },
  { label: 'a step wider than a negative-anchored range', config: { ...BASE, min: -1, max: 1, step: 3 }, valid: false },

  // ── refused: numeric rules ────────────────────────────────────────────────
  { label: 'a zero step', config: { ...BASE, step: 0 }, valid: false },
  { label: 'a negative step', config: { ...BASE, step: -1 }, valid: false },
  { label: 'a NaN step', config: { ...BASE, step: Number.NaN }, valid: false },
  { label: 'an infinite step', config: { ...BASE, step: Number.POSITIVE_INFINITY }, valid: false },
  { label: 'a string step', config: { ...BASE, step: '1' }, valid: false },
  { label: 'min equal to max', config: { ...BASE, min: 10, max: 10 }, valid: false },
  { label: 'min greater than max', config: { ...BASE, min: 11 }, valid: false },
  { label: 'a string min', config: { ...BASE, min: '0' }, valid: false },
  { label: 'a NaN max', config: { ...BASE, max: Number.NaN }, valid: false },
  { label: 'an infinite max', config: { ...BASE, max: Number.POSITIVE_INFINITY }, valid: false },
  { label: 'a null min', config: { ...BASE, min: null }, valid: false },

  // ── refused: unit rules ───────────────────────────────────────────────────
  { label: 'the legacy unit inside a modern config', config: { ...BASE, unit: 'veces' }, valid: false },
  { label: 'an English unit', config: { ...BASE, unit: 'week', allowed_units: ['semana'] }, valid: false },
  { label: 'a capitalised unit', config: { ...BASE, unit: 'Semana' }, valid: false },
  { label: 'a unit with trailing space', config: { ...BASE, unit: 'semana ' }, valid: false },
  { label: 'an empty unit', config: { ...BASE, unit: '' }, valid: false },
  { label: 'a numeric unit', config: { ...BASE, unit: 3 }, valid: false },
  { label: 'a unit outside allowed_units', config: { ...BASE, unit: 'dia' }, valid: false },
  { label: 'allowed_units with the legacy unit', config: { ...BASE, allowed_units: ['semana', 'veces'] }, valid: false },
  { label: 'allowed_units with an English unit', config: { ...BASE, allowed_units: ['semana', 'week'] }, valid: false },
  { label: 'allowed_units with a number', config: { ...BASE, allowed_units: [3] }, valid: false },
  { label: 'an empty allowed_units', config: { ...BASE, allowed_units: [] }, valid: false },
  { label: 'a non-array allowed_units', config: { ...BASE, allowed_units: 'semana' }, valid: false },

  // ── refused: partial modern shapes ────────────────────────────────────────
  { label: 'a platform unit alone', config: { unit: 'semana' }, valid: false },
  { label: 'min only', config: { min: 0 }, valid: false },
  { label: 'min + max', config: { min: 0, max: 10 }, valid: false },
  { label: 'min + max + step', config: { min: 0, max: 10, step: 1 }, valid: false },
  { label: 'everything but allowed_units', config: { min: 0, max: 10, step: 1, unit: 'semana' }, valid: false },
  { label: 'everything but unit', config: { min: 0, max: 10, step: 1, allowed_units: ['semana'] }, valid: false },
  { label: 'allowed_units alone', config: { allowed_units: ['semana'] }, valid: false },
  { label: 'the legacy unit next to a constraint', config: { unit: 'veces', max: 10 }, valid: false },
  { label: 'the legacy unit with allowed_units', config: { unit: 'veces', allowed_units: ['semana'] }, valid: false },

  // ── refused: shape rules ──────────────────────────────────────────────────
  { label: 'an unknown key', config: { ...BASE, tolerance: 1 }, valid: false },
  { label: 'a camelCase key', config: { ...BASE, allowedUnits: ['semana'] }, valid: false },
  { label: 'a numeric type', config: { ...BASE, type: 3 }, valid: false },
  { label: 'an empty object', config: {}, valid: false },
  { label: 'type only', config: { type: 'count' }, valid: false },
  { label: 'an array', config: [], valid: false },
  { label: 'a string', config: 'veces', valid: false },
  { label: 'a number', config: 4, valid: false },
];

/**
 * Shapes with a DIFFERENT verdict per side, by design: unconstrained for the
 * consumer (historical snapshots), never publishable or provisionable.
 */
export const LEGACY_CASES: Array<{ label: string; config: unknown }> = [
  { label: 'an absent config (undefined)', config: undefined },
  { label: 'an absent config (null)', config: null },
  { label: 'the exact legacy { unit: "veces" }', config: { unit: 'veces' } },
  { label: 'the legacy shape with the descriptive type', config: { type: 'count', unit: 'veces' } },
];
