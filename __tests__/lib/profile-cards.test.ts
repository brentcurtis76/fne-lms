// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { fetchProfileCards, cardName, PROFILE_CARDS_MAX_IDS } from '../../lib/profile-cards';

/** EC-S5 (GENERA fixes F11): the one shared helper that reads other people's names. */

function client(answer: (ids: string[]) => { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; ids: string[] }> = [];
  return {
    calls,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      const ids = args.p_ids as string[];
      calls.push({ fn, ids });
      return answer(ids);
    }),
  };
}

const card = (id: string) => ({ id, first_name: `N${id}`, last_name: `L${id}`, avatar_url: null, email: 'never@x.test' });

describe('fetchProfileCards', () => {
  it('asks get_profile_cards once for the distinct ids and keeps only the four card fields', async () => {
    const c = client((ids) => ({ data: ids.map(card), error: null }));
    const cards = await fetchProfileCards(c, ['a', 'b', 'a', null, undefined, '']);
    expect(c.calls).toEqual([{ fn: 'get_profile_cards', ids: ['a', 'b'] }]);
    expect(cards.get('a')).toEqual({ id: 'a', first_name: 'Na', last_name: 'La', avatar_url: null });
    expect(Object.keys(cards.get('b')!)).toEqual(['id', 'first_name', 'last_name', 'avatar_url']);
  });

  it('makes no call when there is nobody to name', async () => {
    const c = client(() => ({ data: [], error: null }));
    expect((await fetchProfileCards(c, [null, ''])).size).toBe(0);
    expect(c.calls).toHaveLength(0);
  });

  it('asks in calls of at most 200 ids', async () => {
    const c = client((ids) => ({ data: ids.map(card), error: null }));
    const ids = Array.from({ length: PROFILE_CARDS_MAX_IDS * 2 + 1 }, (_, i) => `id-${i}`);
    const cards = await fetchProfileCards(c, ids);
    expect(c.calls.map((call) => call.ids.length)).toEqual([200, 200, 1]);
    expect(cards.size).toBe(401);
  });

  it('a person the caller may not know (no row) or a failed call gives no card', async () => {
    const c = client((ids) => (ids.includes('x') ? { data: null, error: { code: '42501' } } : { data: [card('a')], error: null }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect([...(await fetchProfileCards(c, ['a', 'b'])).keys()]).toEqual(['a']);
    expect((await fetchProfileCards(c, ['x'])).size).toBe(0);
  });
});

describe('cardName', () => {
  it('names a card «First Last», otherwise the fallback', () => {
    expect(cardName({ id: 'a', first_name: 'María-José', last_name: 'Núñez', avatar_url: null })).toBe('María-José Núñez');
    expect(cardName({ id: 'a', first_name: 'Ana', last_name: null, avatar_url: null })).toBe('Usuario');
    expect(cardName(undefined, 'Alguien')).toBe('Alguien');
  });
});
