// @vitest-environment node
// GENERA fixes F12c, N154: a meeting's author, facilitator, secretary and the
// person who finalised it are named from profile cards (get_profile_cards),
// not from `profiles` joins that only an admin's session can read; and no
// e-mail address is asked for. Invented people only.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const state: {
  rows: Record<string, Row[]>;
  selects: Record<string, string[]>;
  rpc: ReturnType<typeof vi.fn>;
} = { rows: {}, selects: {}, rpc: vi.fn() };

function builder(table: string) {
  const result = () => ({ data: state.rows[table] ?? [], error: null });
  const chain: any = {
    select: (...args: unknown[]) => {
      (state.selects[table] ??= []).push(String(args[0] ?? ''));
      return chain;
    },
    eq: () => chain,
    in: () => chain,
    or: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    single: () => Promise.resolve({ data: (state.rows[table] ?? [])[0] ?? null, error: null }),
    then: (onFul: (value: unknown) => unknown, onRej?: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(onFul, onRej),
  };
  return chain;
}

vi.mock('../../lib/supabase-wrapper', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: (...args: unknown[]) => state.rpc(...args),
  },
}));

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../utils/workspaceUtils', () => ({ logWorkspaceActivity: vi.fn() }));

import { getMeetings, getMeetingDetails } from '../../utils/meetingUtils';

// Invented people.
const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const CARLA = '33333333-3333-4333-8333-333333333333';
const DIEGO = '44444444-4444-4444-8444-444444444444';
const NONAME = '55555555-5555-4555-8555-555555555555';
const PARTICIPANT = '66666666-6666-4666-8666-666666666666';

const CARDS: Record<string, Row> = {
  [ANA]: { id: ANA, first_name: 'Ana', last_name: 'Uno', avatar_url: null },
  [BRUNO]: { id: BRUNO, first_name: 'Bruno', last_name: 'Dos', avatar_url: null },
  [CARLA]: { id: CARLA, first_name: 'Carla', last_name: 'Tres', avatar_url: null },
  [DIEGO]: { id: DIEGO, first_name: 'Diego', last_name: 'Cuatro', avatar_url: null },
  [PARTICIPANT]: { id: PARTICIPANT, first_name: 'Pía', last_name: 'Cinco', avatar_url: null },
};

const synthId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  state.selects = {};
  state.rows = {};
  state.rpc = vi.fn(async (fn: string, args: { p_ids: string[] }) => {
    if (fn !== 'get_profile_cards') return { data: null, error: { message: 'unexpected' } };
    return {
      data: args.p_ids.map((id) => CARDS[id] ?? (id.startsWith('00000000') ? { id, first_name: 'Persona', last_name: id.slice(-4), avatar_url: null } : undefined)).filter(Boolean),
      error: null,
    };
  });
});

const askedIds = () => state.rpc.mock.calls.flatMap(([, args]) => (args as { p_ids: string[] }).p_ids);

describe('N154 getMeetings — the list', () => {
  beforeEach(() => {
    state.rows.community_meetings = [
      { id: 'm1', title: 'Uno', status: 'borrador', created_by: ANA, facilitator_id: BRUNO, secretary_id: CARLA },
      { id: 'm2', title: 'Dos', status: 'completada', created_by: NONAME, facilitator_id: null, secretary_id: null },
    ];
  });

  it('asks for no e-mail and joins no profiles', async () => {
    await getMeetings('ws-1');
    const select = state.selects.community_meetings.join('\n');
    expect(select).not.toMatch(/email/);
    expect(select).not.toMatch(/profiles/);
  });

  it('names creator, facilitator and secretary from ONE card call; a person without a card has empty names, never an e-mail', async () => {
    const meetings = await getMeetings('ws-1');
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(new Set(askedIds())).toEqual(new Set([ANA, BRUNO, CARLA, NONAME]));

    const m1 = meetings.find((m) => m.id === 'm1')!;
    expect(m1.created_by_profile).toEqual({ id: ANA, first_name: 'Ana', last_name: 'Uno' });
    expect(m1.facilitator).toEqual({ id: BRUNO, first_name: 'Bruno', last_name: 'Dos' });
    expect(m1.secretary).toEqual({ id: CARLA, first_name: 'Carla', last_name: 'Tres' });

    const m2 = meetings.find((m) => m.id === 'm2')!;
    expect(m2.created_by_profile).toEqual({ id: NONAME, first_name: '', last_name: '' });
    expect(m2.facilitator).toBeUndefined();
    expect(m2.secretary).toBeUndefined();
    expect(JSON.stringify(meetings)).not.toMatch(/email/);
  });

  it('more than 200 people are asked in several calls', async () => {
    state.rows.community_meetings = Array.from({ length: 150 }, (_, i) => ({
      id: `m${i}`, title: `R${i}`, status: 'borrador', created_by: synthId(i), facilitator_id: synthId(1000 + i), secretary_id: null,
    }));
    const meetings = await getMeetings('ws-1');
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(new Set(askedIds()).size).toBe(300);
    expect(meetings[149].facilitator).toMatchObject({ first_name: 'Persona' });
  });

  it('no meetings: no card call', async () => {
    state.rows.community_meetings = [];
    expect(await getMeetings('ws-1')).toEqual([]);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe('N154 getMeetingDetails — one meeting', () => {
  beforeEach(() => {
    state.rows = {
      community_meetings: [{
        id: 'm1', title: 'Reunión sintética', status: 'completada',
        created_by: ANA, facilitator_id: BRUNO, secretary_id: CARLA, finalized_by: DIEGO,
      }],
      meeting_agreements: [],
      meeting_commitments: [],
      meeting_tasks: [],
      meeting_attendees: [{ id: 'a1', meeting_id: 'm1', user_id: PARTICIPANT, role: 'participant' }],
    };
  });

  it('asks for no e-mail and joins no profiles', async () => {
    await getMeetingDetails('m1');
    const select = state.selects.community_meetings.join('\n');
    expect(select).not.toMatch(/email/);
    expect(select).not.toMatch(/profiles/);
  });

  it('names the four people from the SAME card call as the participants', async () => {
    const details = await getMeetingDetails('m1');
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(new Set(askedIds())).toEqual(new Set([PARTICIPANT, ANA, BRUNO, CARLA, DIEGO]));
    expect(details!.created_by_profile).toEqual({ id: ANA, first_name: 'Ana', last_name: 'Uno' });
    expect(details!.facilitator).toEqual({ id: BRUNO, first_name: 'Bruno', last_name: 'Dos' });
    expect(details!.secretary).toEqual({ id: CARLA, first_name: 'Carla', last_name: 'Tres' });
    expect(details!.finalized_by_profile).toEqual({ id: DIEGO, first_name: 'Diego', last_name: 'Cuatro' });
    expect(details!.attendees[0].user_profile).toMatchObject({ first_name: 'Pía' });
    expect(JSON.stringify(details)).not.toMatch(/email/);
  });

  it('a meeting not finalised has no finalized_by_profile', async () => {
    state.rows.community_meetings[0].finalized_by = null;
    const details = await getMeetingDetails('m1');
    expect(details!.finalized_by_profile).toBeNull();
  });
});
