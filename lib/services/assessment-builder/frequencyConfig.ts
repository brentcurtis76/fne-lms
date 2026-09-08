import type { FrequencyConfig, FrequencyUnit } from '@/types/assessment-builder';
import { FREQUENCY_UNIT_OPTIONS } from '@/types/assessment-builder';

/** Scoring/UI fields the builder's indicator editor exposes for a frecuencia indicator. */
export interface FrequencyConfigFields {
  min?: number;
  max?: number;
  step?: number;
  allowed_units?: FrequencyUnit[];
}

/**
 * Builds the frequency_config payload for a frecuencia indicator save.
 *
 * The indicator PUT does a full-replace of the jsonb column, so the client
 * must send the *complete* object: the new unit (and any edited fields) are
 * merged onto the existing config so fields not being edited are not wiped.
 * On create there is no existing config, so the result is `{ unit, ...fields }`.
 * Only fields that are actually provided (not undefined) are written.
 */
export function buildFrequencyConfig(
  existing: FrequencyConfig | null | undefined,
  unit: string,
  fields?: FrequencyConfigFields
): Partial<FrequencyConfig> & { unit: string } {
  const provided: FrequencyConfigFields = {};
  if (fields) {
    if (fields.min !== undefined) provided.min = fields.min;
    if (fields.max !== undefined) provided.max = fields.max;
    if (fields.step !== undefined) provided.step = fields.step;
    if (fields.allowed_units !== undefined) provided.allowed_units = fields.allowed_units;
  }
  return { ...(existing ?? {}), unit, ...provided };
}

export interface FrequencyConfigValidation {
  valid: boolean;
  /** es-CL reasons, one per failed rule; empty when valid. */
  errors: string[];
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isFrequencyUnit = (v: unknown): v is FrequencyUnit =>
  typeof v === 'string' && (FREQUENCY_UNIT_OPTIONS as readonly string[]).includes(v);

/** Keys a frequency_config may carry. Anything else is unknown and refused by every side. */
const KNOWN_KEYS = ['type', 'min', 'max', 'step', 'unit', 'allowed_units'] as const;
/** The constraint keys: once ANY of them is present the config must be complete. */
const CONSTRAINT_KEYS = ['min', 'max', 'step', 'unit', 'allowed_units'] as const;

const isPresent = (v: unknown) => v !== undefined && v !== null;

export type FrequencyRangeViolation =
  | 'min_not_finite'
  | 'max_not_finite'
  | 'step_not_finite'
  | 'step_not_positive'
  | 'min_not_below_max'
  | 'step_exceeds_range';

/**
 * Tolerance of the numeric comparisons in the frequency contract, in units
 * in the last place (ULP) of the largest operand (Codex round 4, finding
 * R5-2; supersedes the round-3 ratio).
 *
 * Frequency configs are decimal (0.1, 0.25, …) and IEEE 754 doubles cannot
 * represent most of them exactly: `0.3 - 0.1` is `0.19999999999999998`, so a
 * raw `step > max - min` refused the valid boundary `{ min: 0.1, max: 0.3,
 * step: 0.2 }`. The round-3 fix compared with `1e-9 × max(1, |operand|)`,
 * which handled that example but changed the contract: the floor of 1
 * refused a legitimate narrow range (`{ min: 0, max: 1e-10, step: 1e-11 }`),
 * and the relative part let a response of 1000000000.5 pass an integer grid
 * and 1000000010.5 pass a maximum of 1000000010, because 1e-9 of a billion is
 * one unit.
 *
 * The tolerance is now the representation error itself and nothing more.
 * Each comparison involves a handful of rounded operations (a subtraction, a
 * division, a rounding, a multiplication, an addition), and the inputs are
 * themselves the nearest doubles to decimals; a sweep over decimal grids
 * (steps 1e-11 … 12.5, anchors -5 … 1e9, 5000 multiples each) measured at
 * most 2 ULP of error. Eight ULP is a 4× margin above that and is still far
 * below any distinction an instrument could mean: at 1e9 it is ~1e-6, at 0.3
 * it is ~4e-16. A tolerance that scales with the magnitude of the numbers
 * involved is unavoidable — that is what a double's precision does — but
 * one that scales with the number's LAST PLACE cannot swallow a step
 * difference a double can express.
 *
 * `min < max` is compared EXACTLY (strict): representation error cannot make
 * two different decimals equal, so no tolerance belongs there, and none may
 * invent a minimum permitted range. The same rule is used at publish, at
 * snapshot parse, at response time and by the pilot manifest validator, so
 * the four sides accept and refuse the same numbers.
 */
export const FREQUENCY_TOLERANCE_ULPS = 8;

const ULP_VIEW = new DataView(new ArrayBuffer(8));

/**
 * The unit in the last place of |x|: the distance from |x| to the next
 * representable double above it (for a finite x; the smallest subnormal for
 * 0 and for subnormals, NaN for a non-finite x).
 */
export function ulp(x: number): number {
  const a = Math.abs(x);
  if (!Number.isFinite(a)) return Number.NaN;
  if (a === 0) return Number.MIN_VALUE;
  ULP_VIEW.setFloat64(0, a);
  const exponent = (ULP_VIEW.getUint32(0) >>> 20) & 0x7ff; // biased exponent bits
  if (exponent === 0) return Number.MIN_VALUE;             // subnormal
  return Math.pow(2, exponent - 1023 - 52);
}

/** Absolute tolerance for comparing the given finite operands: FREQUENCY_TOLERANCE_ULPS × ulp(largest |operand|). */
export function frequencyTolerance(...operands: number[]): number {
  let scale = 0;
  for (const v of operands) {
    const a = Math.abs(v);
    if (a > scale) scale = a;
  }
  return FREQUENCY_TOLERANCE_ULPS * ulp(scale);
}

/**
 * THE numeric rule of the frequency contract, shared by the publish-time
 * validator and the snapshot parser so the two can never drift (Codex round
 * 2, finding A): min and max finite, min < max, step finite and > 0, and the
 * step must fit inside the range (step <= max - min). `min < max` is exact;
 * the step-fits comparison uses `frequencyTolerance` (representation error
 * only). Returns every violated rule in a fixed order; empty when the
 * numbers are coherent.
 */
export function frequencyRangeViolations(min: unknown, max: unknown, step: unknown): FrequencyRangeViolation[] {
  const out: FrequencyRangeViolation[] = [];
  const minOk = isFiniteNumber(min);
  const maxOk = isFiniteNumber(max);
  const stepOk = isFiniteNumber(step);
  if (!minOk) out.push('min_not_finite');
  if (!maxOk) out.push('max_not_finite');
  // Strict and exact: a tolerance here would invent a minimum permitted range.
  const rangeOk = minOk && maxOk && (min as number) < (max as number);
  if (minOk && maxOk && !rangeOk) out.push('min_not_below_max');
  if (!stepOk) out.push('step_not_finite');
  else if ((step as number) <= 0) out.push('step_not_positive');
  if (
    rangeOk && stepOk && (step as number) > 0 &&
    (step as number) - ((max as number) - (min as number)) > frequencyTolerance(min as number, max as number, step as number)
  ) {
    out.push('step_exceeds_range');
  }
  return out;
}

/** The first key of `config` that the contract does not know, or undefined. */
export function unknownFrequencyConfigKey(config: Record<string, unknown>): string | undefined {
  return Object.keys(config).find((k) => !(KNOWN_KEYS as readonly string[]).includes(k));
}

/**
 * The publish-time contract for a frecuencia indicator's frequency_config:
 * finite numeric min < max, finite step > 0 that fits inside max - min, no
 * unknown key, a unit that is an EXACT platform FrequencyUnit, and a
 * non-empty allowed_units list of exact FrequencyUnits that contains the
 * unit. It is the SAME rule set parseSnapshotFrequencyConfig enforces at
 * response time (shared helpers above; parity pinned by
 * __tests__/fixtures/frequency-config-contract.ts), so nothing publishable
 * can be unanswerable (Codex round 2, finding A). Shared by the publish endpoint (hard 400) and the
 * builder's indicator editor (same message set), so both sides agree on what
 * "configured" means. The scorer's own defaults are deliberately NOT
 * consulted here: an instrument must state its maximum. (Codex round 1
 * finding 3: a free-text unit such as "veces" or "week" is no longer a
 * publishable unit.)
 */
export function validateFrequencyConfig(config: unknown): FrequencyConfigValidation {
  const errors: string[] = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, errors: ['falta la configuración de frecuencia (mínimo, máximo, paso, unidad y períodos permitidos)'] };
  }
  const c = config as Record<string, unknown>;

  // Shape rules shared with the snapshot parser: no unknown key, `type` (if
  // present) is text. A config the parser would refuse is not publishable.
  const unknownKey = unknownFrequencyConfigKey(c);
  if (unknownKey !== undefined) errors.push(`la configuración contiene un campo desconocido (${unknownKey})`);
  if (isPresent(c.type) && typeof c.type !== 'string') errors.push('el campo type debe ser texto');

  const RANGE_MESSAGES: Record<FrequencyRangeViolation, string> = {
    min_not_finite: 'el valor mínimo debe ser un número',
    max_not_finite: 'el valor máximo debe ser un número',
    min_not_below_max: 'el valor mínimo debe ser menor que el máximo',
    step_not_finite: 'el paso debe ser un número mayor que 0',
    step_not_positive: 'el paso debe ser un número mayor que 0',
    step_exceeds_range: 'el paso no puede ser mayor que el rango (máximo − mínimo)',
  };
  for (const violation of frequencyRangeViolations(c.min, c.max, c.step)) errors.push(RANGE_MESSAGES[violation]);

  const unitPresent = typeof c.unit === 'string' && c.unit.trim().length > 0;
  const unitOk = isFrequencyUnit(c.unit);
  if (!unitPresent) errors.push('falta la unidad por defecto');
  else if (!unitOk) errors.push('la unidad por defecto debe ser un período válido (día, semana, mes, trimestre, semestre o año)');

  const allowed = c.allowed_units;
  const allowedPresent = Array.isArray(allowed) && allowed.length > 0;
  const allowedOk = allowedPresent && (allowed as unknown[]).every(isFrequencyUnit);
  if (!allowedPresent) {
    errors.push('debe definir al menos un período permitido');
  } else if (!allowedOk) {
    errors.push('los períodos permitidos deben ser períodos válidos (día, semana, mes, trimestre, semestre o año)');
  } else if (unitOk && !(allowed as string[]).includes(c.unit as string)) {
    errors.push('la unidad por defecto debe estar entre los períodos permitidos');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Response-time contract (R7): what a docente may SAVE for a frecuencia
// indicator, validated against the PERSISTED snapshot configuration.
// ---------------------------------------------------------------------------

/**
 * The snapshot's frequency_config as the API enforces it. `null` in every
 * field means the instrument is UNCONSTRAINED, which only two shapes may be:
 * an absent config, or the exact legacy shape (see LEGACY_FREQUENCY_UNIT).
 */
export interface ParsedFrequencyConstraints {
  min: number | null;
  max: number | null;
  step: number | null;
  /** Exact allowed periods, or null when the snapshot does not restrict them (legacy). */
  allowedUnits: FrequencyUnit[] | null;
}

export type ParsedFrequencyConfig =
  | { ok: true; constraints: ParsedFrequencyConstraints }
  | { ok: false; reason: string };

/**
 * The one legacy unit the builder used to write before the publish-time gate
 * existed. `{ unit: "veces" }` (optionally with the descriptive `type` key) is
 * the ONLY supported legacy shape; it carries no constraint at all.
 */
export const LEGACY_FREQUENCY_UNIT = 'veces';

/**
 * Parses the snapshot's frequency_config (Codex round 1 finding 3 — exact
 * shapes only):
 *
 *  - absent (undefined / null)                         → unconstrained;
 *  - the exact legacy shape `{ unit: "veces" }`
 *    (optionally with `type`)                          → unconstrained;
 *  - anything that carries a modern constraint field
 *    (min, max, step, allowed_units, or a unit other
 *    than the legacy one)                              → must be COMPLETE and
 *    coherent: finite min < max, finite step > 0 that fits the range, a unit
 *    that is an exact FrequencyUnit, and a non-empty allowed_units list of
 *    exact FrequencyUnits containing the unit;
 *  - every partial modern shape, unknown unit, unknown key, or non-object     → refused.
 *
 * Nothing is clamped or defaulted: a malformed value is refused at the API
 * so a docente can never save against an instrument the platform cannot
 * validate.
 */
export function parseSnapshotFrequencyConfig(config: unknown): ParsedFrequencyConfig {
  if (config === undefined || config === null) {
    return { ok: true, constraints: { min: null, max: null, step: null, allowedUnits: null } };
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    return { ok: false, reason: 'frequency_config no es un objeto' };
  }
  const c = config as Record<string, unknown>;

  const unknownKey = unknownFrequencyConfigKey(c);
  if (unknownKey !== undefined) {
    return { ok: false, reason: `frequency_config contiene un campo desconocido (${unknownKey})` };
  }
  if (isPresent(c.type) && typeof c.type !== 'string') {
    return { ok: false, reason: 'frequency_config.type debe ser texto' };
  }

  // Exact legacy shape: { unit: "veces" } and nothing that constrains.
  const presentConstraintKeys = CONSTRAINT_KEYS.filter((k) => isPresent(c[k]));
  if (presentConstraintKeys.length === 1 && presentConstraintKeys[0] === 'unit' && c.unit === LEGACY_FREQUENCY_UNIT) {
    return { ok: true, constraints: { min: null, max: null, step: null, allowedUnits: null } };
  }
  if (presentConstraintKeys.length === 0) {
    // An object with no constraint at all and no legacy unit (e.g. `{}` or `{ type: "count" }`).
    return { ok: false, reason: 'frequency_config no define restricciones ni la forma legada { unit: "veces" }' };
  }

  // Modern shape: every constraint field is required and must be coherent.
  const missing = CONSTRAINT_KEYS.filter((k) => !isPresent(c[k]));
  if (missing.length > 0) {
    return { ok: false, reason: `frequency_config está incompleto (falta ${missing.join(', ')})` };
  }
  const RANGE_REASONS: Record<FrequencyRangeViolation, string> = {
    min_not_finite: 'frequency_config.min no es un número finito',
    max_not_finite: 'frequency_config.max no es un número finito',
    step_not_finite: 'frequency_config.step no es un número finito',
    step_not_positive: 'frequency_config.step debe ser mayor que 0',
    min_not_below_max: 'frequency_config.min debe ser menor que max',
    step_exceeds_range: 'frequency_config.step no cabe en el rango min..max',
  };
  const [violation] = frequencyRangeViolations(c.min, c.max, c.step);
  if (violation !== undefined) return { ok: false, reason: RANGE_REASONS[violation] };
  const min = c.min as number;
  const max = c.max as number;
  const step = c.step as number;

  if (!isFrequencyUnit(c.unit)) {
    return { ok: false, reason: 'frequency_config.unit no es un período válido' };
  }
  if (!Array.isArray(c.allowed_units) || c.allowed_units.length === 0 || !c.allowed_units.every(isFrequencyUnit)) {
    return { ok: false, reason: 'frequency_config.allowed_units debe ser una lista no vacía de períodos válidos' };
  }
  const allowedUnits = [...(c.allowed_units as FrequencyUnit[])];
  if (!allowedUnits.includes(c.unit)) {
    return { ok: false, reason: 'frequency_config.unit debe estar entre allowed_units' };
  }

  return { ok: true, constraints: { min, max, step, allowedUnits } };
}

export type FrequencyResponseRefusal =
  | 'malformed_config'
  | 'invalid_value'
  | 'below_min'
  | 'above_max'
  | 'off_step'
  | 'unit_required'
  | 'invalid_unit'
  | 'unit_not_allowed';

export type FrequencyResponseValidation =
  | { ok: true }
  | { ok: false; code: FrequencyResponseRefusal; message: string };

/**
 * Validates one saved frecuencia response against the parsed snapshot
 * constraints. `value` null/undefined is a cleared / partial save and is
 * accepted (a unit sent with it must still be a real period). A present
 * value must be a finite number inside [min, max] and on the step grid
 * (anchored at min, or 0 when the snapshot has no min); its unit must be an
 * exact platform FrequencyUnit and, when the snapshot restricts periods, one
 * of allowed_units. Nothing is clamped or defaulted: violations are refused.
 * The bound and grid comparisons use `frequencyTolerance` (a few ULP —
 * representation error only), so a valid endpoint such as 0.3 in
 * `{ min: 0.1, step: 0.2 }` — whose grid point computes as
 * 0.30000000000000004 — is accepted, while 0.2 (off the grid), 0.31 (above
 * max), 1000000000.5 on an integer grid and 1000000010.5 above a maximum of
 * 1000000010 are refused.
 */
export function validateFrequencyResponse(
  config: unknown,
  value: unknown,
  unit: unknown
): FrequencyResponseValidation {
  const parsed = parseSnapshotFrequencyConfig(config);
  if (parsed.ok === false) {
    return { ok: false, code: 'malformed_config', message: `configuración de frecuencia inválida en la plantilla (${parsed.reason})` };
  }
  const { min, max, step, allowedUnits } = parsed.constraints;

  if (unit !== undefined && unit !== null && !isFrequencyUnit(unit)) {
    return { ok: false, code: 'invalid_unit', message: 'el período de frecuencia no es válido' };
  }

  if (value === undefined || value === null) {
    return { ok: true };
  }

  if (!isFiniteNumber(value)) {
    return { ok: false, code: 'invalid_value', message: 'frecuencia debe ser un número válido' };
  }
  if (min !== null && min - value > frequencyTolerance(min, value)) {
    return { ok: false, code: 'below_min', message: `frecuencia debe ser mayor o igual a ${min}` };
  }
  if (max !== null && value - max > frequencyTolerance(max, value)) {
    return { ok: false, code: 'above_max', message: `frecuencia debe ser menor o igual a ${max}` };
  }
  if (step !== null) {
    const anchor = min ?? 0;
    const nearest = anchor + Math.round((value - anchor) / step) * step;
    if (Math.abs(value - nearest) > frequencyTolerance(anchor, step, value)) {
      return { ok: false, code: 'off_step', message: `frecuencia debe avanzar de ${step} en ${step}` };
    }
  }

  if (unit === undefined || unit === null) {
    return { ok: false, code: 'unit_required', message: 'debe indicar el período de la frecuencia' };
  }
  if (allowedUnits && !allowedUnits.includes(unit as FrequencyUnit)) {
    return { ok: false, code: 'unit_not_allowed', message: 'el período de frecuencia no está permitido para este indicador' };
  }

  return { ok: true };
}
