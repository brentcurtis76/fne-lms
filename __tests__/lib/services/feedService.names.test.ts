// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opArgs, selects, type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * EC-S5 (GENERA fixes F11): the Espacio feed shows the names of other people
 * (authors, commenters, reactors) to a member. The fake database answers like
 * the real one does a member: an embedded `profiles` row of another person is
 * null (only one's own row is readable), and `get_profile_cards` answers the
 * cards of the people the member may know.
 */

const fake = vi.hoisted(() => ({ ref: null as any }));
vi.mock('../../../lib/supabase-wrapper', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { supabase: fake.ref.client };
});
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { FeedService } from '../../../lib/services/feedService';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown; count?: number };
  userId: string | null;
};

const SELF = 'user-a1';
const COMEMBER = 'user-a2';
const SAME_SCHOOL = 'user-b';
const CARDS: Record<string, { id: string; first_name: string; last_name: string; avatar_url: string | null }> = {
  [SELF]: { id: SELF, first_name: 'Ana', last_name: 'Uno', avatar_url: null },
  [COMEMBER]: { id: COMEMBER, first_name: 'María-José', last_name: 'Núñez', avatar_url: 'https://example.invalid/a2.png' },
  [SAME_SCHOOL]: { id: SAME_SCHOOL, first_name: 'Bruno', last_name: 'Dos', avatar_url: null },
};

/** Rows of a table; an embed `alias:profiles!fk(...)` gives the caller's own row only, as RLS does. */
function memberDatabase(tables: Record<string, Array<Record<string, unknown>>>) {
  h.respond = (req, terminal) => {
    if (req.kind === 'rpc' && req.target === 'get_profile_cards') {
      const ids = ((req.args as { p_ids: string[] }).p_ids ?? []) as string[];
      return { data: ids.filter((id) => CARDS[id]).map((id) => CARDS[id]), error: null };
    }
    if (req.kind === 'rpc') return { data: true, error: null };
    let rows = (tables[req.target] ?? []).map((row) => ({ ...row }));
    for (const op of req.ops.filter((o) => o.method === 'eq' || o.method === 'is')) {
      const [column, value] = op.args as [string, unknown];
      rows = rows.filter((row) => (row[column] ?? null) === value);
    }
    const embed = selects(req).join(',').match(/(\w+):profiles!(\w+)/);
    if (embed) {
      const [, alias, fk] = embed;
      rows = rows.map((row) => ({ ...row, [alias]: row[fk] === SELF ? { ...CARDS[SELF], email: 'a1@f11.test.local' } : null }));
    }
    if (req.ops.some((o) => o.method === 'insert')) {
      const inserted = { id: 'new-comment', created_at: '2026-11-16T12:00:00Z', ...(opArgs(req, 'insert')?.[0] as object) } as Record<string, unknown>;
      rows = [embed ? { ...inserted, [embed[1]]: inserted[embed[2]] === SELF ? CARDS[SELF] : null } : inserted];
    }
    if (terminal === 'await') return { data: rows, error: null, count: rows.length };
    return { data: rows[0] ?? null, error: null };
  };
}

const POSTS = [
  { id: 'p1', workspace_id: 'ws', author_id: COMEMBER, is_archived: false, created_at: '2026-11-16T10:00:00Z', type: 'text' },
  { id: 'p2', workspace_id: 'ws', author_id: SAME_SCHOOL, is_archived: false, created_at: '2026-11-16T09:00:00Z', type: 'text' },
];
const REACTIONS = [
  { id: 'r1', post_id: 'p1', user_id: SAME_SCHOOL, reaction_type: 'like', created_at: '2026-11-16T10:01:00Z' },
];
const COMMENTS = [
  { id: 'c1', post_id: 'p1', author_id: COMEMBER, content: 'Bien', parent_comment_id: null, created_at: '2026-11-16T10:02:00Z' },
  { id: 'c2', post_id: 'p1', author_id: SAME_SCHOOL, content: 'Sí', parent_comment_id: 'c1', created_at: '2026-11-16T10:03:00Z' },
];

const cardCalls = () => h.requests.filter((r) => r.kind === 'rpc' && r.target === 'get_profile_cards');
const profileEmbeds = () => h.requests.flatMap(selects).filter((columns) => columns.includes('profiles'));

beforeEach(() => {
  h.requests.length = 0;
  h.userId = SELF;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('EC-S5 feed names', () => {
  it('posts show their authors and reactors to a member, from one cards call', async () => {
    memberDatabase({ posts_with_engagement: POSTS, post_reactions: REACTIONS });
    const { posts } = await FeedService.getPosts('ws');
    expect(posts.map((p) => [p.author?.first_name, p.author?.last_name])).toEqual([
      ['María-José', 'Núñez'],
      ['Bruno', 'Dos'],
    ]);
    expect(posts[0].author?.avatar_url).toBe('https://example.invalid/a2.png');
    expect(posts[0].reactions[0].user?.first_name).toBe('Bruno');
    expect(cardCalls()).toHaveLength(1);
    expect(profileEmbeds()).toEqual([]);
  });

  it('comments and their replies show their authors to a member', async () => {
    memberDatabase({ post_comments: COMMENTS });
    const { comments } = await FeedService.getComments('p1');
    expect(comments).toHaveLength(1);
    expect(comments[0].author?.first_name).toBe('María-José');
    expect(comments[0].replies?.[0].author?.first_name).toBe('Bruno');
    expect(cardCalls()).toHaveLength(1);
    expect(profileEmbeds()).toEqual([]);
  });

  it('a new comment comes back with its author card, without embedding profiles', async () => {
    memberDatabase({});
    const comment = await FeedService.addComment('p1', 'Hola');
    expect(comment.author?.first_name).toBe('Ana');
    expect(profileEmbeds()).toEqual([]);
  });
});
