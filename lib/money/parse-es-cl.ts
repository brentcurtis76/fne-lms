/**
 * Reads an amount typed the Chilean way (F21b, N171).
 *
 * - Dots are thousands separators and a comma is the decimal mark:
 *   «1.200,50» → 1200.5, «15.990» → 15990, «1.000.000» → 1000000.
 * - A single dot followed by one or two digits and no comma is read as a
 *   decimal mark when the field allows decimals («100.01» → 100.01,
 *   «100.5» → 100.5); a dot followed by exactly three digits is always
 *   thousands («15.990» → 15990, «49.995» → 49995).
 * - `decimals` is the most decimal places the field accepts: a value with more
 *   is refused (null). With `decimals: 0` (pesos) any decimal part is refused.
 * - Spaces and one leading «$» or «UF» are ignored.
 * - Anything else is refused (null): an empty text, letters, a sign, two
 *   commas, thousands groups that are not three digits («1.2.3,4»), etc.
 *
 * Returns a number or null; it never guesses.
 */
export function parseEsCl(text: string, { decimals }: { decimals: number }): number | null {
  if (typeof text !== 'string') return null;
  let t = text.replace(/\s+/g, '');
  t = t.replace(/^(\$|UF)/i, '');
  if (t === '') return null;

  let intPart: string;
  let decPart = '';

  // Integer part: plain digits, or groups of three separated by dots.
  const GROUPED = /^\d{1,3}(\.\d{3})+$/;
  const PLAIN = /^\d+$/;

  if (t.includes(',')) {
    const pieces = t.split(',');
    if (pieces.length !== 2) return null;
    const [left, right] = pieces;
    if (!/^\d+$/.test(right)) return null;
    if (!PLAIN.test(left) && !GROUPED.test(left)) return null;
    intPart = left.replace(/\./g, '');
    decPart = right;
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    // A single dot with one or two digits after it: a decimal mark, if allowed.
    if (decimals <= 0) return null;
    [intPart, decPart] = t.split('.');
  } else if (GROUPED.test(t)) {
    intPart = t.replace(/\./g, '');
  } else if (PLAIN.test(t)) {
    intPart = t;
  } else {
    return null;
  }

  if (decPart.length > Math.max(0, decimals)) return null;
  const value = Number(decPart ? `${intPart}.${decPart}` : intPart);
  return Number.isFinite(value) ? value : null;
}
