/**
 * The Zoom Meeting SDK (Component View) loader for the embedded join surface
 * (Z3-3, plan §2/§15).
 *
 * ## Why the SDK comes from Zoom's CDN and not from package.json
 *
 * `@zoom/meetingsdk@6.2.0` declares `peer react@"18.2.0"` EXACTLY and this repo runs
 * 18.3.1, so npm refuses the install without `--legacy-peer-deps` — a flag that would
 * change install resolution for every CI job to serve one surface. Loading the
 * standalone bundle keeps `package.json` untouched and, just as important on school
 * hardware, keeps 3.7 MB out of the initial page load: nothing below runs until the
 * user has asked to join.
 *
 * ## Load order is load-bearing
 *
 * The Component View bundle treats React and ReactDOM as EXTERNALS. With no
 * `window.React` present it throws `ReferenceError: React is not defined` while
 * evaluating and never assigns `window.ZoomMtgEmbedded`. Zoom's vendor copies are
 * react 18.2.0 — the exact version the npm package pins as a peer, which is why they
 * must come from Zoom rather than from this app's own React 18.3.1 — and they must
 * load SEQUENTIALLY, BEFORE the main bundle. Parallel loading races React against the
 * bundle that expects it to already be there.
 *
 * Those globals are inert for the rest of the app: Next.js resolves React through its
 * own bundle, never through `window.React`, and the SDK renders its own tree into its
 * own root element. Verified empirically in Z0B (results §6).
 *
 * ## Relationship to /meet/diag
 *
 * `pages/meet/diag.tsx` carries the same pattern and is deliberately NOT refactored to
 * import this module: it is the consultores' field instrument for the hardware protocol
 * (`docs/planning/zoom-hw-protocol.md`) and that protocol is live. Duplicating a loader
 * is cheap; changing the instrument mid-protocol is not. Known debt, recorded on purpose.
 */

export const SDK_VERSION = '6.2.0';

/**
 * Zoom's CDN origin, WITHOUT the version.
 *
 * Everything executable is served from `SDK_BASE` below, which is pinned. This bare
 * origin exists for the one family of assets Zoom does not publish under a version at
 * all — Client View's stylesheets, see `CLIENT_VIEW_STYLE_HREFS` and the trade recorded
 * there. Nothing else may reach for it without the same justification.
 */
export const SDK_ORIGIN = 'https://source.zoom.us';

/** Exported for `zoom-client-view-loader.ts`, so the two views cannot drift apart. */
export const SDK_BASE = `${SDK_ORIGIN}/${SDK_VERSION}`;

/** The Component View bundle. Loaded LAST — see the header. */
export const SDK_SRC = `${SDK_BASE}/zoom-meeting-embedded-${SDK_VERSION}.min.js`;

/** Zoom's own react 18.2.0 pair. Loaded first, in this order, one at a time. */
export const SDK_VENDOR_SRCS = [
  `${SDK_BASE}/lib/vendor/react.min.js`,
  `${SDK_BASE}/lib/vendor/react-dom.min.js`,
];

/**
 * §20 / plan §15: the SDK ships `es-ES` and there is no `es-CL` locale. This is the
 * SDK's own chrome only — every string GENERA authors stays es-CL.
 */
export const SDK_LANGUAGE = 'es-ES';

/** es-CL, and it names the thing a school can act on. */
export const SDK_DOWNLOAD_FAILED_MESSAGE =
  'No se pudo descargar el componente de video de Zoom.';

const SDK_ABSENT_MESSAGE = 'El componente de video se descargó pero no quedó disponible.';

/**
 * Deadlines (Z3-r5, Sol M3).
 *
 * Every transition between "the user pressed continue" and "the meeting is on screen"
 * used to be unbounded, and the link fallback only starts from a thrown error — so a
 * download that stalled, or an SDK that called neither callback, left the UI busy
 * forever with no way out. On a school network that is the LIKELY path, not the exotic
 * one, and it is precisely what the fallback exists to cover.
 *
 * The numbers are generous on purpose: they are a floor under a hang, not a performance
 * budget. Anything slower than these has already lost the meeting, and the link — which
 * opens Zoom's own client — is the better answer by then.
 */
export const SDK_DOWNLOAD_TIMEOUT_MS = 30_000;

/** One deadline for every SDK call: `i18n.load`, `init`, `join`, and the callback wait. */
export const SDK_CALL_TIMEOUT_MS = 45_000;

/** es-CL, and deliberately the same sentence a refused join gets: same remedy. */
export const SDK_TIMEOUT_MESSAGE = 'La reunión no respondió a tiempo en esta página.';

/**
 * Rejects `work` if it has not settled within `ms`.
 *
 * The timer is cleared on either settlement, so a call that finishes normally leaves
 * nothing pending. Losing the race does NOT cancel the underlying work — nothing here
 * can cancel a Zoom `join` — it only stops the UI waiting on it, which is the whole
 * point: the caller falls back to the link while Zoom keeps doing whatever it is doing.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Everything the SDK's `join` takes from us. `zak` only ever for an authorized host. */
export interface ZoomEmbeddedJoinOptions {
  sdkKey: string;
  signature: string;
  meetingNumber: string;
  userName: string;
  password?: string;
  customerKey?: string;
  zak?: string;
}

/** The slice of the Component View surface this surface uses. */
export interface ZoomEmbeddedClient {
  init(options: {
    zoomAppRoot: HTMLElement;
    language: string;
    patchJsMedia?: boolean;
    leaveOnPageUnload?: boolean;
  }): Promise<void>;
  join(options: ZoomEmbeddedJoinOptions): Promise<void>;
  leave(): Promise<void>;
}

export interface ZoomEmbeddedGlobal {
  createClient(): ZoomEmbeddedClient;
}

/**
 * Read through a cast rather than a `declare global`: `pages/meet/diag.tsx` already
 * augments `Window` with its own copy of these types, and a second augmentation of the
 * same property with a structurally different `join` signature is a compile error.
 */
function readSdkGlobal(): ZoomEmbeddedGlobal | undefined {
  return (window as unknown as { ZoomMtgEmbedded?: ZoomEmbeddedGlobal }).ZoomMtgEmbedded;
}

/**
 * Appends one classic script into `doc` and resolves on load, reusing a tag this
 * surface already loaded there. The `data-zoom-embed-src` marker is what makes the
 * reuse safe across two joins in one page life — and it is deliberately a different
 * attribute from the one `/meet/diag` uses, so neither page can adopt the other's
 * half-loaded tag.
 *
 * `doc` defaults to this page's document. Client View passes the isolated frame's
 * document instead (Z3-r5, Sol M4), which is why every read and write below goes
 * through the parameter rather than the global — a tag appended to the wrong document
 * loads a bundle whose globals the caller cannot reach.
 *
 * ## Only a LOADED tag is reused (Z3-r5, Sol M3)
 *
 * The previous version reused any tag it found. A script element that has already
 * fired `error` never fires again, so a retry that adopted one waited on a promise
 * that could not settle — the exact hang the link fallback exists to prevent, in the
 * exact place a school network produces it. A tag that is not known-loaded is dropped
 * and re-created, and both failure edges — `error` and the deadline — remove the node
 * so the NEXT attempt starts from a clean document too.
 */
export function loadZoomCdnScript(src: string, doc: Document = document): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = doc.querySelector<HTMLScriptElement>(
      `script[data-zoom-embed-src="${src}"]`
    );
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    existing?.remove();

    const script = doc.createElement('script');
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error(SDK_DOWNLOAD_FAILED_MESSAGE));
    };

    script.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true }
    );
    script.addEventListener('error', fail, { once: true });
    timer = setTimeout(fail, SDK_DOWNLOAD_TIMEOUT_MS);

    script.src = src;
    script.dataset.zoomEmbedSrc = src;
    doc.head.appendChild(script);
  });
}

/**
 * Resolves with the Component View global, downloading it on first use.
 *
 * Rejects — never returns a half-built client — when the CDN is unreachable or when
 * the bundle evaluates without assigning the global. The caller turns either into the
 * link fallback; there is no recovery worth attempting here.
 */
export async function loadMeetingSdk(): Promise<ZoomEmbeddedGlobal> {
  const alreadyLoaded = readSdkGlobal();
  if (alreadyLoaded) return alreadyLoaded;

  // Sequential on purpose — see the header. `for await` rather than `Promise.all`.
  for (const src of SDK_VENDOR_SRCS) {
    await loadZoomCdnScript(src);
  }
  await loadZoomCdnScript(SDK_SRC);

  const sdk = readSdkGlobal();
  if (!sdk) throw new Error(SDK_ABSENT_MESSAGE);
  return sdk;
}
