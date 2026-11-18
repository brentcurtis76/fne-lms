import { describe, it, expect } from 'vitest';
import { canFileExpenses } from '../../../lib/expenses/access';

describe('canFileExpenses (GES-1.3, F7d)', () => {
  it('is true for admin, consultor and community_manager', () => {
    expect(canFileExpenses(['admin'])).toBe(true);
    expect(canFileExpenses(['consultor'])).toBe(true);
    expect(canFileExpenses(['community_manager'])).toBe(true);
    expect(canFileExpenses(['docente', 'consultor'])).toBe(true);
  });

  it('is false for every other role and for no role', () => {
    expect(canFileExpenses([])).toBe(false);
    expect(canFileExpenses(['docente', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
      'supervisor_de_red', 'encargado_licitacion'])).toBe(false);
  });
});
