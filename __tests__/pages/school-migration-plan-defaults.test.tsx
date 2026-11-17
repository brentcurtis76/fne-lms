// @vitest-environment jsdom
/**
 * GC-6: the Plan de Migración page shows, for grades and years with nothing
 * saved, what registros are really created with (the rule in
 * autoAssignmentService, shared as effectiveGenerationType); «Guardar Plan»
 * can save a plan that was never saved; the assignment warning names the grade.
 * The service side is driven through preflightAutoAssignment with an
 * in-memory admin client, so these tests fail if the service's rule changes.
 * Synthetic ids only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildChainableQuery } from '../api/assessment-builder/_helpers';

const { mockSupabaseAdmin } = vi.hoisted(() => ({ mockSupabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../../lib/supabaseAdmin', () => ({ supabaseAdmin: mockSupabaseAdmin }));
vi.mock('../../components/layout/MainLayout', () => ({ default: () => null }));
vi.mock('../../components/layout/FunctionalPageHeader', () => ({ ResponsiveFunctionalPageHeader: () => null }));
vi.mock('../../components/school/ChangeHistorySection', () => ({ default: () => null }));
vi.mock('../../components/school/CompletionStatusBadge', () => ({ default: () => null }));
vi.mock('recharts', () => ({ PieChart: () => null, Pie: () => null, Cell: () => null, ResponsiveContainer: () => null }));

import { buildInitialPlanGrid, isMigrationPlanSaveEnabled } from '../../pages/school/migration-plan/index';
import { preflightAutoAssignment } from '../../lib/services/assessment-builder/autoAssignmentService';

// ab_grades as the local ground numbers them: 6 = 2° Básico (always GT), 9 = 5° Básico (not)
const GRADES = [
  { id: 6, name: '2° Básico', is_always_gt: true },
  { id: 9, name: '5° Básico', is_always_gt: false },
];

/** What the service decides for a course of `grade` in year 2, given the saved plan value (null = nothing saved). */
async function serviceGenerationType(grade: (typeof GRADES)[number], saved: 'GT' | 'GI' | null) {
  mockSupabaseAdmin.from.mockImplementation((table: string) => {
    switch (table) {
      case 'school_transversal_context': return buildChainableQuery({ implementation_year_2026: 2 });
      case 'school_course_structure': return buildChainableQuery({ id: 'cs-f8', grade_level: 'x', grade_id: grade.id });
      case 'ab_grades': return buildChainableQuery({ name: grade.name, is_always_gt: grade.is_always_gt });
      case 'ab_migration_plan':
        return saved ? buildChainableQuery({ generation_type: saved }) : buildChainableQuery(null, { code: 'PGRST116', message: 'not found' });
      case 'ab_via_assignment_rules': return buildChainableQuery([{ area: 'evaluacion', target: 'course_docente' }]);
      default: return buildChainableQuery([]);
    }
  });
  return preflightAutoAssignment('cs-f8', 701);
}

beforeEach(() => vi.clearAllMocks());

describe('GC-6 Plan de Migración shows what the system does', () => {
  it('with no saved plan, every cell equals the generation type registros are created with', async () => {
    const grid = buildInitialPlanGrid(GRADES, []);
    for (const grade of GRADES) {
      const plan = await serviceGenerationType(grade, null);
      for (let year = 1; year <= 5; year++) {
        expect(grid[year][grade.id]).toBe(plan.generationType);
      }
    }
    // 5° Básico (above 3° Básico) with nothing saved: GT, as registros are created
    expect(grid[2][9]).toBe('GT');
    expect(grid[2][6]).toBe('GT');
  });

  it('pins the service rule: a saved GI is used for a grade that is not always GT, never for an always-GT grade', async () => {
    expect((await serviceGenerationType(GRADES[1], 'GI')).generationType).toBe('GI');
    expect((await serviceGenerationType(GRADES[1], null)).generationType).toBe('GT');
    expect((await serviceGenerationType(GRADES[0], 'GI')).generationType).toBe('GT');
  });

  it('saved entries are shown as saved', () => {
    const grid = buildInitialPlanGrid(GRADES, [{ year_number: 2, grade_id: 9, generation_type: 'GI' }]);
    expect(grid[2][9]).toBe('GI');
    expect(grid[3][9]).toBe('GT');
  });

  it('the warning at assignment names the grade, not its number', async () => {
    const plan = await serviceGenerationType(GRADES[1], null);
    expect(plan.warnings).toEqual([
      'No se encontró plan de migración para el nivel "5° Básico" en el año 2. Se usará GT por defecto.',
    ]);
  });
});

describe('GC-6 «Guardar Plan» enabled state', () => {
  it('is enabled when no plan has been saved yet, even without changes', () => {
    expect(isMigrationPlanSaveEnabled({ saving: false, hasChanges: false, savedEntryCount: 0 })).toBe(true);
  });

  it('with a saved plan, is enabled only after a change', () => {
    expect(isMigrationPlanSaveEnabled({ saving: false, hasChanges: false, savedEntryCount: 80 })).toBe(false);
    expect(isMigrationPlanSaveEnabled({ saving: false, hasChanges: true, savedEntryCount: 80 })).toBe(true);
  });

  it('is disabled while saving', () => {
    expect(isMigrationPlanSaveEnabled({ saving: true, hasChanges: true, savedEntryCount: 0 })).toBe(false);
  });
});
