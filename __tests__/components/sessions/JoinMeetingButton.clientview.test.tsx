// @vitest-environment jsdom
/**
 * Z3-4 [D2] [D3] [D4] [D5] [D6] [D7] — the Client View branch of the managed-session
 * join control, and the two rulings that come with it.
 *
 * A third file rather than an edit to `JoinMeetingButton.sdk.test.tsx`, for the same
 * reason that file was split off from `JoinMeetingButton.test.tsx`: those two suites are
 * the standing proof that the link path and the Component View path behave exactly as
 * they did before this chunk, and they are worth more untouched than merged.
 *
 * Both loaders are stubbed here, so every assertion about which bundle a browser
 * downloads is an assertion about a call that either happened or did not — the claim
 * [D3] and [D4] actually make.
 *
 * Synthetic ids, signature, passcode and ZAK only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockReplace, mockAsPath, mockLoadMeetingSdk, mockLoadClientView } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockAsPath: { value: '/meet/session/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22' },
  mockLoadMeetingSdk: vi.fn(),
  mockLoadClientView: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace, asPath: mockAsPath.value }),
}));

// Only the downloads are stubbed. `SDK_LANGUAGE`, `CLIENT_VIEW_LIB_BASE`,
// `CLIENT_VIEW_ROOT_ID` and `awaitClientViewCall` stay the real things, so the
// assertions below are against shipped values rather than a fixture's copy of them.
vi.mock('../../../lib/meet/zoom-sdk-loader', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, loadMeetingSdk: mockLoadMeetingSdk };
});

vi.mock('../../../lib/meet/zoom-client-view-loader', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, loadClientView: mockLoadClientView };
});

import JoinMeetingButton from '../../../components/sessions/JoinMeetingButton';
import {
  CLIENT_VIEW_FRAME_SRC,
  CLIENT_VIEW_LIB_BASE,
  CLIENT_VIEW_ROOT_ID,
} from '../../../lib/meet/zoom-client-view-loader';

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

const mockFetch = vi.fn();
const mockOpen = vi.fn();

/** Component View's surface. */
const mockComponentInit = vi.fn();
const mockComponentJoin = vi.fn();
const mockCreateClient = vi.fn();

/** Client View's — a different global with a different shape. */
const mockSetZoomJSLib = vi.fn();
const mockPreLoadWasm = vi.fn();
const mockPrepareWebSDK = vi.fn();
const mockI18nLoad = vi.fn();
const mockClientInit = vi.fn();
const mockClientJoin = vi.fn();

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

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DESKTOP_FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** A phone: the browser this chunk exists for. */
function onMobile() {
  setUserAgent(ANDROID_UA);
  setViewport(390);
}

/** Desktop Chrome — the one browser that still gets Component View. */
function onDesktopChrome() {
  setUserAgent(DESKTOP_CHROME_UA);
  setViewport(1280);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAsPath.value = `/meet/session/${SESSION_ID}`;
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('open', mockOpen);
  // `null` is what a real browser returns under `noopener`, opened or blocked (Sol M1).
  mockOpen.mockReturnValue(null);

  mockComponentInit.mockResolvedValue(undefined);
  mockComponentJoin.mockResolvedValue(undefined);
  mockCreateClient.mockReturnValue({
    init: mockComponentInit,
    join: mockComponentJoin,
    leave: vi.fn(),
  });
  mockLoadMeetingSdk.mockResolvedValue({ createClient: mockCreateClient });

  // Client View answers through callbacks, not promises.
  mockClientInit.mockImplementation((options: { success: () => void }) => options.success());
  mockClientJoin.mockImplementation((options: { success: () => void }) => options.success());
  // `i18n.load` IS a promise in the real 6.2.0 bundle (Sol M2). The old double returned
  // `undefined`, which is what let an un-awaited call look correct.
  mockI18nLoad.mockResolvedValue(undefined);
  mockLoadClientView.mockResolvedValue({
    setZoomJSLib: mockSetZoomJSLib,
    preLoadWasm: mockPreLoadWasm,
    prepareWebSDK: mockPrepareWebSDK,
    i18n: { load: mockI18nLoad },
    init: mockClientInit,
    join: mockClientJoin,
  });

  onMobile();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const clickJoin = () => fireEvent.click(screen.getByTestId('meet-join-button'));

/**
 * Deliver the isolated document (Sol M4; reshaped in Z3-r8).
 *
 * jsdom starts navigating the frame and never finishes — there is no server behind
 * `CLIENT_VIEW_FRAME_SRC` in a unit test — so what sits in `contentDocument` is the
 * `about:blank` placeholder every real browser also puts there first.
 *
 * That distinction is now load-bearing, so this helper models the static file ARRIVING
 * rather than an event announcing it: the root element `CLIENT_VIEW_FRAME_SRC` exists to
 * provide is what `awaitClientViewFrame` waits for, and it is the one thing the
 * placeholder never has. A test that skips this is testing the placeholder — which is
 * exactly the defect r8 found in a real browser.
 */
async function deliverFrameDocument() {
  const frame = (await screen.findByTestId('meet-client-root')) as HTMLIFrameElement;
  const doc = frame.contentDocument as Document;
  // Already delivered: a second join in the same page life reuses this very document and
  // the window built from it, so there is nothing left to arrive.
  if (doc.getElementById(CLIENT_VIEW_ROOT_ID)) return frame;

  const root = doc.createElement('div');
  root.id = CLIENT_VIEW_ROOT_ID;
  // jsdom's placeholder has no `body` and not even a `documentElement`; the lookup is by
  // id and does not care which ancestor holds it.
  const documentElement =
    doc.documentElement ?? (doc.appendChild(doc.createElement('html')) as HTMLElement);
  documentElement.appendChild(root);

  // The watcher polls, so this waits for it to notice rather than announcing it.
  const before = mockLoadClientView.mock.calls.length;
  await waitFor(() => expect(mockLoadClientView.mock.calls.length).toBeGreaterThan(before));
  return frame;
}

/** Component View's preflight, which Z3-r8 left exactly where r3 put it. */
const clickContinue = () => fireEvent.click(screen.getByTestId('meet-prejoin-continue'));

/**
 * Click through to a joined Client View meeting.
 *
 * One click, since Z3-r8: Zoom's own pre-join screen is the preflight on this path, so
 * there is no «Entrar a la reunión» of ours between the response and the join.
 */
async function joinClientView(payload: Record<string, unknown> = sdkPayload()) {
  serve(ok(payload));
  const view = render(<JoinMeetingButton sessionId={SESSION_ID} />);

  clickJoin();
  await deliverFrameDocument();
  await waitFor(() => expect(mockClientJoin).toHaveBeenCalled());

  return view;
}

describe('JoinMeetingButton — mobile joins through Client View [D2]', () => {
  it('joins with every field from the payload, and the ZAK when there is one', async () => {
    await joinClientView(sdkPayload({ role: 'host', zak: ZAK }));

    expect(mockClientJoin).toHaveBeenCalledTimes(1);
    const options = mockClientJoin.mock.calls[0][0] as Record<string, unknown>;

    expect(options).toMatchObject({
      sdkKey: SDK_KEY,
      signature: SIGNATURE,
      meetingNumber: MEETING_NUMBER,
      userName: USER_NAME,
      // Client View spells it `passWord`; the value is the same passcode.
      passWord: PASSCODE,
      customerKey: CUSTOMER_KEY,
      zak: ZAK,
    });
    // The link payload's own field name must not have come along for the ride.
    expect(Object.keys(options)).not.toContain('password');
  });

  it('omits the zak KEY entirely when the payload carries none', async () => {
    await joinClientView(sdkPayload());

    const options = mockClientJoin.mock.calls[0][0] as Record<string, unknown>;
    // Key-presence, not value: an explicit `zak: undefined` is a different thing to
    // send to the SDK than no zak at all.
    expect(Object.keys(options)).not.toContain('zak');
    expect(options.passWord).toBe(PASSCODE);
  });

  it('bootstraps the SDK in es-ES, from the pinned CDN lib, and leaves back to its own document', async () => {
    await joinClientView();

    expect(mockSetZoomJSLib).toHaveBeenCalledWith(CLIENT_VIEW_LIB_BASE, '/av');
    expect(mockPreLoadWasm).toHaveBeenCalledTimes(1);
    expect(mockPrepareWebSDK).toHaveBeenCalledTimes(1);
    // §20: the SDK's own chrome is es-ES. Every string GENERA writes stays es-CL.
    expect(mockI18nLoad).toHaveBeenCalledWith('es-ES');

    expect(mockClientInit).toHaveBeenCalledTimes(1);
    const options = mockClientInit.mock.calls[0][0] as Record<string, unknown>;
    expect(options).toMatchObject({
      patchJsMedia: true,
      leaveOnPageUnload: true,
    });
    // Leaving returns the FRAME to its own empty document — which is how this page
    // learns the meeting is over. It carries no session id and nothing Zoom-shaped.
    expect(options.leaveUrl).toContain(CLIENT_VIEW_FRAME_SRC);
    expect(options.leaveUrl).not.toContain(SESSION_ID);
  });

  /**
   * Sol M4's other half: a frame that took the whole viewport must be able to come
   * down, or leaving the meeting strands the user on a blank full-screen box.
   */
  it('takes the frame down when the user leaves, and re-bootstraps on the next join', async () => {
    await joinClientView();
    const frame = screen.getByTestId('meet-client-root');

    // Zoom navigates the frame to `leaveUrl`; its second load is the user leaving.
    fireEvent.load(frame);

    await waitFor(() => expect(screen.queryByTestId('meet-client-root')).toBeNull());
    expect(screen.getByTestId('meet-join-button')).toBeEnabled();

    serve(ok(sdkPayload()));
    clickJoin();
    await deliverFrameDocument();
    await waitFor(() => expect(mockClientJoin).toHaveBeenCalledTimes(2));

    // A fresh frame is a fresh window: the bootstrap that lived on the old one is gone.
    expect(mockClientInit).toHaveBeenCalledTimes(2);
    expect(mockPrepareWebSDK).toHaveBeenCalledTimes(2);
  });

  /**
   * Sol M2 — Zoom's localization loads asynchronously, and their docs require the
   * language resources to be in place BEFORE initialization. r4 called `load()` without
   * awaiting it (and the type said `void`, so nothing could warn), which left es-ES a
   * race the SDK usually lost: Sol saw the language stay `en-US` through `init`.
   */
  it('will not initialise until the Spanish resources have finished loading', async () => {
    let releaseLanguage = () => {};
    mockI18nLoad.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseLanguage = resolve;
      })
    );

    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await deliverFrameDocument();

    await waitFor(() => expect(mockI18nLoad).toHaveBeenCalledWith('es-ES'));
    // Held. Everything downstream of the language is still waiting on it.
    expect(mockClientInit).not.toHaveBeenCalled();
    expect(mockClientJoin).not.toHaveBeenCalled();

    releaseLanguage();

    await waitFor(() => expect(mockClientJoin).toHaveBeenCalledTimes(1));
    expect(mockClientInit).toHaveBeenCalledTimes(1);
  });

  /**
   * Sol M4 — the root Client View looks up by id now lives in the isolated document,
   * not in this one. That IS the boundary: `styles/globals.css` is imported by
   * `_app.tsx`, which wraps every page, so anything mounted in THIS document inherits
   * Tailwind Preflight no matter which route it is on.
   */
  it('renders into the isolated frame, and mounts nothing of Zoom’s in this document', async () => {
    await joinClientView();

    const frame = screen.getByTestId('meet-client-root') as HTMLIFrameElement;
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', CLIENT_VIEW_FRAME_SRC);
    // Without it the frame is refused the camera and the microphone outright: a nested
    // context gets only what the parent explicitly passes it.
    expect(frame.getAttribute('allow')).toContain('camera');
    expect(frame.getAttribute('allow')).toContain('microphone');

    // The app's document never holds Zoom's root — the frame's does.
    expect(document.getElementById(CLIENT_VIEW_ROOT_ID)).toBeNull();
    // And the SDK was loaded against the frame's window, not this page's.
    expect(mockLoadClientView).toHaveBeenCalledWith(frame.contentWindow);
    expect(mockLoadClientView).not.toHaveBeenCalledWith(window);
  });

  it('downloads nothing until the user has asked to join', async () => {
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    expect(mockLoadClientView).not.toHaveBeenCalled();
    expect(screen.queryByTestId('meet-client-root')).toBeNull();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('bootstraps once and reuses it on a second join in the same page life', async () => {
    await joinClientView();

    serve(ok(sdkPayload()));
    clickJoin();
    await deliverFrameDocument();
    await waitFor(() => expect(mockClientJoin).toHaveBeenCalledTimes(2));

    expect(mockClientInit).toHaveBeenCalledTimes(1);
    expect(mockPrepareWebSDK).toHaveBeenCalledTimes(1);
  });

  it('joins on an iPhone too', async () => {
    setUserAgent(IPHONE_UA);
    setViewport(393);

    await joinClientView();

    expect(mockClientJoin).toHaveBeenCalledTimes(1);
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
  });

  it('falls back to the link when Client View itself refuses the join', async () => {
    mockClientJoin.mockImplementation((options: { error: (reason: unknown) => void }) =>
      options.error({ type: 'JOIN_MEETING_FAILED' })
    );
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await deliverFrameDocument();

    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer')
    );
    // The same one extra request every other embed failure makes — no new surface.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1]).toMatchObject({
      body: JSON.stringify({ fallback: 'link' }),
    });
  });
});

/**
 * [D3] — the r3 behaviour this chunk reverses. Desktop Firefox used to download the
 * 3.7 MB Component View bundle, fail, and only then fall back; Zoom's browser-support
 * matrix lists Component View as unsupported there. The assertion is that the LOADER is
 * never called, not merely that the embed did not mount.
 */
describe('JoinMeetingButton — desktop Firefox never loads the Component View bundle [D3]', () => {
  beforeEach(() => {
    setUserAgent(DESKTOP_FIREFOX_UA);
    setViewport(1440);
  });

  it('never calls the Component View loader, at any point in the flow', async () => {
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await deliverFrameDocument();
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();

    await waitFor(() => expect(mockClientJoin).toHaveBeenCalled());

    // Past a completed join, and still never asked for.
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('takes Client View rather than the link — Firefox is a supported browser there', async () => {
    await joinClientView();

    expect(mockClientJoin).toHaveBeenCalledTimes(1);
    expect(mockOpen).not.toHaveBeenCalled();
  });
});

describe('JoinMeetingButton — the two views are mutually exclusive [D4]', () => {
  it('a Client View join mounts no Component View root and loads no Component View bundle', async () => {
    await joinClientView();

    expect(screen.queryByTestId('meet-embed-root')).toBeNull();
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
    expect(screen.getByTestId('meet-client-root')).toBeInTheDocument();
  });

  it('a Component View join mounts no Client View root and loads no Client View bundle', async () => {
    onDesktopChrome();
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    // Component View keeps r3's preflight — Zoom's preview screen exists on the other
    // path only, so this is still the one place a school machine is checked.
    await screen.findByTestId('meet-prejoin-check');
    fireEvent.click(screen.getByTestId('meet-prejoin-continue'));
    await waitFor(() => expect(mockComponentJoin).toHaveBeenCalled());

    expect(screen.queryByTestId('meet-client-root')).toBeNull();
    expect(document.getElementById(CLIENT_VIEW_ROOT_ID)).toBeNull();
    expect(mockLoadClientView).not.toHaveBeenCalled();
  });

  it('never has both roots in the document at the same time, from idle to joined', async () => {
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    const rootsMounted = () =>
      [
        screen.queryByTestId('meet-embed-root'),
        // Client View's surface in THIS document is the frame; its root is inside it.
        screen.queryByTestId('meet-client-root'),
      ].filter(Boolean).length;

    expect(rootsMounted()).toBe(0);

    clickJoin();
    await deliverFrameDocument();
    expect(rootsMounted()).toBe(1);

    await waitFor(() => expect(mockClientJoin).toHaveBeenCalled());
    expect(rootsMounted()).toBe(1);
  });
});

describe('JoinMeetingButton — a browser that can run neither view [D5]', () => {
  it('lands in link mode through the existing fallback, with no new server surface', async () => {
    // No media engine: Component View cannot run here and neither can Client View.
    vi.stubGlobal('WebAssembly', undefined);
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer')
    );
    expect(screen.queryByTestId('meet-prejoin-check')).toBeNull();
    expect(mockLoadClientView).not.toHaveBeenCalled();
    expect(mockLoadMeetingSdk).not.toHaveBeenCalled();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]).toEqual([
      JOIN_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallback: 'link' }),
      },
    ]);
  });
});

/**
 * [D6], as Sol M1 leaves it.
 *
 * r4's version of this block asserted a blocked-popup report and a retry button. Both
 * are gone: `window.open` under `noopener` returns `null` whether or not the tab was
 * created, so the report was fired at every user of the fallback, and the retry it
 * offered went back through a fetch — landing outside the user's gesture again, where
 * the same browser could refuse it again. What is left is a real link, which is a
 * gesture by definition and therefore cannot be refused.
 */
describe('JoinMeetingButton — the fallback leaves a link, not a verdict [D6] [M1]', () => {
  async function reachFallback() {
    onDesktopChrome();
    mockComponentJoin.mockRejectedValue(new Error('join'));
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    clickContinue();
    await screen.findByTestId('meet-join-link');
  }

  it('states what it actually knows, and offers the link', async () => {
    await reachFallback();

    expect(screen.getByTestId('meet-join-link')).toHaveTextContent(
      'Abrimos Zoom en una pestaña nueva. Si no la ves, usa el enlace:'
    );
    const link = screen.getByTestId('meet-join-open-link');
    expect(link).toHaveTextContent('Abrir Zoom en otra pestaña');
    expect(link).toHaveAttribute('href', JOIN_URL);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Nothing claims a block, because nothing can know.
    expect(screen.queryByTestId('meet-join-error')).toBeNull();
    // The URL is offered, never displayed.
    expect(screen.queryByText(JOIN_URL)).toBeNull();
  });

  it('spends no second request and no second embed attempt to offer it', async () => {
    await reachFallback();

    // One embed attempt, one fallback request — and the link needs no third thing.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockLoadMeetingSdk).toHaveBeenCalledTimes(1);
    expect(mockComponentJoin).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('meet-prejoin-check')).toBeNull();
    // The control the old design offered — a retry that re-POSTed — is gone.
    expect(screen.queryByTestId('meet-join-retry-link')).toBeNull();
  });

  it('is absent from every denial, and from the primary link path', async () => {
    onMobile();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 410,
      json: async () => ({ error: 'Esta reunión ya no está disponible' }),
    });
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();

    await screen.findByTestId('meet-join-error');
    expect(screen.queryByTestId('meet-join-link')).toBeNull();
    expect(screen.queryByTestId('meet-join-open-link')).toBeNull();
  });
});

describe('JoinMeetingButton — the credentials leave no trace on Client View either [D7]', () => {
  const secrets = [SIGNATURE, PASSCODE, ZAK];

  it('never renders the signature, the passcode or the ZAK, at any point in the flow', async () => {
    serve(ok(sdkPayload({ role: 'host', zak: ZAK })));
    const { container } = render(<JoinMeetingButton sessionId={SESSION_ID} />);

    for (const secret of secrets) expect(container.innerHTML).not.toContain(secret);

    clickJoin();
    // Holding credentials, mounting the frame — the moment they are most alive.
    await deliverFrameDocument();
    for (const secret of secrets) expect(container.innerHTML).not.toContain(secret);

    await waitFor(() => expect(mockClientJoin).toHaveBeenCalled());
    for (const secret of secrets) expect(container.innerHTML).not.toContain(secret);
    // Client View's root is Zoom's to fill; nothing of ours is written into it.
    expect(screen.getByTestId('meet-client-root').innerHTML).toBe('');
  });

  it('never writes any of them to the console, on the happy path or on a failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );

    try {
      mockClientJoin.mockImplementation((options: { error: (reason: unknown) => void }) =>
        options.error({ type: 'JOIN_MEETING_FAILED', signature: SIGNATURE })
      );
      serve(ok(sdkPayload({ role: 'host', zak: ZAK })));
      render(<JoinMeetingButton sessionId={SESSION_ID} />);

      clickJoin();
      await deliverFrameDocument();
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
    await joinClientView(sdkPayload({ role: 'host', zak: ZAK }));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    serve(ok({ mode: 'pending' }));
    clickJoin();

    await screen.findByTestId('meet-join-pending');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockClientJoin).toHaveBeenCalledTimes(1);
  });
});
