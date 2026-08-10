// @vitest-environment jsdom
/**
 * Z3-3 [C3] [C4] — the CDN loader for Zoom's Component View bundle.
 *
 * Two facts cost real time to rediscover in Z0B and are asserted here so they cannot
 * be lost to a refactor: the vendor React pair must load BEFORE the main bundle, and
 * one at a time. Parallel loading races React against the bundle that declares it an
 * external, and the bundle then throws while evaluating and never assigns its global.
 *
 * jsdom does not fetch script `src`s, so every load and error event below is driven
 * deliberately — which is also what makes the ordering assertion exact.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadMeetingSdk,
  SDK_DOWNLOAD_FAILED_MESSAGE,
  SDK_DOWNLOAD_TIMEOUT_MS,
  SDK_SRC,
  SDK_VENDOR_SRCS,
} from '../../../lib/meet/zoom-sdk-loader';

type SdkWindow = Window & { ZoomMtgEmbedded?: unknown };

const SDK_GLOBAL = { createClient: () => ({}) };

/** Every src the loader appended, in the order it appended them. */
let appended: string[];
/** Scripts appended but not yet resolved — the lever for the sequencing test. */
let pending: HTMLScriptElement[];

/**
 * Intercepts the appends and settles each one on the next tick, so `await` in the
 * loader advances exactly one script at a time.
 */
function primeCdn(options: { failOn?: string; assignGlobal?: boolean } = {}) {
  const { failOn, assignGlobal = true } = options;
  const originalAppend = HTMLElement.prototype.appendChild;

  vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
    const script = node as HTMLScriptElement;
    const src = script.dataset.zoomEmbedSrc ?? '';
    appended.push(src);
    const result = originalAppend.call(document.head, script);
    pending.push(script);

    setTimeout(() => {
      if (src === failOn) {
        script.dispatchEvent(new Event('error'));
        return;
      }
      if (src === SDK_SRC && assignGlobal) {
        (window as SdkWindow).ZoomMtgEmbedded = SDK_GLOBAL;
      }
      script.dispatchEvent(new Event('load'));
    }, 0);

    return result;
  }) as typeof document.head.appendChild);
}

beforeEach(() => {
  appended = [];
  pending = [];
  // The document and the window survive between tests in one file — which is exactly
  // the state the reuse test depends on, so clear it deliberately here.
  delete (window as SdkWindow).ZoomMtgEmbedded;
  document.head
    .querySelectorAll('script[data-zoom-embed-src]')
    .forEach((script) => script.remove());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadMeetingSdk [C3]', () => {
  it('loads the vendor React pair first, in order, and the bundle last', async () => {
    primeCdn();

    await expect(loadMeetingSdk()).resolves.toBe(SDK_GLOBAL);

    expect(appended).toEqual([...SDK_VENDOR_SRCS, SDK_SRC]);
  });

  it('waits for each vendor script before appending the next one', async () => {
    // No events at all: whatever is appended first is all that can be appended.
    vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      const script = node as HTMLScriptElement;
      appended.push(script.dataset.zoomEmbedSrc ?? '');
      return node;
    }) as typeof document.head.appendChild);

    // The rejection is swallowed on purpose: nothing ever answers this load, so it now
    // rejects at its deadline (Z3-r5) long after this test has made its point.
    void loadMeetingSdk().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Parallel loading would have appended all three by now, and the bundle would be
    // evaluating without `window.React`.
    expect(appended).toEqual([SDK_VENDOR_SRCS[0]]);
  });

  it('a second join reuses the loaded SDK and appends no further script tags', async () => {
    primeCdn();

    await loadMeetingSdk();
    expect(appended).toHaveLength(3);

    await expect(loadMeetingSdk()).resolves.toBe(SDK_GLOBAL);
    expect(appended).toHaveLength(3);
  });

  it('rejects with the school-facing message when the CDN is unreachable [C4]', async () => {
    primeCdn({ failOn: SDK_VENDOR_SRCS[0] });

    await expect(loadMeetingSdk()).rejects.toThrow(SDK_DOWNLOAD_FAILED_MESSAGE);
    // The bundle is never asked for once React failed.
    expect(appended).toEqual([SDK_VENDOR_SRCS[0]]);
  });

  it('rejects when the main bundle itself fails to download [C4]', async () => {
    primeCdn({ failOn: SDK_SRC });

    await expect(loadMeetingSdk()).rejects.toThrow(SDK_DOWNLOAD_FAILED_MESSAGE);
    expect(appended).toEqual([...SDK_VENDOR_SRCS, SDK_SRC]);
  });

  it('rejects when the bundle loads but never assigns its global [C4]', async () => {
    primeCdn({ assignGlobal: false });

    await expect(loadMeetingSdk()).rejects.toThrow(/no quedó disponible/);
  });

  /**
   * Sol M3 — the two ways this loader used to hang forever.
   *
   * Nothing downstream can recover from a promise that never settles: the link fallback
   * starts from the `catch` in `JoinMeetingButton`, so a load that neither resolves nor
   * rejects leaves the UI busy with no way out. On a school network — the scenario the
   * fallback exists for — a stalled download is the likely path, not the exotic one.
   */
  it('stops waiting on a script that never answers, and drops the dead node', async () => {
    vi.useFakeTimers();
    try {
      // Appended and never answered: a proxy that accepts the connection and stalls.
      vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
        const script = node as HTMLScriptElement;
        appended.push(script.dataset.zoomEmbedSrc ?? '');
        return HTMLElement.prototype.appendChild.call(document.head, script);
      }) as typeof document.head.appendChild);

      const settled = expect(loadMeetingSdk()).rejects.toThrow(SDK_DOWNLOAD_FAILED_MESSAGE);
      await vi.advanceTimersByTimeAsync(SDK_DOWNLOAD_TIMEOUT_MS);
      await settled;

      expect(appended).toEqual([SDK_VENDOR_SRCS[0]]);
      // Removed, so the retry below starts from a clean document.
      expect(document.head.querySelector('script[data-zoom-embed-src]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('replaces a script that already failed, so a retry can make progress', async () => {
    primeCdn({ failOn: SDK_VENDOR_SRCS[0] });
    await expect(loadMeetingSdk()).rejects.toThrow(SDK_DOWNLOAD_FAILED_MESSAGE);
    expect(appended).toEqual([SDK_VENDOR_SRCS[0]]);

    vi.restoreAllMocks();
    appended = [];
    primeCdn();

    // The previous version reused the tag it found. A script element that has already
    // fired `error` never fires again, so the retry waited on a promise that could not
    // settle — and the second attempt, the one made once the network came back, was the
    // one guaranteed to hang.
    await expect(loadMeetingSdk()).resolves.toBe(SDK_GLOBAL);
    expect(appended).toEqual([...SDK_VENDOR_SRCS, SDK_SRC]);
  });

  it('does not re-append a tag it already loaded when asked again after a reset', async () => {
    primeCdn();
    await loadMeetingSdk();

    // The global is what a fresh page load would lose; the tags are not.
    delete (window as SdkWindow).ZoomMtgEmbedded;
    appended = [];

    await expect(loadMeetingSdk()).rejects.toThrow(/no quedó disponible/);
    // Every tag was reused: the 3.7 MB bundle is not downloaded twice.
    expect(appended).toEqual([]);
  });
});
