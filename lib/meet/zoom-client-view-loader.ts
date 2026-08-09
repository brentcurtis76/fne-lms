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
  SDK_DOWNLOAD_FAILED_MESSAGE,
  SDK_VERSION,
  loadZoomCdnScript,
} from './zoom-sdk-loader';

/** The Client View bundle. Loaded LAST — see the header. */
export const CLIENT_VIEW_SRC = `${SDK_BASE}/zoom-meeting-${SDK_VERSION}.min.js`;

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
 */
export const CLIENT_VIEW_ROOT_ID = 'zmmtg-root';

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

/** The slice of the Client View surface this surface uses. */
export interface ZoomClientViewGlobal {
  setZoomJSLib(path: string, dir: string): void;
  preLoadWasm(): void;
  prepareWebSDK(): void;
  i18n: { load(language: string): void };
  init(options: ZoomClientViewInitOptions & ZoomClientViewCallbacks): void;
  join(options: ZoomClientViewJoinOptions & ZoomClientViewCallbacks): void;
}

/**
 * Read through a cast for the same reason `zoom-sdk-loader` does: `pages/meet/diag.tsx`
 * already augments `Window` with its own Zoom types, and a second augmentation of the
 * same property is a compile error.
 */
function readClientViewGlobal(): ZoomClientViewGlobal | undefined {
  return (window as unknown as { ZoomMtg?: ZoomClientViewGlobal }).ZoomMtg;
}

/**
 * Resolves with the Client View global, downloading it on first use.
 *
 * Rejects — never returns a half-built global — when the CDN is unreachable or when the
 * bundle evaluates without assigning `window.ZoomMtg`. The caller turns either into the
 * link fallback.
 */
export async function loadClientView(): Promise<ZoomClientViewGlobal> {
  const alreadyLoaded = readClientViewGlobal();
  if (alreadyLoaded) return alreadyLoaded;

  // Sequential on purpose — see the header.
  for (const src of CLIENT_VIEW_VENDOR_SRCS) {
    await loadZoomCdnScript(src);
  }
  await loadZoomCdnScript(CLIENT_VIEW_SRC);

  const sdk = readClientViewGlobal();
  if (!sdk) throw new Error(CLIENT_VIEW_ABSENT_MESSAGE);
  return sdk;
}

/**
 * Turns one callback-style Client View call into a promise, so the join reads the same
 * way the Component View one does and a failure lands in the same `catch`.
 */
export function awaitClientViewCall(
  run: (callbacks: ZoomClientViewCallbacks) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    run({
      success: () => resolve(),
      error: () => reject(new Error(CLIENT_VIEW_JOIN_FAILED_MESSAGE)),
    });
  });
}

/** Re-exported so the download failure reads identically on both views. */
export { SDK_DOWNLOAD_FAILED_MESSAGE };
