import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Stubbed so `getServerSideProps` can be exercised without Supabase env vars.
 * A session is always returned: the redirect-when-unauthenticated branch is
 * pre-existing behaviour verified elsewhere, and what these cases are about is
 * the SDK env plumbing that follows it.
 */
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'test-user' } } }, error: null }),
    },
  }),
}));

import MeetDiagPage, { getServerSideProps } from '@/pages/meet/diag';

/**
 * /meet/diag test-join section (Z0B-2, item 6).
 *
 * The requirement being locked in: a consultora who opens this page on a school
 * machine must get a working diagnostic EVEN IF the deployment has no Zoom
 * credentials. In that case the join block shows the "disponible próximamente"
 * placeholder and everything else still renders. A crash here would strand a
 * field visit, so it is asserted rather than assumed.
 *
 * Rendered with `renderToStaticMarkup` rather than @testing-library/react on
 * purpose: this repo has no `jsdom` dependency and no DOM test environment
 * configured, and adding one to assert a branch reachable from the server render
 * would be a heavier change than the assertion is worth. Server rendering is also
 * the honest boundary — `sdkClientId` arrives as a prop from
 * getServerSideProps, and `useEffect` (which is where every browser-global probe
 * lives) does not run during SSR.
 */

const ENV_KEY = 'NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID';

/**
 * `threads: false` means every suite shares one `process.env`. Restoring by
 * `delete` when the key was absent — rather than assigning `undefined`, which
 * stringifies to "undefined" — keeps other suites from inheriting a phantom value.
 */
let hadKey = false;
let previous: string | undefined;

beforeEach(() => {
  hadKey = ENV_KEY in process.env;
  previous = process.env[ENV_KEY];
});

afterEach(() => {
  if (hadKey && previous !== undefined) process.env[ENV_KEY] = previous;
  else delete process.env[ENV_KEY];
});

describe('/meet/diag — join section gating', () => {
  it('renders the placeholder and no join controls when the SDK env is absent', () => {
    const html = renderToStaticMarkup(createElement(MeetDiagPage, { sdkClientId: null }));

    expect(html).toContain('Prueba de conexión: disponible próximamente.');
    expect(html).toContain('data-testid="diag-join-placeholder"');
    // The controls must not exist at all — a disabled-but-present button would
    // invite a tester to press it and report a failure that is not a failure.
    expect(html).not.toContain('data-testid="diag-join-button"');
    expect(html).not.toContain('data-testid="diag-join-meeting-number"');
  });

  it('still renders the rest of the diagnostic when the SDK env is absent', () => {
    const html = renderToStaticMarkup(createElement(MeetDiagPage, { sdkClientId: null }));

    // The parts of the instrument that must survive a credential-less deployment.
    expect(html).toContain('data-testid="diag-media-probe-button"');
    expect(html).toContain('data-testid="diag-copy-button"');
    expect(html).toContain('data-testid="diag-report-json"');
    expect(html).toContain('Diagnóstico del equipo');
  });

  it('renders the join controls when the SDK env is present', () => {
    const html = renderToStaticMarkup(
      createElement(MeetDiagPage, { sdkClientId: 'sdk-key-for-test' })
    );

    expect(html).toContain('data-testid="diag-join-meeting-number"');
    expect(html).toContain('data-testid="diag-join-passcode"');
    expect(html).toContain('data-testid="diag-join-button"');
    expect(html).toContain('data-testid="diag-join-sdk-root"');
    expect(html).not.toContain('data-testid="diag-join-placeholder"');
  });

  it('always reports the time-to-join probe in the copyable JSON', () => {
    // The B1 threshold is the embed gate, so an unmeasured reading and a blank
    // column are different facts. The row exists before any join is attempted.
    const html = renderToStaticMarkup(createElement(MeetDiagPage, { sdkClientId: null }));

    expect(html).toContain('diag-row-test-join');
    expect(html).toContain('Tiempo hasta entrar a la reunión');
    expect(html).toContain('Sin medir');
  });

  it('does not leak the SDK client id into the page when env is absent', () => {
    const html = renderToStaticMarkup(createElement(MeetDiagPage, { sdkClientId: null }));
    expect(html).not.toContain('null');
  });
});

describe('/meet/diag — getServerSideProps SDK env plumbing', () => {
  /** Minimal context; the auth call is stubbed by returning a session below. */
  function contextWithSession() {
    return {
      resolvedUrl: '/meet/diag',
      req: { headers: { cookie: '' }, cookies: {} },
      res: { setHeader: () => {}, getHeader: () => undefined },
      query: {},
    } as never;
  }

  it('passes sdkClientId: null when the env var is unset', async () => {
    delete process.env[ENV_KEY];
    const result = (await getServerSideProps(contextWithSession())) as {
      props: { sdkClientId: string | null };
    };

    // Explicitly null, not undefined — Next.js refuses to serialize undefined,
    // so an `?? null` omission would turn a missing credential into a 500.
    expect(result.props.sdkClientId).toBeNull();
    expect(result.props.sdkClientId).not.toBeUndefined();
  });

  it('passes the SDK client id through when the env var is set', async () => {
    process.env[ENV_KEY] = 'sdk-key-from-env';
    const result = (await getServerSideProps(contextWithSession())) as {
      props: { sdkClientId: string | null };
    };

    expect(result.props.sdkClientId).toBe('sdk-key-from-env');
  });

  it('never exposes the SDK client SECRET to the page props', async () => {
    // §5 secrets inventory: the signing secret is server-only. The page receives
    // the public app key and nothing else; the signature is minted by the API route.
    process.env[ENV_KEY] = 'sdk-key-from-env';
    process.env.ZOOM_SDK_CLIENT_SECRET = 'super-secret-value-must-not-appear';

    const result = (await getServerSideProps(contextWithSession())) as {
      props: Record<string, unknown>;
    };

    expect(JSON.stringify(result.props)).not.toContain('super-secret-value-must-not-appear');
    expect(Object.keys(result.props)).toEqual(['sdkClientId']);

    delete process.env.ZOOM_SDK_CLIENT_SECRET;
  });
});
