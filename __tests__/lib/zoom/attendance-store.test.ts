// @vitest-environment node
/**
 * The PRODUCTION attendance store — `createSupabaseAttendanceStore` itself.
 *
 * ## Why this file exists, and it is not a formality
 *
 * The first Codex FAIL of this chunk was a defect in the STORE'S QUERY — the applier
 * suite drives a store DOUBLE, so mutating the real query leaves it green. That was
 * demonstrated rather than assumed: a probe that re-pointed the real lookup at
 * `display_name` passed the entire applier suite. **This file is the missing half**:
 * real `supabase-js`, real `createSupabaseAttendanceStore`, over an intercepted
 * `fetch`, so what actually reaches PostgREST can be read off the wire.
 *
 * Under §15.3.9 the leave path is ONE RPC — `zoom_internal.apply_participant_leave` —
 * so the load-bearing wire assertion is now that the store sends the delivery whole to
 * that function and consumes its outcome, with NO client-side query that could reach
 * `zoom_attendance` rows by identity evidence.
 *
 * Same boundary as `webhook-store.test.ts` states for the lifecycle: this proves the
 * store SENDS the right call. It cannot prove Postgres honours it — that is what
 * `supabase/tests/011-zoom-public-rls.sql` is for.
 */
import { describe, it, expect, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { defaultZoomAttendanceStore } from '../../../lib/zoom/attendance-store';

const SUPABASE_URL = 'https://synthetic-project.supabase.test';
const SERVICE_KEY = 'sb_secret_synthetic_service_role_key';
const OCCURRENCE = 'z7Synthetic/Occurrence/A==';

interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

/**
 * `rows` becomes a JSON array, as PostgREST returns for a successful select/RETURNING.
 * `body` returns a bare object instead — which is the shape PostgREST uses for an ERROR
 * (`{code, message, ...}`), and getting that wrong is how a 23505 reads as `code:
 * undefined` and escapes as a thrown insert failure instead of an absorbed duplicate.
 */
function interceptedStore(
  replies: Array<{ status?: number; rows?: unknown[]; body?: Record<string, unknown> }>
) {
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
    const payload = reply.body ?? reply.rows;
    if (payload === undefined) return new Response(null, { status: reply.status ?? 204 });
    return new Response(JSON.stringify(payload), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  const client: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    global: { fetch: fetchImpl },
  });
  const store = defaultZoomAttendanceStore({} as NodeJS.ProcessEnv, () => client);

  return { store, requests };
}

describe('applyLeave · one RPC, one transaction (§15.3.9)', () => {
  const LEAVE = {
    schoolId: 9901,
    zoomMeetingUuid: OCCURRENCE,
    sourceEventKey: 'sha256-of-the-raw-body',
    observedAt: '2026-07-30T00:01:25.000Z',
    participantUuid: '73823734-9301-A7E5-36F4-684DEEF79FE5',
    customerKey: '38a578a26df462bfe9cd1d7bbe5a0b77',
    displayName: 'Invitada Spike',
    transientEmail: null,
    identityTokens: ['ck:38a578a26df462bfe9cd1d7bbe5a0b77', 'nm:invitada spike'],
  };

  it('hands the WHOLE delivery to zoom_internal.apply_participant_leave', async () => {
    // PostgREST returns a scalar-returning function's result as bare JSON.
    const { store, requests } = interceptedStore([{ body: 'interval_closed' as never }]);

    await expect(store.applyLeave(LEAVE)).resolves.toBe('interval_closed');

    const [request] = requests;
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/rest/v1/rpc/apply_participant_leave');
    // The zoom_internal profile header — the function lives in the private schema.
    expect(request.headers.get('content-profile')).toBe('zoom_internal');
    expect(request.body).toEqual({
      p_school_id: 9901,
      p_zoom_meeting_uuid: OCCURRENCE,
      p_source_event_key: 'sha256-of-the-raw-body',
      p_observed_at: '2026-07-30T00:01:25.000Z',
      p_participant_uuid: '73823734-9301-A7E5-36F4-684DEEF79FE5',
      p_customer_key: '38a578a26df462bfe9cd1d7bbe5a0b77',
      p_display_name: 'Invitada Spike',
      p_transient_email: null,
      p_identity_tokens: ['ck:38a578a26df462bfe9cd1d7bbe5a0b77', 'nm:invitada spike'],
    });
  });

  it('the leave path issues NO zoom_attendance query — the decision is the function\'s', async () => {
    // The defect class this contract removed was a client-side identity query deciding
    // what to close. One request, to the RPC, and nothing else on the wire.
    const { store, requests } = interceptedStore([{ body: 'no_open_interval' as never }]);

    await store.applyLeave(LEAVE);

    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe('/rest/v1/rpc/apply_participant_leave');
  });

  it('sends p_identity_tokens null when the participant presented nothing', async () => {
    const { store, requests } = interceptedStore([{ body: 'unpairable_leave' as never }]);

    await store.applyLeave({
      ...LEAVE,
      participantUuid: null,
      customerKey: null,
      displayName: null,
      identityTokens: [],
    });

    expect((requests[0].body as Record<string, unknown>).p_identity_tokens).toBeNull();
  });

  it('propagates every outcome the function can return, including the rollback marker', async () => {
    for (const outcome of [
      'interval_closed',
      'no_open_interval',
      'unpairable_leave',
      'no_instant',
      'observation_duplicate',
    ]) {
      const { store } = interceptedStore([{ body: outcome as never }]);
      await expect(store.applyLeave(LEAVE)).resolves.toBe(outcome);
    }
  });

  it('throws on an outcome it does not recognise — deploy-order drift must be loud', async () => {
    const { store } = interceptedStore([{ body: 'closed_maybe' as never }]);
    await expect(store.applyLeave(LEAVE)).rejects.toThrow(/unknown outcome/);
  });

  it('throws on a PostgREST error rather than inventing an outcome', async () => {
    const { store } = interceptedStore([
      { status: 404, body: { code: 'PGRST202', message: 'function not found' } },
    ]);
    await expect(store.applyLeave(LEAVE)).rejects.toThrow(/apply_participant_leave failed/);
  });
});

describe('insertInterval · both idempotency keys reach the wire (Codex P1-2)', () => {
  it('sends identity_token, source_event_key and source=webhook', async () => {
    const { store, requests } = interceptedStore([{ status: 201 }]);

    await store.insertInterval({
      surfaceType: 'consultor_session',
      surfaceId: 'a7a7a7a7-0000-0000-0000-000000000001',
      schoolId: 9901,
      zoomMeetingUuid: OCCURRENCE,
      participantUuid: null,
      userId: null,
      customerKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
      displayName: 'Ana Perez Sintetica',
      transientEmail: null,
      matchedBy: 'unmatched',
      joinedAt: '2026-07-29T23:55:00.000Z',
      identityTokens: ['ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'nm:ana perez sintetica'],
      sourceEventKey: 'sha256-of-the-raw-body',
    });

    const [request] = requests;
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/rest/v1/zoom_attendance');
    expect(request.body).toMatchObject({
      identity_tokens: ['ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'nm:ana perez sintetica'],
      source_event_key: 'sha256-of-the-raw-body',
      source: 'webhook',
      matched_by: 'unmatched',
      user_id: null,
    });
  });

  it('reports a unique violation as `duplicate`, never as an error', async () => {
    // Either partial index can raise it — the participant_uuid one or source_event_key.
    // Both mean "Zoom redelivered, or the sweep replayed", which is normal operation.
    const { store } = interceptedStore([
      {
        status: 409,
        body: { code: '23505', message: 'duplicate key value violates unique constraint' },
      },
    ]);

    await expect(
      store.insertInterval({
        surfaceType: 'consultor_session',
        surfaceId: 'a7a7a7a7-0000-0000-0000-000000000001',
        schoolId: 9901,
        zoomMeetingUuid: OCCURRENCE,
        participantUuid: null,
        userId: null,
        customerKey: null,
        displayName: null,
        transientEmail: null,
        matchedBy: 'unmatched',
        joinedAt: '2026-07-29T23:55:00.000Z',
        identityTokens: [],
        sourceEventKey: 'sha256-of-the-raw-body',
      })
    ).resolves.toBe('duplicate');
  });
});

describe('findProfileIdByEmail · ambiguity is unmatched, not a throw (Codex ruling)', () => {
  it('takes two rows and returns null on two — profiles.email is not unique', async () => {
    const { store, requests } = interceptedStore([{ rows: [{ id: 'user-a' }, { id: 'user-b' }] }]);

    await expect(store.findProfileIdByEmail('shared@test.local')).resolves.toBeNull();
    // `limit=2` is what makes the ambiguity observable. `.maybeSingle()` would instead
    // throw on the duplicate, and from inside the webhook route a throw is a 500 and a
    // Zoom retry loop against a body that can never succeed.
    expect(requests[0].url.searchParams.get('limit')).toBe('2');
    expect(requests[0].url.searchParams.get('email')).toBe('ilike.shared@test.local');
  });

  it('returns the id when exactly one profile holds it', async () => {
    const { store } = interceptedStore([{ rows: [{ id: 'user-a' }] }]);
    await expect(store.findProfileIdByEmail('one@test.local')).resolves.toBe('user-a');
  });

  it('returns null when nobody holds it', async () => {
    const { store } = interceptedStore([{ rows: [] }]);
    await expect(store.findProfileIdByEmail('nobody@test.local')).resolves.toBeNull();
  });
});

describe('surface resolution reads zoom_internal and writes nothing', () => {
  it('addresses zoom_meetings under the zoom_internal profile, by occurrence uuid', async () => {
    const { store, requests } = interceptedStore([
      {
        rows: [
          {
            surface_type: 'consultor_session',
            surface_id: 'a7a7a7a7-0000-0000-0000-000000000001',
            school_id: 9901,
            zoom_meeting_uuid: OCCURRENCE,
          },
        ],
      },
    ]);

    await store.findSurfaceByOccurrence(OCCURRENCE);

    const [request] = requests;
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/rest/v1/zoom_meetings');
    expect(request.headers.get('accept-profile')).toBe('zoom_internal');
    expect(request.url.searchParams.get('zoom_meeting_uuid')).toBe(`eq.${OCCURRENCE}`);
  });
});
