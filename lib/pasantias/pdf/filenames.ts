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
 * RFC 5987 §3.2.1 `attr-char` — the only characters an `ext-value` may carry
 * verbatim: ALPHA / DIGIT and `! # $ & + - . ^ _ \` | ~`. Everything else has to
 * be percent-encoded, `%`, `'` and `*` included.
 *
 * This replaces an earlier "printable ASCII minus a denylist" test (Sol's A3
 * SHOULD-FIX): that one accepted names the grammar forbids — a SPACE, a bare
 * `%` (illegal outside a pct-encoded triplet), a `'` (which terminates the
 * charset/language prefix a parser is reading) and a `*` (which would read as
 * the start of another extended parameter). Both filename constants are
 * letters, digits, `-` and `.`, so they stay valid under the tighter grammar.
 *
 * Note the character class is also a subset of what a quoted `filename=` value
 * accepts, so one predicate still answers both header forms.
 * @see https://www.rfc-editor.org/rfc/rfc5987.html#section-3.2.1
 */
const ATTR_CHAR = /^[A-Za-z0-9!#$&+\-.^_`|~]+$/;

/**
 * True when `name` can be used verbatim in both `Content-Disposition` forms:
 * every character is an RFC 5987 `attr-char`. Empty names are rejected — the
 * grammar requires at least one character.
 */
export function isRfc5987SafeFilename(name: string): boolean {
  return ATTR_CHAR.test(name);
}

/**
 * `name` as an RFC 5987 `value-chars`: `attr-char` bytes verbatim, every other
 * byte percent-encoded from its UTF-8 encoding. Encoding is per BYTE, not per
 * character, which is what makes an accented es-CL name (`Pasantías` → `%C3%AD`)
 * come out right.
 */
export function encodeRfc5987Filename(name: string): string {
  return Array.from(new TextEncoder().encode(name))
    .map((byte) => {
      const char = String.fromCharCode(byte);
      return isRfc5987SafeFilename(char)
        ? char
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

/**
 * The `Content-Disposition` header A4's routes emit: `inline` (both documents
 * are meant to open in the browser's viewer), the quoted ASCII `filename=`
 * fallback for clients that never learned RFC 5987, and the `filename*=` form
 * that carries the real name. A name that is not attr-char-clean cannot go in
 * the quoted fallback either, so it degrades to the percent-encoded form there.
 */
export function buildContentDisposition(filename: string): string {
  const encoded = encodeRfc5987Filename(filename);
  const fallback = isRfc5987SafeFilename(filename) ? filename : encoded;
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
