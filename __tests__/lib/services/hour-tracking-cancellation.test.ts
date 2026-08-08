// @vitest-environment node
/**
 * r29 · Sol R-C — `executeCancellation` and the `hour_types` read that decides MONEY.
 *
 * `lib/services/hour-tracking.ts` read `hour_types.modality` while destructuring only
 * `data`. On a failed read `modality` stayed at its `'online'` initialiser, so a
 * PRESENCIAL session cancelled 120 h out was evaluated under the ONLINE thresholds —
 * clause 1 (`devuelta`, consultant unpaid) instead of clause 4 (`penalizada`, consultant
 * paid) — and that wrong status was written to `contract_hours_ledger`, where it is
 * indistinguishable afterwards from a correct one.
 *
 * The suite drives the REAL function. The Supabase double is hand-rolled and records
 * every write, so "nothing was written" is asserted rather than assumed.
 *
 * Synthetic data only: no real school, consultant or session appears here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { executeCancellation } from '../../../lib/services/hour-tracking';
import type { ConsultorSession } from '../../../lib/types/consultor-sessions.types';
import type { SupabaseClient } from '@supabase/supabase-js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CONTRATO_ID = 'ctr-22222222-2222-4222-8222-222222222222';
const LEDGER_ID = 'led-33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';

/** 2026-08-05 12:00 Chile (UTC−4) — the instant every cancellation below happens at. */
const NOW = new Date('2026-08-05T16:00:00.000Z');
/** 120 h later, to the hour: inside presencial's 336 h bar, outside online's 48 h bar. */
const SESSION_DATE = '2026-08-10';
const SESSION_START = '12:00:00';

type PgError = { code: string; message: string; details: null; hint: null };

function pgError(code: string, message: string): PgError {
  return { code, message, details: null, hint: null };
}

function sessionFixture(overrides: Partial<ConsultorSession> = {}): ConsultorSession {
  return {
    id: SESSION_ID,
    school_id: 77,
    growth_community_id: '55555555-5555-4555-8555-555555555555',
    program_enrollment_id: null,
    title: 'Sesión de acompañamiento — Ciclo 2',
    description: null,
    objectives: null,
    session_date: SESSION_DATE,
    start_time: SESSION_START,
    end_time: '13:30:00',
    scheduled_duration_minutes: 90,
    actual_duration_minutes: null,
    modality: 'presencial',
    meeting_link: null,
    meeting_provider: null,
    is_zoom_managed: false,
    location: 'Sala 2',
    status: 'programada',
    recurrence_rule: null,
    recurrence_group_id: null,
    session_number: null,
    meeting_summary: null,
    meeting_transcript: null,
    created_by: ACTOR_ID,
    approved_by: null,
    approved_at: null,
    finalized_by: null,
    finalized_at: null,
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: null,
    hour_type_key: 'acompanamiento_presencial',
    contrato_id: CONTRATO_ID,
    cancelled_notice_hours: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    is_active: true,
    ...overrides,
  } as ConsultorSession;
}

type Write = { table: string; payload: Record<string, unknown> };

type DoubleOptions = {
  /** What the `hour_types` read answers with. */
  hourType?: { data: { modality: string } | null; error: PgError | null };
};

/**
 * Only the three tables `executeCancellation` touches, and only the shapes it uses:
 * `hour_types … .single()`, `contract_hours_ledger … .maybeSingle()` then `.update()`,
 * and the `consultor_sessions` `.update()`.
 */
function createClient(options: DoubleOptions = {}) {
  const writes: Write[] = [];

  const client = {
    from(table: string) {
      let payload: Record<string, unknown> | null = null;

      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        update: (value: Record<string, unknown>) => {
          payload = value;
          writes.push({ table, payload: value });
          return api;
        },
        single: async () => {
          if (table === 'hour_types') {
            return options.hourType ?? { data: { modality: 'presencial' }, error: null };
          }
          throw new Error(`unexpected .single() on ${table}`);
        },
        maybeSingle: async () => {
          if (table === 'contract_hours_ledger') {
            return { data: { id: LEDGER_ID }, error: null };
          }
          throw new Error(`unexpected .maybeSingle() on ${table}`);
        },
        then(resolve: (value: unknown) => void) {
          // An `.update().eq()` is awaited directly; a select that reaches here is a bug
          // in this double rather than in the function under test.
          if (payload === null) throw new Error(`unexpected awaited select on ${table}`);
          resolve({ data: null, error: null });
        },
      };

      return api;
    },
  };

  return { client: client as unknown as SupabaseClient, writes };
}

const params = {
  cancelled_by_party: 'school' as const,
  reason: 'El colegio suspendió la jornada',
  is_force_majeure: false,
};

describe('executeCancellation · the hour_types read decides the money status [R5]', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('FAILS the cancellation when the read errors, instead of defaulting to online', async () => {
    const { client, writes } = createClient({
      hourType: { data: null, error: pgError('57014', 'canceling statement due to statement timeout') },
    });

    await expect(
      executeCancellation(client, sessionFixture(), params, ACTOR_ID)
    ).rejects.toThrow(/No se pudo determinar la modalidad de la hora \(acompanamiento_presencial\)/);

    // The harm was a WRITE: nothing may reach the ledger or the session on this path.
    expect(writes).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`session=${SESSION_ID}`),
      expect.objectContaining({ code: '57014' })
    );
  });

  it('THE DEFECT, verbatim: the swallowed read would have billed presencial as online', async () => {
    // The same session, the same 120 h notice, read SUCCEEDING. `presencial` is clause 4
    // — `penalizada`, consultant paid. Under the old code a failed read produced clause 1
    // (`devuelta`, consultant unpaid) from these identical inputs, which is the exact
    // pair of statuses the test above now makes unreachable.
    const { client, writes } = createClient({
      hourType: { data: { modality: 'presencial' }, error: null },
    });

    const result = await executeCancellation(client, sessionFixture(), params, ACTOR_ID);

    expect(result.success).toBe(true);
    expect(result.clause_result).toMatchObject({
      clause: 'clause_4',
      ledger_status: 'penalizada',
      consultant_paid: true,
    });
    expect(result.cancelled_notice_hours).toBe(120);

    const ledgerWrite = writes.find((w) => w.table === 'contract_hours_ledger');
    expect(ledgerWrite?.payload).toMatchObject({
      status: 'penalizada',
      cancellation_clause: 'clause_4',
    });
  });

  it('a successful `online` read still classifies as before', async () => {
    const { client, writes } = createClient({
      hourType: { data: { modality: 'online' }, error: null },
    });

    const result = await executeCancellation(
      client,
      sessionFixture({ modality: 'online', hour_type_key: 'acompanamiento_online' }),
      params,
      ACTOR_ID
    );

    expect(result.clause_result).toMatchObject({
      clause: 'clause_1',
      ledger_status: 'devuelta',
      consultant_paid: false,
    });
    expect(writes.find((w) => w.table === 'contract_hours_ledger')?.payload).toMatchObject({
      status: 'devuelta',
    });
  });

  it("a successful `both` read still defers to the SESSION's modality", async () => {
    // `both` is the one value that is not itself an answer: the session decides. Asserted
    // in both directions, because a fix that collapsed `both` to a constant would still
    // pass a one-sided test.
    const { client: presencialClient } = createClient({
      hourType: { data: { modality: 'both' }, error: null },
    });
    const presencial = await executeCancellation(
      presencialClient,
      sessionFixture({ modality: 'presencial' }),
      params,
      ACTOR_ID
    );
    expect(presencial.clause_result).toMatchObject({
      clause: 'clause_4',
      ledger_status: 'penalizada',
    });

    const { client: onlineClient } = createClient({
      hourType: { data: { modality: 'both' }, error: null },
    });
    const online = await executeCancellation(
      onlineClient,
      sessionFixture({ modality: 'online' }),
      params,
      ACTOR_ID
    );
    expect(online.clause_result).toMatchObject({
      clause: 'clause_1',
      ledger_status: 'devuelta',
    });
  });

  it('a key with NO matching row is still not an error: the pre-existing fallback holds', async () => {
    // PGRST116 is `.single()` over zero rows, not a failed read. Nothing about that path
    // changed this round, and turning it into a 500 would be a behaviour change nobody
    // asked for.
    const { client } = createClient({
      hourType: {
        data: null,
        error: pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned'),
      },
    });

    const result = await executeCancellation(client, sessionFixture(), params, ACTOR_ID);

    expect(result.success).toBe(true);
    // `modality` keeps its `'online'` initialiser exactly as before — documented here so
    // the next reader sees it is the OLD behaviour, deliberately left alone.
    expect(result.clause_result).toMatchObject({ clause: 'clause_1' });
  });
});
