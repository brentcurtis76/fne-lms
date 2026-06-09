// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { BotStore, encodeId, decodeId, generateLinkCode } from '../../../lib/bots/store';
import type { BotSessionRow } from '../../../lib/bots/types';

describe('encodeId / decodeId', () => {
  it('round-trips UUIDs through 22-char base64url', () => {
    const uuid = 'a1b2c3d4-e5f6-4789-8abc-def012345678';
    const encoded = encodeId(uuid);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(decodeId(encoded)).toBe(uuid);
  });

  it('rejects non-UUIDs and malformed encodings', () => {
    expect(() => encodeId('not-a-uuid')).toThrow();
    expect(decodeId('short')).toBeNull();
    expect(decodeId('!'.repeat(22))).toBeNull();
  });
});

describe('generateLinkCode', () => {
  it('produces 8 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateLinkCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(code).not.toMatch(/[0O1I]/);
    }
  });
});

function makeSession(overrides: Partial<BotSessionRow> = {}): BotSessionRow {
  return {
    id: 'session-1',
    platform: 'telegram',
    chat_id: '555',
    user_id: 'user-1',
    state: 'idle',
    active_item_id: null,
    edit_field: null,
    submit_report_id: null,
    failed_link_attempts: 0,
    link_locked_until: null,
    ...overrides
  };
}

describe('BotStore link throttling', () => {
  function makeStoreWithUpdateSpy() {
    const updates: Array<Record<string, unknown>> = [];
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn((patch: Record<string, unknown>) => {
          updates.push(patch);
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        })
      }))
    };
    return { store: new BotStore(supabase as never), updates };
  }

  it('locks out after the fifth failed attempt', async () => {
    const { store, updates } = makeStoreWithUpdateSpy();
    const locked = await store.recordFailedLinkAttempt(makeSession({ failed_link_attempts: 4 }));
    expect(locked).toBe(true);
    expect(updates[0].failed_link_attempts).toBe(0);
    expect(updates[0].link_locked_until).toBeTruthy();
  });

  it('just increments below the threshold', async () => {
    const { store, updates } = makeStoreWithUpdateSpy();
    const locked = await store.recordFailedLinkAttempt(makeSession({ failed_link_attempts: 1 }));
    expect(locked).toBe(false);
    expect(updates[0].failed_link_attempts).toBe(2);
    expect(updates[0].link_locked_until).toBeUndefined();
  });

  it('reports active lockouts and expired ones', () => {
    const { store } = makeStoreWithUpdateSpy();
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(store.isLinkLocked(makeSession({ link_locked_until: future }))).toBe(true);
    expect(store.isLinkLocked(makeSession({ link_locked_until: past }))).toBe(false);
    expect(store.isLinkLocked(makeSession())).toBe(false);
  });
});

describe('BotStore.createLinkCode', () => {
  function makeCodeClient(recentCodes: Array<{ code: string }>) {
    const calls: string[] = [];
    const chain = (resolved: unknown): unknown =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => resolve(resolved);
            }
            return () => chain(resolved);
          }
        }
      );
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => {
          calls.push('select');
          return chain({ data: recentCodes, error: null });
        }),
        update: vi.fn(() => {
          calls.push('invalidate');
          return chain({ error: null });
        }),
        insert: vi.fn(() => {
          calls.push('insert');
          return Promise.resolve({ error: null });
        })
      }))
    };
    return { store: new BotStore(supabase as never), calls };
  }

  it('invalidates prior unused codes before inserting a fresh one', async () => {
    const { store, calls } = makeCodeClient([]);
    const code = await store.createLinkCode('user-1');
    expect(code).toHaveLength(8);
    expect(calls).toEqual(['select', 'invalidate', 'insert']);
  });

  it('reuses a recent still-valid code instead of minting new ones (throttle)', async () => {
    const { store, calls } = makeCodeClient([{ code: 'REUSEDX2' }]);
    const code = await store.createLinkCode('user-1');
    expect(code).toBe('REUSEDX2');
    expect(calls).toEqual(['select']);
  });
});

describe('BotStore.claimSessionTransition', () => {
  function makeSessionClient(updatedRows: unknown[]) {
    const filters: string[] = [];
    const chain = (resolved: unknown): unknown =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => resolve(resolved);
            }
            return (...args: unknown[]) => {
              filters.push(`${String(prop)}:${args.map(String).join(',')}`);
              return chain(resolved);
            };
          }
        }
      );
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => chain({ data: updatedRows, error: null }))
      }))
    };
    return { store: new BotStore(supabase as never), filters };
  }

  it('claims the slot when the conditioned update matches', async () => {
    const { store, filters } = makeSessionClient([{ id: 'session-1' }]);
    await expect(
      store.claimSessionTransition('session-1', 'prev-item', 'next-item', 'card_main')
    ).resolves.toBe(true);
    expect(filters.some((f) => f.startsWith('or:') && f.includes('active_item_id.eq.prev-item'))).toBe(true);
  });

  it('backs off when another handler holds the slot (zero rows updated)', async () => {
    const { store, filters } = makeSessionClient([]);
    await expect(
      store.claimSessionTransition('session-1', null, 'next-item', 'card_main')
    ).resolves.toBe(false);
    expect(filters.some((f) => f.startsWith('is:active_item_id'))).toBe(true);
  });
});

describe('BotStore.claimUpdate', () => {
  function makeStoreWithUpsert(rows: unknown[], takeoverRows: unknown[] = []) {
    const upsertArgs: unknown[] = [];
    let takeoverQueried = false;
    const takeoverChain = (resolved: unknown): unknown =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => resolve(resolved);
            }
            return () => takeoverChain(resolved);
          }
        }
      );
    const supabase = {
      from: vi.fn(() => ({
        upsert: vi.fn((row: unknown, opts: unknown) => {
          upsertArgs.push({ row, opts });
          return { select: vi.fn(() => Promise.resolve({ data: rows, error: null })) };
        }),
        update: vi.fn(() => {
          takeoverQueried = true;
          return takeoverChain({ data: takeoverRows, error: null });
        })
      }))
    };
    return {
      store: new BotStore(supabase as never),
      upsertArgs,
      wasTakeoverQueried: () => takeoverQueried
    };
  }

  it('returns true when the insert claimed the update', async () => {
    const { store, upsertArgs, wasTakeoverQueried } = makeStoreWithUpsert([{ update_id: 7 }]);
    await expect(store.claimUpdate('telegram', 7)).resolves.toBe(true);
    expect((upsertArgs[0] as { opts: { ignoreDuplicates: boolean } }).opts.ignoreDuplicates).toBe(true);
    expect(wasTakeoverQueried()).toBe(false);
  });

  it('returns false on duplicate delivery of a live/completed claim', async () => {
    const { store, wasTakeoverQueried } = makeStoreWithUpsert([], []);
    await expect(store.claimUpdate('telegram', 7)).resolves.toBe(false);
    expect(wasTakeoverQueried()).toBe(true);
  });

  it('takes over a stale uncompleted claim (dead handler) on retry', async () => {
    const { store } = makeStoreWithUpsert([], [{ update_id: 7 }]);
    await expect(store.claimUpdate('telegram', 7)).resolves.toBe(true);
  });
});
