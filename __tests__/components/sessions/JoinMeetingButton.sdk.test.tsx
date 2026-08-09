// @vitest-environment jsdom
/**
 * Z3-3 [C2] [C4] [C7] [C9] [C10] [C11] — the SDK branch of the managed-session join
 * control.
 *
 * A separate file from `JoinMeetingButton.test.tsx` on purpose: that suite is the
 * proof of [C1], that the link path behaves exactly as it did before this chunk, and
 * it is worth more untouched than merged.
 *
 * Everything below is asserted against what the SDK is CALLED with and what the DOM
 * ends up containing — never against component internals — because the claims are
 * about a credential that must reach exactly one function and nothing else.
 *
 * Synthetic ids, signature, passcode and ZAK only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const { mockReplace, mockAsPath, mockLoadMeetingSdk } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockAsPath: { value: '/meet/session/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22' },
  mockLoadMeetingSdk: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace, asPath: mockAsPath.value }),
}));

// Only the download is stubbed. `SDK_LANGUAGE` stays the real constant so [C10]
// asserts the shipped value rather than a fixture's copy of it.
vi.mock('../../../lib/meet/zoom-sdk-loader', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, loadMeetingSdk: mockLoadMeetingSdk };
});

import JoinMeetingButton from '../../../components/sessions/JoinMeetingButton';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const JOIN_ENDPOINT = `/api/meet/session/${SESSION_ID}/join`;
const JOIN_URL = 'https://zoom.example.test/j/90210042001?pwd=synthetic';

/** Synthetic stand-ins for the three values §5 exists to contain. */
const SIGNATURE = 'SYNTHETIC.SDK.SIGNATURE';
const PASSCODE = 'SYNTH0142';
const ZAK = 'SYNTHETIC_ZAK_VALUE';

const SDK_KEY = 'SYNTHETIC_SDK_CLIENT_ID';
const MEETING_NUMBER = '90210042001';
const USER_NAME = 'Camila Sintética';
const CUSTOMER_KEY = '7d2f9a4158c34e779b106a4e2c8d0f31';

const sdkPayload = (extra: Record<string, unknown> = {}) => ({
  mode: 'sdk',
  signature: SIGNATURE,
  sdk_key: SDK_KEY,
  meeting_number: MEETING_NUMBER,
  passcode: PASSCODE,
  user_name: USER_NAME,
  customer_key: CUSTOMER_KEY,
  role: 'participant',
  ...extra,
});

const linkPayload = { mode: 'link', join_url: JOIN_URL, role: 'participant' };

/** The wire shape: `sendApiResponse` wraps every success in `{ data }`. */
function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

function fail(status: number, error: string) {
  return { ok: false, status, json: async () => ({ error }) };
}

const mockFetch = vi.fn();
const mockOpen = vi.fn();
const mockInit = vi.fn();
const mockJoin = vi.fn();
const mockCreateClient = vi.fn();

/** True for the ruling-② second request and nothing else. */
function isFallbackRequest(init?: RequestInit): boolean {
  return typeof init?.body === 'string' && init.body.includes('"fallback":"link"');
}

function serve(initial: unknown, fallback: unknown = ok(linkPayload)) {
  mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(isFallbackRequest(init) ? fallback : initial)
  );
}

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAsPath.value = `/meet/session/${SESSION_ID}`;
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('open', mockOpen);
  // A browser that lets a new tab through; one test below takes the other answer.
  mockOpen.mockReturnValue({} as Window);

  mockInit.mockResolvedValue(undefined);
  mockJoin.mockResolvedValue(undefined);
  mockCreateClient.mockReturnValue({ init: mockInit, join: mockJoin, leave: vi.fn() });
  mockLoadMeetingSdk.mockResolvedValue({ createClient: mockCreateClient });

  // Desktop, per ruling ④ — restated every test because the [C9] cases below rewrite
  // both readings and a leaked mobile user agent would silently skip the embed.
  setViewport(1280);
  setUserAgent(DESKTOP_UA);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const clickJoin = () => fireEvent.click(screen.getByTestId('meet-join-button'));
const clickContinue = () => fireEvent.click(screen.getByTestId('meet-prejoin-continue'));

/** Click through to a mounted, joined embed. */
async function joinEmbedded(payload: Record<string, unknown> = sdkPayload()) {
  serve(ok(payload));
  const view = render(<JoinMeetingButton sessionId={SESSION_ID} />);

  clickJoin();
  await screen.findByTestId('meet-prejoin-check');
  clickContinue();
  await waitFor(() => expect(mockJoin).toHaveBeenCalled());

  return view;
}

describe('JoinMeetingButton — the embedded meeting [C2] [C10]', () => {
  it('shows the preflight before anything is mounted, and mounts nothing until asked', async () => {
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await screen.findByTestId('meet-prejoin-check');
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
    expect(mockJoin).not.toHaveBeenCalled();
    // The 3.7 MB bundle is not in the initial page load, and is not fetched by the
    // POST either: only the user's second act pulls it.
    expect(screen.getByTestId('meet-embed-root')).toBeInTheDocument();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('joins with every field from the payload, and the ZAK when there is one [C2]', async () => {
    await joinEmbedded(sdkPayload({ role: 'host', zak: ZAK }));

    expect(mockJoin).toHaveBeenCalledTimes(1);
    expect(mockJoin).toHaveBeenCalledWith({
      sdkKey: SDK_KEY,
      signature: SIGNATURE,
      meetingNumber: MEETING_NUMBER,
      userName: USER_NAME,
      password: PASSCODE,
      customerKey: CUSTOMER_KEY,
      zak: ZAK,
    });
  });

  it('omits the zak KEY entirely when the payload carries none [C2]', async () => {
    await joinEmbedded(sdkPayload());

    const options = mockJoin.mock.calls[0][0] as Record<string, unknown>;
    // Key-presence, not value: an explicit `zak: undefined` is a different thing to
    // send to the SDK than no zak at all.
    expect(Object.keys(options)).not.toContain('zak');
    expect(options.password).toBe(PASSCODE);
  });

  it('initialises the SDK in es-ES, into the root element on this page [C10]', async () => {
    const { getByTestId } = await joinEmbedded();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith({
      zoomAppRoot: getByTestId('meet-embed-root'),
      language: 'es-ES',
      patchJsMedia: true,
      leaveOnPageUnload: true,
    });
  });

  it('reuses the initialised client on a second join in the same page life [C3]', async () => {
    await joinEmbedded();

    serve(ok(sdkPayload()));
    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    clickContinue();
    await waitFor(() => expect(mockJoin).toHaveBeenCalledTimes(2));

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it('renders the dial-in block alongside the embed, exactly as link mode does', async () => {
    await joinEmbedded(
      sdkPayload({
        dial_in: {
          numbers: [{ number: '+56 2 5555 0130', country_name: 'Chile' }],
          meeting_number: MEETING_NUMBER,
        },
      })
    );

    expect(screen.getByTestId('meet-dial-in')).toBeInTheDocument();
    expect(screen.getByText('+56 2 5555 0130')).toBeInTheDocument();
  });
});

describe('JoinMeetingButton — the ruling ② fallback [C4]', () => {
  const failures: Array<[string, () => void]> = [
    ['the CDN is unreachable', () => mockLoadMeetingSdk.mockRejectedValue(new Error('cdn'))],
    [
      'the bundle never assigns its global',
      () => mockLoadMeetingSdk.mockRejectedValue(new Error('absent global')),
    ],
    ['init rejects', () => mockInit.mockRejectedValue(new Error('init'))],
    ['join rejects', () => mockJoin.mockRejectedValue(new Error('join'))],
  ];

  for (const [name, arrange] of failures) {
    it(`falls back to link mode when ${name}`, async () => {
      arrange();
      serve(ok(sdkPayload()));
      render(<JoinMeetingButton sessionId={SESSION_ID} />);

      clickJoin();
      await screen.findByTestId('meet-prejoin-check');
      clickContinue();

      await waitFor(() =>
        expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer')
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  }

  it('carries the intent explicitly, and never a join_url smuggled into the SDK payload', async () => {
    mockJoin.mockRejectedValue(new Error('join'));
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    clickContinue();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    // The first request is byte-for-byte the one Z2 shipped.
    expect(mockFetch.mock.calls[0]).toEqual([JOIN_ENDPOINT, { method: 'POST' }]);
    expect(mockFetch.mock.calls[1]).toEqual([
      JOIN_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallback: 'link' }),
      },
    ]);
  });

  it('takes the fallback when the SDK payload is missing a field it cannot invent', async () => {
    serve(ok({ ...sdkPayload(), passcode: '' }));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer')
    );
    // No preflight, no SDK download: a payload that cannot join must not pretend to.
    expect(screen.queryByTestId('meet-prejoin-check')).toBeNull();
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
  });

  it('offers the link as a deliberate choice from the preflight too', async () => {
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    fireEvent.click(screen.getByTestId('meet-prejoin-use-link'));

    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer')
    );
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
  });

  it('renders the server denial when the fallback request is refused', async () => {
    mockJoin.mockRejectedValue(new Error('join'));
    serve(ok(sdkPayload()), fail(410, 'Esta reunión ya no está disponible'));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    clickContinue();

    expect(await screen.findByTestId('meet-join-error')).toHaveTextContent(
      'Esta reunión ya no está disponible'
    );
  });

  it('never loops: an SDK payload answering the fallback ends the attempt', async () => {
    mockJoin.mockRejectedValue(new Error('join'));
    serve(ok(sdkPayload()), ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    clickContinue();

    expect(await screen.findByTestId('meet-join-error')).toHaveTextContent(
      'No pudimos preparar el acceso a la reunión'
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('says what to press when the browser blocks the fallback tab', async () => {
    mockJoin.mockRejectedValue(new Error('join'));
    mockOpen.mockReturnValue(null);
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    clickContinue();

    expect(await screen.findByTestId('meet-join-error')).toHaveTextContent(
      'Tu navegador bloqueó la ventana nueva'
    );
    // The URL is still not in the document — the message names the button, not the link.
    expect(screen.queryByText(JOIN_URL)).toBeNull();
  });
});

/**
 * [C9] — Component View is desktop only.
 *
 * Z3-4 kept the claim and changed the destination. Both cases below used to assert that
 * a refused browser "takes the link"; since Client View landed, it takes Client View
 * instead, and only a browser that can run neither view takes the link (asserted in
 * `JoinMeetingButton.clientview.test.tsx` [D5]). What [C9] is actually about — that the
 * 3.7 MB Component View bundle is never fetched on a machine that cannot render it — is
 * unchanged and asserted harder here, against the loader rather than the DOM.
 */
describe('JoinMeetingButton — Component View is desktop only [C9]', () => {
  it('a narrow viewport never mounts the embed or fetches its bundle', async () => {
    setViewport(375);
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await screen.findByTestId('meet-prejoin-check');
    expect(screen.queryByTestId('meet-embed-root')).toBeNull();
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
  });

  it('a mobile user agent is refused even on a wide screen', async () => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    );
    setViewport(1600);
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await screen.findByTestId('meet-prejoin-check');
    expect(screen.queryByTestId('meet-embed-root')).toBeNull();
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
  });
});

describe('JoinMeetingButton — the credentials leave no trace [C7]', () => {
  const secrets = [SIGNATURE, PASSCODE, ZAK];

  it('never renders the signature, the passcode or the ZAK, at any point in the flow', async () => {
    serve(ok(sdkPayload({ role: 'host', zak: ZAK })));
    const { container } = render(<JoinMeetingButton sessionId={SESSION_ID} />);

    // Before the click: nothing has been fetched at all.
    for (const secret of secrets) expect(container.innerHTML).not.toContain(secret);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    // Holding credentials, showing the preflight — the moment they are most alive.
    for (const secret of secrets) expect(container.innerHTML).not.toContain(secret);

    clickContinue();
    await waitFor(() => expect(mockJoin).toHaveBeenCalled());
    for (const secret of secrets) expect(container.innerHTML).not.toContain(secret);
  });

  it('never writes any of them to the console, on the happy path or on a failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );

    try {
      mockJoin.mockRejectedValue(new Error('join refused'));
      serve(ok(sdkPayload({ role: 'host', zak: ZAK })));
      render(<JoinMeetingButton sessionId={SESSION_ID} />);

      clickJoin();
      await screen.findByTestId('meet-prejoin-check');
      clickContinue();
      await waitFor(() => expect(mockOpen).toHaveBeenCalled());

      const written = spies
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map((argument) => String(argument))
        .join('\n');

      for (const secret of secrets) expect(written).not.toContain(secret);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('does not reuse the credentials of a completed join — a later click refetches', async () => {
    await joinEmbedded(sdkPayload({ role: 'host', zak: ZAK }));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Fresh credentials or nothing: the ones the join consumed are gone.
    serve(ok({ mode: 'pending' }));
    clickJoin();

    await screen.findByTestId('meet-join-pending');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockJoin).toHaveBeenCalledTimes(1);
  });

  it('does not join a second time from a preflight whose credentials were consumed', async () => {
    mockJoin.mockRejectedValue(new Error('join'));
    serve(ok(sdkPayload()), ok({ mode: 'pending' }));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    clickContinue();
    await screen.findByTestId('meet-join-pending');

    // The failed attempt emptied the ref; nothing is left to retry with.
    expect(mockJoin).toHaveBeenCalledTimes(1);
  });
});

/**
 * Z3-3 [C11] — ruling ①, asserted mechanically rather than by reading the imports.
 *
 * One flag needs two env vars: `FEATURE_ZOOM_EMBED` on the server and
 * `NEXT_PUBLIC_FEATURE_ZOOM_EMBED` in the browser. A client that read its own copy
 * would split-brain on a deployment that set one and not the other. The server's
 * `mode` is the only signal, so there is nothing here to read a flag WITH.
 */
describe('the meeting surface never reads a feature flag in the browser [C11]', () => {
  const ROOT = path.resolve(__dirname, '../../..');

  const SURFACES = [
    'components/sessions',
    'lib/meet/zoom-sdk-loader.ts',
    'lib/meet/zoom-client-view-loader.ts',
    'lib/meet/embed-capabilities.ts',
  ];

  function filesUnder(target: string): string[] {
    const absolute = path.join(ROOT, target);
    if (!statSync(absolute).isDirectory()) return [absolute];
    return readdirSync(absolute)
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => path.join(absolute, name));
  }

  it('no client component or module on this surface mentions featureFlags', () => {
    const files = SURFACES.flatMap(filesUnder);

    // Guard the guard: a glob that silently matched nothing would pass forever.
    // Raised from 8 to 9 in Z3-4, with `zoom-client-view-loader.ts` above [D8].
    expect(files.length).toBeGreaterThanOrEqual(9);

    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('featureFlags') || source.includes('NEXT_PUBLIC_FEATURE_ZOOM');
    });

    expect(offenders).toEqual([]);
  });
});
