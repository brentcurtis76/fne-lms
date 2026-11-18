// @vitest-environment node
// F12a EC-R4/R5: participants and the people in charge of tasks and
// commitments get their names from profile cards (get_profile_cards), not
// from a `profiles` embed that other people's sessions cannot read.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const state: {
  rows: Record<string, Row[]>;
  selects: Record<string, unknown[]>;
  rpc: ReturnType<typeof vi.fn>;
} = { rows: {}, selects: {}, rpc: vi.fn() };

function builder(table: string) {
  const result = () => ({ data: state.rows[table] ?? [], error: null });
  const chain: any = {
    select: (...args: unknown[]) => {
      (state.selects[table] ??= []).push(args[0]);
      return chain;
    },
    eq: () => chain,
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

// Statically imported so this file's mock queue drains here (see
// tools/eslint-plugin-mock-hygiene/drain-mock-queue.js).
import { getMeetingDetails } from '../../utils/meetingUtils';

// Invented people.
const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const CARLA = '33333333-3333-4333-8333-333333333333';
const UNKNOWN = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  state.selects = {};
  state.rows = {
    community_meetings: [{ id: 'm1', title: 'Reunión sintética', status: 'completada' }],
    meeting_agreements: [],
    meeting_commitments: [{ id: 'c1', meeting_id: 'm1', commitment_text: 'Compromiso', assigned_to: BRUNO }],
    meeting_tasks: [
      { id: 't1', meeting_id: 'm1', task_title: 'Tarea', assigned_to: CARLA },
      { id: 't2', meeting_id: 'm1', task_title: 'Otra', assigned_to: UNKNOWN },
    ],
    meeting_attendees: [
      { id: 'a1', meeting_id: 'm1', user_id: ANA, role: 'participant' },
      { id: 'a2', meeting_id: 'm1', user_id: UNKNOWN, role: 'facilitator' },
    ],
  };
  state.rpc = vi.fn(async (fn: string, args: { p_ids: string[] }) => {
    if (fn !== 'get_profile_cards') return { data: null, error: { message: 'unexpected' } };
    const cards: Record<string, Row> = {
      [ANA]: { id: ANA, first_name: 'Ana', last_name: 'Uno', avatar_url: 'https://example.invalid/ana.png' },
      [BRUNO]: { id: BRUNO, first_name: 'Bruno', last_name: 'Dos', avatar_url: null },
      [CARLA]: { id: CARLA, first_name: 'Carla', last_name: 'Tres', avatar_url: null },
    };
    return { data: args.p_ids.map((id) => cards[id]).filter(Boolean), error: null };
  });
});

describe('getMeetingDetails — names from profile cards (EC-R4/R5)', () => {
  it('fills user_profile of attendees and assigned_to_profile of tasks and commitments from ONE card call', async () => {
    const details = await getMeetingDetails('m1');
    expect(details).not.toBeNull();

    expect(state.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = state.rpc.mock.calls[0];
    expect(fn).toBe('get_profile_cards');
    expect(new Set((args as { p_ids: string[] }).p_ids)).toEqual(new Set([ANA, UNKNOWN, BRUNO, CARLA]));

    const ana = details!.attendees.find((a) => a.user_id === ANA)!;
    expect(ana.user_profile).toEqual({ id: ANA, first_name: 'Ana', last_name: 'Uno', avatar_url: 'https://example.invalid/ana.png' });
    expect(ana.role).toBe('participant');
    // A person with no card has no profile (the screen shows «Participante»).
    expect(details!.attendees.find((a) => a.user_id === UNKNOWN)!.user_profile).toBeUndefined();

    expect(details!.commitments[0].assigned_to_profile).toEqual({ id: BRUNO, first_name: 'Bruno', last_name: 'Dos', avatar_url: null });
    expect(details!.tasks.find((t) => t.id === 't1')!.assigned_to_profile).toMatchObject({ first_name: 'Carla', last_name: 'Tres' });
    expect(details!.tasks.find((t) => t.id === 't2')!.assigned_to_profile).toBeUndefined();
  });

  it('reads attendees without a profiles embed', async () => {
    await getMeetingDetails('m1');
    const attendeeSelect = String(state.selects.meeting_attendees?.[0] ?? '');
    expect(attendeeSelect).not.toMatch(/profiles/);
  });

  it('a failed card call leaves names empty but still returns the meeting with ids and roles', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
    const details = await getMeetingDetails('m1');
    expect(details!.attendees.map((a) => [a.user_id, a.role])).toEqual([[ANA, 'participant'], [UNKNOWN, 'facilitator']]);
    expect(details!.attendees.every((a) => a.user_profile === undefined)).toBe(true);
    consoleError.mockRestore();
  });
});
