// @vitest-environment node
/**
 * The PRODUCTION webhook store — `createSupabaseWebhookStore` itself (Sol R2 ③).
 *
 * ## Why this file exists
 *
 * Sol F1 moved the lifecycle's monotonicity rule OUT of process and INTO the UPDATE's
 * own `WHERE ... status IN (...)`, precisely so a route and a concurrent
 * `webhook_sweep` cannot both win a TOCTOU race. That was the right fix, and it had a
 * consequence nobody had to live with before: the guard is no longer in any TypeScript
 * the suites execute. The route suite hands the route an in-memory double, and that
 * double re-implements the rule by importing the same exported sets — so it agrees with
 * production by construction and would keep agreeing if the real store stopped sending
 * the filter at all.
 *
 * The executor recorded that as a known caveat. Sol overturned recorded-not-tested for
 * the first store method whose correctness lives in the filter, and was right to: a
 * dropped `.in(...)` is a silent, total loss of the ordering guarantee, and every
 * existing suite would stay green through it.
 *
 * ## How it is tested without a database
 *
 * Real `supabase-js`, real `createSupabaseWebhookStore`, real `.schema('zoom_internal')`
 * — over an intercepted `fetch`. The interceptor is the assertion surface: it answers
 * like PostgREST, and it records the URL, method, headers and body of every request, so
 * the filters can be read off the wire exactly as Postgres would receive them.
 *
 * This proves the store SENDS the guard. It cannot prove Postgres honours it — that is
 * what `supabase/tests/` and the pgTAP suite are for. Naming the boundary is the point:
 * the gap Sol found was between "the rule is in the SQL" and "the SQL is what we send".
 */
import { describe, it, expect, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  defaultZoomWebhookStore,
  LIFECYCLE_ENDED_APPLIES_FROM,
  LIFECYCLE_STARTED_APPLIES_FROM,
  PROJECTION_ENDED_APPLIES_FROM,
  PROJECTION_LIVE_APPLIES_FROM,
} from '../../../lib/zoom/webhook-store';

const SUPABASE_URL = 'https://synthetic-project.supabase.test';
const SERVICE_KEY = 'sb_secret_synthetic_service_role_key';
const MEETING_ID = '55555555-5555-4555-8555-555555555555';
const SURFACE_ID = '11111111-1111-4111-8111-111111111111';

interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

/**
 * One canned PostgREST reply per call, in order; the last one repeats. `rows` becomes
 * the JSON array PostgREST returns from a `RETURNING`, and `[]` is how it reports "the
 * WHERE matched nothing" — which is exactly the refusal these guards produce.
 */
function interceptedStore(replies: Array<{ status?: number; rows?: unknown[] }>) {
  const requests: RecordedRequest[] = [];
  let index = 0;

  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const reply = replies[Math.min(index, replies.length - 1)] ?? {};
    index += 1;
    requests.push({
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      headers: new Headers(init?.headers as HeadersInit),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const rows = reply.rows;
    if (rows === undefined) return new Response(null, { status: reply.status ?? 204 });
    return new Response(JSON.stringify(rows), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  // The production wiring, not a hand-rolled equivalent: `defaultZoomWebhookStore` is
  // what `zoom_internal` addressing and the public-schema client both come from.
  const client: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    global: { fetch: fetchImpl },
  });
  const store = defaultZoomWebhookStore({} as NodeJS.ProcessEnv, () => client);

  return { store, requests };
}

/** PostgREST renders `.in()` as `in.(a,b,c)`, quoting only values that need it. */
function inFilter(values: readonly string[]): string {
  return `in.(${values.join(',')})`;
}

function statusFilterOf(request: RecordedRequest, column: string): string {
  return (request.url.searchParams.get(column) ?? '').replace(/"/g, '');
}

/**
 * Z7-1 moved the lifecycle transition onto `zoom_internal.apply_meeting_lifecycle`, so
 * the guard now travels in the RPC's JSON body instead of a `?status=in.(...)` query
 * filter. The property under test is unchanged and so is this file's reason to exist:
 * a dropped or widened applies-from set is a silent, total loss of the ordering
 * guarantee, and every other suite would stay green through it.
 */
function rpcArgsOf(request: RecordedRequest): Record<string, unknown> {
  return request.body as Record<string, unknown>;
}

describe('createSupabaseWebhookStore · the guard is on the wire (Sol R2 ③)', () => {
  it('applies `ended` and returns the surface keys the projection needs', async () => {
    const { store, requests } = interceptedStore([
      { rows: [{ surface_type: 'consultor_session', surface_id: SURFACE_ID }] },
    ]);

    const result = await store.setMeetingStatus(MEETING_ID, 'ended', 'Fk+SyntheticUuid/0001==');

    expect(result).toEqual({
      applied: true,
      surface: { surfaceType: 'consultor_session', surfaceId: SURFACE_ID },
    });

    // The surface keys come from the UPDATE's own RETURNING, inside the function — one
    // round trip, no second lookup a concurrent writer could interleave with.
    const [request] = requests;
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/rest/v1/rpc/apply_meeting_lifecycle');
    expect(request.headers.get('content-profile')).toBe('zoom_internal');
    expect(rpcArgsOf(request)).toMatchObject({
      p_meeting_id: MEETING_ID,
      p_status: 'ended',
      p_occurrence_uuid: 'Fk+SyntheticUuid/0001==',
    });
  });

  it('a LATER `started` carries the started applies-from set and reports applied=false', async () => {
    // The ordering bug in one call: a delayed or swept `meeting.started` arriving after
    // `meeting.ended`. Postgres matches zero rows because `ended` is not in the started
    // set, so the store must report the refusal rather than treat it as an error.
    const { store, requests } = interceptedStore([{ rows: [] }]);

    const result = await store.setMeetingStatus(MEETING_ID, 'started', null);

    expect(result).toEqual({ applied: false, surface: null });

    const args = rpcArgsOf(requests[0]);
    expect(args.p_applies_from).toEqual([...LIFECYCLE_STARTED_APPLIES_FROM]);
    // Pinned literally as well, so mutating the exported set cannot quietly relabel
    // what this test proves.
    expect(args.p_applies_from).toEqual(['pending', 'provisioned', 'started']);
    expect(args.p_applies_from).not.toContain('ended');

    // A `started` that omits the uuid must not blank the one an earlier event captured,
    // and an absent instant is offered as null rather than not offered at all — the
    // function COALESCEs, so null can never blank a recorded value.
    expect(args).toEqual({
      p_meeting_id: MEETING_ID,
      p_status: 'started',
      p_applies_from: ['pending', 'provisioned', 'started'],
      p_occurrence_uuid: null,
      p_actual_started_at: null,
      p_actual_ended_at: null,
    });
  });

  it('`ended` may overwrite `started`, so its applies-from set is the wider one', async () => {
    const { store, requests } = interceptedStore([{ rows: [] }]);
    await store.setMeetingStatus(MEETING_ID, 'ended', null);

    const args = rpcArgsOf(requests[0]);
    expect(args.p_applies_from).toEqual([...LIFECYCLE_ENDED_APPLIES_FROM]);
    expect(args.p_applies_from).toEqual([
      'pending',
      'provisioned',
      'started',
      'ended',
      'error',
    ]);
    // Neither set may reopen an operator's decision.
    expect(args.p_applies_from).not.toContain('cancelled');
    expect(args.p_applies_from).not.toContain('deleted');
  });

  it('offers both instants on the wire, so `ended` can fill a start that never landed', async () => {
    // Z7-1: the out-of-order case. `meeting.ended` states when the occurrence began as
    // well as when it finished, and the function fills each column only while NULL — so
    // sending both is what lets a refused `started` stop being a permanent data loss.
    const { store, requests } = interceptedStore([{ rows: [] }]);

    await store.setMeetingStatus(MEETING_ID, 'ended', null, {
      actualStartedAt: '2026-07-29T23:55:56.000Z',
      actualEndedAt: '2026-07-30T00:03:26.000Z',
    });

    expect(rpcArgsOf(requests[0])).toMatchObject({
      p_actual_started_at: '2026-07-29T23:55:56.000Z',
      p_actual_ended_at: '2026-07-30T00:03:26.000Z',
    });
  });

  it('projection `live` cannot overwrite `ended`', async () => {
    const { store, requests } = interceptedStore([{ status: 204 }]);

    await store.setProjectionStatus(
      { surfaceType: 'consultor_session', surfaceId: SURFACE_ID },
      'live'
    );

    const [request] = requests;
    expect(request.method).toBe('PATCH');
    expect(request.url.pathname).toBe('/rest/v1/session_meetings_public');
    expect(statusFilterOf(request, 'meeting_status')).toBe(inFilter(PROJECTION_LIVE_APPLIES_FROM));
    expect(statusFilterOf(request, 'meeting_status')).toBe('in.(scheduled,live)');
    // The assertion this test is named for: `ended` is absent from the set a `live`
    // write may match, so a late `meeting.started` cannot un-finish a finished meeting
    // on the surface the UI actually reads.
    expect(statusFilterOf(request, 'meeting_status')).not.toContain('ended');
    expect(request.url.searchParams.get('surface_type')).toBe('eq.consultor_session');
    expect(request.url.searchParams.get('surface_id')).toBe(`eq.${SURFACE_ID}`);
    expect(request.body).toMatchObject({ meeting_status: 'live' });
  });

  it('projection `ended` may overwrite `live`, and neither touches `cancelled`', async () => {
    const { store, requests } = interceptedStore([{ status: 204 }]);
    await store.setProjectionStatus(
      { surfaceType: 'consultor_session', surfaceId: SURFACE_ID },
      'ended'
    );

    expect(statusFilterOf(requests[0], 'meeting_status')).toBe(
      inFilter(PROJECTION_ENDED_APPLIES_FROM)
    );
    expect(statusFilterOf(requests[0], 'meeting_status')).toBe('in.(scheduled,live,ended)');
    expect(statusFilterOf(requests[0], 'meeting_status')).not.toContain('cancelled');
  });

  it('addresses zoom_internal for the meeting, and the PUBLIC schema for the projection', async () => {
    // §6: `zoom_internal` is exposed in the Data API and denied by GRANTS. PostgREST
    // selects the schema by header, so a lost `.schema()` would silently address
    // `public.zoom_meetings` — a table that does not exist — rather than fail loudly
    // at the seam. `session_meetings_public` must NOT carry the internal profile.
    const { store, requests } = interceptedStore([
      { rows: [{ surface_type: 'consultor_session', surface_id: SURFACE_ID }] },
      { status: 204 },
    ]);

    await store.setMeetingStatus(MEETING_ID, 'ended', null);
    await store.setProjectionStatus(
      { surfaceType: 'consultor_session', surfaceId: SURFACE_ID },
      'ended'
    );

    const [internal, projection] = requests;
    expect(internal.url.pathname).toBe('/rest/v1/rpc/apply_meeting_lifecycle');
    expect(internal.headers.get('content-profile')).toBe('zoom_internal');
    expect(rpcArgsOf(internal).p_meeting_id).toBe(MEETING_ID);

    expect(projection.url.pathname).toBe('/rest/v1/session_meetings_public');
    expect(projection.headers.get('content-profile')).not.toBe('zoom_internal');
  });

  it('surfaces a PostgREST error rather than reporting a silent no-op', async () => {
    // `applied: false` means "the guard refused it", and the caller marks the event
    // processed on that basis. A failed request must never be able to say that.
    const { store } = interceptedStore([
      { status: 403, rows: [{ message: 'permission denied for table zoom_meetings' }] },
    ]);

    await expect(store.setMeetingStatus(MEETING_ID, 'ended', null)).rejects.toThrow(
      /zoom_meetings status update failed/
    );
  });

  it('the ledger insert reports a conflict as `duplicate`, not as an error', async () => {
    // `ignoreDuplicates: true` is ON CONFLICT DO NOTHING, and the `.select()` is what
    // makes the outcome observable: zero rows back = Zoom retried a body we already
    // hold. Included here because it is the same class of wire-level contract.
    const { store, requests } = interceptedStore([{ rows: [] }]);

    const result = await store.recordEvent({
      dedupe_key: 'synthetic-dedupe-0001',
      event_type: 'meeting.ended',
      zoom_meeting_uuid: 'Fk+SyntheticUuid/0001==',
      raw_payload: { object: { id: 82000000042 } },
    });

    expect(result).toBe('duplicate');
    expect(requests[0].method).toBe('POST');
    expect(requests[0].headers.get('prefer')).toContain('resolution=ignore-duplicates');
  });
});
