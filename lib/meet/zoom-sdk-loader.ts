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

const SDK_BASE = `https://source.zoom.us/${SDK_VERSION}`;

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
 * Appends one classic script and resolves on load, reusing a tag this module already
 * appended. The `data-zoom-embed-src` marker is what makes the reuse safe across two
 * joins in one page life — and it is deliberately a different attribute from the one
 * `/meet/diag` uses, so neither page can adopt the other's half-loaded tag.
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-zoom-embed-src="${src}"]`
    );
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing ?? document.createElement('script');
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true }
    );
    script.addEventListener('error', () => reject(new Error(SDK_DOWNLOAD_FAILED_MESSAGE)), {
      once: true,
    });

    if (!existing) {
      script.src = src;
      script.dataset.zoomEmbedSrc = src;
      document.head.appendChild(script);
    }
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
    await loadScript(src);
  }
  await loadScript(SDK_SRC);

  const sdk = readSdkGlobal();
  if (!sdk) throw new Error(SDK_ABSENT_MESSAGE);
  return sdk;
}
