/**
 * Reads an amount typed the Chilean way (F21b, N171; send-back 1).
 *
 * - Dots are thousands separators and a comma is the decimal mark:
 *   «1.200,50» → 1200.5, «1.200.000» → 1200000 (several dots are thousands).
 * - A single dot followed by one or two digits and no comma is a decimal mark
 *   when the field allows decimals («100.01» → 100.01, «100.5» → 100.5).
 * - A single dot followed by exactly three digits and no comma («49.995»,
 *   «1.200») can be read two ways. Where the field allows fewer than three
 *   decimals it can only be thousands and is read so («15.990» → 15990 in pesos
 *   and in a two-decimal field). Where it allows three or more it is AMBIGUOUS:
 *   no value, problem 'ambiguous'. Exception: when the part before the dot is
 *   «0» it cannot be thousands and is a decimal («0.125» → 0.125 with three
 *   decimals allowed).
 * - `decimals` is the most decimal places the field accepts: a value with more
 *   is refused (problem 'too_many_decimals'). With `decimals: 0` (pesos) any
 *   decimal part is refused.
 * - Spaces and one leading «$» or «UF» are ignored.
 * - Anything else is refused (problem 'invalid'): an empty text, letters, a
 *   sign, two commas, thousands groups that are not three digits («1.2.3,4»).
 *
 * It never guesses: an amount that can be read two ways has no value.
 */
export type ParseEsClProblem = 'ambiguous' | 'invalid' | 'too_many_decimals';
export interface ParseEsClResult {
  value: number | null;
  problem: ParseEsClProblem | null;
}

const GROUPED = /^\d{1,3}(\.\d{3})+$/;
const PLAIN = /^\d+$/;

const refuse = (problem: ParseEsClProblem): ParseEsClResult => ({ value: null, problem });

export function parseEsClDetailed(text: string, { decimals }: { decimals: number }): ParseEsClResult {
  if (typeof text !== 'string') return refuse('invalid');
  const allowed = Math.max(0, decimals);
  const t = text.replace(/\s+/g, '').replace(/^(\$|UF)/i, '');
  if (t === '') return refuse('invalid');

  let intPart: string;
  let decPart = '';

  if (t.includes(',')) {
    const pieces = t.split(',');
    if (pieces.length !== 2) return refuse('invalid');
    const [left, right] = pieces;
    if (!PLAIN.test(right)) return refuse('invalid');
    if (!PLAIN.test(left) && !GROUPED.test(left)) return refuse('invalid');
    intPart = left.replace(/\./g, '');
    decPart = right;
  } else if (/^\d+\.\d+$/.test(t)) {
    // Exactly one dot, no comma.
    const [left, right] = t.split('.');
    const couldBeThousands = right.length === 3 && /^\d{1,3}$/.test(left) && left !== '0';
    if (couldBeThousands) {
      if (allowed >= 3) return refuse('ambiguous');
      intPart = left + right;
    } else if (right.length <= 2 || left === '0' || !/^\d{1,3}$/.test(left) || right.length > 3) {
      // Only a decimal reading is possible.
      intPart = left;
      decPart = right;
    } else {
      return refuse('invalid');
    }
  } else if (GROUPED.test(t)) {
    intPart = t.replace(/\./g, '');
  } else if (PLAIN.test(t)) {
    intPart = t;
  } else {
    return refuse('invalid');
  }

  if (decPart.length > allowed) return refuse('too_many_decimals');
  const value = Number(decPart ? `${intPart}.${decPart}` : intPart);
  return Number.isFinite(value) ? { value, problem: null } : refuse('invalid');
}

/** The value of parseEsClDetailed, or null when it is refused for any reason. */
export function parseEsCl(text: string, options: { decimals: number }): number | null {
  return parseEsClDetailed(text, options).value;
}
