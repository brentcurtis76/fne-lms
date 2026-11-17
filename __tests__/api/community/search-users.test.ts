// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { opArgs, type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * EC-S5 (GENERA fixes F11): the feed's @mention search
 * (GET /api/community/search-users) answers a member with the people of
 * their communities — names and picture, never an e-mail — found also by
 * names with accents, hyphens and dots. The fake database answers like the
 * real one answers a member: co-members' role rows are readable, their
 * profile rows are not. Since send-back 1 (item 5) the route decides who
 * may be offered with its service client — approved profiles only — and
 * returns no e-mail and no approval status.
 */

const fake = vi.hoisted(() => ({ ref: null as any, service: null as any }));
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { createServerSupabaseClient: () => fake.ref.client };
});
// The route's service client (server side only): it reads profiles past the
// rules, so the route itself must ask only for approved people and only the
// columns it returns (send-back 1, item 5).
vi.mock('../../../lib/api-auth', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.service = createRecordingSupabase();
  return { createServiceRoleClient: () => fake.service.client };
});

import handler from '../../../pages/api/community/search-users';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
  userId: string | null;
};

const SELF = 'user-a1';
const PEOPLE = [
  { id: 'user-a2', first_name: 'María-José', last_name: 'Núñez', avatar_url: 'https://example.invalid/a2.png', email: 'a2@f11.test.local' },
  { id: 'user-a3', first_name: 'J.', last_name: 'Pérez', avatar_url: null, email: 'a3@f11.test.local' },
  { id: 'user-a4', first_name: 'Bruno', last_name: 'Dos', avatar_url: null, email: 'a4@f11.test.local' },
];

/** Co-members whose profile is not approved: never offered (send-back 1, 5). */
const NOT_APPROVED = [
  { id: 'user-a5', first_name: 'Rita', last_name: 'Rechazada', avatar_url: null, email: 'a5@f11.test.local', approval_status: 'rejected' },
  { id: 'user-a6', first_name: 'Pía', last_name: 'Pendiente', avatar_url: null, email: 'a6@f11.test.local', approval_status: 'pending' },
];
const ALL_PROFILES = [...PEOPLE.map((p) => ({ ...p, approval_status: 'approved' })), ...NOT_APPROVED];

// Loads the mocked service client (also before the route used it).
await import('../../../lib/api-auth');
const service = fake.service.state as typeof h;

beforeEach(() => {
  service.requests.length = 0;
  // The service client reads every profile row; it answers the columns asked for, filtered as asked.
  service.respond = (req) => {
    if (req.kind === 'from' && req.target === 'profiles') {
      const ids = (opArgs(req, 'in')?.[1] as string[]) ?? [];
      const filters = req.ops.filter((op) => op.method === 'eq').map((op) => op.args as [string, unknown]);
      const columns = String(opArgs(req, 'select')?.[0] ?? '*').split(',').map((c) => c.trim());
      const rows = ALL_PROFILES.filter((p) => ids.includes(p.id) && filters.every(([c, v]) => (p as any)[c] === v)).map((p) =>
        columns.includes('*') ? p : Object.fromEntries(columns.map((c) => [c, (p as any)[c]]))
      );
      return { data: rows, error: null };
    }
    return { data: null, error: null };
  };
  h.requests.length = 0;
  h.userId = SELF;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  h.respond = (req) => {
    if (req.kind === 'rpc' && req.target === 'get_profile_cards') {
      const ids = (req.args as { p_ids: string[] }).p_ids;
      // Cards know every co-member, approved or not (they carry no approval status).
      return {
        data: ALL_PROFILES.filter((p) => ids.includes(p.id)).map(({ id, first_name, last_name, avatar_url }) => ({ id, first_name, last_name, avatar_url })),
        error: null,
      };
    }
    if (req.target === 'user_roles') {
      const own = opArgs(req, 'eq')?.[0] === 'user_id';
      return own
        ? { data: [{ community_id: 'community-a' }], error: null }
        : { data: [{ user_id: 'user-a2' }, { user_id: 'user-a3' }, { user_id: 'user-a4' }, { user_id: 'user-a5' }, { user_id: 'user-a6' }], error: null };
    }
    // profiles: a member reads no other person's row
    if (req.target === 'profiles') return { data: [], error: null };
    return { data: null, error: null };
  };
});

async function search(q: string) {
  const { req, res } = createMocks({ method: 'GET', query: { q } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

describe('EC-S5 GET /api/community/search-users', () => {
  it('lists the people of the caller\'s communities with names and picture, no e-mail', async () => {
    const { status, body } = await search('');
    expect(status).toBe(200);
    expect(body.map((u: any) => u.display_name)).toEqual(['María-José Núñez', 'J. Pérez', 'Bruno Dos']);
    for (const user of body) {
      expect(Object.keys(user).sort()).toEqual(['avatar_url', 'display_name', 'first_name', 'id', 'last_name']);
      expect(JSON.stringify(user)).not.toContain('@');
    }
  });

  it('finds names with accents, hyphens and dots', async () => {
    expect((await search('maría-jo')).body.map((u: any) => u.id)).toEqual(['user-a2']);
    expect((await search('nunez')).body.map((u: any) => u.id)).toEqual(['user-a2']);
    expect((await search('Núñez')).body.map((u: any) => u.id)).toEqual(['user-a2']);
    expect((await search('j. p')).body.map((u: any) => u.id)).toEqual(['user-a3']);
  });

  it('does not search by e-mail any more', async () => {
    expect((await search('f11.test.local')).body).toEqual([]);
  });

  it('refuses a visitor', async () => {
    h.userId = null;
    expect((await search('a')).status).toBe(401);
  });
});

describe('send-back 1 (5) only approved people are offered', () => {
  it('a rejected and a pending co-member are not offered; an approved one is', async () => {
    const { status, body } = await search('');
    expect(status).toBe(200);
    const ids = body.map((u: any) => u.id);
    expect(ids).not.toContain('user-a5');
    expect(ids).not.toContain('user-a6');
    expect(ids).toEqual(['user-a2', 'user-a3', 'user-a4']);
    expect((await search('rita')).body).toEqual([]);
    expect((await search('pía')).body).toEqual([]);
  });

  it('who may be offered is decided on the server, asking for approved profiles only and no e-mail', async () => {
    await search('');
    const lookup = service.requests.find((r) => r.kind === 'from' && r.target === 'profiles')!;
    expect(lookup).toBeDefined();
    expect(lookup.ops.filter((op) => op.method === 'eq').map((op) => op.args)).toContainEqual(['approval_status', 'approved']);
    const columns = String(opArgs(lookup, 'select')?.[0]).split(',').map((c) => c.trim());
    expect(columns).not.toContain('email');
    expect(columns).not.toContain('approval_status');
    expect(columns).not.toContain('*');
  });

  it('the answer carries only id, first_name, last_name, avatar_url and display_name', async () => {
    const { body } = await search('');
    for (const user of body) {
      expect(Object.keys(user).sort()).toEqual(['avatar_url', 'display_name', 'first_name', 'id', 'last_name']);
    }
  });
});
