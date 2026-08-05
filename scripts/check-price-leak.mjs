#!/usr/bin/env node
/**
 * D-01 leak guard — no commercial cohort data in the client bundle.
 *
 * `lib/pasantias/cohort-commercial.ts` holds the Pasantías prices and payment
 * terms. Per D-02 those may appear in the brochure PDF bytes and in no other
 * repository-authored surface. `cohort-public.ts` is the module public pages
 * import; the split only means something if something checks it, so this script
 * runs after `next build` and greps everything the browser actually downloads.
 *
 * Usage (after a production build):
 *   node scripts/check-price-leak.mjs
 *
 * WHAT IS SCANNED: `.next/static/**` — the directory Next.js serves to browsers.
 * `.next/server/**` is deliberately NOT scanned: once A3 lands, the brochure
 * generator runs there and is supposed to hold prices.
 *
 * EXCLUSIONS: files whose extension is a known binary asset (images, fonts,
 * media) are skipped — they cannot carry a string leak and decoding them would
 * only produce noise. Everything else under `.next/static` is read as UTF-8,
 * including source maps when a build emits them.
 *
 * FALSE POSITIVES: bare amounts are useless as a signal — minified JS is full of
 * digits like 1000 — so numeric matching is context-scoped: an amount counts
 * only when a currency marker (`€`, `EUR`, or the words `euro`/`euros` — see
 * {@link CURRENCY}) sits nearby. A currency marker on its own is not a finding;
 * the app has unrelated euro-denominated features (consultant rates, expense
 * reports) whose bundles are full of the string `EUR`.
 *
 * WHAT A REAL LEAK LOOKS LIKE, verified by deliberately importing the commercial
 * module into `pages/index.tsx` and building — the minifier is why the obvious
 * checks are not enough:
 *   - accented copy is emitted escaped (`seg\xfan el tipo de alojamiento`), so
 *     every file is unescaped before it is searched;
 *   - round thousands are emitted in exponential form when that is shorter
 *     (`1000` → `1e3`), so amounts are matched in that form too;
 *   - object keys do NOT survive — the minifier flattens the object down to the
 *     properties that were read, so `lodgingNote` is not a usable signal while
 *     the string it pointed at is;
 *   - values the module derives at runtime never appear as literals at all, only
 *     their parts do — which is why the copy check below matters as much as the
 *     amounts. (The €1.560 total that first demonstrated this was retired with
 *     the 2026-07-31 lodging amendment; the lodging note is now derived the same
 *     way, from the per-night band. €1.560 is still hunted for — see the
 *     retired-amount rule above `PRICE_AMOUNTS`.)
 *
 * THREAT MODEL — what this guard is for, and what it deliberately is not.
 * There are exactly two realistic ways a protected figure reaches `.next/static`:
 *
 *   (a) **The commercial module reaches a client bundle.** Then the *minifier*
 *       chooses the spelling, and it always chooses the shortest one: plain
 *       digits (`2500`), or exponential when that is shorter (`1e3`, `2.5e3`).
 *       It never emits `2.500e3` or `25000e-1` — both are longer than the plain
 *       form — and it never emits a space-grouped or fullwidth figure at all.
 *   (b) **A human types or pastes a price into JSX or copy.** That is where
 *       `€2 500` comes from, in all of its spacings: design tools and word
 *       processors emit NBSP (U+00A0), narrow NBSP (U+202F) and thin space
 *       (U+2009) where a person typed a space, and a wrapped line puts a newline
 *       between the figure and its currency marker. Humans do not type fullwidth
 *       or Devanagari digits into a Spanish price.
 *
 * So the separator class below covers **every character JavaScript's `\s`
 * covers** — that is vector (b)'s whole surface — and the exponent handling
 * covers vector (a)'s spellings. This guard **deliberately does not attempt
 * arbitrary Unicode digit normalisation** (fullwidth `２５００`, Arabic-Indic
 * `٢٥٠٠`): neither vector produces them, and a normalisation pass over every
 * byte of every bundle would cost more than the risk it removes. Two known
 * over-firings are left alone for the same reason — `€2500e-1` (=250) and
 * `€2.500e0` (=2.5) both fire — because a guard erring towards a false alarm
 * errs in the safe direction, and neither shape arises from either vector.
 * Every one of these limits is pinned as an explicit expected verdict in the
 * differential corpus in `__tests__/scripts/check-price-leak.test.ts`, so it
 * stays a recorded decision rather than something a later round rediscovers.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const STATIC_DIR = join(process.cwd(), '.next', 'static');

/** Extensions that cannot carry a text leak. */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.gz',
]);

/**
 * Amounts from Appendix A-8, as **values** rather than as spellings. Keep in
 * sync with the values in `lib/pasantias/cohort-commercial.ts` — a price added
 * there without being added here is a price this guard will not look for.
 *
 * These used to be regex fragments, one alternation per shape a bundler might
 * emit, and the list grew every time the guard was proved wrong: unbounded
 * amounts (Sol r1 S1), missing currency word forms (Sol r2 B1), then decimal-dot
 * tails — `2500.00`, `2,500.00`, `EUR 2,500.00` all sailed past a tail that
 * admitted a comma and nothing else, and Sol proved the first of them survived
 * into a production bundle while this script exited 0. Three holes, three
 * alternations, one class of bug. So the matching changed shape instead: a digit
 * run near a currency marker is normalised to a canonical integer (see
 * {@link canonicalAmount}) and compared with the numbers below, so `2500`,
 * `2.500`, `2,500`, `2 500`, `2500,00`, `2500.00`, `2,500.00`, `2.500,00` and
 * the minifier's `2.5e3` all collapse to `2500`. One shape to recognise instead
 * of six, and a fourth separator convention costs nothing.
 *
 * EVERY RETIRED AMOUNT STAYS ON THIS LIST, PERMANENTLY — and the reason is the
 * opposite of the intuitive one. A live price can only reach a public surface
 * through the commercial module, which the sentinel and the copy check already
 * cover. A **retired** price cannot come from the module at all: the module no
 * longer holds it. The only route left is hand-written copy someone forgot to
 * update — which is exactly the leak worth catching, and a number FNE would have
 * to honour or retract if a reader found it. Removing a pattern because "that
 * value is gone from the code" therefore removes the guard precisely when it
 * starts mattering. That mistake was made once already: €1.560/€560 were dropped
 * here when the 2026-07-31 lodging amendment deleted them from the module, and
 * Sol's round-1 review proved a build publishing €1.560 passed. Only an amount
 * whose *shape* stops being distinctive may ever leave this list.
 *
 * Not here: the €810 city extension (removed 2026-08-02) — its shape is not
 * distinctive enough for the wide window and it is covered on the module side by
 * `__tests__/lib/pasantias-cohort.test.ts`'s PROTECTED_AMOUNTS. The €70–120
 * per-night band and the retired €560 package are protected data too, but their
 * figures are two and three digits long, so they get their own tight-window
 * checks below rather than this list's wide currency window.
 */
const PRICE_AMOUNTS = [
  '2500', // the live programme fee
  '1000', // RETIRED 2026-08-02
  '1560', // RETIRED 2026-07-31: the lodging-inclusive total
];

/**
 * The Appendix A-8 lodging band (`COHORT_LODGING_PER_NIGHT_EUR`). A leak that
 * reads `.min` or `.max` alone is tree-shaken free of both the sentinel and the
 * lodging prose, so these figures have to be looked for directly — but `70` and
 * `120` are ordinary numbers that occur constantly in minified output, so they
 * only count inside a much tighter currency window than the amounts above.
 */
const BAND_AMOUNTS = ['70', '120'];

/**
 * RETIRED 2026-07-31: the €560 lodging package, the other half of the €1.560
 * total above. It falls under the same permanent rule as the amounts in
 * `PRICE_AMOUNTS`, but three digits are far too common to look for inside that
 * list's 120-character window, so it is checked the way the band's figures are:
 * with a currency marker right beside it.
 */
const RETIRED_SHORT_AMOUNTS = ['560'];

/**
 * What counts as "a price is being quoted here".
 *
 * Until Sol's round-2 review this was `(?:€|EUR)` — the glyph and the ISO code,
 * nothing else. Sol injected `<p>Programa: 2500 euros por persona</p>`, built,
 * and the scanner reported clean: the amount matched (`2[.,\s]?500` has always
 * had an optional separator, so the bare `2500` was never the gap) but the word
 * beside it was not a currency marker as far as this file was concerned. The
 * most ordinary way a Spanish page states a price was invisible to the guard.
 *
 * So the word forms are recognised too, case-insensitively: `eur`, `euro`,
 * `euros`. Both edges are bounded to non-letters, which is the whole reason
 * this is spelled out rather than written with the `i` flag — **`Europa` must
 * not match**, and it is live copy on `/pasantias` ("recorrer Barcelona o
 * conocer Europa"). `Eur|Euro` both fail the trailing boundary inside `Europa`,
 * so the word is silent while `euro`, `euros` and `EUROS` all fire.
 */
const CURRENCY = /€|(?<![A-Za-z])[Ee][Uu][Rr](?:[Oo][Ss]?)?(?![A-Za-z])/g;
/**
 * How far apart the amount and its currency marker may sit, in characters.
 * Minified output has no line breaks and packs a whole object into one run of
 * characters, so this has to be wide enough to span
 * `currency:"EUR",items:[{id:…,label:…,amount:…}` — measured at roughly 60
 * characters in the leak demo. Verified not to fire on a clean build of this
 * repo, which does ship unrelated euro-denominated code.
 */
const GAP = 120;
/**
 * The band's window, sized to what a rendered figure actually looks like after
 * minification — `"€70"`, `["€",70]`, `"entre €".concat(70,` (nine characters,
 * measured on the r3 leak demo) — and no wider, because at `GAP`'s width a bare
 * `70` would find a euro sign somewhere in most unrelated chunks.
 */
const BAND_GAP = 12;

/**
 * One written number, matched **maximally**: every digit, separator and
 * exponent that belongs to it, and nothing that does not.
 *
 * Maximality is the whole false-positive control, and it replaces the four
 * lookarounds this file used to carry (`(?<!\d)(?<![\d][.,])…(?!\d)(?![.,]\d)`).
 * `€12.500` tokenises as the single number `12.500`, so there is no `500` left
 * over to compare against a protected amount; likewise `€120.000` yields
 * `120.000` and not `120`, and `€1.200,70` yields `1.200,70` and not `70`. Those
 * were exactly the crying-wolf cases Sol's round-1 S1 raised, and they now fall
 * out of tokenisation instead of being fenced off one lookaround at a time.
 *
 * The separator class is `.`, `,` and `\s` — every whitespace character, which
 * is what this guard used before round r4 narrowed it by hand to `[\u00a0 ]`.
 * That narrowing silently dropped **fifteen** spellings the guard had been
 * catching — every whitespace character except the two it kept: tab, newline,
 * carriage return, vertical tab, form feed, U+1680, U+2000–U+200A (thin space
 * among them), U+2028, U+2029, U+202F narrow NBSP, U+205F, U+3000 and U+FEFF.
 * Threat-model vector (b) at the top of this file is exactly where those come
 * from — a design tool emits a narrow NBSP where a person typed a space — so the
 * class is written as `\s` rather than as an enumeration, because an enumeration
 * is the thing that silently falls behind.
 *
 * r4's stated reason for excluding `\s` — that swallowing a newline would let an
 * unrelated neighbour hide a protected figure inside a longer token — names a
 * real hazard, but excluding newline never addressed it: the same masking
 * already happened across an ordinary space, which r4 kept (`€2.500 000` fired
 * before r4 and was a miss after it). {@link candidateReadings} is what actually
 * addresses it, for every whitespace separator rather than for the two r4
 * happened to leave out.
 *
 * The exponent is capped at two digits: the minifier writes `1e3` for 1000 and
 * `2.5e3` for 2500, nothing near a protected amount needs more, and an
 * uncapped exponent would let `1e999999` ask for a gigabyte of zero padding.
 */
const NUMBER_TOKEN = /\d(?:[\d.,\s]*\d)?(?:[eE]\+?\d{1,2})?/g;

const PLAIN = /^\d+$/;
const PLAIN_WITH_DECIMALS = /^(\d+)[.,](\d{1,2})$/;
const GROUPED = /^\d{1,3}(?:([.,\s])\d{3})(?:\1\d{3})*$/;
const GROUPED_WITH_DECIMALS = /^\d{1,3}(?:([.,\s])\d{3})(?:\1\d{3})*([.,])(\d{1,2})$/;
/**
 * A mantissa read the way JavaScript reads one: `.` is a decimal point, and the
 * fractional run carries no two-digit cap. Only consulted when the token has an
 * exponent — see {@link canonicalAmounts}.
 */
const LITERAL_MANTISSA = /^(\d+)[.,](\d+)$/;

/**
 * Split a written number into its integer digits and its decimal tail, or
 * `null` when it is not a well-formed amount under either convention.
 *
 * Well-formed means one of four grammars: plain (`2500`), plain with up to two
 * decimals (`2500.00`, `2500,00`), grouped in threes by a single consistent
 * separator (`2.500`, `1,234,567`, `2 500`), or grouped plus a decimal tail
 * whose separator differs from the grouping one (`2.500,00`, `2,500.00`).
 *
 * Rejecting everything else is the second half of the false-positive control:
 * `2.5000` is neither a grouping (the run after the dot is four digits) nor a
 * decimal (more than two), so it is not an amount and never reaches comparison.
 */
function splitNumber(text) {
  if (PLAIN.test(text)) return { integer: text, decimals: '' };

  let parsed = PLAIN_WITH_DECIMALS.exec(text);
  if (parsed) return { integer: parsed[1], decimals: parsed[2] };

  parsed = GROUPED.exec(text);
  if (parsed) return { integer: text.split(parsed[1]).join(''), decimals: '' };

  parsed = GROUPED_WITH_DECIMALS.exec(text);
  if (parsed && parsed[2] !== parsed[1]) {
    const grouped = text.slice(0, text.length - parsed[3].length - 1);
    return { integer: grouped.split(parsed[1]).join(''), decimals: parsed[3] };
  }
  return null;
}

/** `0250` → `250`, `0` → `0`. Never empties the string. */
function stripLeadingZeroes(digits) {
  return digits.replace(/^0+(?=\d)/, '');
}

/**
 * Move the decimal point right by `exponent` places, padding with zeroes.
 *
 * The integer part comes back without leading zeroes, because shifting is what
 * produces them: `0.25e4` is 2500 written with a mantissa below one, and it
 * shifts to `02500`, which then failed to match the protected `2500` (Sol
 * round-4 S1). Stripping belongs here rather than in {@link canonicalAmounts}
 * so it applies **only** to tokens carrying an exponent — a bare `€070` is not
 * a number JavaScript would write and stays silent, exactly as the `(?<!\d)`
 * boundary this file used to carry left it.
 */
function shiftDecimalPoint({ integer, decimals }, exponent) {
  const digits = integer + decimals;
  const point = integer.length + exponent;
  if (point >= digits.length) {
    return {
      integer: stripLeadingZeroes(digits + '0'.repeat(point - digits.length)),
      decimals: '',
    };
  }
  return { integer: stripLeadingZeroes(digits.slice(0, point)), decimals: digits.slice(point) };
}

/**
 * Every integer value one {@link NUMBER_TOKEN} can denote — empty when it denotes
 * none. This is what lets the lists above hold values instead of spellings:
 * `2500`, `2.500`, `2,500`, `2 500`, `2500,00`, `2500.00`, `2,500.00`,
 * `2.500,00`, `2.5e3` and `2.500e3` all yield `'2500'`.
 *
 * A list rather than a single value because **a mantissa with an exponent is
 * ambiguous and both readings must be checked**. In `2.500e3` the `.` is a
 * decimal point, the way JavaScript reads a numeric literal: 2.5 × 10³ = 2500,
 * the protected fee. In `2.500e0` the same `.` is far more likely a thousands
 * separator, and reading it that way gives 2500 too. Round r4 committed to the
 * grouped reading alone and lost `€2.500e3` (2.500 × 10³ = 2 500 000, no match);
 * committing to the decimal reading alone would lose `€2.500e0`. A guard has no
 * reason to choose: it checks both and fires if either is protected, which is
 * the conservative direction.
 *
 * Cents are dropped rather than compared, matching the `(?:,\d{2})?` tail this
 * replaces: `€2.500,00` and `€2.500,50` are both the protected fee, quoted with
 * cents. Leading zeroes survive in a token with no exponent, so `€070` stays
 * silent exactly as the old `(?<!\d)` boundary left it; a token **with** an
 * exponent is read as a shifted number and comes back normalised, so `€0.25e4`
 * and `€0.1e4` denote 2500 and 1000 rather than `02500` and `01000` — see
 * {@link shiftDecimalPoint}.
 */
function canonicalAmounts(token) {
  const exponentAt = token.search(/[eE]/);
  const mantissa = exponentAt === -1 ? token : token.slice(0, exponentAt);
  const exponent = exponentAt === -1 ? 0 : Number(token.slice(exponentAt + 1).replace('+', ''));

  const readings = [splitNumber(mantissa)];
  if (exponentAt !== -1) {
    const literal = LITERAL_MANTISSA.exec(mantissa);
    if (literal) readings.push({ integer: literal[1], decimals: literal[2] });
  }

  const values = [];
  for (const parsed of readings) {
    if (parsed === null) continue;
    const shifted = exponentAt === -1 ? parsed : shiftDecimalPoint(parsed, exponent);
    if (shifted.decimals.length > 2) continue;
    if (!values.includes(shifted.integer)) values.push(shifted.integer);
  }
  return values;
}

/**
 * The whitespace-free pieces of a token, as offsets into it.
 *
 * The split is on whitespace only. `.` and `,` groups stay intact, which is what
 * keeps `€1.200,70` reading as 1200 rather than decomposing into an unrelated
 * `70` beside a euro sign — the crying-wolf case Sol's round-1 S1 raised.
 */
function whitespacePieces(text) {
  const pieces = [];
  const piece = /\S+/g;
  let match;
  while ((match = piece.exec(text)) !== null) {
    pieces.push({ start: match.index, end: match.index + match[0].length });
  }
  return pieces;
}

/**
 * How many whitespace-separated pieces one candidate reading may span.
 *
 * Every protected figure is at most four digits, so its whitespace-grouped
 * spelling is at most two pieces (`2 500`); four is headroom, and a cap is what
 * keeps this linear in the size of a bundle rather than quadratic. Nothing is
 * lost by capping: a reading that spans more pieces than this denotes at least
 * five digits and cannot be a protected amount, so it can neither be a finding
 * nor suppress one (see {@link candidateReadings}).
 */
const MAX_GROUPED_PIECES = 4;

/**
 * Every reading of a token that denotes a protected amount, keeping only the
 * **maximal** ones.
 *
 * Maximal tokenisation is the false-positive control, but it has one cost: two
 * unrelated numbers with a separator-class character between them tokenise as
 * one, and the fused reading can denote something harmless while a protected
 * figure sits inside it. `€70\n120` is the case — the band's two figures, one
 * per line, fuse into the innocuous `70120` — and `€2.500 000` and `€2500\n7`
 * are the same shape.
 *
 * Round r5 answered that by falling back to the *whole* whitespace split when
 * the fused reading was harmless, which is all-or-nothing: for `€2 500\n7` it
 * checked `2 500 7` (harmless) and then `2`, `500`, `7` (harmless), and never
 * checked `2 500` — the grouped reading a human actually sees. Four shapes the
 * guard had been catching regressed that way (Sol round 4), because a protected
 * amount can sit in a whitespace-grouped **subsequence** rather than in the
 * whole token or in a single piece.
 *
 * So every contiguous run of pieces is a candidate, not just the two extremes.
 * Each is sliced out of the original text, so the separators it contains are the
 * ones that were written — which is why a doubled space still reads as a gap
 * rather than as a grouping (`€2  500` stays an accepted miss: no numeric
 * convention doubles a thousands separator).
 *
 * Only maximal readings are kept: a protected reading contained in a longer
 * protected reading is dropped, so `€1 560` reports the fee once instead of
 * reporting the retired `560` inside it as a second finding. That is the r5
 * "the fused reading *is* the finding" rule, generalised — the whole token is
 * just the longest candidate. Dropping the inner one never loses a finding: a
 * contained reading is never closer to a currency marker than its container,
 * and never carries a wider window, so whenever the inner one would fire the
 * outer one already has.
 */
function candidateReadings(text, offset) {
  const pieces = whitespacePieces(text);
  const readings = [];

  for (let first = 0; first < pieces.length; first += 1) {
    const last = Math.min(pieces.length, first + MAX_GROUPED_PIECES);
    for (let piece = first; piece < last; piece += 1) {
      const start = pieces[first].start;
      const end = pieces[piece].end;
      const amounts = canonicalAmounts(text.slice(start, end)).filter((value) =>
        CHECK_BY_AMOUNT.has(value)
      );
      if (amounts.length > 0) readings.push({ first, last: piece, start, end, amounts });
    }
  }

  return readings
    .filter(
      (reading) =>
        !readings.some(
          (other) =>
            other.first <= reading.first &&
            other.last >= reading.last &&
            (other.first < reading.first || other.last > reading.last)
        )
    )
    .map((reading) => ({
      amounts: reading.amounts,
      start: offset + reading.start,
      end: offset + reading.end,
    }));
}

/** Checks whose whole definition is a regex over the file's text. */
const TEXT_CHECKS = [
  {
    id: 'sentinel',
    description: 'COMMERCIAL_SENTINEL from cohort-commercial.ts',
    pattern: /__INSPIRA_COMMERCIAL__/g,
  },
  {
    // Copy is what actually survives minification (keys do not), so a structural
    // leak carrying no currency symbol is still visible through its strings.
    // Every fragment must stay a verbatim substring of a live `COHORT_*` string,
    // or it guards nothing: the optional city extension's label fragment was
    // dropped on 2026-08-02 with the extension itself, and `en base a habitación
    // doble` added with the same round's base-doble precision to the lodging note.
    id: 'commercial-copy',
    description: 'a string that only exists in cohort-commercial.ts',
    pattern:
      /Alojamiento en Barcelona: entre|por persona por noche|en base a habitación doble|según el tipo de alojamiento|Precios vigentes para la cohorte|al momento del acuerdo|Pasantias-INSPIRA-Barcelona/g,
  },
];

/** Checks that pair a normalised amount with a nearby currency marker. */
const AMOUNT_CHECKS = [
  {
    id: 'priced-amount',
    description:
      'an Appendix A-8 programme amount, live or retired, near a currency marker',
    amounts: PRICE_AMOUNTS,
    gap: GAP,
  },
  {
    id: 'priced-band-amount',
    description: 'an Appendix A-8 lodging-band amount beside a currency marker',
    amounts: BAND_AMOUNTS,
    gap: BAND_GAP,
  },
  {
    id: 'retired-short-amount',
    description:
      'the retired Appendix A-8 lodging package (€560) beside a currency marker',
    amounts: RETIRED_SHORT_AMOUNTS,
    gap: BAND_GAP,
  },
];

/** Canonical integer → the one check that guards it. The three lists are disjoint. */
const CHECK_BY_AMOUNT = new Map(
  AMOUNT_CHECKS.flatMap((check) => check.amounts.map((amount) => [amount, check]))
);

/** Every currency marker in `text`, in ascending order and never overlapping. */
function currencyMarkers(text) {
  const markers = [];
  CURRENCY.lastIndex = 0;
  let match;
  while ((match = CURRENCY.exec(text)) !== null) {
    markers.push({ start: match.index, end: match.index + match[0].length });
  }
  return markers;
}

/**
 * The marker closest to `[start, end)`, and how many characters sit between
 * them. Markers and number tokens are built from disjoint character classes, so
 * they never overlap and the distance is never negative.
 */
function nearestMarker(markers, start, end) {
  let low = 0;
  let high = markers.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (markers[middle].start >= end) high = middle;
    else low = middle + 1;
  }

  let nearest = null;
  let distance = Infinity;
  if (low < markers.length && markers[low].start - end < distance) {
    nearest = markers[low];
    distance = markers[low].start - end;
  }
  if (low > 0 && start - markers[low - 1].end < distance) {
    nearest = markers[low - 1];
    distance = start - markers[low - 1].end;
  }
  return { nearest, distance };
}

/**
 * Every protected amount in `text` that has a currency marker inside its
 * check's window. A file with no currency marker at all cannot contain one, and
 * most bundle chunks are that file — so the tokeniser never runs on them.
 */
function scanAmounts(text) {
  const markers = currencyMarkers(text);
  if (markers.length === 0) return [];

  const found = [];
  NUMBER_TOKEN.lastIndex = 0;
  let token;
  while ((token = NUMBER_TOKEN.exec(text)) !== null) {
    // Whitespace inside a token may be a grouping separator or a gap, and the
    // protected figure may be the whole token, one piece of it, or a grouped
    // run in the middle. Every reading a reader would see is a candidate; see
    // {@link candidateReadings}.
    for (const reading of candidateReadings(token[0], token.index)) {
      for (const amount of reading.amounts) {
        const check = CHECK_BY_AMOUNT.get(amount);
        const { nearest, distance } = nearestMarker(markers, reading.start, reading.end);
        if (distance > check.gap) continue;

        const from = Math.min(reading.start, nearest.start);
        const to = Math.max(reading.end, nearest.end);
        found.push({ check, index: from, match: text.slice(from, to) });
      }
    }
  }
  return found;
}

/**
 * Minified bundles escape non-ASCII (`Extensi\xf3n`), which would hide every
 * accented Spanish string from a literal search. Undo that before scanning.
 */
export function unescapeLiterals(text) {
  return text
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function listFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(path));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

function isScannable(path) {
  const dot = path.lastIndexOf('.');
  const extension = dot === -1 ? '' : path.slice(dot).toLowerCase();
  return !BINARY_EXTENSIONS.has(extension);
}

/**
 * Every check's matches in one already-unescaped blob of text. `main` scans
 * files through this, and `__tests__/scripts/check-price-leak.test.ts` scans
 * synthetic leak shapes through it — so what the regression test proves is what
 * the build actually runs, not a copy of it.
 */
export function scanText(text) {
  const found = [];
  for (const check of TEXT_CHECKS) {
    check.pattern.lastIndex = 0;
    let match;
    while ((match = check.pattern.exec(text)) !== null) {
      found.push({ check, index: match.index, match: match[0] });
    }
  }
  found.push(...scanAmounts(text));
  return found;
}

/** Bundles are one enormous line, so report an offset and its neighbourhood. */
function snippetAt(text, index, length) {
  const from = Math.max(0, index - 40);
  const to = Math.min(text.length, index + length + 40);
  return text.slice(from, to).replace(/\s+/g, ' ');
}

function main() {
  let stats;
  try {
    stats = statSync(STATIC_DIR);
  } catch {
    stats = null;
  }
  if (!stats || !stats.isDirectory()) {
    console.error(
      `check-price-leak: ${relative(process.cwd(), STATIC_DIR)} does not exist — run \`npm run build\` first.`
    );
    process.exit(1);
  }

  const files = listFiles(STATIC_DIR).filter(isScannable);
  if (files.length === 0) {
    console.error(
      'check-price-leak: found no scannable files under .next/static — the build output looks wrong.'
    );
    process.exit(1);
  }

  const findings = [];
  for (const file of files) {
    const text = unescapeLiterals(readFileSync(file, 'utf8'));
    for (const finding of scanText(text)) {
      findings.push({
        check: finding.check,
        file: relative(process.cwd(), file),
        index: finding.index,
        snippet: snippetAt(text, finding.index, finding.match.length),
      });
    }
  }

  if (findings.length > 0) {
    console.error(
      `check-price-leak: FAIL — commercial cohort data reached the client bundle (${findings.length} match(es)).\n`
    );
    for (const finding of findings) {
      console.error(`  [${finding.check.id}] ${finding.file} @ ${finding.index}`);
      console.error(`      ${finding.check.description}`);
      console.error(`      …${finding.snippet}…\n`);
    }
    console.error(
      'Only the server-side brochure generator may import lib/pasantias/cohort-commercial.ts.\n' +
        'Public surfaces import lib/pasantias/cohort-public.ts, which has no monetary fields.'
    );
    process.exit(1);
  }

  console.log(
    `check-price-leak: OK — scanned ${files.length} file(s) under .next/static, no commercial data found.`
  );
}

// Only when run as a CLI: importing this module (the regression test does) must
// not scan the filesystem or exit the process.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
