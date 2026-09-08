import { describe, it, expect } from 'vitest';
import {
  buildFrequencyConfig,
  validateFrequencyConfig, parseSnapshotFrequencyConfig, validateFrequencyResponse,
  frequencyRangeViolations, frequencyTolerance, ulp, FREQUENCY_TOLERANCE_ULPS } from '../../../../lib/services/assessment-builder/frequencyConfig';

describe('buildFrequencyConfig', () => {
  it('merges the new unit onto an existing rich config (preserves min/max/step/type)', () => {
    const existing = { type: 'count' as const, min: 0, max: 10, step: 1, unit: 'dia' };
    expect(buildFrequencyConfig(existing, 'semana')).toEqual({
      type: 'count', min: 0, max: 10, step: 1, unit: 'semana',
    });
  });

  it('returns just the unit when there is no existing config (create path)', () => {
    expect(buildFrequencyConfig(null, 'veces')).toEqual({ unit: 'veces' });
    expect(buildFrequencyConfig(undefined, 'veces')).toEqual({ unit: 'veces' });
  });

  it('overrides an existing unit', () => {
    expect(buildFrequencyConfig({ unit: 'mes', min: 2 }, 'trimestre')).toEqual({ unit: 'trimestre', min: 2 });
  });

  it('writes min/max/step/allowed_units when provided, over the existing values', () => {
    const existing = { type: 'count' as const, min: 0, max: 10, step: 1, unit: 'dia', allowed_units: ['dia' as const] };
    expect(
      buildFrequencyConfig(existing, 'semana', { min: 1, max: 5, step: 0.5, allowed_units: ['semana', 'mes'] })
    ).toEqual({ type: 'count', min: 1, max: 5, step: 0.5, unit: 'semana', allowed_units: ['semana', 'mes'] });
  });

  it('leaves fields that are not provided (undefined) untouched', () => {
    const existing = { type: 'count' as const, min: 0, max: 10, step: 1, unit: 'dia' };
    expect(buildFrequencyConfig(existing, 'dia', { max: 20 })).toEqual({
      type: 'count', min: 0, max: 20, step: 1, unit: 'dia',
    });
  });
});

describe('validateFrequencyConfig (publish-time contract)', () => {
  const valid = { type: 'count', min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana', 'mes'] };

  it('accepts a complete config', () => {
    expect(validateFrequencyConfig(valid)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a missing / non-object config', () => {
    expect(validateFrequencyConfig(null).valid).toBe(false);
    expect(validateFrequencyConfig(undefined).valid).toBe(false);
    expect(validateFrequencyConfig([]).valid).toBe(false);
    expect(validateFrequencyConfig('x').valid).toBe(false);
    expect(validateFrequencyConfig(null).errors[0]).toMatch(/falta la configuración/);
  });

  it('rejects the legacy builder output { unit: "veces" } with every missing rule named, the unit included', () => {
    const r = validateFrequencyConfig({ unit: 'veces' });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual([
      'el valor mínimo debe ser un número',
      'el valor máximo debe ser un número',
      'el paso debe ser un número mayor que 0',
      'la unidad por defecto debe ser un período válido (día, semana, mes, trimestre, semestre o año)',
      'debe definir al menos un período permitido',
    ]);
  });

  it('requires min < max', () => {
    expect(validateFrequencyConfig({ ...valid, min: 10, max: 10 }).errors).toEqual(['el valor mínimo debe ser menor que el máximo']);
    expect(validateFrequencyConfig({ ...valid, min: 11 }).errors).toEqual(['el valor mínimo debe ser menor que el máximo']);
  });

  it('requires finite numbers (NaN, Infinity, strings fail)', () => {
    expect(validateFrequencyConfig({ ...valid, max: Number.NaN }).errors).toEqual(['el valor máximo debe ser un número']);
    expect(validateFrequencyConfig({ ...valid, max: Number.POSITIVE_INFINITY }).valid).toBe(false);
    expect(validateFrequencyConfig({ ...valid, min: '0' }).valid).toBe(false);
  });

  it('requires step > 0', () => {
    expect(validateFrequencyConfig({ ...valid, step: 0 }).errors).toEqual(['el paso debe ser un número mayor que 0']);
    expect(validateFrequencyConfig({ ...valid, step: -1 }).valid).toBe(false);
    expect(validateFrequencyConfig({ ...valid, step: undefined }).valid).toBe(false);
  });

  it('requires a non-empty unit string', () => {
    expect(validateFrequencyConfig({ ...valid, unit: '' }).errors).toEqual(['falta la unidad por defecto']);
    expect(validateFrequencyConfig({ ...valid, unit: undefined }).valid).toBe(false);
  });

  it('requires the unit to be an EXACT platform FrequencyUnit (finding 3)', () => {
    for (const bad of ['veces', 'week', 'Semana', 'semana ', 'días']) {
      const r = validateFrequencyConfig({ ...valid, unit: bad, allowed_units: ['semana', 'mes'] });
      expect(r.valid).toBe(false);
      expect(r.errors).toContain('la unidad por defecto debe ser un período válido (día, semana, mes, trimestre, semestre o año)');
    }
    for (const good of ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año']) {
      expect(validateFrequencyConfig({ ...valid, unit: good, allowed_units: [good] }).valid).toBe(true);
    }
  });

  it('requires a non-empty allowed_units array of exact FrequencyUnits that contains the unit', () => {
    expect(validateFrequencyConfig({ ...valid, allowed_units: [] }).errors).toEqual(['debe definir al menos un período permitido']);
    expect(validateFrequencyConfig({ ...valid, allowed_units: undefined }).valid).toBe(false);
    expect(validateFrequencyConfig({ ...valid, allowed_units: ['mes'] }).errors).toEqual([
      'la unidad por defecto debe estar entre los períodos permitidos',
    ]);
    expect(validateFrequencyConfig({ ...valid, allowed_units: [3] }).valid).toBe(false);
    expect(validateFrequencyConfig({ ...valid, allowed_units: ['semana', 'veces'] }).errors).toEqual([
      'los períodos permitidos deben ser períodos válidos (día, semana, mes, trimestre, semestre o año)',
    ]);
    expect(validateFrequencyConfig({ ...valid, allowed_units: ['semana', 'week'] }).valid).toBe(false);
  });
});

describe('parseSnapshotFrequencyConfig / validateFrequencyResponse (response-time contract, R7 + finding 3)', () => {
  const UNCONSTRAINED = { ok: true, constraints: { min: null, max: null, step: null, allowedUnits: null } };

  it('treats ONLY an absent config and the exact legacy { unit: "veces" } as unconstrained', () => {
    expect(parseSnapshotFrequencyConfig(undefined)).toEqual(UNCONSTRAINED);
    expect(parseSnapshotFrequencyConfig(null)).toEqual(UNCONSTRAINED);
    expect(parseSnapshotFrequencyConfig({ unit: 'veces' })).toEqual(UNCONSTRAINED);
    // The descriptive `type` key rides along with the legacy shape (the builder wrote it).
    expect(parseSnapshotFrequencyConfig({ type: 'count', unit: 'veces' })).toEqual(UNCONSTRAINED);
  });

  it('parses a complete config exactly', () => {
    expect(parseSnapshotFrequencyConfig({ type: 'count', min: 0, max: 10, step: 0.5, unit: 'semana', allowed_units: ['semana', 'mes'] })).toEqual({
      ok: true, constraints: { min: 0, max: 10, step: 0.5, allowedUnits: ['semana', 'mes'] },
    });
  });

  const FULL = { min: 0, max: 10, step: 2, unit: 'semana', allowed_units: ['semana', 'mes'] };

  it.each([
    ['an empty object', {}],
    ['type only', { type: 'count' }],
    ['a legacy unit with a constraint next to it', { unit: 'veces', max: 10 }],
    ['a legacy unit with allowed_units', { unit: 'veces', allowed_units: ['semana'] }],
    ['a platform unit alone (no min/max/step/allowed_units)', { unit: 'semana' }],
    ['min only', { min: 0 }],
    ['min + max', { min: 0, max: 10 }],
    ['min + max + step (no unit, no allowed_units)', { min: 0, max: 10, step: 1 }],
    ['min + max + step + unit (no allowed_units)', { min: 0, max: 10, step: 1, unit: 'semana' }],
    ['min + max + step + allowed_units (no unit)', { min: 0, max: 10, step: 1, allowed_units: ['semana'] }],
    ['min + step (the old anchoring shape)', { min: 1, step: 2 }],
    ['allowed_units alone', { allowed_units: ['semana'] }],
    ['allowed_units with an unknown unit', { ...FULL, allowed_units: ['semana', 'x'] }],
    ['allowed_units with the legacy unit', { ...FULL, allowed_units: ['semana', 'veces'] }],
    ['an unknown unit', { ...FULL, unit: 'week', allowed_units: ['semana'] }],
    ['the legacy unit inside a modern config', { ...FULL, unit: 'veces' }],
    ['a unit outside allowed_units', { ...FULL, unit: 'dia' }],
    ['a string min', { ...FULL, min: '0' }],
    ['an infinite max', { ...FULL, max: Number.POSITIVE_INFINITY }],
    ['a NaN step', { ...FULL, step: Number.NaN }],
    ['a negative step', { ...FULL, step: -1 }],
    ['a zero step', { ...FULL, step: 0 }],
    ['a step wider than the range', { ...FULL, step: 11 }],
    ['min == max', { ...FULL, min: 10, max: 10 }],
    ['min > max', { ...FULL, min: 11 }],
    ['a non-array allowed_units', { ...FULL, allowed_units: 'semana' }],
    ['an empty allowed_units', { ...FULL, allowed_units: [] }],
    ['a numeric unit', { ...FULL, unit: 3 }],
    ['a numeric type', { ...FULL, type: 3 }],
    ['an unknown key', { ...FULL, tolerance: 1 }],
    ['an array', []],
    ['a string', 'veces'],
    ['a number', 4],
  ])('refuses %s', (_label, config) => {
    const r = parseSnapshotFrequencyConfig(config);
    expect(r.ok).toBe(false);
  });

  it('names the missing fields of a partial modern shape', () => {
    const r = parseSnapshotFrequencyConfig({ min: 0, max: 10 });
    expect(r).toEqual({ ok: false, reason: 'frequency_config está incompleto (falta step, unit, allowed_units)' });
  });

  it('accepts a compliant value and a cleared value', () => {
    expect(validateFrequencyResponse(FULL, 4, 'mes')).toEqual({ ok: true });
    expect(validateFrequencyResponse(FULL, null, 'mes')).toEqual({ ok: true });
    expect(validateFrequencyResponse(FULL, undefined, undefined)).toEqual({ ok: true });
  });

  it.each([
    ['below_min', -1, 'semana'],
    ['above_max', 11, 'semana'],
    ['off_step', 3, 'semana'],
    ['invalid_value', Number.NaN, 'semana'],
    ['invalid_value', '4', 'semana'],
    ['unit_required', 4, null],
    ['invalid_unit', 4, 'veces'],
    ['unit_not_allowed', 4, 'dia'],
  ])('refuses with %s', (code, value, unit) => {
    expect(validateFrequencyResponse(FULL, value, unit)).toMatchObject({ ok: false, code });
  });

  it('a unit outside the enum is refused even with a cleared value', () => {
    expect(validateFrequencyResponse(FULL, null, 'veces')).toMatchObject({ ok: false, code: 'invalid_unit' });
  });

  it('reports malformed_config before looking at the value', () => {
    expect(validateFrequencyResponse({ min: 10, max: 1 }, 4, 'semana')).toMatchObject({ ok: false, code: 'malformed_config' });
    expect(validateFrequencyResponse({ unit: 'semana' }, 4, 'semana')).toMatchObject({ ok: false, code: 'malformed_config' });
  });

  it('legacy config accepts any finite value with any platform unit', () => {
    expect(validateFrequencyResponse({ unit: 'veces' }, 123.4, 'año')).toEqual({ ok: true });
    expect(validateFrequencyResponse(undefined, 0, 'dia')).toEqual({ ok: true });
    expect(validateFrequencyResponse({ unit: 'veces' }, 3, 'veces')).toMatchObject({ ok: false, code: 'invalid_unit' });
  });

  // ── Codex round 3, finding 2: decimal boundaries under one scaled tolerance ──
  describe('decimal boundaries (finding 2)', () => {
    const DECIMAL = { type: 'count', min: 0.1, max: 0.3, step: 0.2, unit: 'dia', allowed_units: ['dia'] };

    it('0.3 - 0.1 is not 0.2 in IEEE 754, which is why the raw comparison refused the boundary', () => {
      expect(0.3 - 0.1).toBe(0.19999999999999998);
      expect(0.1 + 0.2).toBe(0.30000000000000004);
    });

    it('the tolerance is FREQUENCY_TOLERANCE_ULPS units in the last place of the largest operand (R5-2)', () => {
      expect(FREQUENCY_TOLERANCE_ULPS).toBe(8);
      expect(ulp(1)).toBe(Number.EPSILON);
      expect(ulp(0.3)).toBe(2 ** -54);
      expect(ulp(1e9)).toBe(2 ** -23);
      expect(ulp(1e-10)).toBe(2 ** -86);
      expect(ulp(0)).toBe(Number.MIN_VALUE);
      expect(ulp(-1000.3)).toBe(ulp(1000.3));
      expect(ulp(Number.POSITIVE_INFINITY)).toBeNaN();
      expect(frequencyTolerance(0.1, 0.3, 0.2)).toBe(8 * 2 ** -54);
      expect(frequencyTolerance(1000.1, 1000.3)).toBe(8 * 2 ** -43);
      expect(frequencyTolerance(-50, 2)).toBe(8 * 2 ** -47);
      expect(frequencyTolerance(0, 1e-10, 1e-11)).toBe(8 * 2 ** -86);
      expect(frequencyTolerance()).toBe(8 * Number.MIN_VALUE);
      // Nothing about it scales with a magnitude floor: at 1e9 it is under a millionth.
      expect(frequencyTolerance(1000000010)).toBeLessThan(1e-6);
    });

    it('the ULP tolerance covers the measured representation error of decimal grids (at most 2 ULP)', () => {
      const dec = (x: number) => { const s = String(x); const e = s.indexOf('e'); if (e >= 0) { return Math.max(0, (s.slice(0, e).split('.')[1] ?? '').length - Number(s.slice(e + 1))); } return (s.split('.')[1] ?? '').length; };
      let worst = 0;
      for (const step of [0.1, 0.2, 0.25, 0.3, 0.05, 0.01, 0.001, 0.7, 1.1, 2.2, 0.15, 0.33, 12.5, 1e-7]) {
        for (const anchor of [0, 0.1, 0.7, 1000.1, -5, -0.3, 1e6, 1e9, 123.456]) {
          const d = Math.min(15, Math.max(dec(step), dec(anchor)));
          for (let n = 0; n <= 500; n++) {
            const exact = Number((anchor + n * step).toFixed(d));
            const nearest = anchor + Math.round((exact - anchor) / step) * step;
            const err = Math.abs(exact - nearest) / ulp(Math.max(Math.abs(exact), Math.abs(nearest), Math.abs(anchor), Math.abs(step)));
            if (err > worst) worst = err;
            if (n > 0) {
              const range = Number((exact - anchor).toFixed(d));
              const rErr = Math.abs(range - (exact - anchor)) / ulp(Math.max(Math.abs(exact), Math.abs(anchor), Math.abs(range)));
              if (rErr > worst) worst = rErr;
            }
          }
        }
      }
      expect(worst).toBeLessThanOrEqual(2);
      expect(worst).toBeLessThan(FREQUENCY_TOLERANCE_ULPS / 2);
    });

    it('the Codex decimal boundary is accepted by the range rule, the publisher and the parser', () => {
      expect(frequencyRangeViolations(0.1, 0.3, 0.2)).toEqual([]);
      expect(validateFrequencyConfig(DECIMAL)).toEqual({ valid: true, errors: [] });
      expect(parseSnapshotFrequencyConfig(DECIMAL)).toEqual({
        ok: true, constraints: { min: 0.1, max: 0.3, step: 0.2, allowedUnits: ['dia'] },
      });
    });

    it('genuinely excessive decimal steps are still refused by every side', () => {
      for (const step of [0.2000002, 0.21, 0.4]) {
        expect(frequencyRangeViolations(0.1, 0.3, step)).toEqual(['step_exceeds_range']);
        expect(validateFrequencyConfig({ ...DECIMAL, step }).errors).toEqual(['el paso no puede ser mayor que el rango (máximo − mínimo)']);
        expect(parseSnapshotFrequencyConfig({ ...DECIMAL, step })).toEqual({ ok: false, reason: 'frequency_config.step no cabe en el rango min..max' });
      }
      expect(frequencyRangeViolations(0.1, 0.29, 0.2)).toEqual(['step_exceeds_range']);
    });

    it('min < max is exact: no tolerance invents a minimum permitted range (R5-2)', () => {
      // 1e-12 above 0.3 is a real (tiny) range; the step then has to fit in it.
      expect(frequencyRangeViolations(0.3, 0.3 + 1e-12, 0.1)).toEqual(['step_exceeds_range']);
      expect(frequencyRangeViolations(0.3, 0.3 + 1e-12, 1e-12)).toEqual([]);
      expect(validateFrequencyConfig({ ...DECIMAL, min: 0.3, max: 0.3 + 1e-12, step: 1e-12 })).toEqual({ valid: true, errors: [] });
      expect(parseSnapshotFrequencyConfig({ ...DECIMAL, min: 0.3, max: 0.3 + 1e-12, step: 1e-12 }).ok).toBe(true);
      // Equal (the same double) is not a range; one ULP apart is.
      expect(frequencyRangeViolations(0.3, 0.3, 0.1)).toEqual(['min_not_below_max']);
      expect(frequencyRangeViolations(0.3, 0.3 + 2 ** -54, 2 ** -54)).toEqual([]);
      expect(frequencyRangeViolations(0.3 + 2 ** -54, 0.3, 2 ** -54)).toEqual(['min_not_below_max']);
    });

    it('accepts both endpoints of the decimal boundary, including the computed 0.1 + 0.2', () => {
      expect(validateFrequencyResponse(DECIMAL, 0.1, 'dia')).toEqual({ ok: true });
      expect(validateFrequencyResponse(DECIMAL, 0.3, 'dia')).toEqual({ ok: true });
      expect(validateFrequencyResponse(DECIMAL, 0.1 + 0.2, 'dia')).toEqual({ ok: true });
    });

    it('still refuses off-grid and out-of-range decimal responses', () => {
      expect(validateFrequencyResponse(DECIMAL, 0.2, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
      expect(validateFrequencyResponse(DECIMAL, 0.29, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
      expect(validateFrequencyResponse(DECIMAL, 0.3000002, 'dia')).toMatchObject({ ok: false, code: 'above_max' });
      expect(validateFrequencyResponse(DECIMAL, 0.31, 'dia')).toMatchObject({ ok: false, code: 'above_max' });
      expect(validateFrequencyResponse(DECIMAL, 0.0999998, 'dia')).toMatchObject({ ok: false, code: 'below_min' });
      expect(validateFrequencyResponse(DECIMAL, 0, 'dia')).toMatchObject({ ok: false, code: 'below_min' });
    });

    it('a decimal grid anchored at 0 accepts values whose division is inexact (0.3 / 0.1 = 2.9999999999999996)', () => {
      const tenths = { min: 0, max: 1, step: 0.1, unit: 'dia', allowed_units: ['dia'] };
      expect(0.3 / 0.1).not.toBe(3);
      for (const v of [0, 0.1, 0.2, 0.3, 0.6, 0.7, 0.9, 1]) {
        expect(validateFrequencyResponse(tenths, v, 'dia')).toEqual({ ok: true });
      }
      expect(validateFrequencyResponse(tenths, 0.35, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
      expect(validateFrequencyResponse(tenths, 0.3001, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
    });
  });

  // ── Codex round 4, finding R5-2: the round-3 ratio weakened the contract ──
  describe('narrow ranges and large magnitudes (finding R5-2)', () => {
    const UNIT = { unit: 'dia', allowed_units: ['dia'] };

    it('reproduction A: a finite min < max with a fitting positive step is valid however narrow the range', () => {
      const narrow = { min: 0, max: 1e-10, step: 1e-11, ...UNIT };
      expect(frequencyRangeViolations(0, 1e-10, 1e-11)).toEqual([]);
      expect(validateFrequencyConfig(narrow)).toEqual({ valid: true, errors: [] });
      expect(parseSnapshotFrequencyConfig(narrow)).toEqual({ ok: true, constraints: { min: 0, max: 1e-10, step: 1e-11, allowedUnits: ['dia'] } });
      // Its grid and bounds work at that scale too.
      expect(validateFrequencyResponse(narrow, 3e-11, 'dia')).toEqual({ ok: true });
      expect(validateFrequencyResponse(narrow, 1e-10, 'dia')).toEqual({ ok: true });
      expect(validateFrequencyResponse(narrow, 3.5e-11, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
      expect(validateFrequencyResponse(narrow, 1.1e-10, 'dia')).toMatchObject({ ok: false, code: 'above_max' });
      expect(validateFrequencyResponse(narrow, -1e-11, 'dia')).toMatchObject({ ok: false, code: 'below_min' });
      // Neighbouring invalid configs at the same scale.
      expect(frequencyRangeViolations(0, 1e-10, 1.1e-10)).toEqual(['step_exceeds_range']);
      expect(frequencyRangeViolations(1e-10, 1e-10, 1e-11)).toEqual(['min_not_below_max']);
      expect(frequencyRangeViolations(1e-10, 0, 1e-11)).toEqual(['min_not_below_max']);
    });

    it('reproduction B: an off-grid response at large magnitude is refused', () => {
      const big = { min: 0, max: 1000000010, step: 1, ...UNIT };
      expect(validateFrequencyConfig(big)).toEqual({ valid: true, errors: [] });
      expect(validateFrequencyResponse(big, 1000000000.5, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
      expect(validateFrequencyResponse(big, 1000000000.001, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
      expect(validateFrequencyResponse(big, 1000000000, 'dia')).toEqual({ ok: true });
      expect(validateFrequencyResponse(big, 1000000010, 'dia')).toEqual({ ok: true });
    });

    it('reproduction C: a response above max at large magnitude is refused', () => {
      const big = { min: 0, max: 1000000010, step: 1, ...UNIT };
      expect(validateFrequencyResponse(big, 1000000010.5, 'dia')).toMatchObject({ ok: false, code: 'above_max' });
      expect(validateFrequencyResponse(big, 1000000011, 'dia')).toMatchObject({ ok: false, code: 'above_max' });
      expect(validateFrequencyResponse(big, 1000000010.001, 'dia')).toMatchObject({ ok: false, code: 'above_max' });
      expect(validateFrequencyResponse(big, -0.5, 'dia')).toMatchObject({ ok: false, code: 'below_min' });
    });

    it('large-magnitude decimal boundaries still work (representation error is a few ULP at every scale)', () => {
      const cfg = { min: 1000000.1, max: 1000000.3, step: 0.2, ...UNIT };
      expect(1000000.3 - 1000000.1).not.toBe(0.2);
      expect(frequencyRangeViolations(1000000.1, 1000000.3, 0.2)).toEqual([]);
      expect(validateFrequencyConfig(cfg)).toEqual({ valid: true, errors: [] });
      expect(validateFrequencyResponse(cfg, 1000000.1, 'dia')).toEqual({ ok: true });
      expect(validateFrequencyResponse(cfg, 1000000.3, 'dia')).toEqual({ ok: true });
      expect(validateFrequencyResponse(cfg, 1000000.1 + 0.2, 'dia')).toEqual({ ok: true });
      expect(validateFrequencyResponse(cfg, 1000000.2, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
      expect(validateFrequencyResponse(cfg, 1000000.3000001, 'dia')).toMatchObject({ ok: false, code: 'above_max' });
      expect(frequencyRangeViolations(1000000.1, 1000000.3, 0.2000001)).toEqual(['step_exceeds_range']);
    });

    it('a step one double above the range is refused even where the round-3 ratio accepted it', () => {
      // At 1e9 the round-3 tolerance was 1 unit; one ULP (2^-23) is what the contract now allows.
      expect(frequencyRangeViolations(0, 1e9, 1e9 + 0.5)).toEqual(['step_exceeds_range']);
      expect(frequencyRangeViolations(0, 1e9, 1e9 + 1)).toEqual(['step_exceeds_range']);
      expect(frequencyRangeViolations(0, 1e9, 1e9 + 8 * 2 ** -23)).toEqual([]);           // 8 ULP: the tolerance itself
      expect(frequencyRangeViolations(0, 1e9, 1e9 + 9 * 2 ** -23)).toEqual(['step_exceeds_range']); // 9 ULP: refused
      expect(frequencyRangeViolations(0, 1e9, 1e9)).toEqual([]);
    });
  });

  it('anchors the step at min and tolerates float noise', () => {
    const anchored = { min: 1, max: 9, step: 2, unit: 'dia', allowed_units: ['dia'] };
    expect(validateFrequencyResponse(anchored, 5, 'dia')).toEqual({ ok: true });
    expect(validateFrequencyResponse(anchored, 4, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
    const fine = { min: 0, max: 1, step: 0.1, unit: 'dia', allowed_units: ['dia'] };
    expect(validateFrequencyResponse(fine, 0.3, 'dia')).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Codex round 2, finding A — producer / consumer parity. A modern config is
// publishable IF AND ONLY IF the persisted snapshot parser accepts it, so an
// instrument can never be published that docentes cannot answer.
// ---------------------------------------------------------------------------
import { FREQUENCY_CONTRACT_CASES, LEGACY_CASES } from '../../../fixtures/frequency-config-contract';

describe('frequency contract parity (publish-time validateFrequencyConfig ⇔ response-time parseSnapshotFrequencyConfig)', () => {
  it.each(FREQUENCY_CONTRACT_CASES.map((c) => [c.label, c.valid, c.config] as const))(
    '%s → producer and consumer agree (valid=%s)',
    (_label, valid, config) => {
      const produced = validateFrequencyConfig(config);
      const parsed = parseSnapshotFrequencyConfig(config);
      expect({ publishable: produced.valid, parseable: parsed.ok }).toEqual({ publishable: valid, parseable: valid });
      if (!valid) {
        expect(produced.errors.length).toBeGreaterThan(0);
        expect(parsed.ok === false && parsed.reason.length > 0).toBe(true);
      }
    }
  );

  it('the Codex example (step 2 in a 0..1 range) is refused at publish with an es-CL reason and at parse', () => {
    const codex = { type: 'count', min: 0, max: 1, step: 2, unit: 'dia', allowed_units: ['dia'] };
    expect(validateFrequencyConfig(codex)).toEqual({ valid: false, errors: ['el paso no puede ser mayor que el rango (máximo − mínimo)'] });
    expect(parseSnapshotFrequencyConfig(codex)).toEqual({ ok: false, reason: 'frequency_config.step no cabe en el rango min..max' });
    expect(validateFrequencyResponse(codex, 0, 'dia')).toMatchObject({ ok: false, code: 'malformed_config' });
  });

  it('a boundary config (step == max − min) publishes and accepts min, max and nothing in between', () => {
    const boundary = { type: 'count', min: 0, max: 1, step: 1, unit: 'dia', allowed_units: ['dia'] };
    expect(validateFrequencyConfig(boundary)).toEqual({ valid: true, errors: [] });
    expect(validateFrequencyResponse(boundary, 0, 'dia')).toEqual({ ok: true });
    expect(validateFrequencyResponse(boundary, 1, 'dia')).toEqual({ ok: true });
    expect(validateFrequencyResponse(boundary, 0.5, 'dia')).toMatchObject({ ok: false, code: 'off_step' });
    expect(validateFrequencyResponse(boundary, 2, 'dia')).toMatchObject({ ok: false, code: 'above_max' });
  });

  it.each(LEGACY_CASES.map((c) => [c.label, c.config] as const))(
    '%s stays unconstrained for the consumer and unpublishable for the producer',
    (_label, config) => {
      expect(parseSnapshotFrequencyConfig(config)).toEqual({ ok: true, constraints: { min: null, max: null, step: null, allowedUnits: null } });
      expect(validateFrequencyConfig(config).valid).toBe(false);
    }
  );

  it('an unknown key is refused at publish with an es-CL reason (it was already refused at parse)', () => {
    const r = validateFrequencyConfig({ type: 'count', min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana'], tolerance: 1 });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['la configuración contiene un campo desconocido (tolerance)']);
  });
});
