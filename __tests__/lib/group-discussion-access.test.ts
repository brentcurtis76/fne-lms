// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), assignment: vi.fn() }));
vi.mock('../../lib/supabase-wrapper', () => ({ supabase: { rpc: db.rpc, from: db.from } }));
vi.mock('../../lib/services/groupAssignmentsV2', () => ({ groupAssignmentsV2Service: { getGroupAssignment: db.assignment } }));

import { groupAssignmentService as current } from '../../lib/services/groupAssignments';
import { groupAssignmentService as compatibility } from '../../lib/services/groupAssignmentsCorrected';

beforeEach(() => {
  vi.clearAllMocks();
  db.assignment.mockResolvedValue({ assignment: { title: 'Tarea sintética', course_title: 'Curso sintético' } });
  const query: any = { select: () => query, eq: () => query, single: async () => ({ data: { title: 'Tarea sintética' } }) };
  db.from.mockReturnValue(query);
});

describe.each([['current', current], ['compatibility', compatibility]] as const)('%s group discussion', (_name, service) => {
  it('uses one atomic authorization operation and accepts its existing thread', async () => {
    const thread = { id: 'private-thread', workspace_id: 'workspace', assignment_group_id: 'group' };
    db.rpc.mockResolvedValue({ data: thread, error: null });
    expect(await service.getOrCreateDiscussion('assignment', 'group', 'workspace', 'forged-author')).toBe(thread);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('get_or_create_group_discussion', expect.objectContaining({
      p_assignment_id: 'assignment', p_group_id: 'group', p_workspace_id: 'workspace',
    }));
    expect(JSON.stringify(db.rpc.mock.calls)).not.toContain('forged-author');
    expect(db.from.mock.calls.every(([table]) => table === 'lesson_assignments')).toBe(true);
  });

  it('keeps a school-only discussion bound to the authoritative group', async () => {
    db.rpc.mockResolvedValue({ data: { id: 'school-private', workspace_id: null }, error: null });
    await service.getOrCreateDiscussion('assignment', 'group', null, 'caller');
    expect(db.rpc).toHaveBeenCalledWith('get_or_create_group_discussion', expect.objectContaining({
      p_group_id: 'group', p_workspace_id: null,
    }));
  });

  it('propagates access denial without falling back to an unbound INSERT', async () => {
    const denied = { code: '42501', message: 'Group discussion access denied' };
    db.rpc.mockResolvedValue({ data: null, error: denied });
    await expect(service.getOrCreateDiscussion('assignment', 'group', 'workspace', 'caller')).rejects.toBe(denied);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
});
