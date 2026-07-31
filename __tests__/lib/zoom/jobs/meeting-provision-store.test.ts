// @vitest-environment node
/**
 * The PRODUCTION provision store — `createSupabaseMeetingProvisionStore` itself, and the
 * one write in it whose correctness lives in a `WHERE` clause (Sol R4).
 *
 * ## Why this file exists
 *
 * Sol R4 moved the operator-recovery write's state rule OUT of process and INTO the
 * UPDATE's own filters, exactly as F1 did for the webhook lifecycle — so a recovery and a
 * `meeting.started` webhook racing on the same row cannot both win. That has the same
 * consequence Sol R2 ③ named for the webhook store: the guard is no longer in any
 * TypeScript the handler suite executes. `provisionHarness` re-implements the rule, so it
 * agrees with production by construction and would keep agreeing if the real store
 * stopped sending the filters at all — and a dropped `.eq('status', 'pending')` is a
 * silent, total loss of the guarantee that every other suite would stay green through.
 *
 * ## How it is tested without a database
 *
 * Real `supabase-js`, real `defaultMeetingProvisionStore`, real `.schema('zoom_internal')`
 * — over an intercepted `fetch`, the pattern `webhook-store.test.ts` established. The
 * interceptor answers like PostgREST and records every request, so the filters can be read
 * off the wire exactly as Postgres would receive them.
 *
 * This proves the store SENDS the guard. It cannot prove Postgres honours it — that is
 * what `supabase/tests/` is for. Every identifier is synthetic.
 */
import { describe, it, expect, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  defaultMeetingProvisionStore,
  type ProvisionedMeetingPatch,
} from '../../../../lib/zoom/jobs/meeting-provision';

const SUPABASE_URL = 'https://synthetic-project.supabase.test';
const SERVICE_KEY = 'sb_secret_synthetic_service_role_key';
const MEETING_ID = '55555555-5555-4555-8555-555555555555';
const MEETING_NUMBER = 82000000123;

/** What the read-back yielded — the whole resolution, written in ONE update. */
const RECOVERY_PATCH: ProvisionedMeetingPatch = {
  zoom_meeting_number: MEETING_NUMBER,
  passcode: 'rec0very77',
  join_url: 'https://example-synthetic.test/j/82000000123',
  effective_settings: { auto_recording: 'none' },
  status: 'provisioned',
};

interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

/**
 * One canned PostgREST reply per call, in order; the last one repeats. `rows` becomes the
 * JSON array a `RETURNING` produces, and `[]` is how PostgREST reports "the WHERE matched
 * nothing" — which is exactly the refusal this guard produces.
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

  // The production wiring, not a hand-rolled equivalent: `defaultMeetingProvisionStore` is
  // where the `zoom_internal` addressing comes from.
  const client: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    global: { fetch: fetchImpl },
  });
  const store = defaultMeetingProvisionStore({} as NodeJS.ProcessEnv, () => client);

  return { store, requests };
}

describe('createSupabaseMeetingProvisionStore · the recovery CAS is on the wire (Sol R4)', () => {
  it('sends id + status + number as the guard, and reports the applied row', async () => {
    const { store, requests } = interceptedStore([{ rows: [{ id: MEETING_ID }] }]);

    const applied = await store.markRecoveredProvisioned(MEETING_ID, RECOVERY_PATCH);

    expect(applied).toBe(true);

    const [request] = requests;
    expect(request.method).toBe('PATCH');
    expect(request.url.pathname).toBe('/rest/v1/zoom_meetings');
    // The internal schema, on the header PostgREST reads it from — the recovery row does
    // not live in `public`.
    expect(request.headers.get('content-profile')).toBe('zoom_internal');

    // The three filters ARE the compare-and-set. Pinned literally: this is the assertion
    // the whole file exists for.
    expect(request.url.searchParams.get('id')).toBe(`eq.${MEETING_ID}`);
    expect(request.url.searchParams.get('status')).toBe('eq.pending');
    expect(request.url.searchParams.get('zoom_meeting_number')).toBe(`eq.${MEETING_NUMBER}`);
    // ...and the `.select()` is what makes the outcome observable at all.
    expect(request.url.searchParams.get('select')).toBe('id');

    // The full resolution in ONE write, `last_error` cleared with it: the park marker
    // must not outlive the row it parks.
    expect(request.body).toMatchObject({
      zoom_meeting_number: MEETING_NUMBER,
      passcode: 'rec0very77',
      join_url: 'https://example-synthetic.test/j/82000000123',
      effective_settings: { auto_recording: 'none' },
      status: 'provisioned',
      last_error: null,
    });
  });

  it('reports a MISS as false — zero rows is a refusal, not an error', async () => {
    // What Postgres answers when a webhook advanced the row to `started` while the
    // read-back was in flight: the WHERE matches nothing and nothing is written.
    const { store } = interceptedStore([{ rows: [] }]);

    await expect(store.markRecoveredProvisioned(MEETING_ID, RECOVERY_PATCH)).resolves.toBe(false);
  });

  it('surfaces a genuine PostgREST error as a throw, never as a quiet miss', async () => {
    const { store } = interceptedStore([
      { status: 400, rows: [{ message: 'synthetic postgrest failure' }] },
    ]);

    await expect(store.markRecoveredProvisioned(MEETING_ID, RECOVERY_PATCH)).rejects.toThrow(
      /recovery write failed/
    );
  });

  it('leaves markProvisioned UNGUARDED — the create and adopt paths own their rows', async () => {
    // The contract R4 deliberately did not change. Narrowing this one would make the
    // create path fail closed on a row it is the sole author of.
    const { store, requests } = interceptedStore([{ status: 204 }]);

    await store.markProvisioned(MEETING_ID, RECOVERY_PATCH);

    const [request] = requests;
    expect(request.url.searchParams.get('id')).toBe(`eq.${MEETING_ID}`);
    expect(request.url.searchParams.get('status')).toBeNull();
    expect(request.url.searchParams.get('zoom_meeting_number')).toBeNull();
  });
});
