// @vitest-environment node
/**
 * The `ZoomApi` seam: the in-memory fake's trap fidelity, and the live adapter's
 * wire shapes.
 *
 * The fake's whole justification is that it is wrong in the same places Zoom is. If
 * these tests ever get "simplified" into asserting that settings round-trip cleanly
 * and UUIDs are stable, downstream Z1b-3/Z2 tests become green in ways production is
 * not, which is worse than having no fake at all.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createZoomFake, type ZoomFake } from '../../../lib/zoom/fake';
import {
  createLiveZoomApi,
  findUnusableCreateFields,
  getZoomApi,
  isLicensedHost,
  mapMeeting,
  resetZoomApiForTests,
  resolveZoomMode,
  type ZoomUser,
} from '../../../lib/zoom/api';
import { createZoomClient } from '../../../lib/zoom/client';
import {
  isZoomError,
  ZoomConfigError,
  ZoomNonRetryableError,
  ZoomUnusableSuccessError,
  type ZoomError,
} from '../../../lib/zoom/errors';
import type { ZoomTokenProvider } from '../../../lib/zoom/token';

const HOST = 'host-licensed-1';
const BASIC_HOST = 'host-basic-1';

const LICENSED: ZoomUser = {
  id: HOST,
  email: 'facilitador@example-synthetic.test',
  firstName: 'Facilitador',
  lastName: 'Sintético',
  licenseType: 2,
  status: 'active',
};
const BASIC: ZoomUser = {
  id: BASIC_HOST,
  email: 'basico@example-synthetic.test',
  firstName: 'Básico',
  lastName: 'Sintético',
  licenseType: 1,
  status: 'active',
};

function provisionInput(overrides: Record<string, unknown> = {}) {
  return {
    hostZoomUserId: HOST,
    topic: 'Sesión de acompañamiento',
    startTime: '2026-08-05T15:00:00',
    durationMinutes: 90,
    timezone: 'America/Santiago',
    ...overrides,
  };
}

describe('fake — trap 1: the meeting UUID rotates per occurrence', () => {
  let zoom: ZoomFake;
  beforeEach(() => {
    zoom = createZoomFake();
  });

  it('mints a different uuid when the meeting starts', async () => {
    const created = await zoom.createMeeting(provisionInput());
    const { occurrenceUuid, previousUuid } = zoom.startOccurrence(created.id);

    expect(previousUuid).toBe(created.uuidAtRead);
    expect(occurrenceUuid).not.toBe(created.uuidAtRead);
  });

  it('reports the NEW uuid on every read after the start', async () => {
    const created = await zoom.createMeeting(provisionInput());
    const { occurrenceUuid } = zoom.startOccurrence(created.id);

    // A consumer that persisted the create-time uuid as the occurrence key is now
    // holding a value that points at nothing.
    expect((await zoom.getMeeting(created.id)).uuidAtRead).toBe(occurrenceUuid);
    expect((await zoom.getMeeting(created.id)).uuidAtRead).not.toBe(created.uuidAtRead);
  });

  it('mints a distinct uuid for EACH occurrence of a recurring meeting', async () => {
    const created = await zoom.createMeeting(provisionInput());
    const first = zoom.startOccurrence(created.id);
    zoom.endOccurrence(created.id);
    const second = zoom.startOccurrence(created.id);

    expect(new Set([created.uuidAtRead, first.occurrenceUuid, second.occurrenceUuid]).size).toBe(3);
  });

  it('keeps the meeting NUMBER stable — that is the key that survives', async () => {
    const created = await zoom.createMeeting(provisionInput());
    zoom.startOccurrence(created.id);
    expect((await zoom.getMeeting(created.id)).id).toBe(created.id);
  });

  it('mints uuids carrying + and /, preserving the double-encoding exemplar', async () => {
    const created = await zoom.createMeeting(provisionInput());
    expect(created.uuidAtRead).toContain('+');
    expect(created.uuidAtRead).toContain('/');
  });
});

describe('fake — trap 2: settings PATCH answers 204 and coerces silently', () => {
  let zoom: ZoomFake;
  beforeEach(() => {
    zoom = createZoomFake();
    zoom.setUsers([LICENSED, BASIC]);
  });

  it('always reports patchStatus 204 with the read-back as the real answer', async () => {
    const created = await zoom.createMeeting(provisionInput());
    const result = await zoom.patchMeetingSettings(created.id, { auto_recording: 'cloud' });

    expect(result.patchStatus).toBe(204);
    expect(result.effective.settings?.auto_recording).toBe('cloud');
    expect(result.matches).toBe(true);
  });

  it('coerces an unrecognised auto_recording to none, and the drift shows it', async () => {
    const created = await zoom.createMeeting(provisionInput());
    const result = await zoom.patchMeetingSettings(created.id, {
      auto_recording: 'clod' as unknown as 'cloud',
    });

    // 204 either way — the status code learned the caller nothing.
    expect(result.patchStatus).toBe(204);
    expect(result.matches).toBe(false);
    expect(result.drift).toEqual([{ key: 'auto_recording', requested: 'clod', effective: 'none' }]);
    expect((await zoom.getMeetingSettings(created.id)).auto_recording).toBe('none');
  });

  it('coerces in the FAIL-SAFE direction — a typo can only turn recording off', async () => {
    const created = await zoom.createMeeting(provisionInput());
    await zoom.patchMeetingSettings(created.id, { auto_recording: 'cloud' });
    expect((await zoom.getMeetingSettings(created.id)).auto_recording).toBe('cloud');

    await zoom.patchMeetingSettings(created.id, { auto_recording: 'CLOUD' as unknown as 'cloud' });
    expect((await zoom.getMeetingSettings(created.id)).auto_recording).toBe('none');
  });

  it('treats an empty settings PATCH as a true no-op, not a clear', async () => {
    const created = await zoom.createMeeting(provisionInput());
    await zoom.patchMeetingSettings(created.id, { auto_recording: 'cloud' });

    await zoom.patchMeetingSettings(created.id, {});
    expect((await zoom.getMeetingSettings(created.id)).auto_recording).toBe('cloud');
  });

  it('leaves unrelated settings alone on a partial PATCH', async () => {
    const created = await zoom.createMeeting(provisionInput());
    await zoom.patchMeetingSettings(created.id, { auto_recording: 'cloud' });
    await zoom.patchMeetingSettings(created.id, { mute_upon_entry: true });

    const settings = await zoom.getMeetingSettings(created.id);
    expect(settings.auto_recording).toBe('cloud');
    expect(settings.mute_upon_entry).toBe(true);
  });

  it('never keys drift on recording_disclaimer (ledger §9.4)', async () => {
    const created = await zoom.createMeeting(provisionInput());
    const result = await zoom.patchMeetingSettings(created.id, {
      recording_disclaimer: true,
      auto_recording: 'none',
    });

    expect(result.drift).toEqual([]);
    expect(result.unverifiable).toEqual(['recording_disclaimer']);
  });
});

describe('fake — trap 3: create responses reflect EFFECTIVE settings', () => {
  let zoom: ZoomFake;
  beforeEach(() => {
    zoom = createZoomFake();
    zoom.setUsers([LICENSED, BASIC]);
  });

  it('provisions with auto_recording none by default (plan §8)', async () => {
    const created = await zoom.createMeeting(provisionInput());
    expect(created.settings.auto_recording).toBe('none');
    expect(created.settings.join_before_host).toBe(false);
    expect(created.settings.waiting_room).toBe(false);
  });

  it('reports none when cloud recording was asked for on a Basic host', async () => {
    // §9: cloud recording requires a Licensed host, and §20 records that Zoom
    // reflects the effective value in the create response on a capability mismatch.
    const created = await zoom.createMeeting(
      provisionInput({ hostZoomUserId: BASIC_HOST, settings: { auto_recording: 'cloud' } })
    );

    expect(created.settings.auto_recording).toBe('none');
  });

  it('honours cloud recording on a Licensed host', async () => {
    const created = await zoom.createMeeting(provisionInput({ settings: { auto_recording: 'cloud' } }));
    expect(created.settings.auto_recording).toBe('cloud');
  });

  it('reports none for an unrecognised value at create time too', async () => {
    const created = await zoom.createMeeting(provisionInput({ settings: { auto_recording: 'nube' } }));
    expect(created.settings.auto_recording).toBe('none');
  });
});

describe('fake — ordinary lifecycle', () => {
  let zoom: ZoomFake;
  beforeEach(() => {
    zoom = createZoomFake();
  });

  it('throws a 404-class error for an unknown meeting', async () => {
    await expect(zoom.getMeeting(82000000001)).rejects.toBeInstanceOf(ZoomNonRetryableError);
    await expect(zoom.getMeeting(82000000001)).rejects.toMatchObject({ status: 404, kind: 'non_retryable' });
  });

  it('makes a deleted meeting unreadable', async () => {
    const created = await zoom.createMeeting(provisionInput());
    await zoom.deleteMeeting(created.id);

    await expect(zoom.getMeeting(created.id)).rejects.toBeInstanceOf(ZoomNonRetryableError);
    expect(zoom.listMeetings()).toEqual([]);
  });

  it('applies a reschedule PATCH', async () => {
    const created = await zoom.createMeeting(provisionInput());
    await zoom.patchMeeting(created.id, { startTime: '2026-08-12T16:30:00', durationMinutes: 60 });

    const read = await zoom.getMeeting(created.id);
    expect(read.startTime).toBe('2026-08-12T16:30:00');
    expect(read.durationMinutes).toBe(60);
    // The zone is a §10 invariant and must survive a reschedule untouched.
    expect(read.timezone).toBe('America/Santiago');
  });

  it('lists only active users for host_sync', async () => {
    zoom.setUsers([LICENSED, BASIC, { ...LICENSED, id: 'gone', status: 'inactive' }]);
    const { users } = await zoom.listUsers();

    expect(users.map((user) => user.id)).toEqual([HOST, BASIC_HOST]);
    expect(users.filter(isLicensedHost).map((user) => user.id)).toEqual([HOST]);
  });

  it('reset clears meetings and users', async () => {
    await zoom.createMeeting(provisionInput());
    zoom.setUsers([LICENSED]);
    zoom.reset();

    expect(zoom.listMeetings()).toEqual([]);
    expect((await zoom.listUsers()).users).toEqual([]);
  });

  it('never puts the passcode in the join URL', async () => {
    // §5 keeps embed_password_in_join_link off; the SDK path carries the plaintext
    // passcode inside the authorized join payload instead.
    const created = await zoom.createMeeting(provisionInput({ passcode: '246813' }));
    expect(created.joinUrl).not.toContain('246813');
    expect(created.passcode).toBe('246813');
  });
});

// ---------------------------------------------------------------------------
// Live adapter — wire shapes
// ---------------------------------------------------------------------------

function liveApi(replies: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  let index = 0;
  const tokens: ZoomTokenProvider = {
    async getToken() {
      return 'token-1';
    },
    async forceRefresh() {
      return 'token-2';
    },
  };
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: reply.headers,
    });
  }) as unknown as typeof fetch;

  const client = createZoomClient({ tokenProvider: tokens, fetchImpl, sleep: async () => {} });
  return { api: createLiveZoomApi(client), calls };
}

const RAW_MEETING = {
  id: 82000000042,
  uuid: 'Fk+SyntheticUuid/0001==',
  host_id: HOST,
  topic: 'Sesión de acompañamiento',
  start_time: '2026-08-05T15:00:00',
  duration: 90,
  timezone: 'America/Santiago',
  join_url: 'https://example-synthetic.test/j/82000000042',
  password: '246813',
  settings: { auto_recording: 'none', join_before_host: false },
};

describe('live adapter — wire shapes', () => {
  it('creates under the host with the Chile wall-clock and its zone', async () => {
    const { api, calls } = liveApi([{ status: 201, body: RAW_MEETING }]);
    await api.createMeeting(provisionInput());

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(`https://api.zoom.us/v2/users/${HOST}/meetings`);
    expect(calls[0].body).toMatchObject({
      type: 2,
      start_time: '2026-08-05T15:00:00',
      duration: 90,
      timezone: 'America/Santiago',
    });
  });

  it('URL-encodes an email host id in the path segment', async () => {
    const { api, calls } = liveApi([{ status: 201, body: RAW_MEETING }]);
    await api.createMeeting(provisionInput({ hostZoomUserId: 'facilitador@example-synthetic.test' }));

    expect(calls[0].url).toContain('facilitador%40example-synthetic.test');
  });

  it('maps uuid onto uuidAtRead, never onto anything key-shaped', async () => {
    const { api } = liveApi([{ status: 200, body: RAW_MEETING }]);
    const meeting = await api.getMeeting(82000000042);

    expect(meeting.uuidAtRead).toBe('Fk+SyntheticUuid/0001==');
    expect(meeting.id).toBe(82000000042);
    expect(Object.keys(meeting)).not.toContain('uuid');
  });

  it('mapMeeting tolerates a meeting with no settings and no password', async () => {
    const mapped = mapMeeting({ ...RAW_MEETING, settings: undefined, password: undefined });
    expect(mapped.settings).toEqual({});
    expect(mapped.passcode).toBe('');
  });

  it('patches settings on the meeting endpoint and reads them back off the meeting', async () => {
    // There is no /meetings/{id}/settings endpoint — spike-verified.
    const { api, calls } = liveApi([
      { status: 204 },
      { status: 200, body: { ...RAW_MEETING, settings: { auto_recording: 'none' } } },
    ]);

    const result = await api.patchMeetingSettings(82000000042, { auto_recording: 'cloud' });

    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toBe('https://api.zoom.us/v2/meetings/82000000042');
    expect(calls[0].body).toEqual({ settings: { auto_recording: 'cloud' } });
    expect(calls[1].method).toBe('GET');
    expect(calls[1].url).toBe('https://api.zoom.us/v2/meetings/82000000042');

    // The coercion the spike measured, caught by the read-back.
    expect(result.patchStatus).toBe(204);
    expect(result.drift).toEqual([{ key: 'auto_recording', requested: 'cloud', effective: 'none' }]);
  });

  it('compares only the keys that were sent, not Zoom’s whole settings object', async () => {
    // Zoom returns dozens of settings nobody asked for; diffing the object wholesale
    // would report drift on every single call.
    const { api } = liveApi([
      { status: 204 },
      {
        status: 200,
        body: {
          ...RAW_MEETING,
          settings: { auto_recording: 'cloud', host_video: true, participant_video: false, watermark: false },
        },
      },
    ]);

    const result = await api.patchMeetingSettings(82000000042, { auto_recording: 'cloud' });
    expect(result.matches).toBe(true);
    expect(result.drift).toEqual([]);
  });

  it('maps users and normalises an empty next_page_token to undefined', async () => {
    const { api, calls } = liveApi([
      {
        status: 200,
        body: {
          users: [
            { id: HOST, email: LICENSED.email, first_name: 'F', last_name: 'S', type: 2, status: 'active' },
            { id: BASIC_HOST, email: BASIC.email, type: 1, status: 'active' },
          ],
          next_page_token: '',
        },
      },
    ]);

    const result = await api.listUsers();
    expect(new URL(calls[0].url).searchParams.get('status')).toBe('active');
    expect(result.nextPageToken).toBeUndefined();
    expect(result.users.map((user) => user.licenseType)).toEqual([2, 1]);
    expect(result.users.filter(isLicensedHost)).toHaveLength(1);
  });

  it('deletes through the meeting endpoint', async () => {
    const { api, calls } = liveApi([{ status: 204 }]);
    await api.deleteMeeting(82000000042);
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://api.zoom.us/v2/meetings/82000000042' });
  });
});

// ---------------------------------------------------------------------------
// Sol R2 ① — a 2xx this integration cannot use is AMBIGUOUS, never a success
// ---------------------------------------------------------------------------

/**
 * The regression Sol reproduced: `201 {}` is valid JSON, so it never reached the
 * empty-body guard, and `mapMeeting`'s cast is unchecked — the adapter returned a
 * "meeting" whose `id` and `joinUrl` were `undefined`, which `meeting_provision` then
 * persisted as a `provisioned` row with no meeting number.
 *
 * The bar these tests hold is not "it throws" — a definite rejection also throws, and
 * that one RELEASES the reservation and retries. It is that the throw carries
 * `outcome: 'ambiguous'`, because Zoom answered 2xx and may well have created a
 * meeting we cannot name.
 */
const REQUEST_ID_HEADER = { 'x-zm-request-id': 'synthetic-zm-request-id-0042' };

describe('live adapter — unusable 2xx create responses (Sol R2 ①)', () => {
  const unusableBodies: Array<[string, unknown]> = [
    ['an empty object', {}],
    ['a body with no id', { join_url: 'https://example-synthetic.test/j/1', uuid: 'u' }],
    ['a body with no join_url', { id: 82000000042, uuid: 'u' }],
    ['an empty join_url', { id: 82000000042, join_url: '   ' }],
    ['a string id', { id: '82000000042', join_url: 'https://example-synthetic.test/j/1' }],
    ['a non-integer id', { id: 8.2e10 + 0.5, join_url: 'https://example-synthetic.test/j/1' }],
    ['a zero id', { id: 0, join_url: 'https://example-synthetic.test/j/1' }],
    ['a mistyped password', { id: 82000000042, join_url: 'https://x.test/j/1', password: 246813 }],
    ['mistyped settings', { id: 82000000042, join_url: 'https://x.test/j/1', settings: [] }],
    ['an error envelope', { code: 3001, message: 'Meeting host does not exist' }],
    ['a JSON array', []],
    // Sol R3 ②: the fields provisioning ALWAYS sends. Absence used to coerce through
    // `mapMeeting` into an empty passcode and a settings object whose missing
    // `auto_recording` reads, at §9.4, as a clean 'none'.
    [
      'an omitted password',
      { id: 82000000042, join_url: 'https://x.test/j/1', settings: { auto_recording: 'none' } },
    ],
    [
      'a blank password',
      {
        id: 82000000042,
        join_url: 'https://x.test/j/1',
        password: '   ',
        settings: { auto_recording: 'none' },
      },
    ],
    ['omitted settings', { id: 82000000042, join_url: 'https://x.test/j/1', password: '246813' }],
    [
      'settings with no auto_recording',
      { id: 82000000042, join_url: 'https://x.test/j/1', password: '246813', settings: {} },
    ],
    [
      'a non-string auto_recording',
      {
        id: 82000000042,
        join_url: 'https://x.test/j/1',
        password: '246813',
        settings: { auto_recording: true },
      },
    ],
  ];

  it.each(unusableBodies)('rejects %s with an AMBIGUOUS outcome', async (_label, body) => {
    const { api } = liveApi([{ status: 201, body, headers: REQUEST_ID_HEADER }]);

    const error = await api.createMeeting(provisionInput()).catch((caught) => caught);

    expect(isZoomError(error)).toBe(true);
    // The whole point. `not_executed` here is what lets a retry create a second meeting.
    expect((error as ZoomError).outcome).toBe('ambiguous');
    expect(error).toBeInstanceOf(ZoomUnusableSuccessError);
    // status + requestId survive: the request id is the ONLY identifier an ambiguous
    // create ever yields, and a support ticket is the reconciliation path.
    expect((error as ZoomError).status).toBe(201);
    expect((error as ZoomError).requestId).toBe('synthetic-zm-request-id-0042');
  });

  it('names the offending fields without echoing their values', async () => {
    const { api } = liveApi([{ status: 201, body: {}, headers: REQUEST_ID_HEADER }]);
    const error = (await api.createMeeting(provisionInput()).catch((caught) => caught)) as Error;

    expect(error.message).toContain('id is not a positive integer meeting number');
    expect(error.message).toContain('join_url is missing or empty');
  });

  it('an EMPTY 2xx body is the same outcome, and no longer a "config" error', async () => {
    // Uniformity across all three unusable-2xx paths — empty, schema-invalid, and the
    // unparseable one `client.ts` raises. The empty-body throw was a ZoomConfigError,
    // which reached the ambiguous branch correctly but named the wrong cause: nothing
    // about Zoom answering 201 with no body is a misconfiguration of this deployment.
    const { api } = liveApi([{ status: 201, headers: REQUEST_ID_HEADER }]);
    const error = await api.createMeeting(provisionInput()).catch((caught) => caught);

    expect((error as ZoomError).outcome).toBe('ambiguous');
    expect(error).toBeInstanceOf(ZoomUnusableSuccessError);
    expect(error).not.toBeInstanceOf(ZoomConfigError);
    expect((error as ZoomError).status).toBe(201);
    expect((error as ZoomError).requestId).toBe('synthetic-zm-request-id-0042');
  });

  it('an UNPARSEABLE 2xx body already carries the same outcome (client layer)', async () => {
    // Not a new fix — asserted here so the three paths are pinned as one class in one
    // place. If a later change split them apart, this file says so.
    const tokens: ZoomTokenProvider = {
      async getToken() {
        return 'token-1';
      },
      async forceRefresh() {
        return 'token-2';
      },
    };
    const fetchImpl = vi.fn(
      async () => new Response('<html>gateway</html>', { status: 201, headers: REQUEST_ID_HEADER })
    ) as unknown as typeof fetch;
    const api = createLiveZoomApi(
      createZoomClient({ tokenProvider: tokens, fetchImpl, sleep: async () => {} })
    );

    const error = await api.createMeeting(provisionInput()).catch((caught) => caught);

    expect((error as ZoomError).outcome).toBe('ambiguous');
    expect((error as ZoomError).status).toBe(201);
    expect((error as ZoomError).requestId).toBe('synthetic-zm-request-id-0042');
  });

  it('NEVER lets an absent passcode or settings map to a usable meeting (Sol R3 ②)', async () => {
    // This test used to assert the opposite — that omitting `password`/`settings` was
    // merely `mapMeeting` exercising its `?? ''` / `?? {}` coercions on a good response.
    // It is not: `meeting_provision` sends both on every create, so a 2xx without them
    // is anomalous, and the coercion output is a joinable-looking meeting with an empty
    // passcode and a settings object whose silence §9.4 reads as 'none'.
    const { api } = liveApi([
      {
        status: 201,
        body: { ...RAW_MEETING, password: undefined, settings: undefined },
        headers: REQUEST_ID_HEADER,
      },
    ]);

    const error = (await api.createMeeting(provisionInput()).catch((caught) => caught)) as Error;

    expect(error).toBeInstanceOf(ZoomUnusableSuccessError);
    expect((error as unknown as ZoomError).outcome).toBe('ambiguous');
    expect(error.message).toContain('password is missing or not a non-empty string');
    expect(error.message).toContain('settings is missing or not an object');
  });

  it('names the missing auto_recording rather than reading its absence as none', () => {
    // The §9.4 trap in one assertion: `{}` is a settings OBJECT, so a shape-only check
    // passes it, and `readAutoRecording({})` then answers 'none' — a clean run reported
    // for a meeting Zoom never said anything about.
    expect(
      findUnusableCreateFields({
        id: 82000000042,
        join_url: 'https://x.test/j/1',
        password: '246813',
        settings: {},
      })
    ).toEqual(['settings.auto_recording is missing or not a string']);
  });

  it('does not reject over fields the provisioner never persists', () => {
    // `uuid`/`host_id`/`topic`/`start_time`/`duration`/`timezone` are deliberately
    // outside the checked set — see the `findUnusableCreateFields` header. Rejecting
    // here would strand a usable meeting behind a human-triage event.
    expect(
      findUnusableCreateFields({
        id: 82000000042,
        join_url: 'https://x.test/j/1',
        password: '246813',
        settings: { auto_recording: 'none' },
      })
    ).toEqual([]);
  });
});

describe('getZoomApi — the ZOOM_MODE switch (§14)', () => {
  const saved = process.env.ZOOM_MODE;
  beforeEach(() => {
    resetZoomApiForTests();
    // Restore by DELETING when absent: assigning `undefined` stores "undefined",
    // and vitest runs threads:false so a leak would poison later files.
    if (saved === undefined) delete process.env.ZOOM_MODE;
    else process.env.ZOOM_MODE = saved;
  });

  it.each([
    ['unset', undefined, 'live'],
    ['empty', '', 'live'],
    ['live', 'live', 'live'],
    ['mock', 'mock', 'mock'],
  ])('resolves %s to %s', (_label, value, expected) => {
    const env = (value === undefined ? {} : { ZOOM_MODE: value }) as NodeJS.ProcessEnv;
    expect(resolveZoomMode(env)).toBe(expected);
  });

  it('throws on an unrecognised value rather than defaulting to live', () => {
    // A typo must not silently become the mode that talks to the real account.
    for (const value of ['Mock', 'MOCK', 'fake', 'true']) {
      expect(() => resolveZoomMode({ ZOOM_MODE: value } as unknown as NodeJS.ProcessEnv)).toThrow(
        ZoomConfigError
      );
    }
  });

  it('returns a stateful singleton in mock mode', async () => {
    const api = getZoomApi({ ZOOM_MODE: 'mock' } as unknown as NodeJS.ProcessEnv);
    const created = await api.createMeeting(provisionInput());

    // A later job must see what an earlier one provisioned.
    const again = getZoomApi({ ZOOM_MODE: 'mock' } as unknown as NodeJS.ProcessEnv);
    expect(again).toBe(api);
    await expect(again.getMeeting(created.id)).resolves.toMatchObject({ id: created.id });
  });

  it('hands back the fake, traps and all', async () => {
    const api = getZoomApi({ ZOOM_MODE: 'mock' } as unknown as NodeJS.ProcessEnv);
    const created = await api.createMeeting(provisionInput({ settings: { auto_recording: 'nube' } }));
    expect(created.settings.auto_recording).toBe('none');
  });
});
