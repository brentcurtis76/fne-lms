import { describe, it, expect } from 'vitest';
import { buildFrequencyConfig } from '../../../../lib/services/assessment-builder/frequencyConfig';

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
});
