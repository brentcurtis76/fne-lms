/**
 * Download filenames for the generated Pasantías PDFs (D-05), plus the check
 * that keeps them safe to put in a `Content-Disposition` header.
 *
 * A4 serves both documents and has to emit the two-form header — the quoted
 * ASCII `filename=` fallback and the RFC 5987 `filename*=UTF-8''…` form. A name
 * that is plain ASCII with no quote, backslash, separator or control character
 * needs no escaping in either form, which is why these constants spell
 * "Pasantias" without its accent: the download name is a wire value, not copy.
 *
 * The brochure's filename deliberately does NOT live here. It is derived from
 * `BROCHURE_VERSION` in `cohort-commercial.ts` (D-01: server-only), and pulling
 * it through this module would drag the commercial module into every importer —
 * including the ficha route, which must never see it.
 */
import { COHORT_ID } from '../cohort-public';

/**
 * Cache key for the generated ficha (D-05). Bump whenever any ficha copy or any
 * public cohort value it renders changes — the `propuestas` bucket is keyed by
 * it, so a stale key serves a stale PDF. Independent of `BROCHURE_VERSION`: the
 * ficha carries no prices, so a pricing change alone must not invalidate it.
 */
export const FICHA_VERSION = '2026-10-v1';

/** Download filename for the open ficha. ASCII only — see the module comment. */
export const FICHA_FILENAME = `Ficha-Pasantias-INSPIRA-Barcelona-${COHORT_ID}-${FICHA_VERSION}.pdf`;

/**
 * Characters that would have to be escaped in a quoted `filename=` value or
 * that separate header parameters: control characters, the quote and backslash,
 * `;` and `,`, and both path separators.
 */
const UNSAFE_FILENAME = /[\u0000-\u001F\u007F"\\;,/]/;

/**
 * True when `name` can be used verbatim in both `Content-Disposition` forms:
 * printable ASCII, no header-breaking character, no path component.
 */
export function isRfc5987SafeFilename(name: string): boolean {
  if (name.length === 0) return false;
  // eslint-disable-next-line no-control-regex
  if (!/^[\u0020-\u007E]+$/.test(name)) return false;
  return !UNSAFE_FILENAME.test(name);
}
