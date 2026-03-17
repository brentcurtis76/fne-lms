// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildChainableQuery } from '../api/assessment-builder/_helpers';

// ----------------------------------------------------------------
// Mock supabaseAdmin
// ----------------------------------------------------------------
const { mockSupabaseAdmin } = vi.hoisted(() => ({
  mockSupabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../lib/supabaseAdmin', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

import { triggerAutoAssignment } from '../../lib/services/assessment-builder/autoAssignmentService';

// ----------------------------------------------------------------
// Shared test data
// ----------------------------------------------------------------
const SCHOOL_ID = 42;
const COURSE_STRUCTURE_ID = 'cs-001';
const DOCENTE_ID = 'docente-uuid-111';
const ASSIGNED_BY = 'admin-uuid-999';
const GRADE_ID = 7;
const TEMPLATE_ID = 'tpl-uuid-aaa';
const SNAPSHOT_ID = 'snap-uuid-bbb';
const INSTANCE_ID = 'inst-uuid-ccc';

// ----------------------------------------------------------------
// Helper: configure mockSupabaseAdmin.from to dispatch by table name.
//
// `tableMap` maps a table name to either:
//   - a single chainable query (used every call), or
//   - an array of chainable queries (shifted on each call).
// ----------------------------------------------------------------
function configureMock(
  tableMap: Record<string, ReturnType<typeof buildChainableQuery> | ReturnType<typeof buildChainableQuery>[]>
) {
  mockSupabaseAdmin.from.mockImplementation((table: string) => {
    const entry = tableMap[table];
    if (!entry) return buildChainableQuery(null, null);
    if (Array.isArray(entry)) {
      // Return queries in order; once exhausted fall back to empty
      return entry.length > 0 ? entry.shift()! : buildChainableQuery(null, null);
    }
    return entry;
  });
}

// ----------------------------------------------------------------
// Standard "happy path" table map builder
// ----------------------------------------------------------------
function happyPathMap(overrides?: {
  schoolContext?: ReturnType<typeof buildChainableQuery>;
  courseStructure?: ReturnType<typeof buildChainableQuery>;
  abGrades?: ReturnType<typeof buildChainableQuery>;
  migrationPlan?: ReturnType<typeof buildChainableQuery>;
  templates?: ReturnType<typeof buildChainableQuery>;
  existingInstance?: ReturnType<typeof buildChainableQuery>;
  newInstance?: ReturnType<typeof buildChainableQuery>;
  assignee?: ReturnType<typeof buildChainableQuery>;
}) {
  const map: Record<string, ReturnType<typeof buildChainableQuery> | ReturnType<typeof buildChainableQuery>[]> = {
    school_transversal_context:
      overrides?.schoolContext ??
      buildChainableQuery({ implementation_year_2026: 2 }),

    school_course_structure:
      overrides?.courseStructure ??
      buildChainableQuery({ id: COURSE_STRUCTURE_ID, grade_level: '3ro Basico', grade_id: GRADE_ID }),

    ab_grades:
      overrides?.abGrades ??
      buildChainableQuery({ is_always_gt: false }),

    ab_migration_plan:
      overrides?.migrationPlan ??
      buildChainableQuery({ generation_type: 'GI' }),

    assessment_templates:
      overrides?.templates ??
      buildChainableQuery([
        {
          id: TEMPLATE_ID,
          name: 'Lectura',
          area: 'lenguaje',
          grade_id: GRADE_ID,
          grade: { id: GRADE_ID, name: '3ro Basico', is_always_gt: false },
          assessment_template_snapshots: [
            { id: SNAPSHOT_ID, version: '1.0', created_at: '2026-01-01T00:00:00Z' },
          ],
        },
      ]),

    // Two sequential calls: existence check (null = not found), then insert
    assessment_instances: [
      overrides?.existingInstance ?? buildChainableQuery(null, { code: 'PGRST116', message: 'not found' }),
      overrides?.newInstance ?? buildChainableQuery({ id: INSTANCE_ID }, null),
    ],

    assessment_instance_assignees:
      overrides?.assignee ??
      buildChainableQuery(null, null),
  };
  return map;
}

describe('triggerAutoAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // 1. Returns error when school context not found
  // ----------------------------------------------------------------
  it('returns error when school context not found', async () => {
    configureMock({
      school_transversal_context: buildChainableQuery(null, { message: 'not found' }),
    });

    const result = await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('contexto transversal')
    );
    expect(result.instancesCreated).toBe(0);
  });

  // ----------------------------------------------------------------
  // 2. Returns error when course structure not found
  // ----------------------------------------------------------------
  it('returns error when course structure not found', async () => {
    configureMock({
      school_transversal_context: buildChainableQuery({ implementation_year_2026: 2 }),
      school_course_structure: buildChainableQuery(null, { message: 'not found' }),
    });

    const result = await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('estructura del curso')
    );
  });

  // ----------------------------------------------------------------
  // 3. Returns error when course has no grade_id (null)
  // ----------------------------------------------------------------
  it('returns error when course has no grade_id', async () => {
    configureMock({
      school_transversal_context: buildChainableQuery({ implementation_year_2026: 2 }),
      school_course_structure: buildChainableQuery({ id: COURSE_STRUCTURE_ID, grade_level: '3ro Basico', grade_id: null }),
    });

    const result = await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    expect(result.success).toBe(false);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('no tiene grade_id')
    );
  });

  // ----------------------------------------------------------------
  // 4. Uses grade_id directly (integer FK), not string matching
  // ----------------------------------------------------------------
  it('queries ab_grades by integer id, not by name string', async () => {
    // We need to capture what arguments are passed to `.eq()` on the
    // ab_grades chainable. We do this by spying on the proxy.
    const eqCalls: Array<[string, unknown]> = [];

    // Build a custom chainable that records .eq() calls
    const gradesProxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: { is_always_gt: true }, error: null });
        }
        if (prop === 'eq') {
          return (col: string, val: unknown) => {
            eqCalls.push([col, val]);
            return new Proxy({}, this);
          };
        }
        return vi.fn(() => new Proxy({}, this));
      },
    });

    configureMock({
      ...happyPathMap({
        abGrades: gradesProxy as any,
      }),
      // Override ab_grades specifically
      ab_grades: gradesProxy as any,
    });

    await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    // The service must query ab_grades with .eq('id', <number>), NOT .eq('name', ...)
    const idCall = eqCalls.find(([col]) => col === 'id');
    expect(idCall).toBeDefined();
    expect(idCall![1]).toBe(GRADE_ID);

    const nameCall = eqCalls.find(([col]) => col === 'name');
    expect(nameCall).toBeUndefined();
  });

  // ----------------------------------------------------------------
  // 5. Creates assessment instance with correct generation_type from migration plan
  // ----------------------------------------------------------------
  it('creates instance with generation_type from migration plan', async () => {
    // Track what gets inserted into assessment_instances
    const insertPayloads: unknown[] = [];

    const instanceInsertProxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: { id: INSTANCE_ID }, error: null });
        }
        if (prop === 'insert') {
          return (payload: unknown) => {
            insertPayloads.push(payload);
            return new Proxy({}, this);
          };
        }
        return vi.fn(() => new Proxy({}, this));
      },
    });

    // First call: existence check returns null (not found), second call: the insert proxy
    configureMock(happyPathMap({
      existingInstance: buildChainableQuery(null, { code: 'PGRST116', message: 'not found' }),
      newInstance: instanceInsertProxy as any,
    }));

    const result = await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    // The migration plan returns generation_type: 'GI'
    expect(insertPayloads.length).toBeGreaterThanOrEqual(1);
    expect(insertPayloads[0]).toMatchObject({
      generation_type: 'GI',
      school_id: SCHOOL_ID,
      course_structure_id: COURSE_STRUCTURE_ID,
    });
    expect(result.instancesCreated).toBeGreaterThanOrEqual(1);
  });

  // ----------------------------------------------------------------
  // 6. Defaults to GT for always-GT grades (skips migration plan lookup)
  // ----------------------------------------------------------------
  it('defaults to GT for always-GT grades and skips migration plan', async () => {
    const insertPayloads: unknown[] = [];

    const instanceInsertProxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: { id: INSTANCE_ID }, error: null });
        }
        if (prop === 'insert') {
          return (payload: unknown) => {
            insertPayloads.push(payload);
            return new Proxy({}, this);
          };
        }
        return vi.fn(() => new Proxy({}, this));
      },
    });

    configureMock(happyPathMap({
      abGrades: buildChainableQuery({ is_always_gt: true }),
      existingInstance: buildChainableQuery(null, { code: 'PGRST116', message: 'not found' }),
      newInstance: instanceInsertProxy as any,
    }));

    await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    // ab_migration_plan should NOT have been called with this grade
    // Since is_always_gt = true, generationType should be 'GT' (the default)
    expect(insertPayloads.length).toBeGreaterThanOrEqual(1);
    expect(insertPayloads[0]).toMatchObject({ generation_type: 'GT' });
  });

  // ----------------------------------------------------------------
  // 7. Skips when instance already exists (idempotent)
  // ----------------------------------------------------------------
  it('skips creation when instance already exists and assignee is present', async () => {
    // First call to assessment_instances: existence check returns existing
    // Then assessment_instance_assignees existence check also returns existing
    configureMock(happyPathMap({
      existingInstance: buildChainableQuery({ id: INSTANCE_ID }),
    }));

    // The assignee check needs to also find existing
    // Override assessment_instance_assignees to return an existing record
    const map = happyPathMap({
      existingInstance: buildChainableQuery({ id: INSTANCE_ID }),
      assignee: buildChainableQuery({ id: 'existing-assignee-id' }),
    });
    configureMock(map);

    const result = await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    expect(result.instancesSkipped).toBe(1);
    expect(result.instancesCreated).toBe(0);
    expect(result.details[0]?.status).toBe('already_exists');
  });

  // ----------------------------------------------------------------
  // 8. Creates assignee record linking docente to new instance
  // ----------------------------------------------------------------
  it('creates assignee record linking docente to new instance', async () => {
    const assigneeInserts: unknown[] = [];

    const assigneeProxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: null, error: null });
        }
        if (prop === 'insert') {
          return (payload: unknown) => {
            assigneeInserts.push(payload);
            return new Proxy({}, this);
          };
        }
        return vi.fn(() => new Proxy({}, this));
      },
    });

    configureMock(happyPathMap({
      assignee: assigneeProxy as any,
    }));

    const result = await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    expect(assigneeInserts.length).toBeGreaterThanOrEqual(1);
    expect(assigneeInserts[0]).toMatchObject({
      instance_id: INSTANCE_ID,
      user_id: DOCENTE_ID,
      can_edit: true,
      can_submit: true,
      assigned_by: ASSIGNED_BY,
    });
    expect(result.instancesCreated).toBeGreaterThanOrEqual(1);
  });

  // ----------------------------------------------------------------
  // 9. Reports error when assignee insert fails on existing instance
  // ----------------------------------------------------------------
  it('reports error when assignee insert fails on existing instance', async () => {
    // Instance exists, assignee does NOT exist, but insert fails
    const assigneeProxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: null, error: { message: 'unique_violation' } });
        }
        if (prop === 'insert') {
          return () => new Proxy({}, this);
        }
        return vi.fn(() => new Proxy({}, this));
      },
    });

    const map = happyPathMap({
      existingInstance: buildChainableQuery({ id: INSTANCE_ID }),
      assignee: [
        // First call: existence check returns null (assignee not found)
        buildChainableQuery(null, { code: 'PGRST116', message: 'not found' }),
        // Second call: insert proxy that returns error
        assigneeProxy as any,
      ],
    });
    configureMock(map);

    const result = await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    expect(result.instancesCreated).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toContain('assignee insert failed');
    expect(result.details[0]?.status).toBe('error');
  });

  // ----------------------------------------------------------------
  // 10. Handles no published templates gracefully (warnings, no errors)
  // ----------------------------------------------------------------
  it('handles no published templates gracefully', async () => {
    configureMock(happyPathMap({
      templates: buildChainableQuery([]),
    }));

    const result = await triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

    // success should remain true (no errors), but we get a warning
    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('No hay templates publicados')
    );
    expect(result.instancesCreated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
