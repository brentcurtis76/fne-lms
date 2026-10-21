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
 *
 * JANUARY 2027 (PASANT-B003, C006). The ratified January contract
 * (`docs/plan/pasantias-january-contract.md`, `commercial`) prices the cohort in
 * pesos with lodging in euros. Its figures are pinned below as literals typed
 * from the contract — never read from the scanner, and never computed from
 * anything the scanner holds — and crossed with their own currency's contexts by
 * {@link generateJanuaryCorpus}. October's {@link PROTECTED} list and
 * {@link generateCorpus} keep every historical case; the October contexts only
 * gained appended entries, so the first eight are still exactly the r6 set.
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
  ['january-clp-amount', 120],
  ['january-clp-short-amount', 12],
  ['january-lodging-amount', 12],
]);

/**
 * The January 2027 commercial facts as the ratified contract states them
 * (`commercial`, ratified 2026-10-09) — the inputs, not the scanner's lists.
 * `__tests__/scripts/check-price-leak.test.ts` checks that the per-person totals
 * below follow from these inputs by the contract's own arithmetic (fee + flight +
 * nights × lodging × rate, rounded to the nearest $100.000), so a mistyped fact
 * and a mistyped total cannot agree by accident.
 */
export const JANUARY_FACTS = {
  feeClp: { standard: '2500000', discounted: '2000000' },
  flightClp: '1500000',
  eurClp: '1100',
  roundingClp: '100000',
  lodgingEur: { doublePerPersonPerNight: ['50', '75'], singlePerNightApprox: '100' },
  nights: { inspira: 12, 'mirada-profunda': 13 },
  perPersonClp: {
    inspira: { standard: ['4700000', '5000000'], discounted: ['4200000', '4500000'] },
    'mirada-profunda': { standard: ['4700000', '5100000'], discounted: ['4200000', '4600000'] },
  },
  teamSizes: [1, 10],
};

/** The six distinct per-person totals across both programmes and both prices (page 14). */
export const JANUARY_PER_PERSON_CLP = ['4200000', '4500000', '4600000', '4700000', '5000000', '5100000'];

/**
 * Every page-15 team total: each per-person total times each team size 1–10,
 * typed out rather than multiplied, one row per per-person total. Sixty products,
 * fifty-nine values: `45000000` is both 4.500.000 × 10 and 5.000.000 × 9 and is
 * listed once, in the first row that reaches it. The size-1 column is the
 * per-person totals themselves.
 */
export const JANUARY_TEAM_TOTALS_CLP = [
  '4200000', '8400000', '12600000', '16800000', '21000000', '25200000', '29400000', '33600000', '37800000', '42000000',
  '4500000', '9000000', '13500000', '18000000', '22500000', '27000000', '31500000', '36000000', '40500000', '45000000',
  '4600000', '9200000', '13800000', '18400000', '23000000', '27600000', '32200000', '36800000', '41400000', '46000000',
  '4700000', '9400000', '14100000', '18800000', '23500000', '28200000', '32900000', '37600000', '42300000', '47000000',
  '5000000', '10000000', '15000000', '20000000', '25000000', '30000000', '35000000', '40000000', '50000000',
  '5100000', '10200000', '15300000', '20400000', '25500000', '30600000', '35700000', '40800000', '45900000', '51000000',
];

const JANUARY_CLP_AMOUNT = 'january-clp-amount';
const JANUARY_CLP_SHORT_AMOUNT = 'january-clp-short-amount';
const JANUARY_LODGING_AMOUNT = 'january-lodging-amount';

/**
 * The January figures and the check expected to guard each, with the currency
 * whose markers the corpus plants beside it. Wide window for the distinctive
 * peso figures; tight for the exchange rate, the rounding unit and the euro
 * lodging figures, which are ordinary numbers in minified output.
 */
export const JANUARY_PROTECTED = [
  { value: '2500000', check: JANUARY_CLP_AMOUNT, currency: 'CLP', label: 'the January programme fee' },
  { value: '2000000', check: JANUARY_CLP_AMOUNT, currency: 'CLP', label: 'the January discounted fee' },
  { value: '1500000', check: JANUARY_CLP_AMOUNT, currency: 'CLP', label: 'the January approximate flight' },
  { value: '1100', check: JANUARY_CLP_SHORT_AMOUNT, currency: 'CLP', label: 'the January exchange rate' },
  { value: '100000', check: JANUARY_CLP_SHORT_AMOUNT, currency: 'CLP', label: 'the January rounding unit' },
  { value: '50', check: JANUARY_LODGING_AMOUNT, currency: 'EUR', label: 'the January double-room lodging minimum' },
  { value: '75', check: JANUARY_LODGING_AMOUNT, currency: 'EUR', label: 'the January double-room lodging maximum' },
  { value: '100', check: JANUARY_LODGING_AMOUNT, currency: 'EUR', label: 'the January single-room lodging' },
  ...JANUARY_TEAM_TOTALS_CLP.map((value) => ({
    value,
    check: JANUARY_CLP_AMOUNT,
    currency: 'CLP',
    label: JANUARY_PER_PERSON_CLP.includes(value)
      ? 'a January per-person total'
      : 'a January team total',
  })),
];

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
 * The no-break spaces design tools put between a currency marker and a figure
 * (threat-model vector (b)), spelled by code point so a reader can see them.
 */
const NBSP = String.fromCharCode(0xa0);
const NARROW_NBSP = String.fromCharCode(0x202f);

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
  // Appended for January (PASANT-B003): the marker on the other side, in other
  // cases, behind the NBSPs design tools emit, and as a separate object field —
  // the shapes C006 names that the contexts above only partly crossed.
  {
    label: 'with the glyph after it',
    build: (written, amount) => ({ text: `${written} €`, occurrences: [own(amount)] }),
  },
  {
    label: 'with the ISO code before it',
    build: (written, amount) => ({ text: `EUR ${written}`, occurrences: [own(amount)] }),
  },
  {
    label: 'with the word shouted after it',
    build: (written, amount) => ({ text: `${written} EUROS`, occurrences: [own(amount)] }),
  },
  {
    label: 'with an NBSP between the glyph and it',
    build: (written, amount) => ({ text: `€${NBSP}${written}`, occurrences: [own(amount)] }),
  },
  {
    label: 'with a narrow NBSP before the ISO code',
    build: (written, amount) => ({ text: `${written}${NARROW_NBSP}EUR`, occurrences: [own(amount)] }),
  },
  {
    label: 'as an amount field after a currency field',
    build: (written, amount) => ({
      text: `{currency:"EUR",amount:${written}}`,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'as an amount field before a currency field',
    build: (written, amount) => ({
      text: `{amount:${written},currency:"EUR"}`,
      occurrences: [own(amount)],
    }),
  },
];

/** Figures a peso context can plant alongside the amount under test. */
const EXCHANGE_RATE = { value: '1100', check: JANUARY_CLP_SHORT_AMOUNT };
const FLIGHT = { value: '1500000', check: JANUARY_CLP_AMOUNT };
const PER_PERSON_MAXIMUM = { value: '5100000', check: JANUARY_CLP_AMOUNT };

/**
 * Padding for the peso window-boundary contexts. {@link FILLER} cannot be used:
 * a `$` followed by a letter is an identifier, not a peso sign (see
 * `CLP_CURRENCY` in `scripts/check-price-leak.mjs`), so `$xxx…` would plant no
 * marker at all, and every inside-the-window case would fail for a reason that
 * has nothing to do with the window. `#` is neither a digit, a separator, a
 * letter nor part of any marker.
 */
const PESO_FILLER = '#';

/**
 * The peso counterpart of {@link CONTEXTS}: the same dimensions — marker before
 * and after, ISO code and word, stray digits, two figures with their own or a
 * shared marker, NBSPs, object fields and the window's edges — with peso markers
 * and peso companions. Companions stay in the amount's own currency: a peso
 * figure beside a euro marker is a cross-currency shape, and those are pinned
 * in {@link PINNED_LIMITS} rather than generated.
 *
 * The shared-marker companion is the flight, a wide-window figure, because the
 * longest peso spellings (`51.000.000,00`) would put a tight-window companion
 * past its 12 characters — a case that plants a figure outside its window is not
 * a leak beside a marker.
 */
export const CLP_CONTEXTS = [
  {
    label: 'with a peso sign before it',
    build: (written, amount) => ({ text: `$${written}`, occurrences: [own(amount)] }),
  },
  {
    label: 'with the ISO code after it',
    build: (written, amount) => ({ text: `${written} CLP`, occurrences: [own(amount)] }),
  },
  {
    label: 'with the word after it',
    build: (written, amount) => ({ text: `${written} pesos`, occurrences: [own(amount)] }),
  },
  {
    label: 'with a stray digit after one space',
    build: (written, amount) => ({ text: `$${written} 7`, occurrences: [own(amount)] }),
  },
  {
    label: 'with a stray digit after a newline',
    build: (written, amount) => ({ text: `$${written}\n45`, occurrences: [own(amount)] }),
  },
  {
    label: 'inside JSX copy, with a stray digit after it',
    build: (written, amount) => ({
      text: `<p>Programa: $${written} 7 cupos</p>`,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'followed by the exchange rate, with its own marker',
    build: (written, amount) => ({
      text: `$${written} $1.100`,
      occurrences: [own(amount), EXCHANGE_RATE],
    }),
  },
  {
    label: 'followed by the flight, sharing one marker',
    build: (written, amount) => ({
      text: `$${written} 1500000`,
      occurrences: [own(amount), FLIGHT],
    }),
  },
  {
    label: 'followed by the per-person maximum, with its own marker',
    build: (written, amount) => ({
      text: `$${written} $5.100.000`,
      occurrences: [own(amount), PER_PERSON_MAXIMUM],
    }),
  },
  {
    label: 'with the ISO code before it',
    build: (written, amount) => ({ text: `CLP ${written}`, occurrences: [own(amount)] }),
  },
  {
    label: 'with the word shouted after it',
    build: (written, amount) => ({ text: `${written} PESOS`, occurrences: [own(amount)] }),
  },
  {
    label: 'with the ISO code in lower case after it',
    build: (written, amount) => ({ text: `${written} clp`, occurrences: [own(amount)] }),
  },
  {
    label: 'with an NBSP between the sign and it',
    build: (written, amount) => ({ text: `$${NBSP}${written}`, occurrences: [own(amount)] }),
  },
  {
    label: 'with a narrow NBSP before the ISO code',
    build: (written, amount) => ({ text: `${written}${NARROW_NBSP}CLP`, occurrences: [own(amount)] }),
  },
  {
    label: 'as an amount field after a currency field',
    build: (written, amount) => ({
      text: `{currency:"CLP",amount:${written}}`,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'as an amount field before a currency field',
    build: (written, amount) => ({
      text: `{amount:${written},currency:"CLP"}`,
      occurrences: [own(amount)],
    }),
  },
  {
    // The literal `$` of a template that prints a peso amount sits directly
    // before an interpolation; the interpolation's own `$` is not a marker.
    label: 'after a template literal that prints the peso sign',
    build: (written, amount) => ({
      text: 'x=`$${a}`;a=' + written,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'with its marker at the far edge of the window, after it',
    build: (written, amount) => ({
      text: `${written}${PESO_FILLER.repeat(WINDOW.get(amount.check))}$`,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'with its marker one character past the window, after it',
    build: (written, amount) => ({
      text: `${written}${PESO_FILLER.repeat(WINDOW.get(amount.check) + 1)}$`,
      occurrences: [],
    }),
  },
  {
    label: 'with its marker at the far edge of the window, before it',
    build: (written, amount) => ({
      text: `$${PESO_FILLER.repeat(WINDOW.get(amount.check))}${written}`,
      occurrences: [own(amount)],
    }),
  },
  {
    label: 'with its marker one character past the window, before it',
    build: (written, amount) => ({
      text: `$${PESO_FILLER.repeat(WINDOW.get(amount.check) + 1)}${written}`,
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
 * The January cross-product: {@link JANUARY_PROTECTED} × {@link spellings} × the
 * contexts of each figure's own currency ({@link CLP_CONTEXTS} for pesos,
 * {@link CONTEXTS} for the euro lodging figures). Expected verdicts come from
 * what each case plants, exactly as in {@link generateCorpus}.
 *
 * Every case also carries `group` — the figure and its spelling — because the
 * product is large (sixty-odd figures, forty-odd spellings, twenty-odd contexts)
 * and the suite asserts it one group at a time rather than registering tens of
 * thousands of tests. A failing assertion still names its full `description`.
 */
export function generateJanuaryCorpus() {
  const cases = [];
  for (const amount of JANUARY_PROTECTED) {
    const contexts = amount.currency === 'CLP' ? CLP_CONTEXTS : CONTEXTS;
    for (const [spelling, written] of spellings(amount.value)) {
      const group = `${amount.label} (${amount.value}), ${spelling}`;
      for (const context of contexts) {
        const { text, occurrences } = context.build(written, amount);
        cases.push({
          group,
          description: `${group}, ${context.label}`,
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
  // January (PASANT-B003). Currencies do not cross: a figure fires only beside a
  // marker of its own currency, which is what keeps the ubiquitous minified `$`
  // away from October's short euro figures. The first three rows pin that
  // decision from both sides; the fourth is the over-firing it costs.
  ['a January peso figure beside a euro sign (expected miss)', '€2.500.000', []],
  ['the October fee beside a peso sign (expected miss)', '$2.500', []],
  ['a January lodging figure beside a peso sign (expected miss)', '$75', []],
  [
    'a peso figure ending in a 100 group beside a euro sign (expected over-firing)',
    '$1 100 €50',
    [
      { value: '1100', check: JANUARY_CLP_SHORT_AMOUNT },
      { value: '100', check: JANUARY_LODGING_AMOUNT },
      { value: '50', check: JANUARY_LODGING_AMOUNT },
    ],
  ],
  // A `$` glued to a letter is an identifier as far as the guard knows.
  ['a dollar sign glued to a letter, as in US$ (expected miss)', 'US$2.500.000', []],
  // The peso analogue of the doubled-space miss above.
  ['a doubled space inside a peso figure (expected miss)', '$2  500  000', []],
  // The tight window, pinned on the shape the contract itself prints: the rate
  // fires beside its sign, and the same digits a dozen characters on do not.
  ['the exchange rate beside its sign', '€1 = $1.100', [{ value: '1100', check: JANUARY_CLP_SHORT_AMOUNT }]],
  [
    'the exchange rate thirteen characters from a peso sign (expected miss)',
    `$${'·'.repeat(13)}1.100`,
    [],
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
  // January (PASANT-B003). Each row puts a marker of the relevant currency
  // within reach of numbers the January brochure is full of — dates, night
  // counts, team sizes, percentages — or of identifiers and longer figures that
  // contain a protected one; none of them quotes a protected price.
  ['the January headline', 'x="Enero, 18 al 29 · 2027"'],
  ['January dates beside a peso sign', '$ · llegada 2027-01-17, regreso 2027-01-29 o 2027-01-30'],
  ['night counts beside a peso sign', '$ por persona · 12 noches (INSPIRA), 13 noches (Mirada Profunda)'],
  ['team sizes beside the ISO code', 'Equipos de 1 a 10 personas, valores en CLP'],
  ['the payment split', '50% al reservar y el 50% restante la semana antes del inicio'],
  ['a percentage beside a euro marker', 'descuento del 50% en EUR'],
  ['an NBSP-spaced percentage beside a euro sign', `precio en €: 75${NBSP}% del total`],
  ['a stylesheet percentage beside a euro sign', 'content:"€";width:100%'],
  [
    'identifiers that contain a marker',
    'var a$=25e5,b=jQuery$1100,useClpFormat=5e6,pesoTotal=1e5,CLPX=2e6,sobrepeso=1100;',
  ],
  ['template interpolation, which is not a peso sign', 'const s=`${a}/${b}`,n=1100,m=1e5;'],
  ['a lone peso sign', 'x="$"'],
  ['the ISO code with no figure near it', 'currency:"CLP"'],
  ['the word with no figure near it', 'Valores en pesos chilenos'],
  ['a larger peso amount', 'x="$12.500.000"'],
  ['a larger peso amount containing the exchange rate', 'x="$1.100.000"'],
  ['a larger peso amount containing the rounding unit', 'x="$100.000.000"'],
  ['a peso amount one unit past a team total', 'x="$25.000.001"'],
  ['a malformed peso figure', 'x="$2.500.0000"'],
  ['a peso amount a thousand times a per-person total', 'x="$4.200.000.000"'],
  ['the retired October fee beside a peso marker', 'Precio (CLP por noche) step="1000"'],
  ['Europa beside a lodging figure', 'conocer Europa · 50 personas'],
  ['a euro amount ending in a lodging figure', 'x="€150",y="€1.050",z="€7.500",w="€50.000"'],
  ['euro cents that are a lodging figure', 'x="€0,50",y="€0.75"'],
  ['a distant euro sign before a lodging figure', `p="€"${'z'.repeat(20)}50`],
  ['a distant peso sign before the rounding unit', `p="$"${'z'.repeat(20)}1e5`],
  ['a distant peso sign before the programme fee', `p="$"${'z'.repeat(130)}25e5`],
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

/* ------------------------------------------- PASANT-B003 part 2 (narrow extension) */

/** What a `commercial-copy` text finding looks like as an occurrence. */
const COMMERCIAL_COPY = { value: null, check: 'commercial-copy' };

/**
 * A backslash, built rather than typed, so the escaped spellings below are
 * unambiguously the sequences a minifier emits (an x-escape, a four-digit
 * u-escape, a braced u-escape) and not characters an editor or a reviewer
 * could read as already decoded.
 */
const BACKSLASH = String.fromCharCode(92);

/**
 * The January commercial-copy fragments the scanner's `commercial-copy` check
 * looks for, listed here independently of the scanner's regex. Each must be a
 * verbatim substring of `lib/pasantias/cohort-commercial.ts` (asserted in the
 * test), or it guards nothing.
 */
export const JANUARY_COPY_FRAGMENTS = [
  'PROGRAMA ANUAL DE ASESORÍA FNE',
  'Habitación individual: aproximadamente',
  'tipo de cambio de referencia',
  'el valor por persona multiplicado',
  // October fragments the January module keeps live.
  'Alojamiento en Barcelona: entre',
  'por persona por noche',
  'en base a habitación doble',
  'Precios vigentes para la cohorte',
  'Pasantias-INSPIRA-Barcelona',
];

/**
 * Actual January commercial copy, in the shapes a bundle carries it: as the
 * module writes it and inside a minified object. The last row is a pinned
 * over-firing: the price-free ficha's download name shares the brand stem the
 * brochure's name is guarded by, and firing on it is the safe direction (the
 * ficha filename is not imported by any client surface either).
 */
export const JANUARY_COMMERCIAL_COPY_ROWS = [
  ['the discount condition as the module writes it', 'x="COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE"', [COMMERCIAL_COPY]],
  [
    'the discount condition inside a minified object',
    '{discountCondition:"COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE",currency:"CLP"}',
    [COMMERCIAL_COPY],
  ],
  ['the single-room lodging line', 'Habitación individual: aproximadamente', [COMMERCIAL_COPY]],
  ['the totals note', 'Los totales por persona suman el programa, con un tipo de cambio de referencia', [COMMERCIAL_COPY]],
  ['the team-table note', 'Valores por equipo: el valor por persona multiplicado por el número de integrantes.', [COMMERCIAL_COPY]],
  ['the January validity line', 'Precios vigentes para la cohorte de enero 2027.', [COMMERCIAL_COPY]],
  ['the January lodging note opening', 'Alojamiento en Barcelona: entre', [COMMERCIAL_COPY]],
  ['the January brochure download name', 'Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v1.pdf', [COMMERCIAL_COPY]],
  [
    'the price-free ficha download name (expected over-firing, safe direction)',
    'Ficha-Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v1.pdf',
    [COMMERCIAL_COPY],
  ],
];

/**
 * The same copy as a minifier emits it, accents escaped. The scanner unescapes
 * every file before searching (`unescapeLiterals`), so these fire only through
 * that step — and the test asserts the raw escaped text alone does not, which
 * is what makes the step load-bearing rather than incidental.
 */
export const JANUARY_ESCAPED_COPY_ROWS = [
  [
    'the discount condition with an x-escaped Í',
    `e="COLEGIOS CON PROGRAMA ANUAL DE ASESOR${BACKSLASH}xcdA FNE"`,
    [COMMERCIAL_COPY],
  ],
  [
    'the discount condition with a u-escaped Í',
    `e="COLEGIOS CON PROGRAMA ANUAL DE ASESOR${BACKSLASH}u00cdA FNE"`,
    [COMMERCIAL_COPY],
  ],
  [
    'the single-room line with an x-escaped ó',
    `e="Habitaci${BACKSLASH}xf3n individual: aproximadamente"`,
    [COMMERCIAL_COPY],
  ],
  [
    'the single-room line with a braced u-escaped ó',
    `e="Habitaci${BACKSLASH}u{f3}n individual: aproximadamente"`,
    [COMMERCIAL_COPY],
  ],
];

/**
 * Benign controls for the new fragments: public January copy and ordinary
 * Spanish that shares words with them. None may fire.
 */
export const JANUARY_COPY_SILENT_CONTROLS = [
  ['the public exclusion that mentions FNE coordination', 'Pasajes y alojamiento, salvo que los coordines a través de FNE'],
  ['the discount wording in lower case, as ordinary prose', 'colegios con programa anual de asesoría FNE'],
  ['an exchange rate without the commercial phrasing', 'Tipo de cambio actualizado cada hora'],
  ['the public places sentence', 'Los cupos de la cohorte de enero se confirman por orden de reserva.'],
  ['a single room in unrelated copy', 'Habitación individual con baño privado'],
  ['a per-person value in unrelated copy', 'el valor por persona se informa en la cotización'],
  ['the public routing line', '¿Primera vez? Pasantía INSPIRA. ¿Ya viajaste? Mirada Profunda.'],
];

/**
 * B003-P1-N2 (part 1 review): the percentage exclusion added for January's
 * lodging figures (`isPercentage`) applies to every amount check, October's
 * included. That is a recorded decision, not an accident: `70%` beside a euro
 * marker is a proportion, not the retired band. These rows name it, so a later
 * change to the exclusion shows up as a named October regression; the controls
 * prove the same figures still fire when they are not written as percentages.
 */
export const HISTORICAL_PERCENTAGE_ROWS = [
  ['B003-P1-N2: the October band minimum as a percentage beside a euro sign (expected miss)', '€70%', []],
  ['B003-P1-N2: the October band minimum with a spaced percent sign (expected miss)', '€70 %', []],
  ['B003-P1-N2: the October band maximum as a percentage beside the ISO code (expected miss)', 'EUR 120%', []],
  ['B003-P1-N2: the retired €560 package as a percentage (expected miss)', '€560%', []],
  ['B003-P1-N2: the October fee as a percentage (expected miss)', '€2500 %', []],
  ['B003-P1-N2: the retired €1.000 fee as a percentage (expected miss)', '€1.000%', []],
  ['B003-P1-N2 control: the band minimum without the sign', '€70 ', [BAND_MINIMUM]],
  ['B003-P1-N2 control: the October fee without the sign', '€2500 ', [{ value: '2500', check: 'priced-amount' }]],
  ['B003-P1-N2 control: the retired package without the sign', '€560 ', [RETIRED_PACKAGE]],
  ['B003-P1-N2 control: a sign two spaces away is not a percentage', '€70  %', [BAND_MINIMUM]],
];
