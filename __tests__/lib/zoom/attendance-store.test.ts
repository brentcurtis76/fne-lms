// @vitest-environment node
/**
 * The PRODUCTION attendance store — `createSupabaseAttendanceStore` itself.
 *
 * ## Why this file exists, and it is not a formality
 *
 * Codex P1-1 was a defect in the STORE'S QUERY: `listOpenIntervals` OR-ed every identity
 * column it had, so two uuid-less participants sharing a display name both matched a
 * leave and the latest-joined one was closed — the wrong person's interval. The fix
 * moved pairing onto one persisted `identity_token` matched by exact equality.
 *
 * The applier suite could not have caught that, and still cannot: it drives a store
 * DOUBLE, so mutating the real query leaves it green. That was demonstrated rather than
 * assumed — a probe that re-pointed the real lookup at `display_name` passed the entire
 * applier suite. **This file is the missing half**: real `supabase-js`, real
 * `createSupabaseAttendanceStore`, over an intercepted `fetch`, so the filters can be
 * read off the wire exactly as PostgREST would send them.
 *
 * Same boundary as `webhook-store.test.ts` states for the lifecycle: this proves the
 * store SENDS the right query. It cannot prove Postgres honours it — that is what
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

describe('listOpenIntervals · ONE key, exact equality (Codex P1-1)', () => {
  it('matches the leave token against EVERY stored rank, by array containment', async () => {
    // The re-review fix. `identity_tokens=cs.{token}` is `@> ARRAY[token]`, so a leave
    // that downgraded to `nm:` still finds a join that recorded `nm:` at a weaker rank —
    // instead of finding only the namesake whose PRIMARY token happened to be `nm:`.
    const { store, requests } = interceptedStore([{ rows: [] }]);

    await store.listOpenIntervals({
      zoomMeetingUuid: OCCURRENCE,
      participantUuid: null,
      identityToken: 'ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
    });

    const [request] = requests;
    expect(request.url.pathname).toBe('/rest/v1/zoom_attendance');
    expect(request.url.searchParams.get('identity_tokens')).toBe(
      'cs.{ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1}'
    );
    expect(request.url.searchParams.get('zoom_meeting_uuid')).toBe(`eq.${OCCURRENCE}`);
    expect(request.url.searchParams.get('left_at')).toBe('is.null');

    // THE REGRESSION, both generations of it. An `or=(...)` widens the match (first
    // FAIL); an `identity_token` equality filter is the single-primary-token model the
    // re-review refuted; and a raw identity-column filter is neither.
    expect(request.url.searchParams.get('or')).toBeNull();
    expect(request.url.searchParams.get('identity_token')).toBeNull();
    expect(request.url.searchParams.get('display_name')).toBeNull();
    expect(request.url.searchParams.get('customer_key')).toBeNull();
    expect(request.url.searchParams.get('transient_email')).toBeNull();
  });

  it('prefers participant_uuid, and then does not also filter on the token', async () => {
    const { store, requests } = interceptedStore([{ rows: [] }]);

    await store.listOpenIntervals({
      zoomMeetingUuid: OCCURRENCE,
      participantUuid: '364B3A17-05C0-6B63-F4FA-2180DCC26971',
      identityToken: 'ck:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
    });

    const [request] = requests;
    expect(request.url.searchParams.get('participant_uuid')).toBe(
      'eq.364B3A17-05C0-6B63-F4FA-2180DCC26971'
    );
    expect(request.url.searchParams.get('identity_tokens')).toBeNull();
    expect(request.url.searchParams.get('or')).toBeNull();
  });

  it('issues NO query at all when the participant is unpairable', async () => {
    // No uuid and no token: there is nothing to match on, and a query with a missing
    // filter would return every open interval of the occurrence.
    const { store, requests } = interceptedStore([{ rows: [] }]);

    const open = await store.listOpenIntervals({
      zoomMeetingUuid: OCCURRENCE,
      participantUuid: null,
      identityToken: null,
    });

    expect(open).toEqual([]);
    expect(requests).toHaveLength(0);
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

describe('closeInterval · the left_at IS NULL guard is on the wire', () => {
  it('sends the guard so a replayed leave matches zero rows in Postgres', async () => {
    const { store, requests } = interceptedStore([{ rows: [{ id: 'row-1' }] }]);

    await expect(store.closeInterval('row-1', '2026-07-30T00:05:00.000Z')).resolves.toBe(true);

    const [request] = requests;
    expect(request.method).toBe('PATCH');
    expect(request.url.searchParams.get('id')).toBe('eq.row-1');
    expect(request.url.searchParams.get('left_at')).toBe('is.null');
    expect(request.body).toMatchObject({ left_at: '2026-07-30T00:05:00.000Z' });
  });

  it('reports zero matched rows as false rather than as success', async () => {
    const { store } = interceptedStore([{ rows: [] }]);
    await expect(store.closeInterval('row-1', '2026-07-30T00:05:00.000Z')).resolves.toBe(false);
  });
});

describe('surface resolution reads zoom_internal and writes nothing ([R2]/[B8])', () => {
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
