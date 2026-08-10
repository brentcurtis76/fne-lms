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
  CLIENT_VIEW_STYLE_FAILED_MESSAGE,
  CLIENT_VIEW_STYLE_HREFS,
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
    // Zoom's own stylesheets go through here too since Z3-r5; only scripts are
    // sequenced, and only scripts are what the ordering claims below are about.
    if (script.tagName !== 'SCRIPT') return originalAppend.call(document.head, script);

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
    .querySelectorAll('script[data-zoom-embed-src], link[rel="stylesheet"]')
    .forEach((node) => node.remove());
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

    await expect(loadClientView(window)).resolves.toBe(CLIENT_VIEW_GLOBAL);

    expect(appended).toEqual([...CLIENT_VIEW_VENDOR_SRCS, CLIENT_VIEW_SRC]);
  });

  it('waits for each vendor script before appending the next one', async () => {
    // No events at all: whatever is appended first is all that can be appended.
    vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      const script = node as HTMLScriptElement;
      // Zoom's stylesheets are not sequenced and are not what this claim is about.
      if (script.tagName === 'SCRIPT') appended.push(script.dataset.zoomEmbedSrc ?? '');
      return node;
    }) as typeof document.head.appendChild);

    // Swallowed on purpose: nothing answers this load, so it now rejects at its
    // deadline (Z3-r5) long after this test has made its point.
    void loadClientView(window).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Parallel loading would race the bundle against the globals it declares external.
    expect(appended).toEqual([CLIENT_VIEW_VENDOR_SRCS[0]]);
  });

  it('a second join reuses the loaded SDK and appends no further script tags', async () => {
    primeCdn();

    await loadClientView(window);
    expect(appended).toHaveLength(5);

    await expect(loadClientView(window)).resolves.toBe(CLIENT_VIEW_GLOBAL);
    expect(appended).toHaveLength(5);
  });

  it('rejects with the school-facing message when the CDN is unreachable [D5]', async () => {
    primeCdn({ failOn: CLIENT_VIEW_VENDOR_SRCS[0] });

    await expect(loadClientView(window)).rejects.toThrow(SDK_DOWNLOAD_FAILED_MESSAGE);
    // The bundle is never asked for once a vendor file failed.
    expect(appended).toEqual([CLIENT_VIEW_VENDOR_SRCS[0]]);
  });

  it('rejects when the bundle loads but never assigns its global [D5]', async () => {
    primeCdn({ assignGlobal: false });

    await expect(loadClientView(window)).rejects.toThrow(/no quedó disponible/);
  });

  it('never appends the Component View bundle [D4]', async () => {
    primeCdn();

    await loadClientView(window);

    expect(appended).not.toContain(SDK_SRC);
  });

  /**
   * Z3-r5 (Sol M4): the isolated document ships with no CSS at all, which is right for
   * OURS and wrong for THEIRS — Zoom's sample app loads these next to the bundle. They
   * go into the same document the scripts do, and are not awaited: a stylesheet that
   * 404s must not cost the meeting.
   *
   * Z3-r7: and NOT from the pinned version, which is what this assertion used to
   * require. `${SDK_BASE}/css/*.css` is HTTP 403 at every version — the reason the
   * isolated document carried no CSS at all from r5 until r7 — and Zoom publishes these
   * two under the bare origin only.
   */
  it('puts Zoom’s own stylesheets in the same document, from the UNVERSIONED root', async () => {
    primeCdn();

    await loadClientView(window);

    const hrefs = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map(
      (link) => link.getAttribute('href')
    );
    expect(hrefs).toEqual(CLIENT_VIEW_STYLE_HREFS);
    // The versioned path is the 403. A href that carries the version is the r5 defect
    // coming back, and it must fail here rather than at a school on a Tuesday.
    for (const href of hrefs) expect(href).not.toContain(`/${SDK_VERSION}/`);
    for (const href of hrefs) expect(href).toMatch(/^https:\/\/source\.zoom\.us\/css\//);
  });

  /**
   * Z3-r7 — the silence is the defect, not the 403.
   *
   * These were dead links for three rounds and nothing said so: appended, never
   * awaited, no listener of any kind. It need not block the join, and does not; it must
   * not fail invisibly a second time.
   */
  it('says so, by name, when a stylesheet does not load [r7]', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    primeCdn();

    await loadClientView(window);
    const link = document.head.querySelector<HTMLLinkElement>(
      `link[href="${CLIENT_VIEW_STYLE_HREFS[0]}"]`
    );
    link?.dispatchEvent(new Event('error'));

    expect(warn).toHaveBeenCalledWith(
      CLIENT_VIEW_STYLE_FAILED_MESSAGE,
      CLIENT_VIEW_STYLE_HREFS[0]
    );
    expect(link?.dataset.loaded).toBe('false');
  });

  it('records a stylesheet that DID load, so the state is readable either way [r7]', async () => {
    primeCdn();

    await loadClientView(window);
    const link = document.head.querySelector<HTMLLinkElement>(
      `link[href="${CLIENT_VIEW_STYLE_HREFS[1]}"]`
    );
    // Pending until the browser answers — neither loaded nor failed, and distinguishable.
    expect(link?.dataset.loaded).toBeUndefined();

    link?.dispatchEvent(new Event('load'));

    expect(link?.dataset.loaded).toBe('true');
  });

  it('a failed stylesheet does not cost the meeting [r7]', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    primeCdn();

    // Both stylesheets fail the moment they are in the document — they are appended
    // synchronously, before the first `await` — and the bundle still resolves. CSS is
    // cosmetic relative to joining and must never reach the catch that turns a join
    // into a link.
    const loading = loadClientView(window);
    document.head
      .querySelectorAll('link[rel="stylesheet"]')
      .forEach((link) => link.dispatchEvent(new Event('error')));

    await expect(loading).resolves.toBe(CLIENT_VIEW_GLOBAL);
  });

  it('does not append the stylesheets twice for a second join', async () => {
    primeCdn();

    await loadClientView(window);
    delete (window as ClientViewWindow).ZoomMtg;
    await expect(loadClientView(window)).rejects.toThrow(/no quedó disponible/);

    expect(document.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(
      CLIENT_VIEW_STYLE_HREFS.length
    );
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
