/**
 * The Zoom Meeting SDK (Client View) loader for the mobile join surface (Z3-4, plan
 * §2/§15).
 *
 * ## Why a second loader and not a branch inside the first one
 *
 * Component View (`ZoomMtgEmbedded`) and Client View (`ZoomMtg`) are two different
 * products behind one SDK name: different bundles, different globals, different
 * vendor sets, and an init/join that differs from the first line — Component View
 * renders into an element you hand it and answers with promises; Client View takes
 * over the whole page, is bootstrapped by four side-effecting calls before `init`, and
 * answers through `success`/`error` callbacks. A module that served both would branch
 * at every line, so this one only shares what genuinely IS shared: the CDN base, the
 * version, and `loadZoomCdnScript` — imported from `zoom-sdk-loader.ts` rather than
 * copied, so a version bump moves both views at once.
 *
 * Importing that module loads no bundle. Nothing here can reach `SDK_SRC`, and which
 * of the two loaders runs is decided once, by `selectEmbedView()`, before either is
 * called.
 *
 * ## Load order is load-bearing here too
 *
 * Client View externalises React, ReactDOM, Redux and redux-thunk — four vendor files
 * against Component View's two — and they must load SEQUENTIALLY, BEFORE the main
 * bundle, for the same reason: the bundle evaluates against globals it expects to
 * already exist and never assigns `window.ZoomMtg` if they do not.
 *
 * ## Browser support
 *
 * This is the view Zoom supports where Component View is not: mobile browsers, tablets
 * and Firefox (§20; re-confirmed against Zoom's published browser-support matrix on
 * 2026-08-08, which lists Component View as unsupported on Firefox, Android Chrome and
 * iOS Safari, and Client View as supported on all four desktop browsers and both mobile
 * ones). The matrix itself lives in `embed-capabilities.ts`.
 */

import {
  SDK_BASE,
  SDK_ORIGIN,
  SDK_CALL_TIMEOUT_MS,
  SDK_DOWNLOAD_FAILED_MESSAGE,
  SDK_TIMEOUT_MESSAGE,
  SDK_VERSION,
  loadZoomCdnScript,
  withTimeout,
} from './zoom-sdk-loader';

/** The Client View bundle. Loaded LAST — see the header. */
export const CLIENT_VIEW_SRC = `${SDK_BASE}/zoom-meeting-${SDK_VERSION}.min.js`;

/**
 * The isolated document Client View runs in (Z3-r5, Sol M4).
 *
 * A plain static file under `public/`, so it is served WITHOUT going through
 * `pages/_app.tsx` — which is the whole point. Next.js only permits a global
 * stylesheet to be imported from `_app`, and `_app` wraps every page, so in this
 * router NO page can be a CSS boundary: a dedicated route would still inherit
 * `styles/globals.css`, Tailwind Preflight and all. Zoom's own import guidance warns
 * that global framework CSS conflicts with Client View, and `init`/`join` can SUCCEED
 * with a broken layout — a failure the catch-based fallback cannot see. So the boundary
 * has to be a document the app's CSS never reaches, and the frame is the isolation the
 * vendor supports.
 *
 * It lives under `/meet/` deliberately: `next.config.js` grants
 * `camera=(self), microphone=(self), display-capture=(self)` to that prefix and denies
 * them everywhere else, and a frame cannot be granted what its path is refused.
 */
export const CLIENT_VIEW_FRAME_SRC = '/meet/zoom-client-view.html';

/**
 * Zoom's own stylesheets for Client View, from the UNVERSIONED CDN root.
 *
 * The isolated document ships with no CSS at all, which is correct for OURS and wrong
 * for THEIRS: Zoom's sample app loads these two next to the bundle.
 *
 * ## Why the version is missing here, and why that is a real trade
 *
 * Until Z3-r7 these pointed at `${SDK_BASE}/css/*.css` — the pinned path every other
 * asset on this page uses — and BOTH answer **HTTP 403** (`text/plain`, so Chrome
 * refuses them outright). Zoom serves these files from the bare origin only:
 * `https://source.zoom.us/css/bootstrap.css` is 200 `text/css`, as is
 * `…/css/react-select.css`. There is no versioned URL that answers, and Zoom's own
 * samples load them exactly this way.
 *
 * So the JS stays pinned at `SDK_VERSION` while the CSS floats. That is a dependency
 * that can change under us between one page load and the next, with no release note
 * and no way to hold it still. It is recorded here rather than discovered later, and
 * it is the reason a failure to load them must now be VISIBLE — see
 * `appendClientViewStyles`.
 */
export const CLIENT_VIEW_STYLE_HREFS = [
  `${SDK_ORIGIN}/css/bootstrap.css`,
  `${SDK_ORIGIN}/css/react-select.css`,
];

/**
 * What a stylesheet that did not arrive says, by name.
 *
 * Exported so a test asserts on a value rather than on prose, and so the string is
 * greppable from a support ticket. It carries the href and nothing else — this path
 * holds a signature and a passcode, and neither is ever within reach of a log line.
 */
export const CLIENT_VIEW_STYLE_FAILED_MESSAGE =
  '[zoom-client-view] Zoom stylesheet did not load:';

/** Zoom's own React/Redux vendor set. Loaded first, in this order, one at a time. */
export const CLIENT_VIEW_VENDOR_SRCS = [
  `${SDK_BASE}/lib/vendor/react.min.js`,
  `${SDK_BASE}/lib/vendor/react-dom.min.js`,
  `${SDK_BASE}/lib/vendor/redux.min.js`,
  `${SDK_BASE}/lib/vendor/redux-thunk.min.js`,
];

/**
 * Where the SDK fetches its WebAssembly media engine from, and the `/av` subdirectory
 * inside it. Client View asks for these separately from the bundle.
 */
export const CLIENT_VIEW_LIB_BASE = `${SDK_BASE}/lib`;
export const CLIENT_VIEW_LIB_DIR = '/av';

/**
 * Client View renders into an element it looks up BY ID — it is not handed a node the
 * way Component View is. The id is Zoom's, not ours, and cannot be renamed.
 *
 * Since Z3-r5 the element lives in `CLIENT_VIEW_FRAME_SRC`, not in this app's document,
 * so the lookup resolves inside the isolated frame. This page never mounts one.
 */
export const CLIENT_VIEW_ROOT_ID = 'zmmtg-root';

/**
 * What counts as "Zoom put a control in front of a person" (Z3-r8).
 *
 * Deliberately the generic interactive set and NOT a Zoom class name. The screen this
 * has to recognise is the vendor's own pre-join UI («Silenciar / Iniciar el vídeo /
 * Fondos / Entrar»), and its markup is theirs to change between bundle versions; what
 * cannot change without the screen ceasing to be a screen is that it offers something
 * to press.
 */
const CLIENT_VIEW_INTERACTIVE_SELECTOR =
  'button, [role="button"], a[href], input, select, textarea';

/** How often the render watch re-reads the frame while the deadline is running. */
export const CLIENT_VIEW_RENDER_POLL_MS = 250;

/** The frame did not reach `load` — same class of failure as a stalled download. */
const CLIENT_VIEW_FRAME_FAILED_MESSAGE = 'No se pudo preparar la reunión en esta página.';

const CLIENT_VIEW_ABSENT_MESSAGE =
  'El componente de video se descargó pero no quedó disponible.';

/**
 * What a rejected `init` or `join` becomes. Zoom's own reason object is deliberately
 * NOT carried into it: the caller turns any failure into the link fallback and reads
 * nothing, so there is no reason to move a vendor payload — which can name the meeting
 * — into an Error that some later hand might log.
 */
const CLIENT_VIEW_JOIN_FAILED_MESSAGE = 'No se pudo entrar a la reunión en esta página.';

/** Everything Client View's `join` takes from us. `zak` only ever for an authorized host. */
export interface ZoomClientViewJoinOptions {
  sdkKey: string;
  signature: string;
  meetingNumber: string;
  userName: string;
  /** Client View spells it with a capital W; Component View spells it `password`. */
  passWord: string;
  customerKey?: string;
  zak?: string;
}

/** Client View answers through callbacks rather than a promise. */
export interface ZoomClientViewCallbacks {
  success: () => void;
  error: (reason: unknown) => void;
}

export interface ZoomClientViewInitOptions {
  /** Where the browser lands when the user leaves the meeting. */
  leaveUrl: string;
  patchJsMedia?: boolean;
  leaveOnPageUnload?: boolean;
}

/**
 * The slice of the Client View surface this surface uses.
 *
 * `i18n.load` is ASYNCHRONOUS (Z3-r5, Sol M2). The previous declaration returned
 * `void`, so TypeScript could not warn that the call site never awaited it — and Zoom's
 * localization docs require the language resources to be in place BEFORE `init`. Left
 * un-awaited, the SDK initialises in `en-US` and only becomes `es-ES` once the load
 * happens to settle, which makes a settled §15 scope item a race.
 */
export interface ZoomClientViewGlobal {
  setZoomJSLib(path: string, dir: string): void;
  preLoadWasm(): void;
  prepareWebSDK(): void;
  i18n: { load(language: string): Promise<unknown> };
  init(options: ZoomClientViewInitOptions & ZoomClientViewCallbacks): void;
  join(options: ZoomClientViewJoinOptions & ZoomClientViewCallbacks): void;
}

/**
 * Read through a cast for the same reason `zoom-sdk-loader` does: `pages/meet/diag.tsx`
 * already augments `Window` with its own Zoom types, and a second augmentation of the
 * same property is a compile error.
 */
function readClientViewGlobal(host: Window): ZoomClientViewGlobal | undefined {
  return (host as unknown as { ZoomMtg?: ZoomClientViewGlobal }).ZoomMtg;
}

/**
 * Puts Zoom's two stylesheets into `doc`, once, and makes either one's failure
 * OBSERVABLE (Z3-r7).
 *
 * Still not awaited, and that part is deliberate and unchanged: CSS is cosmetic
 * relative to joining, nothing below reads these, and a stylesheet the school's proxy
 * swallows must not cost the meeting. What changed is that "not awaited" no longer
 * means "not noticed" — until r7 these had been **403 on every join since r5** and
 * nothing anywhere said so, because nobody was listening.
 *
 * `data-loaded` is the state a runtime probe can read (`'true'` / `'false'` /
 * absent-while-pending) without waiting on an event it may already have missed; the
 * warning is what a support ticket can grep for. Neither carries anything but the
 * constant href.
 */
export function appendClientViewStyles(doc: Document): void {
  for (const href of CLIENT_VIEW_STYLE_HREFS) {
    if (doc.querySelector(`link[href="${href}"]`)) continue;

    const link = doc.createElement('link');
    link.rel = 'stylesheet';

    link.addEventListener('load', () => {
      link.dataset.loaded = 'true';
    }, { once: true });

    link.addEventListener('error', () => {
      link.dataset.loaded = 'false';
      // Not an exception: this must not reach the caller's catch and turn a cosmetic
      // failure into a link fallback. It is a signal, and the point is that it exists.
      console.warn(CLIENT_VIEW_STYLE_FAILED_MESSAGE, href);
    }, { once: true });

    link.href = href;
    doc.head.appendChild(link);
  }
}

/**
 * Resolves with the Client View global belonging to `host`, downloading it there on
 * first use.
 *
 * `host` is the isolated frame's window, not this page's (Sol M4) — the bundle assigns
 * `ZoomMtg` on whatever window evaluated it, so the scripts and the global read have to
 * agree on which document that is.
 *
 * Rejects — never returns a half-built global — when the CDN is unreachable, when a
 * download passes its deadline, or when the bundle evaluates without assigning
 * `ZoomMtg`. The caller turns any of them into the link fallback.
 */
export async function loadClientView(host: Window): Promise<ZoomClientViewGlobal> {
  const alreadyLoaded = readClientViewGlobal(host);
  if (alreadyLoaded) return alreadyLoaded;

  const doc = host.document;

  appendClientViewStyles(doc);

  // Sequential on purpose — see the header.
  for (const src of CLIENT_VIEW_VENDOR_SRCS) {
    await loadZoomCdnScript(src, doc);
  }
  await loadZoomCdnScript(CLIENT_VIEW_SRC, doc);

  const sdk = readClientViewGlobal(host);
  if (!sdk) throw new Error(CLIENT_VIEW_ABSENT_MESSAGE);
  return sdk;
}

/**
 * Resolves with the isolated frame's window once ITS OWN document is in it (Z3-r5,
 * Sol M4; corrected in Z3-r8).
 *
 * ## Why the readiness test is the root element and not `readyState`
 *
 * A freshly mounted `<iframe src="…">` does not start empty. It holds `about:blank`
 * FIRST — a real, same-origin, already-`complete` document — and only then navigates to
 * its `src`. The previous version short-circuited on `readyState === 'complete'`, so it
 * could resolve with that placeholder; everything downstream then appended Zoom's four
 * vendor files, its bundle and its two stylesheets into a document the browser was about
 * to discard, and the join sat waiting on a global assigned to a window that no longer
 * existed.
 *
 * Until r8 the preflight hid it: the frame was mounted while the user read OUR device
 * check, so the real document had long since arrived by the time they pressed continue.
 * With Zoom's own screen as the preflight the join starts in the same tick as the mount,
 * and the placeholder is what is there. **Observed on the first framed run of r8** — the
 * frame's document held `#zmmtg-root` and no scripts and no stylesheets at all, and the
 * join fell back to the link at the deadline.
 *
 * So readiness is the one thing that tells the two documents apart: the element
 * `CLIENT_VIEW_FRAME_SRC` exists to provide. `about:blank` never has it.
 *
 * Bounded like every other machine transition on this path: a frame whose document never
 * arrives — an offline school link, a proxy swallowing the request — rejects instead of
 * leaving the join waiting on a document that is not coming.
 */
export function awaitClientViewFrame(frame: HTMLIFrameElement): Promise<Window> {
  return new Promise<Window>((resolve, reject) => {
    /**
     * The frame's window, but only once that window is showing OUR document.
     *
     * `document` is read defensively rather than through the type: a frame that is
     * unmounted while this is polling — the user takes the GENERA way out, or leaves the
     * page — leaves a window behind whose document is gone, and a poll that threw there
     * would do so inside a timer, where nothing is catching.
     */
    const readHost = (): Window | null => {
      const host = frame.contentWindow;
      const doc = host?.document as Document | undefined;
      if (!host || !doc) return null;
      return doc.getElementById(CLIENT_VIEW_ROOT_ID) ? host : null;
    };

    let watch: ReturnType<typeof setInterval> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      if (watch !== undefined) clearInterval(watch);
      if (deadline !== undefined) clearTimeout(deadline);
      watch = undefined;
      deadline = undefined;
    };

    const ready = readHost();
    if (ready) {
      resolve(ready);
      return;
    }

    // Polled rather than driven by `load`: the navigation this frame is doing produces
    // more than one of those, and the first belongs to the document being replaced.
    watch = setInterval(() => {
      const host = readHost();
      if (!host) return;
      stop();
      resolve(host);
    }, CLIENT_VIEW_RENDER_POLL_MS);

    deadline = setTimeout(() => {
      stop();
      reject(new Error(SDK_TIMEOUT_MESSAGE));
    }, SDK_CALL_TIMEOUT_MS);

    frame.addEventListener(
      'error',
      () => {
        stop();
        reject(new Error(CLIENT_VIEW_FRAME_FAILED_MESSAGE));
      },
      { once: true }
    );
  });
}

/**
 * Turns one callback-style Client View call into a promise, so it reads the same way the
 * Component View one does and a failure lands in the same `catch`.
 *
 * Bounded (Z3-r5, Sol M3): Zoom calling NEITHER callback used to be an unrecoverable
 * hang, because the fallback only starts from a rejection. Now silence rejects like any
 * other failure and lands in the same place.
 *
 * **`init` only, since Z3-r8.** This deadline is correct for a call the machine both
 * starts and finishes. `join` is not one — it finishes when a person presses «Entrar» —
 * so it uses `awaitClientViewJoin` below, which bounds the same machine work without
 * putting a clock on the human. Do not route `join` back through here.
 */
export function awaitClientViewCall(
  run: (callbacks: ZoomClientViewCallbacks) => void
): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      run({
        success: () => resolve(),
        error: () => reject(new Error(CLIENT_VIEW_JOIN_FAILED_MESSAGE)),
      });
    }),
    SDK_CALL_TIMEOUT_MS,
    SDK_TIMEOUT_MESSAGE
  );
}

/**
 * Whether Zoom has rendered a screen a person can act on inside `doc` (Z3-r8).
 *
 * This is the signal that separates OUR time from the USER's. Two conditions, and both
 * are needed:
 *
 *  - the element Zoom renders into holds something from the interactive set — a shell
 *    with a spinner in it is still the machine working, and must stay deadlined;
 *  - that control has a layout box (`getClientRects()`), so a node that exists in the
 *    tree but is `display:none` — which is how Zoom's own bundle carries pieces of the
 *    meeting UI before it needs them — does not read as a screen.
 *
 * `#zmmtg-root` starts EMPTY and this app never writes into it: the frame's document is
 * a constant (`CLIENT_VIEW_FRAME_SRC`) whose only content is that one empty div, and the
 * parent page mounts nothing inside it. So anything matching here was put there by Zoom.
 */
export function clientViewIsInteractive(doc: Document): boolean {
  const root = doc.getElementById(CLIENT_VIEW_ROOT_ID);
  if (!root) return false;

  const controls = root.querySelectorAll<HTMLElement>(CLIENT_VIEW_INTERACTIVE_SELECTOR);
  for (const control of Array.from(controls)) {
    if (control.getAttribute('aria-hidden') === 'true') continue;
    if (control.getClientRects().length > 0) return true;
  }

  return false;
}

/**
 * `join`, with a deadline that bounds the MACHINE and never the person (Z3-r8).
 *
 * ## Why `join` cannot be `awaitClientViewCall`
 *
 * In Client View, `join()` renders Zoom's own pre-join screen and its `success` callback
 * fires **when the user presses «Entrar»** — not when the SDK finishes. r7 measured it:
 * the screen is up and healthy in a few seconds, the callback fires 5.9 s after a human
 * clicks, and the 45 s bound `awaitClientViewCall` carries expired at 46.5–46.7 s in
 * front of a working meeting and yanked the user to a link. A deadline on that step is a
 * deadline on deliberation.
 *
 * ## What replaces it
 *
 * The clock still starts at the call, and it still rejects — it just stops asking a
 * different question. It measures **"has Zoom put a screen up?"**, not "has the meeting
 * been entered?", and it is cancelled the moment `clientViewIsInteractive` says yes.
 * After that this promise waits as long as the user does.
 *
 * So the two halves that must both hold, hold:
 *
 *  - **machine failure is bounded.** An SDK that renders nothing — a bundle that
 *    evaluated but cannot start, a media engine that never comes up, callbacks that
 *    never fire — never satisfies the signal, so the deadline expires and the caller
 *    reaches the link, exactly as it did before this round.
 *  - **a person is never interrupted.** Once the screen is up there is no timer left to
 *    fire, so nothing tears the meeting down while they are reading it.
 *
 * `error` is honoured throughout, before and after the signal: a refused join is the
 * machine answering, and it belongs in the same `catch` every other failure lands in.
 */
export function awaitClientViewJoin(
  host: Window,
  run: (callbacks: ZoomClientViewCallbacks) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let watch: ReturnType<typeof setInterval> | undefined;
    let settled = false;

    /** Stops the machine clock. Called by the signal, and by either callback. */
    const stopWaitingOnTheMachine = () => {
      if (deadline !== undefined) clearTimeout(deadline);
      if (watch !== undefined) clearInterval(watch);
      deadline = undefined;
      watch = undefined;
    };

    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      stopWaitingOnTheMachine();
      finish();
    };

    /** The one transfer of custody: from our deadline to the user's attention. */
    const checkForTheScreen = () => {
      if (settled || deadline === undefined) return;
      // Read defensively: a frame unmounted while this is polling — the user takes the
      // GENERA way out, or leaves the page — leaves a window whose document is gone, and
      // throwing here would throw inside a timer, where nothing is catching.
      const doc = host.document as Document | undefined;
      if (doc && clientViewIsInteractive(doc)) stopWaitingOnTheMachine();
    };

    deadline = setTimeout(
      () => settle(() => reject(new Error(SDK_TIMEOUT_MESSAGE))),
      SDK_CALL_TIMEOUT_MS
    );
    watch = setInterval(checkForTheScreen, CLIENT_VIEW_RENDER_POLL_MS);

    run({
      success: () => settle(resolve),
      error: () => settle(() => reject(new Error(CLIENT_VIEW_JOIN_FAILED_MESSAGE))),
    });

    // Zoom may have rendered synchronously inside `run`; the first poll is a whole
    // interval away and there is no reason to hold a deadline over a screen already up.
    checkForTheScreen();
  });
}

/** Re-exported so the download failure reads identically on both views. */
export { SDK_DOWNLOAD_FAILED_MESSAGE };
