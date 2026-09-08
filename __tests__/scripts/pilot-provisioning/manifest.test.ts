import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildDesiredState,
  computeExpectedCounts,
  digestManifest,
  idFor,
  lintManifestSafety,
  loadManifest,
  prepareManifest,
  publishedVersionFor,
  validateManifest,
} from '../../../scripts/pilot-provisioning/manifest.mjs';

const SYNTHETIC = resolve(__dirname, '../../../config/pilot-manifests/pc-pilot-synthetic-v1.json');
const SKELETON = resolve(__dirname, '../../../config/pilot-manifests/pc-pilot-v1.template.json');

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('pilot provisioning manifests', () => {
  it('loads the synthetic manifest with a stable canonical digest and derived, deterministic ids', () => {
    const first = loadManifest(SYNTHETIC);
    const second = loadManifest(SYNTHETIC);
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.mode).toBe('synthetic');
    expect(first.target).toBe('staging');
    expect(first.environmentClass).toBe('staging');
    expect(first.syntheticSchool.name.startsWith('[SINTÉTICO]')).toBe(true);
    for (const template of first.templates) expect(template.name.startsWith('[SINTÉTICO]')).toBe(true);
    for (const persona of first.rehearsalPersonas) {
      expect(persona.email.endsWith('@example.com')).toBe(true);
      expect(persona.createdByThisTooling).toBe(false);
    }
    expect(JSON.stringify(first)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(idFor('pc-pilot-synthetic-v1', 'template', 'eva-1b')).toBe(idFor('pc-pilot-synthetic-v1', 'template', 'eva-1b'));
    expect(idFor('pc-pilot-synthetic-v1', 'template', 'eva-1b')).not.toBe(idFor('pc-pilot-synthetic-v2', 'template', 'eva-1b'));
  });

  it('ignores _comment blocks in the digest but not a content change', () => {
    const manifest = loadManifest(SYNTHETIC);
    const commented = { ...clone(manifest), _comment: ['different note'] };
    delete (commented as any).digest;
    expect(digestManifest(commented)).toBe(manifest.digest);
    const changed = clone(manifest);
    delete (changed as any).digest;
    changed.templates[0].name = '[SINTÉTICO] otro nombre';
    expect(digestManifest(changed)).not.toBe(manifest.digest);
  });

  it('refuses the real-pilot skeleton as shipped (unapproved, no school, no grades)', () => {
    expect(() => loadManifest(SKELETON)).toThrow(/pilotSchoolId is null/);
    expect(() => loadManifest(SKELETON)).toThrow(/grades must be a non-empty list/);
    expect(() => loadManifest(SKELETON)).toThrow(/templates must be a non-empty list/);
  });

  it('derives every row the manifest owns and mirrors the publish version rule', () => {
    const manifest = loadManifest(SYNTHETIC);
    const state = buildDesiredState(manifest, new Map([['1_basico', 5], ['5_basico', 9]]));
    expect(state.templates).toHaveLength(2);
    expect(state.objectives).toHaveLength(2);
    expect(state.modules).toHaveLength(2);
    expect(state.indicators).toHaveLength(6);
    expect(state.expectations).toHaveLength(9);
    expect(state.yearWeights).toHaveLength(3);
    expect(state.migrationPlan).toHaveLength(4);
    expect(state.templates[0].published_version).toBe('1.1.0');
    expect(publishedVersionFor('2.3.7')).toBe('2.4.0');
    expect(computeExpectedCounts(manifest)).toEqual(manifest.expectedCounts);
    const dualExpectations = state.expectations.filter((e) => e.generation_type === 'GI');
    expect(dualExpectations).toHaveLength(3);
    for (const indicator of state.indicators.filter((i) => i.category === 'frecuencia')) {
      expect(indicator.frequency_config).toMatchObject({ min: expect.any(Number), max: expect.any(Number), step: expect.any(Number) });
    }
  });

  describe('safety lint', () => {
    const base = () => {
      const m = clone(loadManifest(SYNTHETIC));
      delete (m as any).digest;
      return m;
    };

    it.each([
      ['a non-reserved email domain', (m: any) => (m.rehearsalPersonas[0].email = 'persona@gmail.com'), 'non-reserved-email'],
      ['a plausible real domain', (m: any) => (m.rehearsalPersonas[0].email = 'persona@colegio.cl'), 'non-reserved-email'],
      ['a JWT-shaped string', (m: any) => (m.templates[0].description = 'ey' + 'J' + 'hbGciOiJIUzI1NiJ9.x.y'), 'credential-shaped-value'],
      ['an sb_ key', (m: any) => (m.templates[0].description = 'sb_' + 'secret_abc'), 'credential-shaped-value'],
      ['a postgres URL', (m: any) => (m.templates[0].description = ['postgres', '//u:p@host/db'].join(':')), 'credential-shaped-value'],
      ['an https URL', (m: any) => (m.templates[0].description = 'https://colegio.example.org'), 'url-value'],
      ['a key named password', (m: any) => (m.rehearsalPersonas[0].password = 'x'), 'secret-named-key'],
      ['a key named token', (m: any) => (m.accessToken = 'x'), 'secret-named-key'],
      ['a birth-date key', (m: any) => (m.rehearsalPersonas[0].fechaNacimiento = '2010-01-01'), 'birth-date-key'],
      ['a bare date', (m: any) => (m.templates[0].description = 'nacido el 2010-01-01'), 'date-value'],
      ['a RUT-shaped string', (m: any) => (m.templates[0].description = 'RUT 12.345.678-9'), 'rut-shaped-value'],
      ['a UUID', (m: any) => (m.templates[0].description = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'), 'uuid-value'],
      ['a minor-data term', (m: any) => (m.templates[0].description = 'lista de estudiantes'), 'prohibited-term:estudiante'],
    ])('rejects %s', (_label, mutate, rule) => {
      const m = base();
      mutate(m);
      const findings = lintManifestSafety(m);
      expect(findings.map((f) => f.rule)).toContain(rule);
      expect(() => prepareManifest(m)).toThrow(/refusing manifest: safety lint failed/);
      for (const finding of findings) expect(JSON.stringify(finding)).not.toMatch(/gmail|colegio\.cl|hbGci|sb_|postgres:|12\.345/);
    });

    it('accepts every RFC 2606 reserved domain and TLD', () => {
      for (const email of ['a@example.com', 'a@sub.example.net', 'a@example.org', 'a@school.test', 'a@school.invalid']) {
        const m = base();
        m.rehearsalPersonas[0].email = email;
        expect(lintManifestSafety(m)).toEqual([]);
      }
    });
  });

  describe('shape validation', () => {
    const base = () => {
      const m = clone(loadManifest(SYNTHETIC));
      delete (m as any).digest;
      return m;
    };
    const frequencyIndicator = (m: any) => m.templates[0].objectives[0].modules[0].indicators[1];

    it('fails an incomplete frequency configuration', () => {
      const m = base();
      frequencyIndicator(m).frequencyConfig = { unit: 'semana' };
      expect(validateManifest(m).join('\n')).toMatch(/frequencyConfig max must be a number/);
      const m2 = base();
      frequencyIndicator(m2).frequencyConfig.unit = 'dia';
      expect(validateManifest(m2).join('\n')).toMatch(/unit must be in allowed_units/);
    });

    it('fails a missing GT or GI expectation', () => {
      const m = base();
      delete frequencyIndicator(m).expectations.GT;
      expect(validateManifest(m).join('\n')).toMatch(/GT: expectation missing/);
      const m2 = base();
      delete m2.templates[1].objectives[0].modules[0].indicators[0].expectations.GI;
      expect(validateManifest(m2).join('\n')).toMatch(/GI: expectation missing/);
    });

    it('fails a grade without a migration plan, a template, or with a bad year', () => {
      const m = base();
      m.grades[0].migrationPlan = [];
      expect(validateManifest(m).join('\n')).toMatch(/migrationPlan must be a non-empty list/);
      const m2 = base();
      m2.grades[0].migrationPlan[0].yearNumber = 6;
      expect(validateManifest(m2).join('\n')).toMatch(/yearNumber must be 1..5/);
      const m3 = base();
      m3.templates.splice(1, 1);
      expect(validateManifest(m3).join('\n')).toMatch(/grade 5_basico has no template/);
    });

    it('fails declared counts that do not match the derived counts', () => {
      const m = base();
      m.expectedCounts.indicators = 99;
      expect(validateManifest(m).join('\n')).toMatch(/expectedCounts mismatch/);
    });

    it('fails a synthetic name without the banner marker and a persona claiming to be created', () => {
      const m = base();
      m.templates[0].name = 'Evaluación sin marca';
      expect(validateManifest(m).join('\n')).toMatch(/name must start with the synthetic marker/);
      const m2 = base();
      m2.rehearsalPersonas[0].createdByThisTooling = true;
      expect(validateManifest(m2).join('\n')).toMatch(/createdByThisTooling must be false/);
    });

    it('binds mode to target and environment class', () => {
      const m = base();
      m.target = 'realPilot';
      expect(validateManifest(m).join('\n')).toMatch(/target must be staging for mode synthetic/);
      const m2 = base();
      m2.environmentClass = 'production';
      expect(validateManifest(m2).join('\n')).toMatch(/environmentClass must be staging/);
    });
  });
});

// Codex round 2, finding A — the manifest validator enforces the SAME
// frequency contract as the publish service and the responses API.
import { validateFrequencyConfigShape, frequencyTolerance, ulp, FREQUENCY_TOLERANCE_ULPS } from '../../../scripts/pilot-provisioning/manifest.mjs';
import {
  frequencyTolerance as tsTolerance, ulp as tsUlp, FREQUENCY_TOLERANCE_ULPS as TS_ULPS,
} from '../../../lib/services/assessment-builder/frequencyConfig';
import { FREQUENCY_CONTRACT_CASES, LEGACY_CASES } from '../../fixtures/frequency-config-contract';

describe('manifest frequency contract parity', () => {
  it.each(FREQUENCY_CONTRACT_CASES.map((c) => [c.label, c.valid, c.config] as const))(
    '%s → validateFrequencyConfigShape agrees (valid=%s)',
    (_label, valid, config) => {
      expect(validateFrequencyConfigShape(config).length === 0).toBe(valid);
    }
  );

  it.each(LEGACY_CASES.map((c) => [c.label, c.config] as const))('%s is never provisionable', (_label, config) => {
    expect(validateFrequencyConfigShape(config).length).toBeGreaterThan(0);
  });

  it('the manifest tolerance is the same ULP rule as frequencyConfig.ts, and min < max is exact (R5-2)', () => {
    expect(FREQUENCY_TOLERANCE_ULPS).toBe(TS_ULPS);
    expect(ulp(0.3)).toBe(tsUlp(0.3));
    expect(ulp(1e9)).toBe(tsUlp(1e9));
    expect(ulp(1e-10)).toBe(tsUlp(1e-10));
    for (const ops of [[0.1, 0.3, 0.2], [1000.1, 1000.3], [0, 1e-10, 1e-11], [0, 1000000010, 1], []]) {
      expect(frequencyTolerance(...ops)).toBe(tsTolerance(...ops));
    }
    expect(validateFrequencyConfigShape({ type: 'count', min: 0.1, max: 0.3, step: 0.2, unit: 'dia', allowed_units: ['dia'] })).toEqual([]);
    expect(validateFrequencyConfigShape({ type: 'count', min: 0.1, max: 0.3, step: 0.2000002, unit: 'dia', allowed_units: ['dia'] })).toEqual(['step must fit inside max - min']);
    // A 1e-12 range is a real range (exact min < max); the step then has to fit in it.
    expect(validateFrequencyConfigShape({ type: 'count', min: 0.3, max: 0.3 + 1e-12, step: 0.1, unit: 'dia', allowed_units: ['dia'] })).toEqual(['step must fit inside max - min']);
    expect(validateFrequencyConfigShape({ type: 'count', min: 0.3, max: 0.3, step: 0.1, unit: 'dia', allowed_units: ['dia'] })).toEqual(['min must be < max']);
    // Codex round 4 reproductions A (narrow range valid) and the large-magnitude neighbours.
    expect(validateFrequencyConfigShape({ min: 0, max: 1e-10, step: 1e-11, unit: 'dia', allowed_units: ['dia'] })).toEqual([]);
    expect(validateFrequencyConfigShape({ min: 0, max: 1e9, step: 1e9 + 0.5, unit: 'dia', allowed_units: ['dia'] })).toEqual(['step must fit inside max - min']);
    expect(validateFrequencyConfigShape({ min: 0, max: 1e9, step: 1e9, unit: 'dia', allowed_units: ['dia'] })).toEqual([]);
  });

  it('accepts a whole manifest whose frecuencia indicator carries the Codex decimal boundary (finding 2)', () => {
    const m = clone(loadManifest(SYNTHETIC)) as any;
    delete m.digest;
    m.templates[0].objectives[0].modules[0].indicators[1].frequencyConfig = { type: 'count', min: 0.1, max: 0.3, step: 0.2, unit: 'dia', allowed_units: ['dia'] };
    expect(validateManifest(m).filter((e: string) => /frequencyConfig/.test(e))).toEqual([]);
  });

  it('refuses a whole manifest whose frecuencia indicator carries the Codex example (step wider than the range)', () => {
    const m = clone(loadManifest(SYNTHETIC)) as any;
    delete m.digest;
    m.templates[0].objectives[0].modules[0].indicators[1].frequencyConfig = { type: 'count', min: 0, max: 1, step: 2, unit: 'dia', allowed_units: ['dia'] };
    expect(validateManifest(m).join('\n')).toMatch(/frequencyConfig step must fit inside max - min/);
  });
});
