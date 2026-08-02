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
    const note =
      'Alojamiento en Barcelona: entre €70 y €120 por persona por noche, según el tipo de alojamiento.';
    expect(checksFiring(note)).toEqual(['commercial-copy', 'priced-band-amount']);
    expect(checksFiring('x="€1.000"')).toEqual(['priced-amount']);
    expect(checksFiring('x="__INSPIRA_COMMERCIAL__"')).toEqual(['sentinel']);
  });
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
    ['the public headline', 'x="Octubre 2026 · 5–9 y 13–16 de octubre"'],
  ];

  for (const [description, text] of clean) {
    it(`stays silent on ${description}`, () => {
      expect(checksFiring(text)).toEqual([]);
    });
  }
});
