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
 * way of writing it, and something to put around it; the expected verdict is one
 * entry per figure the case plants — the amount and the check that guards it —
 * so a case that plants two figures must produce two findings. If the guard
 * cannot find a figure this file deliberately put in front of it, that is a
 * failure by construction rather than by opinion.
 *
 * WHY OCCURRENCES AND NOT CHECK IDS (A6a r7). The oracle used to reduce a case
 * to the *set* of check ids that fired. Under that oracle `€120 €70` and
 * `€560 560` stay green when the first planted figure stops firing, because the
 * second still produces the same id — and that is exactly how r5's damage hid:
 * on `€1 560 7` r5 did fire, on the nested `560` rather than on the fee, so
 * every spot check passed while the finding was attributed to the wrong figure.
 * The expected verdict is therefore a multiset of `(check, amount)` pairs, and
 * findings carry the canonical amount and the span of the reading that produced
 * them (see `scanText` in `scripts/check-price-leak.mjs`).
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
 * How far each check lets an amount sit from its currency marker, mirroring
 * `GAP` / `BAND_GAP` in `scripts/check-price-leak.mjs`. Duplicated for the same
 * reason as {@link PROTECTED}, and used by the window-boundary contexts below:
 * marker distance is a dimension the corpus did not vary until r7.
 */
export const WINDOW = new Map([
  ['priced-amount', 120],
  ['priced-band-amount', 12],
  ['retired-short-amount', 12],
]);

/**
 * Every code point JavaScript's `\s` matches, **derived from the engine** rather
 * than typed out.
 *
 * This list has now been wrong three times, in three different ways, by three
 * different authors: r4 narrowed the guard's class to two characters and lost
 * fifteen spellings; r6's corpus enumerated eighteen of the twenty-five and
 * omitted U+2001, U+2002 and U+2004–U+2008; an independent generator written to
 * check that enumeration listed twenty-one and omitted four. Adding the missing
 * characters would repeat the method that keeps failing, so the set is asked of
 * the engine. {@link WHITESPACE_COUNT} is the size that answer is expected to
 * have — a future engine gaining or losing a whitespace character surfaces as a
 * failing assertion rather than as silently thinner coverage.
 */
export const WHITESPACE_CODE_POINTS = (() => {
  const found = [];
  for (let code = 0; code <= 0xffff; code += 1) {
    if (/\s/.test(String.fromCharCode(code))) found.push(code);
  }
  return found;
})();

/**
 * The size of the ECMAScript whitespace set: WhiteSpace (11.2) + LineTerminator
 * (11.3) = 25 code points, all in the BMP. Asserted in
 * `__tests__/scripts/check-price-leak.test.ts`.
 */
export const WHITESPACE_COUNT = 25;

/**
 * Readable names for the code points a reader is likely to care about. Cosmetic
 * only — this map never decides membership, so an entry missing from it costs a
 * case its nice label and nothing else.
 */
const WHITESPACE_NAMES = new Map([
  [0x09, 'tab'],
  [0x0a, 'newline'],
  [0x0b, 'vertical tab'],
  [0x0c, 'form feed'],
  [0x0d, 'carriage return'],
  [0x20, 'plain space'],
  [0xa0, 'NBSP'],
  [0x1680, 'ogham space mark'],
  [0x2007, 'figure space'],
  [0x2009, 'thin space'],
  [0x200a, 'hair space'],
  [0x2028, 'line separator'],
  [0x2029, 'paragraph separator'],
  [0x202f, 'narrow NBSP'],
  [0x205f, 'medium mathematical space'],
  [0x3000, 'ideographic space'],
  [0xfeff, 'zero-width NBSP'],
]);

function whitespaceLabel(code) {
  const point = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
  const name = WHITESPACE_NAMES.get(code);
  return name === undefined ? point : `${name} (${point})`;
}

/**
 * The separator class the guard commits to, as `[label, character]`. Vector (b)
 * of the threat model is a human typing a price into copy and the tool emitting
 * one of these where the space was: NBSP, narrow NBSP and thin space are what
 * design tools and word processors produce, and a wrapped line produces the
 * newline.
 */
export const SEPARATORS = WHITESPACE_CODE_POINTS.map((code) => [
  whitespaceLabel(code),
  String.fromCharCode(code),
]);

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

/** The occurrence a case's own amount must produce. */
const own = (amount) => ({ value: amount.value, check: amount.check });

/** The figures a context can plant alongside the amount under test. */
const BAND_MINIMUM = { value: '70', check: 'priced-band-amount' };
const BAND_MAXIMUM = { value: '120', check: 'priced-band-amount' };
const RETIRED_PACKAGE = { value: '560', check: 'retired-short-amount' };

/**
 * Padding for the window-boundary contexts: a character that is neither a digit,
 * nor a separator, nor part of any currency marker, so the only thing it changes
 * is the distance between the amount and its marker.
 */
const FILLER = 'x';

/**
 * What can sit around a written amount. Each returns the full text plus **every
 * occurrence it plants**, so the expected verdict stays a statement about what
 * was put in the string rather than a reading of the output.
 *
 * The trailing-digit contexts are the composition r5 lost: a price, then a digit
 * belonging to something else, close enough to fuse into one token. The
 * two-figure contexts are the attribution case (A6a r7): with a same-id second
 * figure present, a set-of-ids oracle cannot tell "both fired" from "only one
 * did". The window-boundary contexts vary marker distance, which is the
 * dimension the real `lib/services/hour-tracking.ts` over-firing lives on and
 * which nothing varied before r7.
 */
export const CONTEXTS = [
  {
    label: 'with a currency glyph before it',
    build: (written, amount) => ({ text: `€${written}`, occurrences: [own(amount)] }),
  },
  {
    label: 'with the ISO code after it',
    build: (written, amount) => ({ text: `${written} EUR`, occurrences: [own(amount)] }),
  },
  {
    label: 'with the word after it',
    build: (written, amount) => ({ text: `${written} euros`, occurrences: [own(amount)] }),
  },
  {
    label: 'with a stray digit after one space',
    build: (written, amount) => ({ text: `€${written} 7`, occurrences: [own(amount)] }),
  },
  {
    label: 'with a stray digit after a newline',
    build: (written, amount) => ({ text: `€${written}\n45`, occurrences: [own(amount)] }),
  },
  {
    label: 'inside JSX copy, with a stray digit after it',
    build: (written, amount) => ({
      text: `<p>Programa: €${written} 7 cupos</p>`,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'followed by the band minimum, with its own marker',
    build: (written, amount) => ({
      text: `€${written} €70`,
      occurrences: [own(amount), BAND_MINIMUM],
    }),
  },
  {
    label: 'followed by the retired package, sharing one marker',
    build: (written, amount) => ({
      text: `€${written} 560`,
      occurrences: [own(amount), RETIRED_PACKAGE],
    }),
  },
  // Everything below is new in r7, and is appended rather than interleaved so
  // that the first eight contexts stay exactly the r6 set — the differential
  // harness slices them off to reproduce Sol's figures on the corpus Sol read.
  {
    label: 'followed by the band maximum, with its own marker',
    build: (written, amount) => ({
      text: `€${written} €120`,
      occurrences: [own(amount), BAND_MAXIMUM],
    }),
  },
  {
    label: 'with its marker at the far edge of the window, after it',
    build: (written, amount) => ({
      text: `${written}${FILLER.repeat(WINDOW.get(amount.check))}€`,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'with its marker one character past the window, after it',
    build: (written, amount) => ({
      text: `${written}${FILLER.repeat(WINDOW.get(amount.check) + 1)}€`,
      occurrences: [],
    }),
  },
  {
    label: 'with its marker at the far edge of the window, before it',
    build: (written, amount) => ({
      text: `€${FILLER.repeat(WINDOW.get(amount.check))}${written}`,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'with its marker one character past the window, before it',
    build: (written, amount) => ({
      text: `€${FILLER.repeat(WINDOW.get(amount.check) + 1)}${written}`,
      occurrences: [],
    }),
  },
];

/**
 * The full cross-product, each case carrying the occurrences it must produce.
 *
 * `expected` is the multiset of `(check, amount)` pairs the case plants, in the
 * canonical order {@link sortOccurrences} imposes. A context never removes an
 * occurrence — that is the property under test.
 */
export function generateCorpus() {
  const cases = [];
  for (const amount of PROTECTED) {
    for (const [spelling, written] of spellings(amount.value)) {
      for (const context of CONTEXTS) {
        const { text, occurrences } = context.build(written, amount);
        cases.push({
          description: `${amount.label} (${amount.value}), ${spelling}, ${context.label}`,
          text,
          expected: sortOccurrences(occurrences),
        });
      }
    }
  }
  return cases;
}

/**
 * The canonical order for an occurrence multiset: `check:amount`, sorted. A
 * multiset rather than a set — two figures guarded by the same check are two
 * occurrences, and collapsing them is the attribution loss this corpus exists to
 * catch.
 */
export function sortOccurrences(occurrences) {
  return occurrences
    .map(({ check, value }) => (value === null || value === undefined ? check : `${check}:${value}`))
    .sort();
}

/**
 * The live `lib/services/hour-tracking.ts` fragment that puts an unrelated cache
 * TTL of `1000` inside `priced-amount`'s 120-character window of the FX API
 * URL's `EUR`. Copied verbatim, so a change to that file's shape shows up here.
 */
export const HOUR_TRACKING_FX_FRAGMENT = [
  'const FX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour',
  "const FX_API_URL = 'https://api.exchangerate-api.com/v4/latest/EUR';",
].join('\n');

/**
 * The limits the guard deliberately does not cover, and the over-firings it
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
  [
    '€2500e-1, which is 250 (expected over-firing)',
    '€2500e-1',
    [{ value: '2500', check: 'priced-amount' }],
  ],
  [
    '€2.500e0, which is 2.5 (expected over-firing)',
    '€2.500e0',
    [{ value: '2500', check: 'priced-amount' }],
  ],
  // The real one, added in r7. `1000` is a retired programme fee and this is an
  // hour cache TTL; the two sit 75 characters apart, well inside the window that
  // has to span `currency:"EUR",items:[{id:…,label:…,amount:…}` for the
  // commercial-module mutant proof to fire. Tightening the association — a
  // no-newline rule, a URL exclusion — would buy silence here at the cost of the
  // proof this guard exists for, so the over-firing is kept and recorded
  // instead. It costs nothing today: the constant does not survive minification,
  // so `.next/static` never carries it and the production scan stays green.
  [
    'the live hour-tracking FX cache TTL near the API URL (expected over-firing)',
    HOUR_TRACKING_FX_FRAGMENT,
    [{ value: '1000', check: 'priced-amount' }],
  ],
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
 * failure here says *which* regression came back — and now also *which figure*
 * the guard attributed it to, since `€1 560 45` is the row where r5 fired on the
 * nested `560` instead of on the fee and every spot check still passed.
 */
export const SOL_ROUND_4_ROWS = [
  ['grouped fee, digit on the next line', '€2 500\n7', [{ value: '2500', check: 'priced-amount' }]],
  ['grouped fee, digit after a space', '€2 500 7', [{ value: '2500', check: 'priced-amount' }]],
  [
    'grouped retired fee, digits on the next line',
    '€1 000\n45',
    [{ value: '1000', check: 'priced-amount' }],
  ],
  [
    'narrow-NBSP fee, digit after a space',
    '€2 500 7',
    [{ value: '2500', check: 'priced-amount' }],
  ],
  [
    'grouped retired total, digits after it',
    '€1 560 45',
    [{ value: '1560', check: 'priced-amount' }],
  ],
  ['the grouped fee alone', '€2 500', [{ value: '2500', check: 'priced-amount' }]],
  ['bare fee, digit on the next line', '€2500\n7', [{ value: '2500', check: 'priced-amount' }]],
];

/**
 * Attribution cases: two planted figures whose findings a set-of-ids oracle
 * cannot tell apart, plus the nesting cases where one reading is suppressed
 * inside another. `spans` is what each finding's reading must slice back to, in
 * the order the scanner reports them — this is the assertion that says *which
 * figure* fired, not merely that something did.
 */
export const ATTRIBUTION_ROWS = [
  {
    description: 'the band maximum and the band minimum, same check id',
    text: '€120 €70',
    occurrences: [BAND_MAXIMUM, BAND_MINIMUM],
    spans: ['120', '70'],
  },
  {
    description: 'the retired package twice, sharing one marker',
    text: '€560 560',
    occurrences: [RETIRED_PACKAGE, RETIRED_PACKAGE],
    spans: ['560', '560'],
  },
  {
    description: 'the band minimum twice, each with its own marker',
    text: '€70 €70',
    occurrences: [BAND_MINIMUM, BAND_MINIMUM],
    spans: ['70', '70'],
  },
  {
    description: 'the retired total reported once, on the fee and not on the 560 inside it',
    text: '€1 560',
    occurrences: [{ value: '1560', check: 'priced-amount' }],
    spans: ['1 560'],
  },
  {
    description: 'the retired total beside a separately planted package',
    text: '€1 560 560',
    occurrences: [{ value: '1560', check: 'priced-amount' }, RETIRED_PACKAGE],
    spans: ['1 560', '560'],
  },
  {
    description: 'the fee and a separately planted package, sharing one marker',
    text: '€2 500 560',
    occurrences: [{ value: '2500', check: 'priced-amount' }, RETIRED_PACKAGE],
    spans: ['2 500', '560'],
  },
];
