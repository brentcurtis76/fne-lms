/**
 * LIC-E4: a proposal's link carries a short part of the proposal's own id, so
 * two proposals of the same school, year, type and version no longer collide.
 */
import { describe, expect, it } from 'vitest';
import { generateSlug } from '../access-code';

const ID_A = '8f3c2a1b-1111-4111-8111-111111111111';
const ID_B = '0d9e7f6a-2222-4222-8222-222222222222';

describe('generateSlug — LIC-E4', () => {
  it('two proposals of the same school, year, type and version get two different slugs', () => {
    const a = generateSlug('Escuela Inventada', 'evoluciona', 2026, 1, ID_A);
    const b = generateSlug('Escuela Inventada', 'evoluciona', 2026, 1, ID_B);
    expect(a).not.toBe(b);
    expect(a).toBe('escuela-inventada-evoluciona-2026-v1-8f3c2a1b');
    expect(b).toBe('escuela-inventada-evoluciona-2026-v1-0d9e7f6a');
  });

  it('two schools sharing their first 20 characters no longer collide', () => {
    const a = generateSlug('Colegio Inventado del Norte', 'preparacion', 2026, 1, ID_A);
    const b = generateSlug('Colegio Inventado del Sur', 'preparacion', 2026, 1, ID_B);
    expect(a).not.toBe(b);
  });

  it('stays within the 64-character column for a 20-character school and a four-digit version', () => {
    const slug = generateSlug('Escuela Veinte Letra', 'evoluciona', 2026, 1234, ID_A);
    expect('escuela-veinte-letra'.length).toBe(20);
    expect(slug).toBe('escuela-veinte-letra-evoluciona-2026-v1234-8f3c2a1b');
    expect(slug.length).toBeLessThanOrEqual(64);
    // Even with a 20-character service type the slug fits.
    const longest = generateSlug('Escuela Veinte Letra', 'Servicio Muy Largo Inventado', 2026, 9999, ID_A);
    expect(longest.length).toBeLessThanOrEqual(64);
  });
});
