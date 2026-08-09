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
 * Zoom's own stylesheets for Client View, from the pinned version.
 *
 * The isolated document ships with no CSS at all, which is correct for OURS and wrong
 * for THEIRS: Zoom's sample app loads these two next to the bundle. Appended without
 * awaiting — a stylesheet that 404s must not cost the meeting, and nothing below reads
 * them — so this is the one load on this path that is allowed to fail silently.
 */
export const CLIENT_VIEW_STYLE_HREFS = [
  `${SDK_BASE}/css/bootstrap.css`,
  `${SDK_BASE}/css/react-select.css`,
];

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

  for (const href of CLIENT_VIEW_STYLE_HREFS) {
    if (doc.querySelector(`link[href="${href}"]`)) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.appendChild(link);
  }

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
 * Resolves with the isolated frame's window once its document has finished loading
 * (Z3-r5, Sol M4).
 *
 * Bounded like every other transition on this path: a frame whose document never
 * arrives — an offline school link, a proxy swallowing the request — rejects instead of
 * leaving the join waiting on a `load` that is not coming.
 */
export function awaitClientViewFrame(frame: HTMLIFrameElement): Promise<Window> {
  return withTimeout(
    new Promise<Window>((resolve, reject) => {
      const settle = () => {
        const host = frame.contentWindow;
        if (host) resolve(host);
        else reject(new Error(CLIENT_VIEW_FRAME_FAILED_MESSAGE));
      };

      // Already there: the frame is mounted at the preflight, so by the time the user
      // presses continue its document has usually loaded already and no event is coming.
      if (frame.contentWindow && frame.contentDocument?.readyState === 'complete') {
        settle();
        return;
      }

      frame.addEventListener('load', settle, { once: true });
      frame.addEventListener(
        'error',
        () => reject(new Error(CLIENT_VIEW_FRAME_FAILED_MESSAGE)),
        { once: true }
      );
    }),
    SDK_CALL_TIMEOUT_MS,
    SDK_TIMEOUT_MESSAGE
  );
}

/**
 * Turns one callback-style Client View call into a promise, so the join reads the same
 * way the Component View one does and a failure lands in the same `catch`.
 *
 * Bounded (Z3-r5, Sol M3): Zoom calling NEITHER callback used to be an unrecoverable
 * hang, because the fallback only starts from a rejection. Now silence rejects like any
 * other failure and lands in the same place.
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

/** Re-exported so the download failure reads identically on both views. */
export { SDK_DOWNLOAD_FAILED_MESSAGE };
