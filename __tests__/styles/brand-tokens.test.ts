/**
 * A6r — `styles/fne-tokens.css` and `tailwind.config.js` carry the same brand
 * palette, and this is what stops them drifting.
 *
 * The handoff's design system arrives as CSS custom properties; the app's colours
 * already live in the Tailwind config and are used by every other surface.
 * Collapsing the config onto `var(--fne-*)` would be the true single source, but
 * it silently breaks every existing `bg-brand_primary/40`-style opacity modifier
 * — Tailwind cannot compute an alpha from a `var()` without an `<alpha-value>`
 * placeholder — and that is an app-wide change, not an A6r one.
 *
 * So the duplication is deliberate and this test is the price of it: change one
 * hex and the other file fails here, by name.
 *
 * The gold gradient is NOT in this table. It has no legacy Tailwind entry, so
 * the config reads it straight out of the token file via `var()` — genuinely one
 * source, nothing to pin. The last case asserts that, so a later "tidy-up" that
 * inlines the gradient into the config gets caught.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'styles', 'fne-tokens.css'), 'utf8');

// CommonJS on purpose: `tailwind.config.js` is the file Tailwind itself loads,
// and reading that exact module is the point of this test.
const tailwindConfig = require('../../tailwind.config.js');
const tailwindColors: Record<string, string> = tailwindConfig.theme.extend.colors;

/** Token name in `fne-tokens.css` → colour key in `tailwind.config.js`. */
const MIRRORED_COLOURS: ReadonlyArray<readonly [string, string]> = [
  ['--fne-black', 'brand_primary'],
  ['--fne-yellow', 'brand_accent'],
  ['--fne-amber', 'brand_accent_hover'],
  ['--fne-yellow-light', 'brand_accent_light'],
  ['--fne-amber-text', 'brand_accent_text'],
  ['--fne-white', 'brand_light'],
  ['--fne-gray-dark', 'brand_gray_dark'],
  ['--fne-gray-medium', 'brand_gray_medium'],
];

function readToken(name: string): string | null {
  const match = TOKENS_CSS.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim().toLowerCase() : null;
}

describe('FNE brand tokens', () => {
  it.each(MIRRORED_COLOURS)('%s matches tailwind.config.js %s', (token, tailwindKey) => {
    const tokenValue = readToken(token);
    expect(tokenValue, `${token} is not declared in styles/fne-tokens.css`).not.toBeNull();
    expect(tailwindColors[tailwindKey]?.toLowerCase()).toBe(tokenValue);
  });

  it('declares every mirrored token exactly once', () => {
    for (const [token] of MIRRORED_COLOURS) {
      const occurrences = TOKENS_CSS.split(`${token}:`).length - 1;
      expect(occurrences, `${token} is declared ${occurrences} times`).toBe(1);
    }
  });

  it('keeps the gold gradient in one place — the config reads it, never restates it', () => {
    expect(readToken('--fne-gold-light')).toBe('#fdb833');
    expect(readToken('--fne-gold-dark')).toBe('#b47410');
    expect(TOKENS_CSS).toContain('--fne-gold-gradient: linear-gradient(135deg');

    expect(tailwindColors.brand_gold_light).toBe('var(--fne-gold-light)');
    expect(tailwindColors.brand_gold_dark).toBe('var(--fne-gold-dark)');
    expect(tailwindConfig.theme.extend.backgroundImage['gold-gradient']).toBe(
      'var(--fne-gold-gradient)'
    );
  });
});
