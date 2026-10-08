// @vitest-environment node
/**
 * schoolViaAssignmentService (20261008120000): RPC selection and parameters,
 * refusal mapping, result validation, and the pending-delivery computation of
 * the overview.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildChainableQuery } from '../api/assessment-builder/_helpers';

const { mockSupabaseAdmin } = vi.hoisted(() => ({
  mockSupabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../lib/supabaseAdmin', () => ({ supabaseAdmin: mockSupabaseAdmin }));

import {
  writeSchoolViaResponsible,
  getSchoolViaOverview,
  listResponsibleCandidates,
} from '../../lib/services/assessment-builder/schoolViaAssignmentService';

const RULES = [
  { area: 'personalizacion', target: 'course_docente' },
  { area: 'liderazgo', target: 'school_responsible' },
  { area: 'proposito', target: 'school_responsible' },
];

function tables(map: Record<string, any>) {
  mockSupabaseAdmin.from.mockImplementation((table: string) => map[table] ?? buildChainableQuery(null, null));
}

beforeEach(() => vi.clearAllMocks());

describe('writeSchoolViaResponsible', () => {
  const base = { schoolId: 42, area: 'liderazgo', userId: 'u-new', by: 'u-actor' };

  it('assign calls assign_school_via_responsible with the actor', async () => {
    mockSupabaseAdmin.rpc.mockResolvedValue({
      data: { mode: 'assigned', details: [{ template_id: 't1', template_name: 'LID', instance_id: 'i1', outcome: 'created' }] },
      error: null,
    });
    const r = await writeSchoolViaResponsible({ ...base, mode: 'assign' });
    expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith('assign_school_via_responsible', {
      p_school_id: 42, p_area: 'liderazgo', p_user_id: 'u-new', p_by: 'u-actor',
    });
    expect(r).toEqual({ kind: 'ok', mode: 'assigned', details: [{ templateId: 't1', templateName: 'LID', instanceId: 'i1', outcome: 'created' }] });
  });

  it('replace calls replace_school_via_responsible', async () => {
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: { mode: 'replaced', details: [] }, error: null });
    await writeSchoolViaResponsible({ ...base, mode: 'replace' });
    expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith('replace_school_via_responsible', {
      p_school_id: 42, p_area: 'liderazgo', p_new_user_id: 'u-new', p_by: 'u-actor',
    });
  });

  it('maps a known refusal and names the started registros', async () => {
    mockSupabaseAdmin.rpc.mockResolvedValue({
      data: null,
      error: { message: 'registros_already_started', details: '[{"instance_id": "i1", "template_id": "t1"}]' },
    });
    tables({ assessment_templates: buildChainableQuery([{ name: 'LID Equipo' }]) });
    const r = await writeSchoolViaResponsible({ ...base, mode: 'replace' });
    expect(r).toMatchObject({ kind: 'error', code: 'registros_already_started', status: 409, templates: ['LID Equipo'] });
  });

  it('never leaks an unknown database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: null, error: { message: 'relation "x" does not exist' } });
    const r = await writeSchoolViaResponsible({ ...base, mode: 'assign' });
    expect(r).toMatchObject({ kind: 'error', code: 'unexpected', status: 500 });
    expect(JSON.stringify(r)).not.toContain('relation');
  });

  it('rejects a malformed RPC result', async () => {
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: { mode: 'assigned', details: [{ outcome: 'weird' }] }, error: null });
    const r = await writeSchoolViaResponsible({ ...base, mode: 'assign' });
    expect(r).toMatchObject({ kind: 'error', code: 'unexpected' });
  });
});

describe('getSchoolViaOverview', () => {
  it('fails closed when the rules cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tables({ ab_via_assignment_rules: buildChainableQuery(null, { message: 'down' }) });
    const r = await getSchoolViaOverview(42);
    expect(r.kind).toBe('error');
  });

  it('computes pending delivery per vía', async () => {
    tables({
      ab_via_assignment_rules: buildChainableQuery(RULES),
      assessment_templates: buildChainableQuery([
        { id: 't-held', name: 'LID A', area: 'liderazgo' },
        { id: 't-new', name: 'LID B', area: 'liderazgo' },
        { id: 't-cancel', name: 'LID C', area: 'liderazgo' },
        { id: 't-pro', name: 'PRO A', area: 'proposito' },
      ]),
      school_via_responsibles: buildChainableQuery([{ area: 'liderazgo', user_id: 'u1', assigned_at: '2026-10-08' }]),
      school_via_instance_links: buildChainableQuery([
        { template_id: 't-held', instance_id: 'i1', assessment_instances: { cancelled_at: null, status: 'pending', assessment_instance_assignees: [{ user_id: 'u1', can_edit: true, can_submit: true }] } },
        { template_id: 't-cancel', instance_id: 'i2', assessment_instances: { cancelled_at: '2026-10-01', status: 'pending', assessment_instance_assignees: [] } },
      ]),
      profiles: buildChainableQuery([{ id: 'u1', first_name: 'Ana', last_name: 'Pérez', email: 'ana@test.local' }]),
    });
    const r = await getSchoolViaOverview(42);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const lid = r.vias.find((v) => v.area === 'liderazgo')!;
    expect(lid.label).toBe('Liderazgo');
    expect(lid.responsible?.name).toBe('Ana Pérez');
    expect(lid.pendingTemplates.map((t) => t.id)).toEqual(['t-new']);
    const pro = r.vias.find((v) => v.area === 'proposito')!;
    expect(pro.responsible).toBeNull();
    expect(pro.pendingTemplates).toEqual([]);
    expect(r.vias.map((v) => v.area)).not.toContain('personalizacion');
  });
});

describe('getSchoolViaOverview — delivery needs edit AND submit (Codex B2 r1)', () => {
  const overviewWith = (grant: Record<string, unknown>) => {
    tables({
      ab_via_assignment_rules: buildChainableQuery(RULES),
      assessment_templates: buildChainableQuery([{ id: 't1', name: 'LID A', area: 'liderazgo' }]),
      school_via_responsibles: buildChainableQuery([{ area: 'liderazgo', user_id: 'u1', assigned_at: '2026-10-08' }]),
      school_via_instance_links: buildChainableQuery([
        { template_id: 't1', instance_id: 'i1', assessment_instances: { cancelled_at: null, status: 'pending', assessment_instance_assignees: [{ user_id: 'u1', ...grant }] } },
      ]),
      profiles: buildChainableQuery([{ id: 'u1', name: 'Ana', email: null }]),
    });
    return getSchoolViaOverview(42);
  };

  it.each([
    [{ can_edit: false, can_submit: true }],
    [{ can_edit: true, can_submit: false }],
    [{ can_edit: false, can_submit: false }],
  ])('a weaker grant %j is still pending', async (grant) => {
    const r = await overviewWith(grant);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.vias.find((v) => v.area === 'liderazgo')!.pendingTemplates.map((t) => t.id)).toEqual(['t1']);
  });

  it('a full grant is delivered', async () => {
    const r = await overviewWith({ can_edit: true, can_submit: true });
    if (r.kind !== 'ok') throw new Error('expected ok');
    expect(r.vias.find((v) => v.area === 'liderazgo')!.pendingTemplates).toEqual([]);
  });

  it('a rules read failure never exposes the database message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tables({ ab_via_assignment_rules: buildChainableQuery(null, { message: 'permission denied for table ab_via_assignment_rules' }) });
    const r = await getSchoolViaOverview(42);
    expect(r.kind).toBe('error');
    expect(JSON.stringify(r)).not.toContain('permission denied');
  });
});

describe('listResponsibleCandidates', () => {
  it('lists active Equipo Directivo members of the school, deduplicated', async () => {
    tables({
      user_roles: buildChainableQuery([{ user_id: 'u2' }, { user_id: 'u1' }, { user_id: 'u1' }]),
      profiles: buildChainableQuery([
        { id: 'u1', name: 'Zoe', email: null },
        { id: 'u2', first_name: 'Ana', last_name: 'B', email: null },
      ]),
    });
    const r = await listResponsibleCandidates(42);
    expect(r).toEqual({ kind: 'ok', people: [{ id: 'u2', name: 'Ana B', email: null }, { id: 'u1', name: 'Zoe', email: null }] });
  });
});
