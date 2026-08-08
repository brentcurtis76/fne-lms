// @vitest-environment node
/**
 * The PRODUCTION delete store — `createSupabaseMeetingDeleteStore`'s
 * `findLiveProvisionJob`, the one read Sol S1 (r27) added.
 *
 * ## Why this file exists
 *
 * The handler suite drives that seam through the in-memory harness, which proves the
 * DECISION (defer vs dead-letter) and nothing about the query underneath it. A filter
 * that named the wrong column, matched only half the surface identity, or included a
 * terminal status would satisfy every one of those tests and still defer a genuine
 * anomaly in production. So the query itself is pinned here.
 *
 * ## How it is tested without a database
 *
 * Real `supabase-js`, real `defaultMeetingDeleteStore`, real `.schema('zoom_internal')`
 * over an intercepted fetch — the same device as
 * `meeting-provision-store.test.ts`. Every identifier is synthetic.
 */
import { describe, it, expect, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { defaultMeetingDeleteStore } from '../../../../lib/zoom/jobs/meeting-delete';

const SUPABASE_URL = 'https://synthetic-project.supabase.test';
const SERVICE_KEY = 'sb_secret_synthetic_service_role_key';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
}

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
    });
    if (reply.body === undefined) return new Response(null, { status: reply.status ?? 204 });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  const client: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    global: { fetch: fetchImpl },
  });
  const store = defaultMeetingDeleteStore({} as NodeJS.ProcessEnv, () => client);

  return { store, requests };
}

describe('createSupabaseMeetingDeleteStore · findLiveProvisionJob (Sol S1)', () => {
  it('asks zoom_jobs for a non-terminal meeting_provision job on exactly this surface', async () => {
    const { store, requests } = interceptedStore([
      { body: { id: 'job-provision-9', status: 'leased' } },
    ]);

    await expect(store.findLiveProvisionJob('consultor_session', SESSION_ID)).resolves.toEqual({
      id: 'job-provision-9',
      status: 'leased',
    });

    const [request] = requests;
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/rest/v1/zoom_jobs');
    // The queue lives in the internal schema, not `public`.
    expect(request.headers.get('accept-profile')).toBe('zoom_internal');

    expect(request.url.searchParams.get('select')).toBe('id,status');
    expect(request.url.searchParams.get('job_type')).toBe('eq.meeting_provision');
    expect(request.url.searchParams.get('limit')).toBe('1');

    // The payload is matched WHOLE — a `surface_id` filter alone would match a delete
    // enqueued for a different surface type once Z6 adds community surfaces.
    expect(request.url.searchParams.get('payload')).toBe(
      `cs.${JSON.stringify({ surface_type: 'consultor_session', surface_id: SESSION_ID })}`
    );

    // Only the statuses a job can still run from. `done`, `failed` and `dead` are
    // terminal, so they can no longer explain a missing zoom_meetings row.
    const statusFilter = request.url.searchParams.get('status');
    expect(statusFilter).toMatch(/^in\./);
    expect(statusFilter).toContain('pending');
    expect(statusFilter).toContain('leased');
    for (const terminal of ['done', 'failed', 'dead']) {
      expect(statusFilter).not.toContain(terminal);
    }
  });

  it('returns null when the queue holds no live provisioner for the surface', async () => {
    const { store } = interceptedStore([{ status: 200, body: null }]);

    await expect(store.findLiveProvisionJob('consultor_session', SESSION_ID)).resolves.toBeNull();
  });

  it('throws on a failed lookup rather than reporting "no provisioner"', async () => {
    // Not knowing is not the same as knowing there is none, and the benign branch must
    // never be reached by default — see the handler's module header.
    const { store } = interceptedStore([
      {
        status: 500,
        body: { message: 'connection reset by peer', code: '08006', details: null, hint: null },
      },
    ]);

    await expect(store.findLiveProvisionJob('consultor_session', SESSION_ID)).rejects.toThrow(
      /zoom_jobs provision lookup failed/
    );
  });
});
