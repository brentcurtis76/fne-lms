// @vitest-environment node
/**
 * The PRODUCTION provision store — `createSupabaseMeetingProvisionStore` itself, and the
 * atomic recovery/adoption RPC wiring (Sol R5).
 *
 * ## Why this file exists
 *
 * The compare-and-set predicates now live in SQL so they cannot be asserted as a
 * PostgREST UPDATE chain. This suite pins the RPC name and every argument the production
 * store sends; pgTAP 002 owns the predicates, exactly-one semantics, atomic projection,
 * miss behavior and backward guard.
 *
 * ## How it is tested without a database
 *
 * Real `supabase-js`, real `defaultMeetingProvisionStore`, real `.schema('zoom_internal')`
 * over an intercepted fetch. Every identifier is synthetic.
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
 * One canned PostgREST reply per call, in order; the last one repeats.
 */
function interceptedStore(replies: Array<{ status?: number; body?: unknown }>) {
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
    if (reply.body === undefined) return new Response(null, { status: reply.status ?? 204 });
    return new Response(JSON.stringify(reply.body), {
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

describe('createSupabaseMeetingProvisionStore · atomic provision RPC wiring (Sol R5)', () => {
  it('calls recover_provisioned_meeting with the complete recovery payload', async () => {
    const { store, requests } = interceptedStore([{ body: true }]);

    const applied = await store.recoverProvisionedMeeting(MEETING_ID, {
      ...RECOVERY_PATCH,
      growth_community_id: '44444444-4444-4444-8444-444444444444',
    });

    expect(applied).toBe(true);

    const [request] = requests;
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/rest/v1/rpc/recover_provisioned_meeting');
    // The internal schema, on the header PostgREST reads it from — the recovery row does
    // not live in `public`.
    expect(request.headers.get('content-profile')).toBe('zoom_internal');

    expect(request.body).toEqual({
      p_meeting_id: MEETING_ID,
      p_zoom_meeting_number: MEETING_NUMBER,
      p_passcode: 'rec0very77',
      p_join_url: 'https://example-synthetic.test/j/82000000123',
      p_effective_settings: { auto_recording: 'none' },
      p_growth_community_id: '44444444-4444-4444-8444-444444444444',
    });
  });

  it('maps the recovery RPC boolean miss without inventing a write outcome', async () => {
    const { store } = interceptedStore([{ body: false }]);

    await expect(
      store.recoverProvisionedMeeting(MEETING_ID, {
        ...RECOVERY_PATCH,
        growth_community_id: null,
      })
    ).resolves.toBe(false);
  });

  it('surfaces a recovery RPC error as a throw, never as a quiet miss', async () => {
    const { store } = interceptedStore([
      { status: 400, body: { message: 'synthetic postgrest failure' } },
    ]);

    await expect(
      store.recoverProvisionedMeeting(MEETING_ID, {
        ...RECOVERY_PATCH,
        growth_community_id: null,
      })
    ).rejects.toThrow(/recover_provisioned_meeting failed/);
  });

  it('calls adopt_checkpoint_meeting with the checkpoint and projection context', async () => {
    const { store, requests } = interceptedStore([{ body: true }]);

    await expect(
      store.adoptCheckpointMeeting(MEETING_ID, {
        ...RECOVERY_PATCH,
        growth_community_id: null,
      })
    ).resolves.toBe(true);

    expect(requests[0].url.pathname).toBe('/rest/v1/rpc/adopt_checkpoint_meeting');
    expect(requests[0].headers.get('content-profile')).toBe('zoom_internal');
    expect(requests[0].body).toEqual({
      p_meeting_id: MEETING_ID,
      p_zoom_meeting_number: MEETING_NUMBER,
      p_passcode: 'rec0very77',
      p_join_url: 'https://example-synthetic.test/j/82000000123',
      p_effective_settings: { auto_recording: 'none' },
      p_growth_community_id: null,
    });
  });

  it('leaves markProvisioned UNGUARDED for the fresh-create path', async () => {
    // The contract deliberately did not change: the fresh-create path writes the row it
    // just reserved after checkpointing the provider response.
    const { store, requests } = interceptedStore([{ status: 204 }]);

    await store.markProvisioned(MEETING_ID, RECOVERY_PATCH);

    const [request] = requests;
    expect(request.url.searchParams.get('id')).toBe(`eq.${MEETING_ID}`);
    expect(request.url.searchParams.get('status')).toBeNull();
    expect(request.url.searchParams.get('zoom_meeting_number')).toBeNull();
  });
});
