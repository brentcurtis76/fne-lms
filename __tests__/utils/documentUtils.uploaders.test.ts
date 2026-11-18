// @vitest-environment node
// GENERA fixes F12c, N163: the documents of a workspace say who uploaded them.
// The uploader's name comes from profile cards (get_profile_cards): one call
// for the page's distinct uploaders; «Usuario» only for an uploader without a
// card; no e-mail address. Invented people only.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const NOCARD = '33333333-3333-4333-8333-333333333333';

const state = vi.hoisted(() => ({
  docs: [] as Array<Record<string, unknown>>,
  rpc: null as any,
}));

function builder(table: string) {
  const result = () =>
    table === 'community_documents' ? { data: state.docs, error: null, count: 0 } : { data: [], error: null, count: 0 };
  const proxy: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject);
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('../../lib/supabase-wrapper', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: (...args: unknown[]) => state.rpc(...args),
  },
}));
vi.mock('../../utils/workspaceUtils', () => ({ getUserWorkspaceAccess: vi.fn() }));

import { getWorkspaceDocuments } from '../../utils/documentUtils';

const doc = (id: string, uploaded_by: string) => ({
  id, workspace_id: 'ws-1', folder_id: null, title: `Acta ${id}`, file_name: `${id}.pdf`, file_size: 10,
  mime_type: 'application/pdf', storage_path: `documents/ws-1/root/${id}.pdf`, uploaded_by, is_active: true,
  created_at: '2026-11-17T12:00:00Z', updated_at: '2026-11-17T12:00:00Z', tags: [],
});

beforeEach(() => {
  state.docs = [doc('d1', ANA), doc('d2', BRUNO), doc('d3', ANA), doc('d4', NOCARD)];
  state.rpc = vi.fn(async (fn: string, args: { p_ids: string[] }) => {
    if (fn !== 'get_profile_cards') return { data: null, error: { message: 'unexpected' } };
    const cards: Record<string, unknown> = {
      [ANA]: { id: ANA, first_name: 'Ana', last_name: 'Uno', avatar_url: null },
      [BRUNO]: { id: BRUNO, first_name: 'Bruno', last_name: 'Dos', avatar_url: null },
    };
    return { data: args.p_ids.map((id) => cards[id]).filter(Boolean), error: null };
  });
});

describe('N163 getWorkspaceDocuments names the uploader', () => {
  it('one card call for the distinct uploaders; names from the cards; «Usuario» without a card; no e-mail', async () => {
    const { documents } = await getWorkspaceDocuments('ws-1', null, {});
    expect(state.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = state.rpc.mock.calls[0];
    expect(fn).toBe('get_profile_cards');
    expect([...(args as { p_ids: string[] }).p_ids].sort()).toEqual([ANA, BRUNO, NOCARD].sort());

    expect(documents.map((d) => [d.id, d.uploader_name])).toEqual([
      ['d1', 'Ana Uno'],
      ['d2', 'Bruno Dos'],
      ['d3', 'Ana Uno'],
      ['d4', 'Usuario'],
    ]);
    expect(documents.every((d) => d.uploader_email === '')).toBe(true);
  });

  it('a failed card call leaves «Usuario» and still returns the documents', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
    const { documents } = await getWorkspaceDocuments('ws-1', null, {});
    expect(documents.map((d) => d.uploader_name)).toEqual(['Usuario', 'Usuario', 'Usuario', 'Usuario']);
    consoleError.mockRestore();
  });

  it('no documents: no card call', async () => {
    state.docs = [];
    await getWorkspaceDocuments('ws-1', null, {});
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
