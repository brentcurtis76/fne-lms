// @vitest-environment node
/**
 * `getServerSideProps` for `/meet/diag` — the join section's availability contract
 * (Z0B-2r1, Sol R1 finding ⑧).
 *
 * The page used to compute availability from `NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID` while
 * `/api/meet/diag-signature` required the server-side pair. Two env contracts for one
 * feature, so a deployment could render a join form whose every submission 404'd.
 *
 * These cases walk the partial-configuration combinations and assert that the page's
 * answer is the API's answer — both come from `isDiagJoinConfigured()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GetServerSidePropsContext } from 'next';

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({ auth: { getSession: mockGetSession } }),
}));

import { getServerSideProps } from '../../../pages/meet/diag';

const MEETING = '84830781209';

const ENV_KEYS = [
  'ZOOM_SDK_CLIENT_ID',
  'ZOOM_SDK_CLIENT_SECRET',
  'ZOOM_DIAG_MEETING_IDS',
  'NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID',
] as const;
let saved: Record<string, string | undefined> = {};

function context(resolvedUrl = '/meet/diag'): GetServerSidePropsContext {
  return { resolvedUrl, req: { headers: {} }, res: {}, query: {} } as unknown as GetServerSidePropsContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  // Restore-by-delete, not assign-undefined (which stores the string "undefined").
  for (const key of ENV_KEYS) delete process.env[key];
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key] as string;
  }
});

async function props() {
  const result = await getServerSideProps(context());
  if (!('props' in result)) throw new Error('expected props');
  return result.props as { joinAvailable: boolean };
}

describe('/meet/diag getServerSideProps — session gate', () => {
  it('redirects an unauthenticated visitor to login carrying the destination', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await getServerSideProps(context('/meet/diag'));
    expect(result).toEqual({
      redirect: { destination: `/login?next=${encodeURIComponent('/meet/diag')}`, permanent: false },
    });
  });

  it('stays session-presence-only — the page itself needs no role', async () => {
    // Deliberate: everything on the page except the join section is a browser
    // capability read, and a role check would lock out the consultores it is for.
    // The JOIN is bounded by the API's role + allowlist gates instead.
    process.env.ZOOM_SDK_CLIENT_ID = 'id';
    process.env.ZOOM_SDK_CLIENT_SECRET = 'secret';
    process.env.ZOOM_DIAG_MEETING_IDS = MEETING;
    expect(await props()).toEqual({ joinAvailable: true });
  });
});

describe('/meet/diag getServerSideProps — joinAvailable across partial configurations', () => {
  it('false with nothing configured', async () => {
    expect((await props()).joinAvailable).toBe(false);
  });

  it('false with the SDK pair but NO allowlist — the form would 404 on submit', async () => {
    process.env.ZOOM_SDK_CLIENT_ID = 'id';
    process.env.ZOOM_SDK_CLIENT_SECRET = 'secret';
    expect((await props()).joinAvailable).toBe(false);
  });

  it('false with the SDK pair and an EMPTY allowlist', async () => {
    process.env.ZOOM_SDK_CLIENT_ID = 'id';
    process.env.ZOOM_SDK_CLIENT_SECRET = 'secret';
    process.env.ZOOM_DIAG_MEETING_IDS = '';
    expect((await props()).joinAvailable).toBe(false);
  });

  it('false with an allowlist but no SDK secret', async () => {
    process.env.ZOOM_SDK_CLIENT_ID = 'id';
    process.env.ZOOM_DIAG_MEETING_IDS = MEETING;
    expect((await props()).joinAvailable).toBe(false);
  });

  it('false with an allowlist but no SDK client id', async () => {
    process.env.ZOOM_SDK_CLIENT_SECRET = 'secret';
    process.env.ZOOM_DIAG_MEETING_IDS = MEETING;
    expect((await props()).joinAvailable).toBe(false);
  });

  it('FALSE with only NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID — the exact divergence Sol found', async () => {
    // Before this round these env vars rendered a working-looking join form.
    process.env.NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID = 'id';
    process.env.ZOOM_DIAG_MEETING_IDS = MEETING;
    expect((await props()).joinAvailable).toBe(false);
  });

  it('true with the full server configuration, regardless of the public variable', async () => {
    process.env.ZOOM_SDK_CLIENT_ID = 'id';
    process.env.ZOOM_SDK_CLIENT_SECRET = 'secret';
    process.env.ZOOM_DIAG_MEETING_IDS = MEETING;
    // Absent on purpose: the sdkKey the SDK needs comes from the API response.
    expect(process.env.NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID).toBeUndefined();
    expect((await props()).joinAvailable).toBe(true);
  });

  it('no longer exposes an sdkClientId prop at all', async () => {
    process.env.ZOOM_SDK_CLIENT_ID = 'id';
    process.env.ZOOM_SDK_CLIENT_SECRET = 'secret';
    process.env.ZOOM_DIAG_MEETING_IDS = MEETING;
    expect(await props()).not.toHaveProperty('sdkClientId');
  });
});
