// @vitest-environment node
/**
 * Authorization contract for `/api/meet/diag-signature` (Z0B-2r1, Sol R1 finding ⑤).
 *
 * The endpoint mints an FNE-signed Meeting SDK JWT. Before this round it gated on
 * SESSION PRESENCE alone with syntactic validation of the meeting number, and had no
 * handler tests at all — so "any authenticated account can mint a signature for any
 * syntactically valid meeting number in the account" was true and unasserted in both
 * directions.
 *
 * Every gate gets a test here, and the ORDER matters as much as the gates: an
 * unconfigured deployment must 404 before it reveals whether a caller is
 * authenticated, and the allowlist must be consulted after the role check so a
 * docente cannot use response codes to probe which meetings are listed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const { mockGetSession, mockGetUserPrimaryRole } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUserPrimaryRole: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({ auth: { getSession: mockGetSession } }),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserPrimaryRole: mockGetUserPrimaryRole,
}));

import handler from '../../../pages/api/meet/diag-signature';
import { diagMeetingAllowlist, isDiagJoinConfigured } from '../../../lib/meet/diag-config';

const ALLOWED_MEETING = '84830781209';
const UNLISTED_MEETING = '87239242778';

type Captured = { status: number; body: unknown; headers: Record<string, string> };

function makeRes(): { res: NextApiResponse; captured: Captured } {
  const captured: Captured = { status: 0, body: undefined, headers: {} };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
    setHeader(key: string, value: string) {
      captured.headers[key] = value;
    },
  } as unknown as NextApiResponse;
  return { res, captured };
}

function makeReq(body: unknown, method = 'POST'): NextApiRequest {
  return { method, body, headers: {}, cookies: {} } as unknown as NextApiRequest;
}

async function call(body: unknown, method = 'POST') {
  const { res, captured } = makeRes();
  await handler(makeReq(body, method), res);
  return captured;
}

/** A configured deployment: server SDK pair present, one meeting allowlisted. */
function configure() {
  process.env.ZOOM_SDK_CLIENT_ID = 'SdkClientIdInvented1';
  process.env.ZOOM_SDK_CLIENT_SECRET = 'SdkClientSecretInvented00001';
  process.env.ZOOM_DIAG_MEETING_IDS = ALLOWED_MEETING;
}

/**
 * Restores by DELETING when the key was absent, rather than assigning `undefined` —
 * `process.env.X = undefined` stores the string "undefined", and vitest runs with
 * `threads: false` so a leaked value would poison later files.
 */
const ENV_KEYS = ['ZOOM_SDK_CLIENT_ID', 'ZOOM_SDK_CLIENT_SECRET', 'ZOOM_DIAG_MEETING_IDS'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  configure();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  mockGetUserPrimaryRole.mockResolvedValue('consultor');
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key] as string;
  }
});

describe('POST /api/meet/diag-signature — configuration gate', () => {
  it('404s when the SDK client id is absent', async () => {
    delete process.env.ZOOM_SDK_CLIENT_ID;
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 404 });
  });

  it('404s when the SDK secret is absent', async () => {
    delete process.env.ZOOM_SDK_CLIENT_SECRET;
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 404 });
  });

  it('404s when the allowlist env var is absent — an unconfigured signer, not an open one', async () => {
    delete process.env.ZOOM_DIAG_MEETING_IDS;
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 404 });
  });

  it('404s when the allowlist is present but empty', async () => {
    process.env.ZOOM_DIAG_MEETING_IDS = '';
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 404 });
  });

  it('404s when every allowlist entry is malformed', async () => {
    // A typo must not widen the allowlist to "everything".
    process.env.ZOOM_DIAG_MEETING_IDS = 'abc, 12, ';
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 404 });
  });

  it('checks configuration BEFORE authentication, so it reveals nothing about the caller', async () => {
    delete process.env.ZOOM_DIAG_MEETING_IDS;
    mockGetSession.mockResolvedValue({ data: { session: null } });
    // An unconfigured deployment answers 404 to an anonymous caller, not 401.
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 404 });
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});

describe('POST /api/meet/diag-signature — authentication and role', () => {
  it('401s an unauthenticated caller', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await call({ meetingNumber: ALLOWED_MEETING });
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Unauthorized' });
    // Never reaches the role lookup.
    expect(mockGetUserPrimaryRole).not.toHaveBeenCalled();
  });

  it('403s a docente — the account class Fase 3 multiplies', async () => {
    mockGetUserPrimaryRole.mockResolvedValue('docente');
    const result = await call({ meetingNumber: ALLOWED_MEETING });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: 'Forbidden' });
  });

  it('403s every non-operator role in the 9-role system', async () => {
    const forbidden = [
      'equipo_directivo',
      'lider_generacion',
      'lider_comunidad',
      'supervisor_de_red',
      'community_manager',
      'docente',
      'encargado_licitacion',
    ];
    for (const role of forbidden) {
      mockGetUserPrimaryRole.mockResolvedValue(role);
      // eslint-disable-next-line no-await-in-loop
      const result = await call({ meetingNumber: ALLOWED_MEETING });
      expect(result.status, `role ${role} was allowed`).toBe(403);
    }
  });

  it('403s an account with no role at all (getUserPrimaryRole returns "")', async () => {
    mockGetUserPrimaryRole.mockResolvedValue('');
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 403 });
  });

  it('allows admin and consultor — the §17 field-protocol operators', async () => {
    for (const role of ['admin', 'consultor']) {
      mockGetUserPrimaryRole.mockResolvedValue(role);
      // eslint-disable-next-line no-await-in-loop
      const result = await call({ meetingNumber: ALLOWED_MEETING });
      expect(result.status, `role ${role} was refused`).toBe(200);
    }
  });

  it('checks role BEFORE the allowlist, so a docente cannot probe what is listed', async () => {
    mockGetUserPrimaryRole.mockResolvedValue('docente');
    const listed = await call({ meetingNumber: ALLOWED_MEETING });
    const unlisted = await call({ meetingNumber: UNLISTED_MEETING });
    // Identical responses: the docente learns nothing either way.
    expect(listed.status).toBe(403);
    expect(unlisted.status).toBe(403);
    expect(listed.body).toEqual(unlisted.body);
  });
});

describe('POST /api/meet/diag-signature — validation', () => {
  it('400s a missing meeting number', async () => {
    expect(await call({})).toMatchObject({ status: 400 });
  });

  it('400s a too-short and a too-long meeting number', async () => {
    expect(await call({ meetingNumber: '1234' })).toMatchObject({ status: 400 });
    expect(await call({ meetingNumber: '123456789012' })).toMatchObject({ status: 400 });
  });

  it('400s a non-scalar body value rather than coercing it into the allowlist check', async () => {
    // Found while writing these tests: `String(x)` invokes `toString()`, so a JSON
    // body of `{"meetingNumber": ["84830781209"]}` coerced to an allowlisted number
    // and got SIGNED. The handler now checks the type before coercing.
    expect(await call({ meetingNumber: [ALLOWED_MEETING] })).toMatchObject({ status: 400 });
    expect(await call({ meetingNumber: { toString: () => ALLOWED_MEETING } })).toMatchObject({
      status: 400,
    });
    expect(await call({ meetingNumber: null })).toMatchObject({ status: 400 });
    expect(await call({ meetingNumber: true })).toMatchObject({ status: 400 });
    expect(await call(undefined)).toMatchObject({ status: 400 });
  });

  it('accepts a numeric meetingNumber, since JSON permits one', async () => {
    expect(await call({ meetingNumber: Number(ALLOWED_MEETING) })).toMatchObject({ status: 200 });
  });

  it('405s a GET and advertises Allow: POST', async () => {
    const result = await call({ meetingNumber: ALLOWED_MEETING }, 'GET');
    expect(result.status).toBe(405);
    expect(result.headers.Allow).toBe('POST');
  });
});

describe('POST /api/meet/diag-signature — meeting allowlist', () => {
  it('404s an unlisted meeting — NOT 403, so the response is no existence oracle', async () => {
    const result = await call({ meetingNumber: UNLISTED_MEETING });
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: 'Not found' });
  });

  it('makes an unlisted meeting indistinguishable from an unconfigured endpoint', async () => {
    // This is the whole point of choosing 404: byte-identical responses.
    const unlisted = await call({ meetingNumber: UNLISTED_MEETING });
    delete process.env.ZOOM_DIAG_MEETING_IDS;
    const unconfigured = await call({ meetingNumber: UNLISTED_MEETING });
    expect(unlisted.status).toBe(unconfigured.status);
    expect(unlisted.body).toEqual(unconfigured.body);
  });

  it('signs for any of several allowlisted meetings', async () => {
    process.env.ZOOM_DIAG_MEETING_IDS = `${ALLOWED_MEETING}, ${UNLISTED_MEETING}`;
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 200 });
    expect(await call({ meetingNumber: UNLISTED_MEETING })).toMatchObject({ status: 200 });
  });

  it('tolerates whitespace and separators in the env value', async () => {
    process.env.ZOOM_DIAG_MEETING_IDS = `  ${ALLOWED_MEETING.slice(0, 3)} ${ALLOWED_MEETING.slice(3)}  `;
    // Non-digits are stripped, so a copy-paste with spaces still matches.
    expect(await call({ meetingNumber: ALLOWED_MEETING })).toMatchObject({ status: 200 });
  });
});

describe('POST /api/meet/diag-signature — success path', () => {
  function decodePayload(signature: string) {
    const [, payload] = signature.split('.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  }

  it('returns a signature and the sdkKey', async () => {
    const result = await call({ meetingNumber: ALLOWED_MEETING });
    expect(result.status).toBe(200);
    const body = result.body as { signature: string; sdkKey: string };
    expect(body.sdkKey).toBe('SdkClientIdInvented1');
    expect(body.signature.split('.')).toHaveLength(3);
  });

  it('hardcodes role:0 — a client-supplied role is ignored (§5)', async () => {
    // The claim the header comment makes, asserted: this endpoint can never mint
    // host credentials, whatever the request asks for.
    const result = await call({ meetingNumber: ALLOWED_MEETING, role: 1 });
    const payload = decodePayload((result.body as { signature: string }).signature);
    expect(payload.role).toBe(0);
  });

  it('signs the allowlisted meeting number, not whatever arrived', async () => {
    const result = await call({ meetingNumber: ` ${ALLOWED_MEETING} ` });
    const payload = decodePayload((result.body as { signature: string }).signature);
    expect(payload.mn).toBe(ALLOWED_MEETING);
  });

  it('honours the §20 TTL contract: exp === tokenExp and exp - iat >= 1800', async () => {
    const result = await call({ meetingNumber: ALLOWED_MEETING });
    const payload = decodePayload((result.body as { signature: string }).signature) as {
      iat: number;
      exp: number;
      tokenExp: number;
    };
    expect(payload.exp).toBe(payload.tokenExp);
    expect(payload.exp - payload.iat).toBeGreaterThanOrEqual(1800);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(48 * 3600);
  });

  it('never returns the SDK client secret', async () => {
    const result = await call({ meetingNumber: ALLOWED_MEETING });
    expect(JSON.stringify(result.body)).not.toContain('SdkClientSecretInvented00001');
  });
});

/**
 * The shared availability contract (Sol R1 finding ⑧). The diag page's
 * `joinAvailable` prop and this endpoint's first gate are the SAME function, so
 * these cases cover the partial-configuration combinations that used to disagree.
 */
describe('isDiagJoinConfigured — one contract for page and API', () => {
  const BASE = {
    ZOOM_SDK_CLIENT_ID: 'id',
    ZOOM_SDK_CLIENT_SECRET: 'secret',
    ZOOM_DIAG_MEETING_IDS: ALLOWED_MEETING,
  } as NodeJS.ProcessEnv;

  it('is true only when all three parts are present', () => {
    expect(isDiagJoinConfigured(BASE)).toBe(true);
  });

  it.each([
    ['no SDK client id', { ...BASE, ZOOM_SDK_CLIENT_ID: '' }],
    ['no SDK secret', { ...BASE, ZOOM_SDK_CLIENT_SECRET: '' }],
    ['no allowlist', { ...BASE, ZOOM_DIAG_MEETING_IDS: '' }],
    ['malformed allowlist only', { ...BASE, ZOOM_DIAG_MEETING_IDS: 'not-a-number' }],
    ['nothing at all', {} as NodeJS.ProcessEnv],
  ])('is false with %s', (_label, env) => {
    expect(isDiagJoinConfigured(env as NodeJS.ProcessEnv)).toBe(false);
  });

  it('ignores NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID entirely — the divergence Sol found', () => {
    // The page used to render its join form on the strength of this variable alone.
    const publicOnly = {
      NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID: 'id',
      ZOOM_DIAG_MEETING_IDS: ALLOWED_MEETING,
    } as NodeJS.ProcessEnv;
    expect(isDiagJoinConfigured(publicOnly)).toBe(false);
  });

  it('parses the allowlist to digits-only entries in Zoom range', () => {
    expect(
      diagMeetingAllowlist({ ZOOM_DIAG_MEETING_IDS: '848-3078-1209, 12, abc, 872 392 42778' } as NodeJS.ProcessEnv)
    ).toEqual([ALLOWED_MEETING, UNLISTED_MEETING]);
  });
});
