// @vitest-environment node
/**
 * getServerSideProps for the meeting interstitial (`/meet/session/[id]`).
 *
 * The authorization decisions themselves live in
 * `__tests__/lib/utils/session-meet-access.test.ts`; what is asserted here is
 * the mapping from those decisions onto Next.js SSR results — in particular
 * that an unauthenticated visitor keeps their destination across the login
 * bounce, so a join link mailed out days earlier still lands on the meeting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GetServerSidePropsContext } from 'next';

const { mockResolveMeetSessionAccess, mockGetSession } = vi.hoisted(() => ({
  mockResolveMeetSessionAccess: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({ auth: { getSession: mockGetSession } }),
}));

vi.mock('../../../lib/api-auth', () => ({
  createServiceRoleClient: () => ({}),
}));

vi.mock('../../../lib/utils/session-meet-access', () => ({
  resolveMeetSessionAccess: mockResolveMeetSessionAccess,
}));

import { getServerSideProps } from '../../../pages/meet/session/[id]';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';

function context(resolvedUrl: string): GetServerSidePropsContext {
  return {
    params: { id: SESSION_ID },
    resolvedUrl,
    req: { headers: {} },
    res: {},
    query: {},
  } as unknown as GetServerSidePropsContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

describe('/meet/session/[id] getServerSideProps', () => {
  it('redirects an unauthenticated visitor to login carrying the destination', async () => {
    mockResolveMeetSessionAccess.mockResolvedValue({ kind: 'unauthenticated' });

    const result = await getServerSideProps(context(`/meet/session/${SESSION_ID}`));

    expect(result).toEqual({
      redirect: {
        destination: `/login?next=${encodeURIComponent(`/meet/session/${SESSION_ID}`)}`,
        permanent: false,
      },
    });
  });

  it('encodes the destination so it cannot inject extra login query params', async () => {
    mockResolveMeetSessionAccess.mockResolvedValue({ kind: 'unauthenticated' });

    const result = await getServerSideProps(
      context(`/meet/session/${SESSION_ID}?utm=mail&x=1`)
    );
    const destination = 'redirect' in result ? result.redirect.destination : '';

    expect(destination.startsWith('/login?next=')).toBe(true);
    expect(destination.slice('/login?next='.length)).not.toMatch(/[&?#]/);
  });

  it('returns notFound for a denied or nonexistent session', async () => {
    mockResolveMeetSessionAccess.mockResolvedValue({ kind: 'not-found' });

    const result = await getServerSideProps(context(`/meet/session/${SESSION_ID}`));

    expect(result).toEqual({ notFound: true });
  });

  it('passes the resolved session through as props', async () => {
    const session = {
      id: SESSION_ID,
      title: 'Sesión sintética',
      session_date: '2026-03-10',
      start_time: '09:00:00',
      end_time: '10:30:00',
      meeting_link: 'https://meet.example.test/abc-def',
    };
    mockResolveMeetSessionAccess.mockResolvedValue({ kind: 'ok', session });

    const result = await getServerSideProps(context(`/meet/session/${SESSION_ID}`));

    expect(result).toEqual({ props: { session } });
  });

  it('hands the authenticated user id to the access resolver', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } });
    mockResolveMeetSessionAccess.mockResolvedValue({ kind: 'not-found' });

    await getServerSideProps(context(`/meet/session/${SESSION_ID}`));

    expect(mockResolveMeetSessionAccess).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, userId: 'u-1' })
    );
  });
});
