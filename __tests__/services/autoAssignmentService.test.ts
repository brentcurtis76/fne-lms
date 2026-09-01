// @vitest-environment node
/**
 * autoAssignmentService — PROC-CONTAIN-01 (A-01 / A-02) regression suite.
 *
 * Covers the single eligibility policy (published + not archived + current
 * snapshot) on both automatic paths, the read-only preflight, idempotent
 * reconciliation, and the truthful success rule (zero confirmed assessments is
 * never a success). Every test imports the production service.
 */
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

import {
  triggerAutoAssignment,
  preflightAutoAssignment,
  createSchoolLevelInstances,
} from '../../lib/services/assessment-builder/autoAssignmentService';

// ----------------------------------------------------------------
// Shared test data
// ----------------------------------------------------------------
const SCHOOL_ID = 42;
const COURSE_STRUCTURE_ID = 'cs-001';
const DOCENTE_ID = 'docente-uuid-111';
const ASSIGNED_BY = 'admin-uuid-999';
const GRADE_ID = 7;
const GRADE_NAME = '3° Básico';
const TEMPLATE_ID = 'tpl-uuid-aaa';
const SNAPSHOT_ID = 'snap-uuid-bbb';
const INSTANCE_ID = 'inst-uuid-ccc';

type Query = any;
type Call = { method: string; args: unknown[] };

/**
 * Chainable query that records every method call and resolves to { data, error }.
 * Lets a test assert exact filters (.eq) and write payloads (.insert).
 */
function recordingQuery(data: unknown = null, error: unknown = null): { query: Query; calls: Call[] } {
  const calls: Call[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve({ data, error, count: null });
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return new Proxy({}, handler);
      };
    },
  };
  return { query: new Proxy({}, handler), calls };
}

const eqCalls = (calls: Call[]) =>
  calls.filter(c => c.method === 'eq').map(c => c.args as [string, unknown]);
const insertPayloads = (calls: Call[]) =>
  calls.filter(c => c.method === 'insert').map(c => c.args[0]);

/**
 * Dispatch mockSupabaseAdmin.from by table name. A table maps to one query
 * (reused on every call) or an array of queries (shifted per call).
 */
function configureMock(tableMap: Record<string, Query | Query[]>) {
  mockSupabaseAdmin.from.mockImplementation((table: string) => {
    const entry = tableMap[table];
    if (!entry) return buildChainableQuery(null, null);
    if (Array.isArray(entry)) {
      return entry.length > 0 ? entry.shift()! : buildChainableQuery(null, null);
    }
    return entry;
  });
}

const activeTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: TEMPLATE_ID,
  name: 'Lectura',
  area: 'lenguaje',
  status: 'published',
  is_archived: false,
  grade_id: GRADE_ID,
  grade: { id: GRADE_ID, name: GRADE_NAME, is_always_gt: false },
  assessment_template_snapshots: [
    { id: SNAPSHOT_ID, version: '1.0', created_at: '2026-01-01T00:00:00Z' },
  ],
  ...overrides,
});

const archivedTemplate = () =>
  activeTemplate({ id: 'tpl-archived', name: 'QA Test Template - Aprendizaje', is_archived: true });

const snapshotlessTemplate = () =>
  activeTemplate({ id: 'tpl-nosnap', name: 'Sin snapshot', assessment_template_snapshots: [] });

/** Happy-path map: course grade 7 (not always-GT), migration plan GI, one eligible template, no existing instance. */
function happyPathMap(overrides: Partial<{
  schoolContext: Query;
  courseStructure: Query;
  abGrades: Query;
  migrationPlan: Query;
  templates: Query;
  instances: Query[];
  assignees: Query[];
}> = {}): Record<string, Query | Query[]> {
  return {
    school_transversal_context: overrides.schoolContext ?? buildChainableQuery({ implementation_year_2026: 2 }),
    school_course_structure:
      overrides.courseStructure ??
      buildChainableQuery({ id: COURSE_STRUCTURE_ID, grade_level: '3_basico', grade_id: GRADE_ID }),
    ab_grades: overrides.abGrades ?? buildChainableQuery({ name: GRADE_NAME, is_always_gt: false }),
    ab_migration_plan: overrides.migrationPlan ?? buildChainableQuery({ generation_type: 'GI' }),
    assessment_templates: overrides.templates ?? buildChainableQuery([activeTemplate()]),
    // Sequential calls: existence check (null = not found), then insert
    assessment_instances: overrides.instances ?? [
      buildChainableQuery(null, null),
      buildChainableQuery({ id: INSTANCE_ID }, null),
    ],
    assessment_instance_assignees: overrides.assignees ?? [buildChainableQuery(null, null)],
  };
}

const run = () => triggerAutoAssignment(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, ASSIGNED_BY);

describe('triggerAutoAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Plan resolution ────────────────────────────────────────────
  it('returns a blocking context_missing error when school context is not found', async () => {
    configureMock({
      school_transversal_context: buildChainableQuery(null, { message: 'not found' }),
    });

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.blockingError?.code).toBe('context_missing');
    expect(result.errors).toContainEqual(expect.stringContaining('contexto transversal'));
    expect(result.counts.created).toBe(0);
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instances');
  });

  it('returns a blocking course_missing error when course structure is not found', async () => {
    configureMock({
      school_transversal_context: buildChainableQuery({ implementation_year_2026: 2 }),
      school_course_structure: buildChainableQuery(null, { message: 'not found' }),
    });

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.blockingError?.code).toBe('course_missing');
    expect(result.errors).toContainEqual(expect.stringContaining('estructura del curso'));
  });

  it('returns a blocking, grade-identifiable grade_missing error when the course has no grade_id', async () => {
    configureMock({
      school_transversal_context: buildChainableQuery({ implementation_year_2026: 2 }),
      school_course_structure: buildChainableQuery({ id: COURSE_STRUCTURE_ID, grade_level: '3_basico', grade_id: null }),
    });

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.blockingError?.code).toBe('grade_missing');
    expect(result.blockingError?.gradeLevel).toBe('3_basico');
    expect(result.errors[0]).toContain('3_basico');
    expect(result.errors[0]).toContain('grade_id');
    // Not a warning-only outcome any more
    expect(result.warnings).toHaveLength(0);
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_templates');
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instances');
  });

  it('queries ab_grades by integer id, not by name string', async () => {
    const grades = recordingQuery({ name: GRADE_NAME, is_always_gt: true });
    configureMock(happyPathMap({ abGrades: grades.query }));

    await run();

    const eqs = eqCalls(grades.calls);
    expect(eqs).toContainEqual(['id', GRADE_ID]);
    expect(eqs.find(([col]) => col === 'name')).toBeUndefined();
  });

  // ── Eligibility policy (A-01) ──────────────────────────────────
  it('filters templates by status = published, is_archived = false and the course grade', async () => {
    const templates = recordingQuery([activeTemplate()]);
    configureMock(happyPathMap({ templates: templates.query }));

    await run();

    const eqs = eqCalls(templates.calls);
    expect(eqs).toContainEqual(['status', 'published']);
    expect(eqs).toContainEqual(['is_archived', false]);
    expect(eqs).toContainEqual(['grade_id', GRADE_ID]);
  });

  it('never creates or attaches an instance for an archived published template', async () => {
    const instances = recordingQuery(null, null);
    configureMock(happyPathMap({
      templates: buildChainableQuery([archivedTemplate()]),
      instances: [instances.query, instances.query],
    }));

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.counts.created).toBe(0);
    expect(result.counts.attached).toBe(0);
    expect(result.counts.skipped).toBe(1);
    expect(result.details[0]).toMatchObject({ status: 'skipped', reason: 'archived', templateId: 'tpl-archived' });
    expect(result.blockingError?.code).toBe('no_eligible_templates');
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instances');
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instance_assignees');
    expect(insertPayloads(instances.calls)).toHaveLength(0);
  });

  it('processes only the active template when the query returns archived and active rows', async () => {
    const insert = recordingQuery({ id: INSTANCE_ID });
    configureMock(happyPathMap({
      templates: buildChainableQuery([archivedTemplate(), activeTemplate()]),
      instances: [buildChainableQuery(null, null), insert.query],
    }));

    const result = await run();

    expect(result.success).toBe(true);
    expect(result.counts).toMatchObject({ created: 1, skipped: 1, errors: 0 });
    expect(insertPayloads(insert.calls)).toHaveLength(1);
    expect(insertPayloads(insert.calls)[0]).toMatchObject({ template_snapshot_id: SNAPSHOT_ID });
    expect(result.details.map(d => d.status).sort()).toEqual(['created', 'skipped']);
  });

  it('returns a blocking, grade-identifiable snapshot_missing error for a published template without snapshot', async () => {
    configureMock(happyPathMap({
      templates: buildChainableQuery([activeTemplate(), snapshotlessTemplate()]),
    }));

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.blockingError).toMatchObject({
      code: 'snapshot_missing',
      gradeId: GRADE_ID,
      gradeName: GRADE_NAME,
      gradeLevel: '3_basico',
      templates: [{ id: 'tpl-nosnap', name: 'Sin snapshot' }],
    });
    expect(result.errors[0]).toContain('Sin snapshot');
    expect(result.errors[0]).toContain(GRADE_NAME);
    // Nothing is written for the other (valid) template either — configuration must be fixed first
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instances');
    expect(result.counts.created).toBe(0);
  });

  it('returns a blocking failure — not a warning-only success — when zero eligible templates exist', async () => {
    configureMock(happyPathMap({ templates: buildChainableQuery([]) }));

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.blockingError?.code).toBe('no_eligible_templates');
    expect(result.blockingError?.gradeId).toBe(GRADE_ID);
    expect(result.errors[0]).toContain(GRADE_NAME);
    expect(result.errors[0]).toContain(`grade_id ${GRADE_ID}`);
    expect(result.counts.created + result.counts.attached + result.counts.alreadyExisting).toBe(0);
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instances');
  });

  // ── Creation ───────────────────────────────────────────────────
  it('creates an instance with generation_type from the migration plan and links the docente', async () => {
    const insert = recordingQuery({ id: INSTANCE_ID });
    const assignee = recordingQuery(null, null);
    configureMock(happyPathMap({
      instances: [buildChainableQuery(null, null), insert.query],
      assignees: [assignee.query],
    }));

    const result = await run();

    expect(insertPayloads(insert.calls)[0]).toMatchObject({
      template_snapshot_id: SNAPSHOT_ID,
      generation_type: 'GI',
      school_id: SCHOOL_ID,
      course_structure_id: COURSE_STRUCTURE_ID,
      transformation_year: 2,
      status: 'pending',
      assigned_by: ASSIGNED_BY,
    });
    expect(insertPayloads(assignee.calls)[0]).toMatchObject({
      instance_id: INSTANCE_ID,
      user_id: DOCENTE_ID,
      can_edit: true,
      can_submit: true,
      assigned_by: ASSIGNED_BY,
    });
    expect(result.success).toBe(true);
    expect(result.counts).toEqual({ created: 1, attached: 0, alreadyExisting: 0, skipped: 0, errors: 0 });
    expect(result.instancesCreated).toBe(1);
    expect(result.details[0]).toMatchObject({ status: 'created', instanceId: INSTANCE_ID, generationType: 'GI' });
  });

  it('defaults to GT for always-GT grades and skips the migration plan lookup', async () => {
    const insert = recordingQuery({ id: INSTANCE_ID });
    configureMock(happyPathMap({
      abGrades: buildChainableQuery({ name: 'Kinder', is_always_gt: true }),
      instances: [buildChainableQuery(null, null), insert.query],
    }));

    await run();

    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('ab_migration_plan');
    expect(insertPayloads(insert.calls)[0]).toMatchObject({ generation_type: 'GT' });
  });

  it('keeps a missing migration plan as a visible warning without blocking', async () => {
    configureMock(happyPathMap({
      migrationPlan: buildChainableQuery(null, { code: 'PGRST116', message: 'not found' }),
    }));

    const result = await run();

    expect(result.success).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringContaining('plan de migración'));
    expect(result.warnings[0]).toContain(`grade_id ${GRADE_ID}`);
  });

  // ── Idempotent reconciliation (A-02) ───────────────────────────
  it('is a truthful no-op when the instance and the assignee link already exist', async () => {
    const instances = recordingQuery({ id: INSTANCE_ID });
    const assignees = recordingQuery({ id: 'existing-assignee' });
    configureMock(happyPathMap({
      instances: [instances.query],
      assignees: [assignees.query],
    }));

    const result = await run();

    expect(result.success).toBe(true);
    expect(result.counts).toEqual({ created: 0, attached: 0, alreadyExisting: 1, skipped: 0, errors: 0 });
    expect(result.instancesSkipped).toBe(1);
    expect(result.details[0]).toMatchObject({ status: 'already_exists', instanceId: INSTANCE_ID });
    expect(insertPayloads(instances.calls)).toHaveLength(0);
    expect(insertPayloads(assignees.calls)).toHaveLength(0);
  });

  it('repairs a missing assignee link on an existing instance', async () => {
    const lookup = recordingQuery(null, null);
    const insert = recordingQuery(null, null);
    configureMock(happyPathMap({
      instances: [buildChainableQuery({ id: INSTANCE_ID })],
      assignees: [lookup.query, insert.query],
    }));

    const result = await run();

    expect(result.success).toBe(true);
    expect(result.counts).toEqual({ created: 0, attached: 1, alreadyExisting: 0, skipped: 0, errors: 0 });
    expect(result.details[0]).toMatchObject({ status: 'assignee_attached', instanceId: INSTANCE_ID });
    expect(insertPayloads(insert.calls)[0]).toMatchObject({
      instance_id: INSTANCE_ID,
      user_id: DOCENTE_ID,
      can_edit: true,
      can_submit: true,
      assigned_by: ASSIGNED_BY,
    });
  });

  it('treats a unique violation on the assignee insert as already linked (concurrent repair)', async () => {
    configureMock(happyPathMap({
      instances: [buildChainableQuery({ id: INSTANCE_ID })],
      assignees: [
        buildChainableQuery(null, null),
        buildChainableQuery(null, { code: '23505', message: 'duplicate key value violates unique constraint' }),
      ],
    }));

    const result = await run();

    expect(result.success).toBe(true);
    expect(result.counts.alreadyExisting).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('reports an error when the assignee insert fails on an existing instance', async () => {
    configureMock(happyPathMap({
      instances: [buildChainableQuery({ id: INSTANCE_ID })],
      assignees: [
        buildChainableQuery(null, null),
        buildChainableQuery(null, { message: 'permission denied' }),
      ],
    }));

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.counts.errors).toBe(1);
    expect(result.errors[0]).toContain('assignee insert failed');
    expect(result.details[0]?.status).toBe('error');
  });

  it('cannot report success when the instance insert fails (zero confirmed assessments)', async () => {
    configureMock(happyPathMap({
      instances: [buildChainableQuery(null, null), buildChainableQuery(null, { message: 'insert failed' })],
    }));

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.counts.created + result.counts.attached + result.counts.alreadyExisting).toBe(0);
    expect(result.errors[0]).toContain('insert failed');
  });
});

describe('preflightAutoAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves an ok plan with eligible templates and current snapshots without writing anything', async () => {
    configureMock(happyPathMap({
      templates: buildChainableQuery([
        activeTemplate({
          assessment_template_snapshots: [
            { id: 'snap-old', version: '1.0', created_at: '2026-01-01T00:00:00Z' },
            { id: 'snap-current', version: '1.1', created_at: '2026-04-01T00:00:00Z' },
          ],
        }),
      ]),
    }));

    const plan = await preflightAutoAssignment(COURSE_STRUCTURE_ID, SCHOOL_ID);

    expect(plan.ok).toBe(true);
    expect(plan.blockingError).toBeUndefined();
    expect(plan).toMatchObject({
      gradeId: GRADE_ID,
      gradeName: GRADE_NAME,
      gradeLevel: '3_basico',
      transformationYear: 2,
      generationType: 'GI',
    });
    expect(plan.eligibleTemplates).toEqual([
      expect.objectContaining({ id: TEMPLATE_ID, name: 'Lectura', snapshotId: 'snap-current', snapshotVersion: '1.1' }),
    ]);
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instances');
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instance_assignees');
  });

  it('keeps a missing migration plan as a warning on an ok plan', async () => {
    configureMock(happyPathMap({
      migrationPlan: buildChainableQuery(null, { code: 'PGRST116', message: 'not found' }),
    }));

    const plan = await preflightAutoAssignment(COURSE_STRUCTURE_ID, SCHOOL_ID);

    expect(plan.ok).toBe(true);
    expect(plan.generationType).toBe('GT');
    expect(plan.warnings).toContainEqual(expect.stringContaining('plan de migración'));
  });

  it('blocks with no_eligible_templates when only archived templates exist for the grade', async () => {
    configureMock(happyPathMap({ templates: buildChainableQuery([archivedTemplate()]) }));

    const plan = await preflightAutoAssignment(COURSE_STRUCTURE_ID, SCHOOL_ID);

    expect(plan.ok).toBe(false);
    expect(plan.blockingError?.code).toBe('no_eligible_templates');
    expect(plan.blockingError?.gradeName).toBe(GRADE_NAME);
    expect(plan.skipped).toEqual([expect.objectContaining({ status: 'skipped', reason: 'archived' })]);
    expect(plan.eligibleTemplates).toHaveLength(0);
  });

  it('blocks with snapshot_missing naming the template and grade', async () => {
    configureMock(happyPathMap({ templates: buildChainableQuery([snapshotlessTemplate()]) }));

    const plan = await preflightAutoAssignment(COURSE_STRUCTURE_ID, SCHOOL_ID);

    expect(plan.ok).toBe(false);
    expect(plan.blockingError).toMatchObject({
      code: 'snapshot_missing',
      gradeId: GRADE_ID,
      gradeName: GRADE_NAME,
      templates: [{ id: 'tpl-nosnap', name: 'Sin snapshot' }],
    });
    expect(plan.blockingError?.message).toContain('Sin snapshot');
    expect(plan.blockingError?.message).toContain(GRADE_NAME);
  });

  it('never throws: an unexpected failure becomes a query_error plan', async () => {
    mockSupabaseAdmin.from.mockImplementation(() => {
      throw new Error('connection reset');
    });

    const plan = await preflightAutoAssignment(COURSE_STRUCTURE_ID, SCHOOL_ID);

    expect(plan.ok).toBe(false);
    expect(plan.blockingError?.code).toBe('query_error');
    expect(plan.blockingError?.message).toContain('connection reset');
  });
});

describe('createSchoolLevelInstances', () => {
  const CREATED_BY = 'directivo-uuid-555';
  const runSchool = () => createSchoolLevelInstances(null, SCHOOL_ID, 3, CREATED_BY);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters templates by status = published and is_archived = false', async () => {
    const templates = recordingQuery([activeTemplate()]);
    configureMock({
      assessment_templates: templates.query,
      assessment_instances: [buildChainableQuery(null, null), buildChainableQuery({ id: INSTANCE_ID })],
    });

    await runSchool();

    const eqs = eqCalls(templates.calls);
    expect(eqs).toContainEqual(['status', 'published']);
    expect(eqs).toContainEqual(['is_archived', false]);
  });

  it('never creates a school-level instance for an archived template', async () => {
    configureMock({
      assessment_templates: buildChainableQuery([archivedTemplate()]),
    });

    const result = await runSchool();

    expect(result.success).toBe(false);
    expect(result.blockingError?.code).toBe('no_eligible_templates');
    expect(result.counts.skipped).toBe(1);
    expect(result.details[0]).toMatchObject({ status: 'skipped', reason: 'archived' });
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instances');
  });

  it('returns a blocking failure when zero eligible templates exist', async () => {
    configureMock({ assessment_templates: buildChainableQuery([]) });

    const result = await runSchool();

    expect(result.success).toBe(false);
    expect(result.blockingError?.code).toBe('no_eligible_templates');
    expect(result.errors).toHaveLength(1);
  });

  it('returns a structured snapshot_missing error for a published template without snapshot', async () => {
    configureMock({
      assessment_templates: buildChainableQuery([activeTemplate(), snapshotlessTemplate()]),
    });

    const result = await runSchool();

    expect(result.success).toBe(false);
    expect(result.blockingError).toMatchObject({
      code: 'snapshot_missing',
      templates: [{ id: 'tpl-nosnap', name: 'Sin snapshot' }],
    });
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('assessment_instances');
  });

  it('creates a school-level GT instance for an eligible template', async () => {
    const existence = recordingQuery(null, null);
    const insert = recordingQuery({ id: INSTANCE_ID });
    configureMock({
      assessment_templates: buildChainableQuery([activeTemplate()]),
      assessment_instances: [existence.query, insert.query],
    });

    const result = await runSchool();

    expect(result.success).toBe(true);
    expect(result.counts).toEqual({ created: 1, attached: 0, alreadyExisting: 0, skipped: 0, errors: 0 });
    const payload = insertPayloads(insert.calls)[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      template_snapshot_id: SNAPSHOT_ID,
      school_id: SCHOOL_ID,
      transformation_year: 3,
      generation_type: 'GT',
      status: 'pending',
      assigned_by: CREATED_BY,
    });
    expect(payload).not.toHaveProperty('course_structure_id');
    // Existence check is scoped to school-level rows (course_structure_id IS NULL)
    expect(existence.calls.find(c => c.method === 'is')?.args).toEqual(['course_structure_id', null]);
  });

  it('reports an already-existing school-level instance without inserting', async () => {
    const existing = recordingQuery({ id: INSTANCE_ID });
    configureMock({
      assessment_templates: buildChainableQuery([activeTemplate()]),
      assessment_instances: [existing.query],
    });

    const result = await runSchool();

    expect(result.success).toBe(true);
    expect(result.counts.alreadyExisting).toBe(1);
    expect(result.details[0]).toMatchObject({ status: 'already_exists', instanceId: INSTANCE_ID });
    expect(insertPayloads(existing.calls)).toHaveLength(0);
  });
});
