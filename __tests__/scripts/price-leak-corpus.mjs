/**
 * The generated differential corpus for the D-01 leak guard.
 *
 * WHY THIS IS GENERATED AND NOT A LIST. Three rounds running, a hand-picked list
 * of leak shapes passed while real coverage was lost. r4 narrowed the separator
 * class and dropped fifteen spellings; r5 rebuilt the corpus by hand and dropped
 * four more — `€2 500\n7`, `€2 500 7`, `€1 000\n45` and the
 * narrow-NBSP form of the second — because the list covered whitespace-grouped
 * amounts *alone* and bare amounts *with a trailing digit*, and never their
 * composition. Every one of those misses was a composition of two dimensions
 * that were each individually tested. Enumeration cannot cover a product; a
 * product has to be crossed.
 *
 * So this module crosses the axes instead of sampling them:
 *
 *   AMOUNT x SPELLING x CONTEXT
 *
 * and derives each case's expected verdict from **what was planted**, not from
 * what the scanner returns. A case is built by choosing a protected amount, a
 * way of writing it, and something to put around it; the expected verdict is the
 * check that guards that amount, plus the check for any second amount the
 * context plants. If the guard cannot find a figure this file deliberately put
 * in front of it, that is a failure by construction rather than by opinion.
 *
 * The module is plain ESM rather than TypeScript so that a differential harness
 * — which imports two revisions of `scripts/check-price-leak.mjs` side by side
 * and diffs their verdicts — can run it under bare `node`, on exactly the cases
 * the vitest suite runs.
 */

/**
 * The protected figures and the check that guards each, mirroring
 * `PRICE_AMOUNTS` / `BAND_AMOUNTS` / `RETIRED_SHORT_AMOUNTS` in
 * `scripts/check-price-leak.mjs`. Duplicated on purpose: a corpus that imported
 * the lists would stop testing that the guard still holds the right ones.
 */
export const PROTECTED = [
  { value: '2500', check: 'priced-amount', label: 'the live programme fee' },
  { value: '1000', check: 'priced-amount', label: 'the fee retired 2026-08-02' },
  { value: '1560', check: 'priced-amount', label: 'the total retired 2026-07-31' },
  { value: '560', check: 'retired-short-amount', label: 'the retired lodging package' },
  { value: '70', check: 'priced-band-amount', label: 'the lodging-band minimum' },
  { value: '120', check: 'priced-band-amount', label: 'the lodging-band maximum' },
];

/**
 * Every character JavaScript's `\s` matches, which is the separator class the
 * guard commits to. Vector (b) of the threat model is a human typing a price
 * into copy and the tool emitting one of these where the space was: NBSP,
 * narrow NBSP and thin space are what design tools and word processors produce,
 * and a wrapped line produces the newline. Written as escapes because most of
 * them are invisible in an editor.
 */
export const SEPARATORS = [
  ['plain space', ' '],
  ['tab', '\t'],
  ['newline', '\n'],
  ['carriage return', '\r'],
  ['vertical tab', '\v'],
  ['form feed', '\f'],
  ['NBSP (U+00A0)', '\u00a0'],
  ['ogham space mark (U+1680)', '\u1680'],
  ['en quad (U+2000)', '\u2000'],
  ['em space (U+2003)', '\u2003'],
  ['thin space (U+2009)', '\u2009'],
  ['hair space (U+200A)', '\u200a'],
  ['line separator (U+2028)', '\u2028'],
  ['paragraph separator (U+2029)', '\u2029'],
  ['narrow NBSP (U+202F)', '\u202f'],
  ['medium mathematical space (U+205F)', '\u205f'],
  ['ideographic space (U+3000)', '\u3000'],
  ['zero-width NBSP (U+FEFF)', '\ufeff'],
];

/** `2500` -> `2 500` under `separator`; only meaningful past three digits. */
function group(value, separator) {
  const head = value.length % 3 === 0 ? 3 : value.length % 3;
  const groups = [value.slice(0, head)];
  for (let at = head; at < value.length; at += 3) groups.push(value.slice(at, at + 3));
  return groups.join(separator);
}

/**
 * `2500` shifted `places` decimal places to the right of the point, as a
 * mantissa string: 3 -> `2.5`, 2 -> `25`, 4 -> `0.25`. The last shape is the one
 * Sol's round-4 S1 raised — a mantissa below one shifts back to `02500`, which
 * is the protected fee with a leading zero in front of it.
 */
function mantissa(value, places) {
  if (places === 0) return value;
  const padded = places >= value.length ? `${'0'.repeat(places - value.length + 1)}${value}` : value;
  const point = padded.length - places;
  const fraction = padded.slice(point).replace(/0+$/, '');
  return fraction === '' ? padded.slice(0, point) : `${padded.slice(0, point)}.${fraction}`;
}

/**
 * Every way this corpus knows to write `value`, as `[label, text]`. The
 * whitespace-grouped spellings are the product with {@link SEPARATORS}; the rest
 * are the conventions the guard's normalisation claims to collapse, and the
 * exponential forms vector (a) — the minifier — can emit.
 */
export function spellings(value) {
  const written = [['plain', value]];

  if (value.length > 3) {
    written.push(['dot-grouped', group(value, '.')]);
    written.push(['comma-grouped', group(value, ',')]);
    for (const [name, separator] of SEPARATORS) {
      written.push([`grouped by ${name}`, group(value, separator)]);
    }
    written.push(['dot-grouped with a comma tail', `${group(value, '.')},00`]);
    written.push(['comma-grouped with a dot tail', `${group(value, ',')}.00`]);
  }

  written.push(['a decimal-dot tail', `${value}.00`]);
  written.push(['a decimal-comma tail', `${value},50`]);

  for (let places = 1; places <= value.length; places += 1) {
    written.push([`exponential e${places}`, `${mantissa(value, places)}e${places}`]);
  }
  written.push(['an explicit positive exponent', `${mantissa(value, 1)}e+1`]);
  written.push(['an uppercase exponent', `${mantissa(value, 1)}E1`]);

  return written;
}

/**
 * What can sit around a written amount. Each returns the full text plus any
 * *extra* check the context itself plants, so the expected verdict stays a
 * statement about what was put in the string rather than a reading of the
 * output.
 *
 * The trailing-digit contexts are the composition r5 lost: a price, then a digit
 * belonging to something else, close enough to fuse into one token.
 */
export const CONTEXTS = [
  {
    label: 'with a currency glyph before it',
    build: (written) => ({ text: `€${written}`, plants: [] }),
  },
  {
    label: 'with the ISO code after it',
    build: (written) => ({ text: `${written} EUR`, plants: [] }),
  },
  {
    label: 'with the word after it',
    build: (written) => ({ text: `${written} euros`, plants: [] }),
  },
  {
    label: 'with a stray digit after one space',
    build: (written) => ({ text: `€${written} 7`, plants: [] }),
  },
  {
    label: 'with a stray digit after a newline',
    build: (written) => ({ text: `€${written}\n45`, plants: [] }),
  },
  {
    label: 'inside JSX copy, with a stray digit after it',
    build: (written) => ({ text: `<p>Programa: €${written} 7 cupos</p>`, plants: [] }),
  },
  {
    label: 'followed by the band minimum, with its own marker',
    build: (written) => ({ text: `€${written} €70`, plants: ['priced-band-amount'] }),
  },
  {
    label: 'followed by the retired package, sharing one marker',
    build: (written) => ({ text: `€${written} 560`, plants: ['retired-short-amount'] }),
  },
];

/**
 * The full cross-product, each case carrying the verdict it must produce.
 *
 * `expected` is the sorted set of check ids: the one guarding the amount that
 * was written, plus whatever the context planted. A context never removes a
 * finding — that is the property under test.
 */
export function generateCorpus() {
  const cases = [];
  for (const amount of PROTECTED) {
    for (const [spelling, written] of spellings(amount.value)) {
      for (const context of CONTEXTS) {
        const { text, plants } = context.build(written);
        cases.push({
          description: `${amount.label} (${amount.value}), ${spelling}, ${context.label}`,
          text,
          expected: [...new Set([amount.check, ...plants])].sort(),
        });
      }
    }
  }
  return cases;
}

/**
 * The limits the guard deliberately does not cover, and the two over-firings it
 * accepts, pinned as expected verdicts so they stay recorded decisions rather
 * than something a later round rediscovers as a bug. Read the threat model at
 * the top of `scripts/check-price-leak.mjs` before changing one.
 */
export const PINNED_LIMITS = [
  ['fullwidth digits (expected miss)', '€２５００', []],
  ['Arabic-Indic digits (expected miss)', '€٢٥٠٠', []],
  ['a doubled space (expected miss)', '€2  500', []],
  ['a negative exponent (expected miss)', '€25000e-1', []],
  ['a bare leading zero, no exponent (expected miss)', '€02500', []],
  ['€2500e-1, which is 250 (expected over-firing)', '€2500e-1', ['priced-amount']],
  ['€2.500e0, which is 2.5 (expected over-firing)', '€2.500e0', ['priced-amount']],
];

/**
 * Unrelated euro-denominated text that must stay silent. A guard that cries wolf
 * gets switched off, so every case Sol's round-1 S1 raised is here, alongside two
 * strings copied verbatim out of live repo code.
 */
export const SILENT_CONTROLS = [
  ['an unrelated larger amount', 'x="€12.500"'],
  ['a malformed trailing digit', 'x="€2.5000"'],
  ['another unrelated larger amount', 'x="€22.500"'],
  ['a grouped euro thousand', 'x="€120.000"'],
  ['a larger amount with cents', 'x="€12.500,00"'],
  ['a larger amount with a dot tail', 'x="€12,500.00"'],
  ['the retired amount inside a larger one', 'x="€21.000"'],
  ['a euro decimal whose cents are a band figure', 'total="€1.200,70 por hora"'],
  ['the same, written the other way round', 'total="€1,200.70 por hora"'],
  ['a euro amount that is not protected', 'x="€45"'],
  ['a four-digit year', 'x="€1970"'],
  ['bare band digits with no currency', 'const a=70,b=120,c=70+120;'],
  ['a chunk hash', 'static/chunks/pages/index-a70f9c120b.js'],
  ['a distant euro sign', `p="€"${'z'.repeat(40)}70`],
  ['the public headline', 'x="Octubre, 5 al 16 · 2026"'],
  ['a euro-word inside a longer word', 'x="eurocentrismo 2500"'],
  ['the ISO code with no protected amount near it', 'th="Tarifa EUR/hora"'],
  ['an unrelated euro rate', '"Tarifa EUR",amount:45'],
  // Live `/pasantias` copy. `Europa` contains `Eur`, and a case-insensitive
  // alternation with no trailing boundary would fire on every free-day block.
  ['the free-weekend copy', 'recorrer Barcelona o conocer Europa antes de la segunda semana'],
  ['Europa beside a band figure', 'conocer Europa · 70 personas'],
  // Verbatim from `lib/currency-service.ts` and `lib/expenseReportExport.ts`.
  ['the live fallback exchange rate', 'EUR: 1050, // 1 EUR ≈ 1050 CLP (approximate)'],
  ['the live formatter example', 'Locale-formatted original amount, e.g. "1.234,50" for EUR'],
];

/**
 * The four shapes Sol's round 4 proved regressed between `ca8e024` and
 * `2158c44`, plus the three neighbours that kept working. Generation is what
 * stops the next composition from slipping through; these stay named so that a
 * failure here says *which* regression came back.
 */
export const SOL_ROUND_4_ROWS = [
  ['grouped fee, digit on the next line', '€2 500\n7', ['priced-amount']],
  ['grouped fee, digit after a space', '€2 500 7', ['priced-amount']],
  ['grouped retired fee, digits on the next line', '€1 000\n45', ['priced-amount']],
  ['narrow-NBSP fee, digit after a space', '€2\u202f500 7', ['priced-amount']],
  ['grouped retired total, digits after it', '€1 560 45', ['priced-amount']],
  ['the grouped fee alone', '€2 500', ['priced-amount']],
  ['bare fee, digit on the next line', '€2500\n7', ['priced-amount']],
];
