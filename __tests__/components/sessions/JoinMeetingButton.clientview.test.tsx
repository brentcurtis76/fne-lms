// @vitest-environment jsdom
/**
 * Z3-r9 [V3] [V4] — **the truth table over `selectEmbedView()`**: the standing proof
 * that Client View is STRUCTURALLY UNREACHABLE while Z3 is the active phase.
 *
 * ## What this file used to say, and why it says the opposite now
 *
 * Until r8 this suite proved that mobile, tablets and Firefox reached Client View. The
 * 2026-08-08 split (plan §15.1) moved Client View to **Z3b**, behind a
 * Client-View-specific field protocol that does not exist yet, and §15's Z3 row now
 * requires the reverse: on every non-Component path, **link mode is requested BEFORE any
 * Client View bundle, iframe, SDK/media worker or Client View join is started**, and a
 * host on that path **mints no ZAK and writes no `zoom_zak_issuances` row**. Every
 * assertion below is that requirement, per branch.
 *
 * ## Why a TABLE and not three user-agent tests (the reviewer's Note 1)
 *
 * "Mobile, tablet, Firefox" is the minimum coverage, not the definition. The selector is
 * `component → client → none` (`lib/meet/embed-capabilities.ts`), and
 * `supportsComponentView()` also refuses **any viewport under 768 px** — so a
 * split-screen desktop user, a low-resolution school monitor and a restored-down browser
 * window are all on the Client View branch too. Three UA tests would have passed while
 * every narrow desktop in a school kept reaching the code this round is closing off. So
 * the table enumerates every branch that can yield a non-`component` answer, and the
 * width branch is in it twice.
 *
 * ## The assertions are NON-CALLS, deliberately
 *
 * "Nothing rendered" is satisfied by a page that downloaded 3.7 MB over a school link,
 * bootstrapped a media worker and then hid the result. So both loaders are stubbed and
 * what is asserted is that they were **never invoked** — and, on the server side, that
 * the ONE request that goes out carries the link intent, so the SDK branch is never
 * entered at all (`__tests__/api/meet/session-join-zak.test.ts` [B12] is that half).
 *
 * The SSR branch of the selector (`typeof window === 'undefined'` → `'none'`) is the one
 * row with no behaviour to assert here: this component's click handler cannot run on a
 * server. It is covered as a pure function in
 * `__tests__/lib/meet/embed-capabilities.test.ts`.
 *
 * Synthetic ids, signature, passcode and ZAK only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockReplace, mockAsPath, mockLoadMeetingSdk, mockLoadClientView } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockAsPath: { value: '/meet/session/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22' },
  mockLoadMeetingSdk: vi.fn(),
  mockLoadClientView: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace, asPath: mockAsPath.value }),
}));

// Only the downloads are stubbed, so every claim below is about a call that either
// happened or did not — which is the claim [V3] actually makes.
vi.mock('../../../lib/meet/zoom-sdk-loader', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, loadMeetingSdk: mockLoadMeetingSdk };
});

vi.mock('../../../lib/meet/zoom-client-view-loader', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, loadClientView: mockLoadClientView };
});

import JoinMeetingButton from '../../../components/sessions/JoinMeetingButton';
import { restoreBrowserFacts } from '../../helpers/browser-facts';
import { CLIENT_VIEW_ROOT_ID } from '../../../lib/meet/zoom-client-view-loader';
import { MIN_EMBED_VIEWPORT_WIDTH, selectEmbedView } from '../../../lib/meet/embed-capabilities';

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

/** True for a request carrying the link intent — since r9 that includes the FIRST one. */
function asksForLink(init?: RequestInit): boolean {
  return typeof init?.body === 'string' && init.body.includes('"fallback":"link"');
}

/**
 * The real server's two answers. `whenAskedForLink` is what the route returns once
 * `wantsLinkFallback` is true: the SDK branch is skipped and nothing else changes.
 */
function serve(whenEmbedAllowed: unknown, whenAskedForLink: unknown = ok(linkPayload)) {
  mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(asksForLink(init) ? whenAskedForLink : whenEmbedAllowed)
  );
}

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

function setPlatform(value: string, maxTouchPoints: number) {
  Object.defineProperty(window.navigator, 'platform', { value, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DESKTOP_FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Firefox on iOS carries no `Firefox/` token at all — `FxiOS` is the whole signal. */
const FIREFOX_IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';

/** iPadOS 13+ ships the macOS user agent; the touch-point count is what gives it away. */
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

/** Desktop Chrome on a normal screen — the one browser that still gets Component View. */
function onDesktopChrome() {
  setUserAgent(DESKTOP_CHROME_UA);
  setViewport(1280);
  setPlatform('Win32', 0);
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

  // Fully working Client View doubles ON PURPOSE: if anything ever reaches them the
  // join would SUCCEED, so a passing assertion below is about reachability and not
  // about a stub that happened to fail.
  mockClientInit.mockImplementation((options: { success: () => void }) => options.success());
  mockClientJoin.mockImplementation((options: { success: () => void }) => options.success());
  mockI18nLoad.mockResolvedValue(undefined);
  mockLoadClientView.mockResolvedValue({
    setZoomJSLib: mockSetZoomJSLib,
    preLoadWasm: mockPreLoadWasm,
    prepareWebSDK: mockPrepareWebSDK,
    i18n: { load: mockI18nLoad },
    init: mockClientInit,
    join: mockClientJoin,
  });

  onDesktopChrome();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreBrowserFacts();
});

const clickJoin = () => fireEvent.click(screen.getByTestId('meet-join-button'));

/** Every Client View surface, in one place, so no row can forget one of them. */
function expectNoClientViewAnywhere() {
  // The bundle.
  expect(mockLoadClientView).not.toHaveBeenCalled();
  // The bootstrap and the media worker it preloads.
  expect(mockSetZoomJSLib).not.toHaveBeenCalled();
  expect(mockPreLoadWasm).not.toHaveBeenCalled();
  expect(mockPrepareWebSDK).not.toHaveBeenCalled();
  // The SDK calls.
  expect(mockI18nLoad).not.toHaveBeenCalled();
  expect(mockClientInit).not.toHaveBeenCalled();
  expect(mockClientJoin).not.toHaveBeenCalled();
  // The iframe, and Zoom's root inside it.
  expect(screen.queryByTestId('meet-client-root')).toBeNull();
  expect(document.getElementById(CLIENT_VIEW_ROOT_ID)).toBeNull();
}

/**
 * One row of the table.
 *
 * `arrange` sets the browser facts; `expects` is what `selectEmbedView()` must answer
 * for them — asserted, so a row cannot silently stop testing the branch it names.
 */
interface Row {
  name: string;
  arrange: () => void;
  expects: 'client' | 'none';
}

const NON_COMPONENT_ROWS: Row[] = [
  {
    name: 'an Android phone',
    arrange: () => {
      setUserAgent(ANDROID_UA);
      setViewport(390);
    },
    expects: 'client',
  },
  {
    name: 'an iPhone',
    arrange: () => {
      setUserAgent(IPHONE_UA);
      setViewport(393);
    },
    expects: 'client',
  },
  {
    name: 'Firefox on iOS, which carries no Firefox/ token',
    arrange: () => {
      setUserAgent(FIREFOX_IOS_UA);
      setViewport(393);
    },
    expects: 'client',
  },
  {
    name: 'an iPad reporting the desktop macOS user agent',
    arrange: () => {
      setUserAgent(IPAD_DESKTOP_UA);
      setViewport(1024);
      setPlatform('MacIntel', 5);
    },
    expects: 'client',
  },
  {
    name: 'desktop Firefox on a wide screen',
    arrange: () => {
      setUserAgent(DESKTOP_FIREFOX_UA);
      setViewport(1440);
    },
    expects: 'client',
  },
  {
    // Note 1: the population three UA tests would have missed entirely.
    name: 'a DESKTOP Chrome window one pixel below the floor — split screen, or a low-resolution school monitor',
    arrange: () => {
      setUserAgent(DESKTOP_CHROME_UA);
      setViewport(MIN_EMBED_VIEWPORT_WIDTH - 1);
    },
    expects: 'client',
  },
  {
    name: 'an old phone with no WebAssembly — neither view has a media engine there',
    arrange: () => {
      setUserAgent(ANDROID_UA);
      setViewport(390);
      vi.stubGlobal('WebAssembly', undefined);
    },
    expects: 'none',
  },
  {
    name: 'a narrow DESKTOP window with no WebAssembly',
    arrange: () => {
      setUserAgent(DESKTOP_CHROME_UA);
      setViewport(MIN_EMBED_VIEWPORT_WIDTH - 1);
      vi.stubGlobal('WebAssembly', undefined);
    },
    expects: 'none',
  },
];

describe('[V3] the truth table — every non-Component branch requests link mode first', () => {
  for (const row of NON_COMPONENT_ROWS) {
    describe(row.name, () => {
      beforeEach(() => {
        row.arrange();
      });

      it(`selects '${row.expects}', so it is a row of this table at all`, () => {
        expect(selectEmbedView()).toBe(row.expects);
      });

      it('sends ONE request, and it carries the link intent', async () => {
        serve(ok(sdkPayload()));
        render(<JoinMeetingButton sessionId={SESSION_ID} />);

        clickJoin();
        await waitFor(() => expect(mockOpen).toHaveBeenCalled());

        // One. Not "an SDK request, then a fallback" — the credential-minting request
        // is the one that must not be made.
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch.mock.calls[0]).toEqual([
          JOIN_ENDPOINT,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fallback: 'link' }),
          },
        ]);
      });

      it('reaches no Client View loader, bundle, worker, iframe or SDK call', async () => {
        serve(ok(sdkPayload()));
        render(<JoinMeetingButton sessionId={SESSION_ID} />);

        clickJoin();
        await waitFor(() => expect(mockOpen).toHaveBeenCalled());

        expectNoClientViewAnywhere();
        // Nor the other bundle: this browser downloads neither.
        expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
        expect(mockCreateClient).not.toHaveBeenCalled();
      });

      it('lands in link mode, on the primary path Z2 shipped', async () => {
        serve(ok(sdkPayload()));
        render(<JoinMeetingButton sessionId={SESSION_ID} />);

        clickJoin();
        await waitFor(() =>
          expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer')
        );

        // Neither embed surface, and no preflight of ours.
        expect(screen.queryByTestId('meet-embed-root')).toBeNull();
        expect(screen.queryByTestId('meet-prejoin-check')).toBeNull();
        expect(screen.queryByTestId('meet-join-error')).toBeNull();
        // Byte-for-byte the Z2 outcome: the link block belongs to the POST-FAILURE
        // fallback, and nothing failed here.
        expect(screen.queryByTestId('meet-join-link')).toBeNull();
        await waitFor(() => expect(screen.getByTestId('meet-join-button')).toBeEnabled());
      });

      it('starts nothing even if the server answers with an SDK payload anyway', async () => {
        // A contract violation, not a real answer — the route skips its SDK branch when
        // `fallback: 'link'` is set. Asserted because "unreachable" must not depend on
        // the server being correct: a client that reached Client View from a payload it
        // asked not to receive would be reachable by a misconfiguration.
        serve(ok(sdkPayload({ role: 'host', zak: ZAK })), ok(sdkPayload({ role: 'host', zak: ZAK })));
        render(<JoinMeetingButton sessionId={SESSION_ID} />);

        clickJoin();
        await screen.findByTestId('meet-join-error');

        expectNoClientViewAnywhere();
        expect(mockLoadMeetingSdk).not.toHaveBeenCalled();
        // One request still. It does not loop asking again.
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  }
});

/**
 * [V3] the positive control. Without it the table above is satisfied by a component
 * that embeds nothing at all, anywhere.
 */
describe('[V3] desktop Chrome on a normal screen still gets Component View', () => {
  it('asks for the embed — no link intent on the first request — and joins through it', async () => {
    expect(selectEmbedView()).toBe('component');
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    // r3's preflight, exactly where it has been: Component View is a widget with no
    // preview screen of its own.
    await screen.findByTestId('meet-prejoin-check');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]).toEqual([JOIN_ENDPOINT, { method: 'POST' }]);

    fireEvent.click(screen.getByTestId('meet-prejoin-continue'));
    await waitFor(() => expect(mockComponentJoin).toHaveBeenCalled());

    expect(mockLoadMeetingSdk).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('meet-embed-root')).toBeInTheDocument();
    expectNoClientViewAnywhere();
  });

  it('exactly at the floor width, which is the boundary the table straddles', async () => {
    setViewport(MIN_EMBED_VIEWPORT_WIDTH);
    expect(selectEmbedView()).toBe('component');

    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    expect(mockFetch.mock.calls[0]).toEqual([JOIN_ENDPOINT, { method: 'POST' }]);
  });
});

/**
 * The gap between the click and the response. `selectEmbedView()` is read twice — once
 * to decide what to ask for, once when the answer lands — and a window resized in
 * between must not carry an SDK payload into a view Z3 does not ship.
 */
describe('[V3] a window resized while the request is in flight', () => {
  it('takes the link rather than the payload it is now the wrong browser for', async () => {
    let deliver: (value: unknown) => void = () => {};
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        })
    );
    mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(asksForLink(init) ? ok(linkPayload) : ok(sdkPayload()))
    );

    render(<JoinMeetingButton sessionId={SESSION_ID} />);
    clickJoin();

    // Split screen, mid-request.
    setViewport(MIN_EMBED_VIEWPORT_WIDTH - 1);
    deliver(ok(sdkPayload()));

    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer')
    );

    expectNoClientViewAnywhere();
    // The SDK payload was refused, and the second request is the existing fallback.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1]).toMatchObject({
      body: JSON.stringify({ fallback: 'link' }),
    });
  });
});

/**
 * [D6], as Sol M1 leaves it — the post-failure fallback, on the one path that can still
 * fail into it. Unchanged by this round, and kept here because it is the standing proof
 * that `keepLinkOnScreen` still distinguishes a failed embed from a browser that asked
 * for the link up front.
 */
describe('JoinMeetingButton — the fallback leaves a link, not a verdict [D6] [M1]', () => {
  async function reachFallback() {
    mockComponentJoin.mockRejectedValue(new Error('join'));
    serve(ok(sdkPayload()));
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    clickJoin();
    await screen.findByTestId('meet-prejoin-check');
    fireEvent.click(screen.getByTestId('meet-prejoin-continue'));
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

  it('spends no second embed attempt to offer it', async () => {
    await reachFallback();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockLoadMeetingSdk).toHaveBeenCalledTimes(1);
    expect(mockComponentJoin).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('meet-prejoin-check')).toBeNull();
  });

  it('is absent from every denial, and from the primary link path', async () => {
    setUserAgent(ANDROID_UA);
    setViewport(390);
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

/**
 * [V4], client side. The server half — no ZAK requested, no `zoom_zak_issuances` row —
 * is `__tests__/api/meet/session-join-zak.test.ts` [B12]. What this proves is that the
 * request which reaches the server carries nothing, and that nothing credential-shaped
 * ever exists in this tree on a non-Component path.
 */
describe('[V4] a non-Component path carries no credentials at all', () => {
  const secrets = [SIGNATURE, PASSCODE, ZAK];

  it('sends only the link intent, and never renders or logs a credential', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    );

    try {
      setUserAgent(ANDROID_UA);
      setViewport(390);
      // The server would have had a host payload for this caller. It is never asked.
      serve(ok(sdkPayload({ role: 'host', zak: ZAK })));
      const { container } = render(<JoinMeetingButton sessionId={SESSION_ID} />);

      clickJoin();
      await waitFor(() => expect(mockOpen).toHaveBeenCalled());

      const sent = String((mockFetch.mock.calls[0][1] as RequestInit).body);
      for (const secret of secrets) expect(sent).not.toContain(secret);
      for (const secret of secrets) expect(container.innerHTML).not.toContain(secret);

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
});
