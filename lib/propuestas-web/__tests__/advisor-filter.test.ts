/**
 * Tests the advisor exclusion logic used in ProposalPublicView.
 *
 * The component filters snapshot consultants into two groups:
 *   - FNE consultants: shown in the "Equipo de Consultoría" grid
 *   - International advisors: shown from the fixed INTERNATIONAL_ADVISORS constant
 *
 * A consultant is excluded from the FNE grid if:
 *   1. categoria === 'asesor_internacional' (new snapshots), OR
 *   2. nombre matches an entry in INTERNATIONAL_ADVISORS (old snapshots without categoria)
 *
 * This test verifies the logic directly against the constants to ensure
 * old snapshots don't double-render advisors.
 */

import { describe, it, expect } from 'vitest';
import { INTERNATIONAL_ADVISORS } from '../constants';
import type { SnapshotConsultant } from '../snapshot';

// Replicate the exact filter logic from ProposalPublicView.tsx:73-79
function filterFneConsultants(consultants: SnapshotConsultant[]): SnapshotConsultant[] {
  const advisorNames = new Set(INTERNATIONAL_ADVISORS.map((a) => a.nombre.toLowerCase()));
  return consultants.filter(
    (c) =>
      c.categoria !== 'asesor_internacional' &&
      !advisorNames.has(c.nombre.toLowerCase())
  );
}

const fneConsultant: SnapshotConsultant = {
  nombre: 'Arnoldo Cisternas',
  titulo: 'Consultor FNE',
  bio: 'Test bio',
  fotoPath: null,
  formacion: null,
  experiencia: null,
  especialidades: null,
};

describe('Advisor exclusion filter', () => {
  it('keeps FNE consultants without categoria (old snapshot)', () => {
    const result = filterFneConsultants([fneConsultant]);
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe('Arnoldo Cisternas');
  });

  it('keeps FNE consultants with non-advisor categoria', () => {
    const result = filterFneConsultants([
      { ...fneConsultant, categoria: 'equipo_fne' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('excludes consultant with categoria asesor_internacional (new snapshot)', () => {
    const result = filterFneConsultants([
      { ...fneConsultant, nombre: 'Someone New', categoria: 'asesor_internacional' },
    ]);
    expect(result).toHaveLength(0);
  });

  it('excludes advisor by name even without categoria (old snapshot backward compat)', () => {
    // Coral Regí is in INTERNATIONAL_ADVISORS — should be excluded even without categoria
    const result = filterFneConsultants([
      { ...fneConsultant, nombre: 'Coral Regí', categoria: undefined },
    ]);
    expect(result).toHaveLength(0);
  });

  it('excludes all 7 known advisors by name (case-insensitive)', () => {
    const advisorsAsConsultants: SnapshotConsultant[] = INTERNATIONAL_ADVISORS.map((a) => ({
      nombre: a.nombre,
      titulo: a.titulo,
      bio: a.bio,
      fotoPath: a.fotoPath,
      formacion: null,
      experiencia: null,
      especialidades: null,
      // No categoria — simulates old snapshot
    }));
    const result = filterFneConsultants(advisorsAsConsultants);
    expect(result).toHaveLength(0);
  });

  it('correctly splits a mixed list (FNE + advisors without categoria)', () => {
    const mixed: SnapshotConsultant[] = [
      fneConsultant, // FNE — keep
      { ...fneConsultant, nombre: 'Gabriela Naranjo' }, // FNE — keep
      { ...fneConsultant, nombre: 'Coral Regí', categoria: undefined }, // Advisor by name — exclude
      { ...fneConsultant, nombre: 'Jordi Mussons', categoria: undefined }, // Advisor by name — exclude
      { ...fneConsultant, nombre: 'Boris Mir', categoria: 'asesor_internacional' }, // Advisor by categoria — exclude
    ];
    const result = filterFneConsultants(mixed);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.nombre)).toEqual(['Arnoldo Cisternas', 'Gabriela Naranjo']);
  });
});
