// @vitest-environment jsdom
/**
 * Z3-r8 [U1] [U4] [U5] — the owner ruling, at the component level.
 *
 * > Zoom's pre-join screen IS the intended UX on Client View. It is the vendor's device
 * > check, in the meeting's own context, and it is better than the one we built.
 *
 * Three things follow from that and all three are asserted here, against the DOM and the
 * SDK calls rather than against component internals:
 *
 *  - **[U5]** our `PreJoinCheck` does not render on the Client View path, and does render
 *    on the Component View path, where Zoom has no preview screen to be the preflight;
 *  - **[U1]** a user who takes far longer than the old 45 s bound to press «Entrar» still
 *    joins — no deadline, no teardown, no yank to a link;
 *  - **[U4]** a GENERA control reaches the link for as long as Zoom's screen is up, over
 *    a frame that fills the viewport, through the same `{fallback:'link'}` request the
 *    preflight's escape hatch makes — no new server surface.
 *
 * A fourth file rather than an edit to `JoinMeetingButton.clientview.test.tsx`, for the
 * reason that file gives for being a third: what is already there is the standing proof
 * of Z3-4's rulings and is worth more as it stands than merged into this.
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

// Only the downloads are stubbed. `awaitClientViewJoin` — the thing under test — stays
// the real one, so the deadline that runs below is the shipped deadline.
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
  CLIENT_VIEW_RENDER_POLL_MS,
  CLIENT_VIEW_ROOT_ID,
} from '../../../lib/meet/zoom-client-view-loader';
import { SDK_CALL_TIMEOUT_MS } from '../../../lib/meet/zoom-sdk-loader';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const JOIN_ENDPOINT = `/api/meet/session/${SESSION_ID}/join`;
const JOIN_URL = 'https://zoom.example.test/j/90210042001?pwd=synthetic';

const SIGNATURE = 'SYNTHETIC.SDK.SIGNATURE';
const PASSCODE = 'SYNTH0142';

/** Longer than the bound that used to yank the user, by a wide margin. */
const A_LONG_DELIBERATION_MS = 5 * 60 * 1_000;

const sdkPayload = {
  mode: 'sdk',
  signature: SIGNATURE,
  sdk_key: 'SYNTHETIC_SDK_CLIENT_ID',
  meeting_number: '90210042001',
  passcode: PASSCODE,
  user_name: 'Camila Sintética',
  customer_key: '7d2f9a4158c34e779b106a4e2c8d0f31',
  role: 'participant',
};

const linkPayload = { mode: 'link', join_url: JOIN_URL, role: 'participant' };

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

const mockFetch = vi.fn();
const mockOpen = vi.fn();

const mockClientJoin = vi.fn();
const mockComponentInit = vi.fn();
const mockComponentJoin = vi.fn();

function isFallbackRequest(init?: RequestInit): boolean {
  return typeof init?.body === 'string' && init.body.includes('"fallback":"link"');
}

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function setBrowser(userAgent: string, width: number) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

/**
 * The static document arriving in the frame.
 *
 * jsdom never finishes navigating it, so what sits there is the `about:blank` placeholder
 * every real browser puts in a fresh frame first — and telling the two apart is exactly
 * what `awaitClientViewFrame` does, by looking for the root this file exists to provide.
 */
function deliverFrameDocument(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument as Document;
  if (doc.getElementById(CLIENT_VIEW_ROOT_ID)) return;
  const root = doc.createElement('div');
  root.id = CLIENT_VIEW_ROOT_ID;
  const documentElement =
    doc.documentElement ?? (doc.appendChild(doc.createElement('html')) as HTMLElement);
  documentElement.appendChild(root);
}

/**
 * Zoom's pre-join screen, reduced to the property the signal reads: something to press,
 * with a layout box, inside the root Zoom looks up by id.
 *
 * jsdom has no layout engine, so `getClientRects()` is the one browser fact supplied by
 * hand. Everything else — the root, the frame's document, the selector — is real.
 */
function renderZoomPreJoinScreen(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument as Document;
  deliverFrameDocument(frame);
  const root = doc.getElementById(CLIENT_VIEW_ROOT_ID) as HTMLElement;
  const entrar = doc.createElement('button');
  entrar.textContent = 'Entrar';
  entrar.getClientRects = () => [{ width: 96, height: 36 }] as unknown as DOMRectList;
  root.appendChild(entrar);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('open', mockOpen);
  mockOpen.mockReturnValue(null);

  mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(isFallbackRequest(init) ? ok(linkPayload) : ok(sdkPayload))
  );

  mockComponentInit.mockResolvedValue(undefined);
  mockComponentJoin.mockResolvedValue(undefined);
  mockLoadMeetingSdk.mockResolvedValue({
    createClient: () => ({
      init: mockComponentInit,
      join: mockComponentJoin,
      leave: vi.fn(),
    }),
  });

  mockLoadClientView.mockResolvedValue({
    setZoomJSLib: vi.fn(),
    preLoadWasm: vi.fn(),
    prepareWebSDK: vi.fn(),
    i18n: { load: vi.fn().mockResolvedValue(undefined) },
    init: (options: { success: () => void }) => options.success(),
    join: mockClientJoin,
  });

  setBrowser(ANDROID_UA, 390);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Drive a Client View join up to Zoom's own pre-join screen and stop there.
 *
 * The clock is fake from before the click, because every deadline this file is about is
 * armed by the effect that click sets off. Returns the `success` callback Zoom would
 * call — i.e. the «Entrar» button, in the hands of the test.
 */
async function reachZoomPreJoinScreen() {
  let enterTheMeeting = () => {};
  mockClientJoin.mockImplementation((options: { success: () => void }) => {
    enterTheMeeting = options.success;
  });

  render(<JoinMeetingButton sessionId={SESSION_ID} />);
  vi.useFakeTimers();
  fireEvent.click(screen.getByTestId('meet-join-button'));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  const frame = screen.getByTestId('meet-client-root') as HTMLIFrameElement;
  await act(async () => {
    deliverFrameDocument(frame);
    await vi.advanceTimersByTimeAsync(CLIENT_VIEW_RENDER_POLL_MS + 50);
  });

  await act(async () => {
    // Zoom's bundle puts its screen up a few seconds in — the part that IS ours to bound.
    await vi.advanceTimersByTimeAsync(4_000);
    renderZoomPreJoinScreen(frame);
    await vi.advanceTimersByTimeAsync(1_000);
  });

  return { frame, enter: () => enterTheMeeting() };
}

describe('JoinMeetingButton — Zoom’s screen is the preflight on Client View [U5]', () => {
  it('never renders ours, from the click through to a joined meeting', async () => {
    const { enter } = await reachZoomPreJoinScreen();

    expect(screen.queryByTestId('meet-prejoin-check')).toBeNull();
    expect(screen.queryByTestId('meet-prejoin-continue')).toBeNull();
    // One click of ours, and the SDK was already asked to join.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockClientJoin).toHaveBeenCalledTimes(1);

    enter();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId('meet-prejoin-check')).toBeNull();
  });

  it('keeps ours on Component View, where Zoom has no preview screen at all', async () => {
    setBrowser(DESKTOP_CHROME_UA, 1280);
    render(<JoinMeetingButton sessionId={SESSION_ID} />);

    fireEvent.click(screen.getByTestId('meet-join-button'));

    // r3's preflight, exactly where r3 put it: nothing joins until it is answered.
    await screen.findByTestId('meet-prejoin-check');
    expect(mockComponentJoin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('meet-prejoin-continue'));
    await waitFor(() => expect(mockComponentJoin).toHaveBeenCalledTimes(1));
  });
});

describe('JoinMeetingButton — the user takes as long as they like [U1]', () => {
  it('joins after a deliberation far longer than the old 45 s bound, with no fallback', async () => {
    const { enter } = await reachZoomPreJoinScreen();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(A_LONG_DELIBERATION_MS);
    });

    // The exact failure this round replaces: at 46 s the old build had already fetched
    // the link, opened a tab and unmounted the embed.
    expect(A_LONG_DELIBERATION_MS).toBeGreaterThan(SDK_CALL_TIMEOUT_MS);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId('meet-client-root')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-join-link')).toBeNull();

    enter();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Joined, on the embed, after five minutes of thinking about it.
    expect(screen.getByTestId('meet-client-root')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-embed-connecting')).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('JoinMeetingButton — an SDK that never renders is still bounded [U2]', () => {
  it('reaches the link when the bundle loads, the join is called and no screen appears', async () => {
    // Everything upstream succeeds: the frame arrives, the bundle is there, `init`
    // answers, `join` is called. Then nothing — no screen, no callback. The failure the
    // deadline is FOR, and the one the machine bound must still catch.
    mockClientJoin.mockImplementation(() => {});

    render(<JoinMeetingButton sessionId={SESSION_ID} />);
    vi.useFakeTimers();
    fireEvent.click(screen.getByTestId('meet-join-button'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      deliverFrameDocument(screen.getByTestId('meet-client-root') as HTMLIFrameElement);
      await vi.advanceTimersByTimeAsync(CLIENT_VIEW_RENDER_POLL_MS + 50);
    });
    expect(mockClientJoin).toHaveBeenCalledTimes(1);

    // One second short of the bound: still waiting, nothing torn down.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SDK_CALL_TIMEOUT_MS - 1_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockOpen).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1]).toMatchObject({
      body: JSON.stringify({ fallback: 'link' }),
    });
    expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer');
    expect(screen.getByTestId('meet-join-open-link')).toHaveAttribute('href', JOIN_URL);
  });
});

describe('JoinMeetingButton — a GENERA way out, while Zoom holds the viewport [U4]', () => {
  it('offers the link over the frame, and is never disabled by the join it interrupts', async () => {
    await reachZoomPreJoinScreen();

    const hatch = screen.getByTestId('meet-embed-use-link');
    expect(hatch).toBeEnabled();
    expect(hatch).toHaveTextContent('Abrir Zoom en otra pestaña');
    // Above the frame's own `z-50`, or it is behind the thing it exists to escape.
    expect(hatch.parentElement?.className).toContain('fixed');
    expect(hatch.parentElement?.className).toContain('z-[60]');
  });

  it('reaches the link through the existing fallback intent, with no new server surface', async () => {
    await reachZoomPreJoinScreen();

    fireEvent.click(screen.getByTestId('meet-embed-use-link'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]).toEqual([
      JOIN_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallback: 'link' }),
      },
    ]);
    expect(mockOpen).toHaveBeenCalledWith(JOIN_URL, '_blank', 'noopener,noreferrer');
    // The frame that filled the screen is gone, and the link is on the page behind it.
    expect(screen.queryByTestId('meet-client-root')).toBeNull();
    expect(screen.getByTestId('meet-join-open-link')).toHaveAttribute('href', JOIN_URL);
  });

  /**
   * The join it interrupted has no deadline any more, so it is still running when the
   * user walks away from it. It must not come back and speak for the page.
   */
  it('is not overruled by the abandoned join settling afterwards', async () => {
    const { enter } = await reachZoomPreJoinScreen();

    fireEvent.click(screen.getByTestId('meet-embed-use-link'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    enter();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    // Still the link the user asked for: no embed, and no second fallback request.
    expect(screen.getByTestId('meet-join-open-link')).toHaveAttribute('href', JOIN_URL);
    expect(screen.queryByTestId('meet-client-root')).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('is gone once the meeting has been entered — Zoom’s own «Salir» owns that state', async () => {
    const { enter } = await reachZoomPreJoinScreen();

    enter();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByTestId('meet-embed-use-link')).toBeNull();
  });

  it('carries no credential of any kind', async () => {
    const { frame } = await reachZoomPreJoinScreen();
    const hatch = screen.getByTestId('meet-embed-use-link');

    for (const secret of [SIGNATURE, PASSCODE, JOIN_URL]) {
      expect(hatch.outerHTML).not.toContain(secret);
      expect(frame.outerHTML).not.toContain(secret);
    }
  });
});
