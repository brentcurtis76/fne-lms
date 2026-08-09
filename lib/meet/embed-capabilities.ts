/**
 * Browser-capability reads for the embedded meeting surface (Z3-3, plan §2/§17).
 *
 * Pure functions over `window`/`navigator`, kept out of the components so the two
 * decisions they feed can be tested over the whole fact space rather than through
 * a rendered tree:
 *
 *  - **Can this device run Component View at all?** Component View is DESKTOP ONLY
 *    (§2, verified in Z0B). Mobile gets Client View, and that route is chunk Z3-4 —
 *    so until it exists a phone or a tablet must land on the link path that already
 *    works for it, never on an embed that cannot render.
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
 * True when this browser can host the desktop Component View.
 *
 * Three refusals, cheapest first: not a browser at all (SSR), a mobile user agent,
 * an iPad that reports a desktop UA (iPadOS 13+ does; the touch-point count is what
 * gives it away), and finally a viewport too narrow to render the view usably.
 */
export function supportsComponentView(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  if (MOBILE_USER_AGENT.test(navigator.userAgent)) return false;

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
