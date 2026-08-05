// @vitest-environment node
/**
 * Regression tests for the D-01 post-build leak guard.
 *
 * `scripts/check-price-leak.mjs` only earns its place in CI if it fails on the
 * leaks it claims to catch. The build-level demonstration lives in
 * `docs/plan/evidence/a1/leak-guard.md`; this file pins the part that has to
 * keep holding — the isolated lodging-band literals, which a consumer importing
 * `COHORT_LODGING_PER_NIGHT_EUR.min` alone leaks with neither the sentinel nor
 * the lodging prose attached — and the false positives the band's figures would
 * otherwise cause.
 *
 * These scan through the script's own exported `scanText`, so what passes here
 * is what `npm run build && node scripts/check-price-leak.mjs` runs.
 */
import { describe, it, expect } from 'vitest';
import { scanText, unescapeLiterals } from '../../scripts/check-price-leak.mjs';
import {
  generateCorpus,
  PINNED_LIMITS,
  SILENT_CONTROLS,
  SOL_ROUND_4_ROWS,
} from './price-leak-corpus.mjs';

/** Check ids that fired on a blob of text. */
function checksFiring(text: string): string[] {
  return [...new Set(scanText(text).map((finding) => finding.check.id))].sort();
}

describe('leak guard — isolated lodging-band literals (Appendix A-8)', () => {
  // The shapes a bundler actually emits for a rendered band figure. Each one is
  // the whole leak: no sentinel, no lodging prose, nothing else to fall back on.
  const isolatedLeaks: ReadonlyArray<readonly [string, string]> = [
    ['a bare minimum', 'window.price="€70"'],
    ['a bare maximum', 'window.price="€120"'],
    ['a JSX array split', 'e=[(0,r.jsx)("span",{children:["€",70]})]'],
    ['a template concat', '"desde €".concat(120," la noche")'],
    ['an EUR-labelled field', 'x={currency:"EUR",amount:120}'],
    ['an escaped euro sign', unescapeLiterals('window.p="\\u20ac70"')],
  ];

  for (const [description, leak] of isolatedLeaks) {
    it(`fails on ${description}`, () => {
      expect(checksFiring(leak)).toContain('priced-band-amount');
    });
  }

  it('catches them without the sentinel or the lodging prose', () => {
    // This is the finding Codex raised: the guard used to rest on `sentinel` and
    // `commercial-copy`, both of which tree-shake away when a consumer reads one
    // number. Assert those two are silent so the band check is doing the work.
    for (const [, leak] of isolatedLeaks) {
      expect(checksFiring(leak)).toEqual(['priced-band-amount']);
    }
  });

  it('still fails on the full band note and on the programme fee', () => {
    // Verbatim `COHORT_LODGING_NOTE`, including the 2026-08-02 base-doble
    // clause — the fragments the `commercial-copy` check looks for are cut from
    // this exact string, so it is pinned in both places.
    const note =
      'Alojamiento en Barcelona: entre €70 y €120 por persona por noche, en base a habitación doble — el monto es por persona, no por habitación — según el tipo de alojamiento.';
    expect(checksFiring(note)).toEqual(['commercial-copy', 'priced-band-amount']);
    expect(checksFiring('x="€2.500"')).toEqual(['priced-amount']);
    expect(checksFiring('x="__INSPIRA_COMMERCIAL__"')).toEqual(['sentinel']);
  });
});

describe('leak guard — the live programme fee, in every shape a bundler emits', () => {
  // €2.500 replaced €1.000 on 2026-08-02 (owner). The guard is only repriced
  // when it catches the new figure in the forms minified output actually uses,
  // not just the one a human would type.
  const liveShapes: ReadonlyArray<readonly [string, string]> = [
    ['a grouped literal', 'x="€2.500"'],
    ['a comma-grouped literal', 'x="€2,500"'],
    ['a bare integer', 'x={currency:"EUR",amount:2500}'],
    ['an exponential spelling', 'e=[(0,r.jsx)("span",{children:["€",2.5e3]})]'],
    ['a template concat', '"Programa: €".concat(2500)'],
    ['an escaped euro sign', unescapeLiterals('window.p="\\u20ac2.500"')],
  ];

  for (const [description, leak] of liveShapes) {
    it(`fails on ${description}`, () => {
      expect(checksFiring(leak)).toContain('priced-amount');
    });
  }
});

describe('leak guard — retired amounts stay guarded (2026-08-02 repricing)', () => {
  // A price FNE no longer sells at is worse on a public page than the current
  // one: it is a number the foundation would have to honour or retract. The
  // repricing round therefore *added* €1.000 to the guard rather than swapping
  // it out, and these cases are what stop a later cleanup from dropping it.
  const retiredShapes: ReadonlyArray<readonly [string, string]> = [
    ['the retired grouped literal', 'x="€1.000"'],
    ['the retired bare integer', 'x={currency:"EUR",amount:1000}'],
    ['the retired exponential spelling', '"desde €".concat(1e3)'],
  ];

  for (const [description, leak] of retiredShapes) {
    it(`fails on ${description}`, () => {
      expect(checksFiring(leak)).toContain('priced-amount');
    });
  }
});

describe('leak guard — the 2026-07-31 retired amounts (Sol r1 B2)', () => {
  // €1.560 and €560 were dropped from the scanner when the lodging amendment
  // deleted them from the module — before the retired-amount rule existed. Sol
  // proved a build publishing €1.560 passed the guard. These are the isolated
  // shapes that must never stop firing again; the build-level proof is
  // `docs/plan/evidence/a1/leak-guard.md` §8.
  const retiredTotalShapes: ReadonlyArray<readonly [string, string]> = [
    ['the retired total as a grouped literal', 'x="€1.560"'],
    ['the retired total as a bare integer', 'x={currency:"EUR",amount:1560}'],
    ['the retired total in a template concat', '"Total: €".concat(1560)'],
    ['the retired total with an escaped euro sign', unescapeLiterals('window.p="\\u20ac1.560"')],
  ];

  for (const [description, leak] of retiredTotalShapes) {
    it(`fails on ${description}`, () => {
      expect(checksFiring(leak)).toEqual(['priced-amount']);
    });
  }

  const retiredPackageShapes: ReadonlyArray<readonly [string, string]> = [
    ['the retired lodging package as a literal', 'x="€560"'],
    ['the retired lodging package as a bare integer', 'x={currency:"EUR",amount:560}'],
    ['the retired lodging package in a JSX array split', 'e=[(0,r.jsx)("span",{children:["€",560]})]'],
  ];

  for (const [description, leak] of retiredPackageShapes) {
    it(`fails on ${description}`, () => {
      // Its own check: three digits are far too common for the wide 120-char
      // window the four-digit amounts use, so €560 gets the band's tight one.
      expect(checksFiring(leak)).toEqual(['retired-short-amount']);
    });
  }

  it('reports €1.560 once, not twice — the 560 inside it is not a second finding', () => {
    // `retired-short-amount` is bounded, so the `560` of `1.560` is part of a
    // grouped number rather than a whole amount. If that ever regresses, every
    // real €1.560 leak starts reporting two findings for one string.
    expect(checksFiring('x="€1.560"')).toEqual(['priced-amount']);
  });
});

describe('leak guard — programme amounts match as whole amounts only (Sol r1 S1)', () => {
  // Unbounded, `2[.,\s]?500` fired on any `€12.500` or `€2.5000` in the tree.
  // Nothing collided today, but a guard that cries wolf gets switched off.
  const notTheAmount: ReadonlyArray<readonly [string, string]> = [
    ['an unrelated larger amount', 'x="€12.500"'],
    ['a malformed trailing digit', 'x="€2.5000"'],
    ['another unrelated larger amount', 'x="€22.500"'],
    ['a larger amount with cents', 'x="€12.500,00"'],
    ['the retired amount inside a larger one', 'x="€21.000"'],
  ];

  for (const [description, text] of notTheAmount) {
    it(`stays silent on ${description}`, () => {
      expect(checksFiring(text)).toEqual([]);
    });
  }

  const stillTheAmount: ReadonlyArray<readonly [string, string]> = [
    ['the live fee itself', 'x="€2.500"'],
    ['the live fee written with cents', 'x="€2.500,00"'],
    ['the retired fee written with cents', 'x="€1.000,00"'],
  ];

  for (const [description, text] of stillTheAmount) {
    it(`still fails on ${description}`, () => {
      expect(checksFiring(text)).toEqual(['priced-amount']);
    });
  }
});

/**
 * Sol's round-2 B1. The guard recognised `€` and `EUR` and nothing else, so
 * `<p>Programa: 2500 euros por persona</p>` shipped, built, and reported clean —
 * the most ordinary way a Spanish page quotes a price was invisible to it.
 *
 * These are the mutants themselves, run through the scanner's own matcher rather
 * than through six production builds: each string must make the guard fire, and
 * the clean counterparts must leave it silent. `main()` turns any finding into
 * `process.exit(1)`, so "the matcher fires" and "the scanner exits non-zero" are
 * the same statement.
 */
describe('leak guard — word-form currencies (Sol r2 B1)', () => {
  const mustFail: ReadonlyArray<readonly [string, string]> = [
    ['Sol’s exact injection', '<p>Programa: 2500 euros por persona</p>'],
    ['the same amount grouped', '<p>Programa: 2.500 euros por persona</p>'],
    ['shouted', 'PROGRAMA: 2500 EUROS POR PERSONA'],
    ['title case', 'Programa: 2500 Euros por persona'],
    ['the singular word', 'x="2500 euro"'],
    ['the bare ISO code after the figure', 'x="2500 EUR"'],
    ['the glyph, grouped', '<p>Programa: €2.500 por persona</p>'],
    ['the glyph, bare', '<p>Programa: €2500 por persona</p>'],
    ['the retired programme fee in words', 'x="1000 euros"'],
    ['the retired total in words', 'x="1560 euros"'],
    ['the retired lodging package in words', 'x="560 euros"'],
    ['the lodging band, both figures in words', 'entre 70 euros y 120 euros por noche'],
    ['the lodging band minimum in words', 'desde 70 euros la noche'],
    ['a commercial phrase with no figure at all', 'x="por persona por noche"'],
  ];

  for (const [description, leak] of mustFail) {
    it(`fires on ${description}`, () => {
      expect(checksFiring(leak).length, leak).toBeGreaterThan(0);
    });
  }

  const mustStaySilent: ReadonlyArray<readonly [string, string]> = [
    // Live `/pasantias` copy. `Europa` contains `Eur`, and a case-insensitive
    // alternation with no trailing boundary would fire on every free-day block.
    ['the free-weekend copy', 'recorrer Barcelona o conocer Europa antes de la segunda semana'],
    ['Europa beside a band figure', 'conocer Europa · 70 personas'],
    ['a euro-word inside a longer word', 'x="eurocentrismo 2500"'],
    ['the ISO code with no protected amount near it', 'th="Tarifa EUR/hora"'],
    ['an unrelated euro rate', '"Tarifa EUR",amount:45'],
  ];

  for (const [description, text] of mustStaySilent) {
    it(`stays silent on ${description}`, () => {
      expect(checksFiring(text), text).toEqual([]);
    });
  }
});

/**
 * Sol's round-2 B1 residue. The amount patterns admitted a two-digit tail after
 * a comma and nothing else, so `Programa: 2500.00 euros por persona` shipped,
 * built, and reported clean — and Sol proved it survived into
 * `.next/static/chunks/pages/pasantias-*.js` while the script exited 0.
 *
 * The fix was not a fourth alternation. A digit run is now tokenised maximally
 * and normalised to a canonical integer, so every convention for writing the
 * same amount collapses to the same value and the trailing separator stops
 * being something the guard has to enumerate. These cases are that promise:
 * each block below is the *same amount* in every convention, and the guard must
 * not be able to tell them apart.
 */
describe('leak guard — decimal separators do not hide an amount (Sol r2 B1 residue)', () => {
  const sameProgrammeFee: ReadonlyArray<readonly [string, string]> = [
    ['a decimal-dot tail', 'Programa: 2500.00 euros por persona'],
    ['comma grouping with a decimal-dot tail', '2,500.00 euros'],
    ['the ISO code before a dot-decimal amount', 'EUR 2,500.00'],
    ['the word before a dot-decimal amount', 'euros 2500.00'],
    ['dot grouping with a decimal-comma tail', '2.500,00 euros'],
    ['a decimal-comma tail on a bare integer', '2500,00 euros'],
    ['the glyph with a dot-decimal tail', 'x="€2,500.00"'],
    ['a space-grouped amount', 'x="€2 500"'],
  ];

  for (const [description, leak] of sameProgrammeFee) {
    it(`fires on ${description}`, () => {
      expect(checksFiring(leak), leak).toEqual(['priced-amount']);
    });
  }

  const sameShortAmounts: ReadonlyArray<readonly [string, string, string]> = [
    ['the band minimum with cents', 'x="€70.00"', 'priced-band-amount'],
    ['the band maximum with cents', 'x="€120,00"', 'priced-band-amount'],
    ['the retired total with a dot-decimal tail', 'x="1560.00 euros"', 'priced-amount'],
    ['the retired package with a dot-decimal tail', 'x="560.00 euros"', 'retired-short-amount'],
  ];

  for (const [description, leak, id] of sameShortAmounts) {
    it(`fires on ${description}`, () => {
      expect(checksFiring(leak), leak).toEqual([id]);
    });
  }

  // The reason the tail was comma-only in the first place: it was the control
  // that kept the guard from crying wolf on ordinary euro amounts. Widening it
  // by hand would have brought those back, so every one of them is pinned here.
  const stillSilent: ReadonlyArray<readonly [string, string]> = [
    ['an unrelated larger amount', 'x="€12.500"'],
    ['a malformed trailing digit', 'x="€2.5000"'],
    ['a grouped euro thousand', 'x="€120.000"'],
    ['a larger amount with cents', 'x="€12.500,00"'],
    ['a larger amount with a dot-decimal tail', 'x="€12,500.00"'],
    ['a euro decimal whose cents are a band figure', 'total="€1.200,70 por hora"'],
    ['the same, written the other way round', 'total="€1,200.70 por hora"'],
    // Verbatim from `lib/currency-service.ts` and `lib/expenseReportExport.ts` —
    // live, unrelated, euro-denominated repo code, one of which writes an amount
    // in exactly the dot-grouped/comma-decimal shape this round taught the
    // guard to read. Neither may become noise.
    ['the live fallback exchange rate', 'EUR: 1050, // 1 EUR ≈ 1050 CLP (approximate)'],
    ['the live formatter example', 'Locale-formatted original amount, e.g. "1.234,50" for EUR'],
  ];

  for (const [description, text] of stillSilent) {
    it(`stays silent on ${description}`, () => {
      expect(checksFiring(text), text).toEqual([]);
    });
  }
});

/**
 * The differential corpus (A6a r6 — generated, not listed).
 *
 * Three rounds running, a hand-picked list of leak shapes passed while real
 * coverage was lost. r4 narrowed the separator class and dropped fifteen
 * spellings. r5 rebuilt the corpus by hand — this block, in its previous form —
 * and dropped four more, because it covered whitespace-grouped amounts *alone*
 * and bare amounts *followed by a stray digit*, and never their composition.
 * Both times the round reported zero coverage lost, because the list tested was
 * the list written, and the list written was the author's model of the problem.
 *
 * A list cannot cover a product. So the cases below are **generated** by
 * crossing AMOUNT x SPELLING x CONTEXT in `./price-leak-corpus.mjs`, and each
 * one's expected verdict is derived from the amount that was planted rather than
 * from what the scanner returns. The composition r5 lost is in there because the
 * product contains it, not because anyone remembered to write it down.
 *
 * `[]` means "no check fires". Read the threat model at the top of
 * `scripts/check-price-leak.mjs` before changing a pinned limit from a miss to a
 * hit or the other way round: those are decisions, not oversights.
 */
describe('leak guard — generated differential corpus (A6a r6)', () => {
  for (const { description, text, expected } of generateCorpus()) {
    it(`fires on ${description}`, () => {
      expect(checksFiring(text), JSON.stringify(text)).toEqual([...expected]);
    });
  }
});

describe('leak guard — accepted limits, pinned (A6a r6)', () => {
  for (const [description, text, expected] of PINNED_LIMITS) {
    it(`${expected.length === 0 ? 'stays silent on' : 'fires on'} ${description}`, () => {
      expect(checksFiring(text), JSON.stringify(text)).toEqual([...expected]);
    });
  }
});

describe('leak guard — unrelated euro text stays silent (A6a r6)', () => {
  for (const [description, text] of SILENT_CONTROLS) {
    it(`stays silent on ${description}`, () => {
      expect(checksFiring(text), JSON.stringify(text)).toEqual([]);
    });
  }
});

/**
 * Sol's round 4. The generated product already contains these, but a regression
 * should say which named shape came back rather than only which coordinate of
 * the cross-product moved — and four of the rows below are the exact strings Sol
 * proved fired at `ca8e024` and missed at `2158c44`.
 */
describe('leak guard — the shapes Sol round 4 proved regressed', () => {
  for (const [description, text, expected] of SOL_ROUND_4_ROWS) {
    it(`fires on ${description}`, () => {
      expect(checksFiring(text), JSON.stringify(text)).toEqual([...expected]);
    });
  }
});

describe('leak guard — the band figures do not fire on ordinary output', () => {
  // `70` and `120` are ordinary numbers, and this repo ships unrelated
  // euro-denominated code (consultant rates, expense reports). Everything here
  // must stay silent or the guard becomes noise that gets switched off.
  const clean: ReadonlyArray<readonly [string, string]> = [
    ['a euro decimal', 'total="€1.200,70 por hora"'],
    ['a grouped euro thousand', 'tarifa="€120.000"'],
    ['a euro amount that is not the band', 'x="€45"'],
    ['bare band digits with no currency', 'const a=70,b=120,c=70+120;'],
    ['a chunk hash', 'static/chunks/pages/index-a70f9c120b.js'],
    ['a four-digit year', 'x="€1970"'],
    ['a distant euro sign', `p="€"${'z'.repeat(40)}70`],
    ['the public headline', 'x="Octubre, 5 al 16 · 2026"'],
  ];

  for (const [description, text] of clean) {
    it(`stays silent on ${description}`, () => {
      expect(checksFiring(text)).toEqual([]);
    });
  }
});
