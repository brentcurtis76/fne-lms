// @vitest-environment jsdom
/**
 * Z3-r5 (Sol M3) — every transition between "continue" and "the meeting is on screen"
 * is bounded, and a hang reaches the link fallback with the busy state cleared.
 *
 * The finding this file exists for: the link fallback starts from the `catch` in
 * `JoinMeetingButton`, so **if nothing ever throws, nothing ever falls back**. A stalled
 * CDN download, an `init` that never resolves, a Client View that calls neither callback
 * — each of them used to leave the join spinning forever, on exactly the school network
 * the fallback was written for.
 *
 * ## No module mocks here, on purpose
 *
 * The other two SDK suites stub `loadMeetingSdk` / `loadClientView`, which would stub
 * out the very deadlines under test. This file drives the REAL loaders and controls them
 * the way a browser does:
 *
 *  - a **stalled download** is simply jsdom's own behaviour — it never fetches a script
 *    `src`, so no `load` and no `error` ever arrive, which is precisely the hang;
 *  - a **silent SDK** is a global assigned before the fact, so the real loader
 *    short-circuits to it without appending anything.
 *
 * Synthetic ids, signature, passcode and ZAK only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

const { mockReplace, mockAsPath } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockAsPath: { value: '/meet/session/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22' },
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace, asPath: mockAsPath.value }),
}));

import JoinMeetingButton from '../../../components/sessions/JoinMeetingButton';
import {
  SDK_CALL_TIMEOUT_MS,
  SDK_DOWNLOAD_TIMEOUT_MS,
} from '../../../lib/meet/zoom-sdk-loader';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const JOIN_ENDPOINT = `/api/meet/session/${SESSION_ID}/join`;
const JOIN_URL = 'https://zoom.example.test/j/90210042001?pwd=synthetic';

const sdkPayload = {
  mode: 'sdk',
  signature: 'SYNTHETIC.SDK.SIGNATURE',
  sdk_key: 'SYNTHETIC_SDK_CLIENT_ID',
  meeting_number: '90210042001',
  passcode: 'SYNTH0142',
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

function isFallbackRequest(init?: RequestInit): boolean {
  return typeof init?.body === 'string' && init.body.includes('"fallback":"link"');
}

type SdkWindow = Window & { ZoomMtgEmbedded?: unknown; ZoomMtg?: unknown };

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

function setBrowser(userAgent: string, width: number) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

/** A promise that models the thing under test: it never settles. */
function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('open', mockOpen);
  // What a real browser returns under `noopener` (Sol M1) — success or block alike.
  mockOpen.mockReturnValue(null);

  mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(isFallbackRequest(init) ? ok(linkPayload) : ok(sdkPayload))
  );

  delete (window as SdkWindow).ZoomMtgEmbedded;
  delete (window as SdkWindow).ZoomMtg;
  document.head
    .querySelectorAll('script[data-zoom-embed-src]')
    .forEach((script) => script.remove());

  setBrowser(DESKTOP_UA, 1280);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Click through to the preflight on real timers, then hand the clock over. `findBy*`
 * polls, so it cannot run under a clock nothing is advancing.
 */
async function reachPreflight() {
  render(<JoinMeetingButton sessionId={SESSION_ID} />);
  fireEvent.click(screen.getByTestId('meet-join-button'));
  await screen.findByTestId('meet-prejoin-check');
  vi.useFakeTimers();
  fireEvent.click(screen.getByTestId('meet-prejoin-continue'));
}

/** Deliver the isolated document — jsdom never finishes navigating it. See M4. */
function deliverFrameDocument() {
  const frame = screen.queryByTestId('meet-client-root');
  if (frame) fireEvent.load(frame);
}

async function runOutTheClock(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms + 1_000);
  });
  vi.useRealTimers();
}

/** What every case below must end at: the link, offered, with the UI released. */
function expectFellBackToLink() {
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
  expect(screen.getByTestId('meet-join-open-link')).toHaveAttribute('href', JOIN_URL);
  // Released: the spinner is gone and the control is pressable again.
  expect(screen.getByTestId('meet-join-button')).toBeEnabled();
  expect(screen.queryByTestId('meet-embed-connecting')).toBeNull();
}

describe('JoinMeetingButton — a stalled download reaches the link [M3]', () => {
  it('gives up on a CDN that never answers, and falls back', async () => {
    // No global and no script events: the real loader appends Zoom's first vendor file
    // and waits on a `load` that is never coming.
    await reachPreflight();

    expect(document.head.querySelectorAll('script[data-zoom-embed-src]')).toHaveLength(1);
    // Still waiting, one second before the deadline.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SDK_DOWNLOAD_TIMEOUT_MS - 1_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('meet-embed-connecting')).toBeInTheDocument();

    await runOutTheClock(2_000);

    expectFellBackToLink();
  });
});

describe('JoinMeetingButton — a silent SDK reaches the link [M3]', () => {
  it('gives up on a Component View init that never resolves', async () => {
    (window as SdkWindow).ZoomMtgEmbedded = {
      createClient: () => ({
        init: () => neverSettles<void>(),
        join: () => Promise.resolve(),
        leave: () => Promise.resolve(),
      }),
    };

    await reachPreflight();
    await runOutTheClock(SDK_CALL_TIMEOUT_MS);

    expectFellBackToLink();
  });

  it('gives up on a Component View join that never resolves', async () => {
    (window as SdkWindow).ZoomMtgEmbedded = {
      createClient: () => ({
        init: () => Promise.resolve(),
        join: () => neverSettles<void>(),
        leave: () => Promise.resolve(),
      }),
    };

    await reachPreflight();
    await runOutTheClock(SDK_CALL_TIMEOUT_MS);

    expectFellBackToLink();
  });

  it('gives up on a Client View that calls neither callback', async () => {
    setBrowser(ANDROID_UA, 390);
    (window as SdkWindow).ZoomMtg = {
      setZoomJSLib: () => {},
      preLoadWasm: () => {},
      prepareWebSDK: () => {},
      i18n: { load: () => Promise.resolve() },
      // Neither `success` nor `error`. Before this round the join simply never returned.
      init: () => {},
      join: () => {},
    };

    await reachPreflight();
    deliverFrameDocument();
    await runOutTheClock(SDK_CALL_TIMEOUT_MS);

    expectFellBackToLink();
  });

  it('gives up on a localization load that never settles', async () => {
    setBrowser(ANDROID_UA, 390);
    (window as SdkWindow).ZoomMtg = {
      setZoomJSLib: () => {},
      preLoadWasm: () => {},
      prepareWebSDK: () => {},
      // M2 made this an awaited call, which makes it one more place that can hang.
      i18n: { load: () => neverSettles<void>() },
      init: (options: { success: () => void }) => options.success(),
      join: (options: { success: () => void }) => options.success(),
    };

    await reachPreflight();
    deliverFrameDocument();
    await runOutTheClock(SDK_CALL_TIMEOUT_MS);

    expectFellBackToLink();
  });

  it('gives up on an isolated frame whose document never arrives', async () => {
    setBrowser(ANDROID_UA, 390);

    // No `deliverFrameDocument()`: jsdom's own never-completing navigation IS the case.
    await reachPreflight();
    await runOutTheClock(SDK_CALL_TIMEOUT_MS);

    expectFellBackToLink();
  });
});
