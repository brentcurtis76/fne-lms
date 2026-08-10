/**
 * Browser-capability reads for the embedded meeting surface (Z3-3, plan §2/§17).
 *
 * Pure functions over `window`/`navigator`, kept out of the components so the two
 * decisions they feed can be tested over the whole fact space rather than through
 * a rendered tree:
 *
 *  - **Which of Zoom's two views can this browser run?** Component View is DESKTOP
 *    ONLY and does not support Firefox; Client View covers mobile and Firefox and is
 *    the answer everywhere Component View is refused (§20, re-confirmed against Zoom's
 *    published browser-support matrix on 2026-08-08). `selectEmbedView` is where that
 *    matrix is written down; a browser neither view can serve takes the link path that
 *    already works for it, never an embed that cannot render.
 *  - **What will fail before the user is looking at a black rectangle?** The
 *    permission reads below are the preflight's raw material.
 *
 * Nothing here reads a feature flag. The server's `mode` is the only signal for
 * WHETHER to embed; these answer only whether this machine could.
 */

/**
 * Below this viewport width the Component View's own chrome does not fit — the same
 * floor `/meet/diag` grades the screen against for the field protocol.
 */
export const MIN_EMBED_VIEWPORT_WIDTH = 768;

/**
 * Phones and tablets, by the user agent they send. Coarse on purpose: this is a
 * "which Zoom view" question, not analytics, and the cost of a false positive is a
 * link that works while the cost of a false negative is an embed that cannot.
 *
 * `Mobile` covers Chrome on Android and Safari on iOS; desktop Chrome, Edge,
 * Firefox and Safari carry none of these tokens.
 */
const MOBILE_USER_AGENT =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk|Kindle/i;

/**
 * Firefox on any platform. `Firefox/` is the desktop and Android token; `FxiOS` is
 * Firefox on iOS, which carries no `Firefox/` token at all.
 */
const FIREFOX_USER_AGENT = /Firefox\/|FxiOS/i;

/**
 * True when this browser can host the desktop Component View.
 *
 * Refusals, cheapest first: not a browser at all (SSR), a mobile user agent,
 * **Firefox** — Zoom's browser-support matrix lists Component View as unsupported
 * there, and a Firefox user who reached the embed would download 3.7 MB over a school
 * link only to fail into the fallback — an iPad that reports a desktop UA (iPadOS 13+
 * does; the touch-point count is what gives it away), and finally a viewport too
 * narrow to render the view usably.
 *
 * Deliberately does NOT test for the WebAssembly media engine: the preflight reports
 * that reading and never blocks on it (see `PreJoinCheck`), and a desktop machine
 * missing it fails into the link exactly as it did before this chunk.
 */
export function supportsComponentView(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  if (MOBILE_USER_AGENT.test(navigator.userAgent)) return false;

  if (FIREFOX_USER_AGENT.test(navigator.userAgent)) return false;

  // iPadOS 13+ ships the macOS user agent. A real Mac reports 0 touch points.
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return false;

  return window.innerWidth >= MIN_EMBED_VIEWPORT_WIDTH;
}

/** The video SDK needs it; without it there is no embedded experience at all. */
export function supportsWebAssembly(): boolean {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  } catch {
    return false;
  }
}

/**
 * True when this browser can host Client View — the full-page surface Zoom supports on
 * mobile browsers and on Firefox, i.e. everywhere Component View refuses.
 *
 * The one refusal beyond SSR is the media engine. Both views are WebAssembly
 * applications, so a browser without it has no embedded meeting of any kind and must
 * take the link — the `'none'` answer below, and the reason it is reachable at all.
 */
export function supportsClientView(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  return supportsWebAssembly();
}

/** The two embedded surfaces Zoom ships for the web. */
export type EmbeddedView = 'component' | 'client';

/** …and the answer when this browser can run neither. */
export type EmbedViewChoice = EmbeddedView | 'none';

/**
 * Which view this browser gets — the single place the support matrix is written down,
 * so exactly one of the two bundles can ever be reached from a given machine.
 *
 * Component View first because it is the better experience where it runs: it renders
 * inside the page instead of taking it over. Client View is the fallback for the
 * browsers Zoom does not support there (mobile, tablets, Firefox), and `'none'` sends
 * the user to the link path that worked before the embed existed.
 */
export function selectEmbedView(): EmbedViewChoice {
  if (supportsComponentView()) return 'component';
  if (supportsClientView()) return 'client';
  return 'none';
}

/**
 * What the browser will do about a device, WITHOUT asking for it.
 *
 *  - `unavailable` — no `getUserMedia` at all: an insecure context or a browser
 *    below the floor. The embed cannot work here.
 *  - `granted` / `denied` / `prompt` — the Permissions API's own answer.
 *  - `unknown` — no Permissions API, or one that does not know this name (Firefox
 *    rejects `camera`). Not a failure: the SDK will prompt at join time.
 *
 * Deliberately non-intrusive. A preflight that lit the camera to find out whether it
 * could would be a worse experience than the black rectangle it exists to prevent.
 */
export type DevicePermission = 'granted' | 'denied' | 'prompt' | 'unavailable' | 'unknown';

export async function readDevicePermission(
  device: 'camera' | 'microphone'
): Promise<DevicePermission> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unavailable';
  }

  const permissions = navigator.permissions;
  if (!permissions || typeof permissions.query !== 'function') return 'unknown';

  try {
    // `camera` / `microphone` are not in every lib.dom's PermissionName union, and
    // the browsers that do not know them REJECT rather than returning a state.
    const status = await permissions.query({ name: device as PermissionName });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
