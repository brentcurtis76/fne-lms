/**
 * Open-redirect guard for post-login `?next=` round-tripping.
 *
 * The middleware appends the destination a user was denied to the login URL so
 * a deep link survives the auth bounce. That value is fully attacker-controlled
 * — anyone can hand out `/login?next=…` — so it is treated as untrusted input
 * and must be proven to be an internal path before anything navigates to it.
 *
 * Deliberately conservative: this only ever returns a value that starts with a
 * single `/` and parses as same-origin. Anything ambiguous returns `null` and
 * the caller falls back to its own default (`/dashboard`).
 */

/**
 * Browsers strip tabs, newlines and carriage returns from URLs before resolving
 * them, so `"/\tevil.com"` is not the string it appears to be. Reject the whole
 * C0 range plus DEL rather than trying to predict which ones get stripped.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** `scheme:` per RFC 3986 — `javascript:`, `https:`, `data:`, … */
const URL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Any origin works as a parse base; `.invalid` is reserved by RFC 2606 and can
 * never be a real host, so an accidental match is impossible.
 */
const PARSE_BASE = 'http://internal.invalid';

/**
 * Return `raw` when it is a safe internal path (optionally with a query string
 * and/or fragment), otherwise `null`.
 *
 * Note the input is the value a Next.js router hands over, i.e. already
 * percent-decoded once: `?next=%2F%2Fevil.com` arrives here as `//evil.com`.
 */
export function resolveSafeInternalPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }

  if (CONTROL_CHARS.test(raw)) {
    return null;
  }

  // A backslash is a forward slash to every browser's URL parser, so
  // `/\evil.com` navigates exactly like `//evil.com`.
  if (raw.includes('\\')) {
    return null;
  }

  if (URL_SCHEME.test(raw)) {
    return null;
  }

  // Must be root-relative…
  if (!raw.startsWith('/')) {
    return null;
  }

  // …but not protocol-relative: `//evil.com` reads like a path and is not one.
  if (raw.startsWith('//')) {
    return null;
  }

  // Belt and braces: whatever the checks above missed, the URL parser must
  // still resolve this to our own origin.
  try {
    if (new URL(raw, PARSE_BASE).origin !== PARSE_BASE) {
      return null;
    }
  } catch {
    return null;
  }

  return raw;
}
