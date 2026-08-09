// @vitest-environment jsdom
/**
 * Z3-4 [D2] [D4] [D5] — the CDN loader for Zoom's Client View bundle.
 *
 * The same two facts the Component View loader asserts hold here and cost the same time
 * to rediscover: the vendor files must load BEFORE the main bundle, and one at a time.
 * Client View externalises four of them rather than two, so there is more to get wrong.
 *
 * jsdom does not fetch script `src`s, so every load and error event below is driven
 * deliberately — which is also what makes the ordering assertion exact.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  awaitClientViewCall,
  CLIENT_VIEW_SRC,
  CLIENT_VIEW_VENDOR_SRCS,
  loadClientView,
  SDK_DOWNLOAD_FAILED_MESSAGE,
} from '../../../lib/meet/zoom-client-view-loader';
import { SDK_SRC, SDK_VERSION } from '../../../lib/meet/zoom-sdk-loader';

type ClientViewWindow = Window & { ZoomMtg?: unknown };

const CLIENT_VIEW_GLOBAL = { join: () => {} };

/** Every src the loader appended, in the order it appended them. */
let appended: string[];

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

    setTimeout(() => {
      if (src === failOn) {
        script.dispatchEvent(new Event('error'));
        return;
      }
      if (src === CLIENT_VIEW_SRC && assignGlobal) {
        (window as ClientViewWindow).ZoomMtg = CLIENT_VIEW_GLOBAL;
      }
      script.dispatchEvent(new Event('load'));
    }, 0);

    return result;
  }) as typeof document.head.appendChild);
}

beforeEach(() => {
  appended = [];
  delete (window as ClientViewWindow).ZoomMtg;
  document.head
    .querySelectorAll('script[data-zoom-embed-src]')
    .forEach((script) => script.remove());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Client View bundle is a different bundle [D4]', () => {
  it('is not the Component View one, and both are pinned to the same version', () => {
    expect(CLIENT_VIEW_SRC).not.toBe(SDK_SRC);
    expect(CLIENT_VIEW_SRC).toBe(`https://source.zoom.us/${SDK_VERSION}/zoom-meeting-6.2.0.min.js`);
    // A drift between the two would ship one view a version behind the other.
    expect(CLIENT_VIEW_SRC).toContain(SDK_VERSION);
    expect(SDK_SRC).toContain(SDK_VERSION);
  });

  it('brings the Redux pair Component View does not need', () => {
    expect(CLIENT_VIEW_VENDOR_SRCS).toHaveLength(4);
    expect(CLIENT_VIEW_VENDOR_SRCS.filter((src) => src.includes('redux'))).toHaveLength(2);
  });
});

describe('loadClientView [D2]', () => {
  it('loads the four vendor files first, in order, and the bundle last', async () => {
    primeCdn();

    await expect(loadClientView()).resolves.toBe(CLIENT_VIEW_GLOBAL);

    expect(appended).toEqual([...CLIENT_VIEW_VENDOR_SRCS, CLIENT_VIEW_SRC]);
  });

  it('waits for each vendor script before appending the next one', async () => {
    // No events at all: whatever is appended first is all that can be appended.
    vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      const script = node as HTMLScriptElement;
      appended.push(script.dataset.zoomEmbedSrc ?? '');
      return node;
    }) as typeof document.head.appendChild);

    void loadClientView();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Parallel loading would race the bundle against the globals it declares external.
    expect(appended).toEqual([CLIENT_VIEW_VENDOR_SRCS[0]]);
  });

  it('a second join reuses the loaded SDK and appends no further script tags', async () => {
    primeCdn();

    await loadClientView();
    expect(appended).toHaveLength(5);

    await expect(loadClientView()).resolves.toBe(CLIENT_VIEW_GLOBAL);
    expect(appended).toHaveLength(5);
  });

  it('rejects with the school-facing message when the CDN is unreachable [D5]', async () => {
    primeCdn({ failOn: CLIENT_VIEW_VENDOR_SRCS[0] });

    await expect(loadClientView()).rejects.toThrow(SDK_DOWNLOAD_FAILED_MESSAGE);
    // The bundle is never asked for once a vendor file failed.
    expect(appended).toEqual([CLIENT_VIEW_VENDOR_SRCS[0]]);
  });

  it('rejects when the bundle loads but never assigns its global [D5]', async () => {
    primeCdn({ assignGlobal: false });

    await expect(loadClientView()).rejects.toThrow(/no quedó disponible/);
  });

  it('never appends the Component View bundle [D4]', async () => {
    primeCdn();

    await loadClientView();

    expect(appended).not.toContain(SDK_SRC);
  });
});

describe('awaitClientViewCall — callbacks become a promise', () => {
  it('resolves when the SDK reports success', async () => {
    await expect(awaitClientViewCall(({ success }) => success())).resolves.toBeUndefined();
  });

  it('rejects without carrying Zoom’s own reason object into the Error', async () => {
    const reason = { type: 'JOIN_MEETING_FAILED', meetingNumber: '90210042001' };

    await expect(awaitClientViewCall(({ error }) => error(reason))).rejects.toThrow(
      // Whatever the vendor put in the reason stays there: nothing downstream reads it,
      // so moving it into an Error only creates something for a later hand to log.
      'No se pudo entrar a la reunión en esta página.'
    );
    await expect(awaitClientViewCall(({ error }) => error(reason))).rejects.not.toThrow(
      /90210042001/
    );
  });
});
