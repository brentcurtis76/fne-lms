// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shortPathLabel } from '../../../lib/reports/chartLabels';

describe('learning-path chart axis labels', () => {
  it('keeps short names as they are', () => {
    expect(shortPathLabel('Elementos del plan personal')).toBe('Elementos del plan personal');
  });
  it('shortens long names to 28 characters with an ellipsis', () => {
    const label = shortPathLabel('Ejemplos de plan personal en diferentes etapas educativas');
    expect(label).toBe('Ejemplos de plan personal e…');
    expect(label.length).toBeLessThanOrEqual(28);
  });
  it('handles empty values', () => {
    expect(shortPathLabel(undefined)).toBe('');
    expect(shortPathLabel(null)).toBe('');
  });
});
