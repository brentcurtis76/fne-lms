import { describe, it, expect } from 'vitest';
import { categoryScopedColumns } from '../../../../lib/services/assessment-builder/indicatorCategoryColumns';

// A row that still holds off-category data preserved from a prior category.
const stale = {
  frequency_config: { unit: 'dia', min: 0, max: 10 },
  frequency_unit_options: ['dia', 'semana'],
  level_0_descriptor: 'lvl0',
  level_1_descriptor: 'lvl1',
  level_2_descriptor: 'lvl2',
  level_3_descriptor: 'lvl3',
  level_4_descriptor: 'lvl4',
  detalle_options: ['A', 'B'],
};

describe('categoryScopedColumns (preserve + hide)', () => {
  it('emits only descriptors for a profundidad indicator, hiding frequency/detalle', () => {
    const cols = categoryScopedColumns({ category: 'profundidad', ...stale });
    expect(cols.level_0_descriptor).toBe('lvl0');
    expect(cols.level_4_descriptor).toBe('lvl4');
    expect(cols.frequency_config).toBeNull();
    expect(cols.frequency_unit_options).toBeNull();
    expect(cols.detalle_options).toBeNull();
  });

  it('emits only frequency columns for a frecuencia indicator, hiding descriptors', () => {
    const cols = categoryScopedColumns({ category: 'frecuencia', ...stale });
    expect(cols.frequency_config).toEqual(stale.frequency_config);
    expect(cols.frequency_unit_options).toEqual(stale.frequency_unit_options);
    expect(cols.level_0_descriptor).toBeNull();
    expect(cols.detalle_options).toBeNull();
  });

  it('emits only detalle_options for a detalle indicator', () => {
    const cols = categoryScopedColumns({ category: 'detalle', ...stale });
    expect(cols.detalle_options).toEqual(['A', 'B']);
    expect(cols.level_0_descriptor).toBeNull();
    expect(cols.frequency_config).toBeNull();
  });

  it('hides all category-specific columns for cobertura/traspaso', () => {
    for (const category of ['cobertura', 'traspaso']) {
      const cols = categoryScopedColumns({ category, ...stale });
      expect(cols.level_0_descriptor).toBeNull();
      expect(cols.frequency_config).toBeNull();
      expect(cols.detalle_options).toBeNull();
    }
  });
});
