// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { opArgs, type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F12e V5b (N28): POST /api/community/ensure-workspace accepts, as before, an
 * admin or a member of the community — and now also a consultor CURRENTLY
 * ASSIGNED to the community's school (public.auth_consultor_assigned_school_ids
 * asked with the caller's own session client). Everyone else: the same 403.
 * Synthetic data only.
 */

const fake = vi.hoisted(() => ({
  service: null as any,
  session: { rpc: null as any },
  caller: { id: 'caller-1' } as { id: string } | null,
}));

vi.mock('@supabase/supabase-js', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.service = createRecordingSupabase();
  return { createClient: () => fake.service.client };
});

vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedCaller: async () =>
    fake.caller
      ? { user: fake.caller, status: null, body: null }
      : { user: null, status: 401, body: { error: 'No autorizado' } },
  loggableError: () => ({}),
  createApiSupabaseClient: async () => ({ rpc: (...args: unknown[]) => fake.session.rpc(...args) }),
}));

import handler from '../../../pages/api/community/ensure-workspace';

const COMMUNITY_ID = 'd75e23ca-621c-4b06-84df-2c61fb779dfb';
const SCHOOL_ID = 101;
const OTHER_SCHOOL_ID = 202;

type Answer = { data: unknown; error: unknown };

let membership: unknown;
let assigned: Answer;
let existingWorkspace: unknown;

beforeEach(() => {
  fake.caller = { id: 'caller-1' };
  membership = null;
  existingWorkspace = { id: 'ws-1', community_id: COMMUNITY_ID, name: 'Espacio de Comunidad A' };
  assigned = { data: [], error: null };
  fake.session.rpc = vi.fn(async () => assigned);
  const service = fake.service.state;
  service.requests.length = 0;
  service.respond = (req: RecordedRequest, terminal: string): Answer => {
    if (req.target === 'user_roles') return { data: membership, error: null };
    if (req.target === 'growth_communities') {
      const id = opArgs(req, 'eq')?.[1];
      const known = id === COMMUNITY_ID;
      if (!known) return { data: null, error: terminal === 'single' ? { code: 'PGRST116' } : null };
      return { data: { id: COMMUNITY_ID, name: 'Comunidad A', school_id: SCHOOL_ID }, error: null };
    }
    if (req.target === 'community_workspaces') {
      const isInsert = req.ops.some((op) => op.method === 'insert');
      if (isInsert) return { data: { id: 'ws-new', community_id: COMMUNITY_ID, name: 'Espacio de Comunidad A' }, error: null };
      return { data: existingWorkspace, error: null };
    }
    return { data: null, error: null };
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

async function post(body: Record<string, unknown>) {
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return res;
}

describe('POST /api/community/ensure-workspace — who may enter (F12e V5b)', () => {
  it('a member of the community: accepted as before (no assignment lookup)', async () => {
    membership = { id: 'r1', role_type: 'docente' };
    const res = await post({ communityId: COMMUNITY_ID });
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).workspace.id).toBe('ws-1');
    expect(fake.session.rpc).not.toHaveBeenCalled();
  });

  it('an admin: accepted as before (no assignment lookup)', async () => {
    membership = { id: 'r1', role_type: 'admin' };
    const res = await post({ communityId: COMMUNITY_ID });
    expect(res._getStatusCode()).toBe(200);
    expect(fake.session.rpc).not.toHaveBeenCalled();
  });

  it("a consultor currently assigned to the community's school: accepted", async () => {
    assigned = { data: [SCHOOL_ID], error: null };
    const res = await post({ communityId: COMMUNITY_ID });
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).workspace.id).toBe('ws-1');
    expect(fake.session.rpc).toHaveBeenCalledWith('auth_consultor_assigned_school_ids');
  });

  it('an assigned consultor may also have the missing workspace made (201)', async () => {
    assigned = { data: [SCHOOL_ID], error: null };
    existingWorkspace = null;
    const res = await post({ communityId: COMMUNITY_ID });
    expect(res._getStatusCode()).toBe(201);
    expect(JSON.parse(res._getData()).created).toBe(true);
  });

  it('a consultor with no current assignment (or whose assignment ended): 403', async () => {
    assigned = { data: [], error: null };
    const res = await post({ communityId: COMMUNITY_ID });
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: 'No access to this community' });
  });

  it('a consultor assigned to another school: 403', async () => {
    assigned = { data: [OTHER_SCHOOL_ID], error: null };
    const res = await post({ communityId: COMMUNITY_ID });
    expect(res._getStatusCode()).toBe(403);
  });

  it('the assignment lookup fails: 403 (fail closed)', async () => {
    assigned = { data: null, error: { code: '42501' } };
    const res = await post({ communityId: COMMUNITY_ID });
    expect(res._getStatusCode()).toBe(403);
  });

  it('nothing is written for a refused caller', async () => {
    existingWorkspace = null;
    const res = await post({ communityId: COMMUNITY_ID });
    expect(res._getStatusCode()).toBe(403);
    const writes = fake.service.state.requests.filter((r: RecordedRequest) => r.ops.some((op) => op.method === 'insert'));
    expect(writes).toHaveLength(0);
  });

  it('still 401 without a verified caller and 400 for a non-UUID community', async () => {
    fake.caller = null;
    expect((await post({ communityId: COMMUNITY_ID }))._getStatusCode()).toBe(401);
    fake.caller = { id: 'caller-1' };
    expect((await post({ communityId: 'not-a-uuid' }))._getStatusCode()).toBe(400);
  });
});
