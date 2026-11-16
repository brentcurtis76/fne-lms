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
 * profile rows are not; `get_profile_cards` gives the cards.
 */

const fake = vi.hoisted(() => ({ ref: null as any }));
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { createServerSupabaseClient: () => fake.ref.client };
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

beforeEach(() => {
  h.requests.length = 0;
  h.userId = SELF;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  h.respond = (req) => {
    if (req.kind === 'rpc' && req.target === 'get_profile_cards') {
      const ids = (req.args as { p_ids: string[] }).p_ids;
      return {
        data: PEOPLE.filter((p) => ids.includes(p.id)).map(({ id, first_name, last_name, avatar_url }) => ({ id, first_name, last_name, avatar_url })),
        error: null,
      };
    }
    if (req.target === 'user_roles') {
      const own = opArgs(req, 'eq')?.[0] === 'user_id';
      return own
        ? { data: [{ community_id: 'community-a' }], error: null }
        : { data: [{ user_id: 'user-a2' }, { user_id: 'user-a3' }, { user_id: 'user-a4' }], error: null };
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
