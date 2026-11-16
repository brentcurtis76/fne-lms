// @vitest-environment node
/**
 * The platform's values live in ONE place — `styles/fne-tokens.css` — and
 * `tailwind.config.js` only names them. This is what keeps that true.
 *
 * History. Until the platform redesign's groundwork (phase 4a) the config held
 * the brand palette as hex literals, the token file held it again as custom
 * properties (A6r), and this test pinned the two copies to each other. The copy
 * was deliberate then: a plain `var()` in the config would have broken every
 * `bg-brand_primary/40`-style opacity modifier. Phase 4a removed the copy the
 * right way: the token file declares each colour as an RGB triplet and the
 * config reads it as `rgb(var(--color-x) / <alpha-value>)`, the form Tailwind
 * can put an opacity into. The grey, yellow, amber, red, green and blue
 * families, the font families and the corner radii moved the same way.
 *
 * What is pinned here, and why:
 *  1. NOTHING CHANGED ON SCREEN. Each named value equals what the platform had
 *     before: the brand hexes below, Tailwind's own defaults for the families,
 *     fonts and radii. Changing a value in `:root` is changing the platform for
 *     everyone and has to fail here, by name.
 *  2. ONE DECLARATION EACH. A second look (the redesign's `[data-look="nuevo"]`)
 *     overrides these names in a file of its own. A second declaration inside
 *     `fne-tokens.css` would silently win or lose by source order.
 *  3. NO NAME WITHOUT A VALUE. Every variable the config reads is declared, on
 *     `:root`, in the file `styles/globals.css` imports, and in no other
 *     stylesheet of the platform; a typo or a lost import would otherwise paint
 *     transparent, not fail.
 *  4. THE OLDER HEX TOKENS AGREE. `--fne-black` and friends are whole colours
 *     that the semantic aliases of the token file read; each must equal its
 *     triplet, or the two sets of names would describe two palettes.
 *  5. OPACITY AND THE DEFAULT RING STILL COMPILE. Tailwind is run for real over
 *     a handful of classes: an opacity modifier must land inside the `rgb()`,
 *     and a `ring` that names no colour must stay blue 500 at half strength —
 *     Tailwind cannot work that default out from a named value and falls back
 *     to a lighter blue without saying so (found by `scripts/redesign/tokens-check.mjs`).
 *  6. THE STRAYS (phase 4b). Hand-typed colours that are neither the brand kit
 *     nor a step above read a name of their own, `--color-legacy-<hex>`, which
 *     holds exactly the colour in its name and is offered as `legacy.<hex>`. The
 *     config's list and the token file's declarations are the same set, and every
 *     name is used by the platform's code (and every use has a name).
 *
 * The gold gradient was never copied: the config reads it straight from the
 * token file as a whole colour. The last case keeps it that way.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'styles', 'fne-tokens.css'), 'utf8');

// CommonJS on purpose: `tailwind.config.js` is the file Tailwind itself loads,
// and reading that exact module is the point of this test.
const tailwindConfig = require('../../tailwind.config.js');
const stockColours: Record<string, Record<string, string>> = require('tailwindcss/colors');
const stockTheme = require('tailwindcss/defaultTheme');

const extend = tailwindConfig.theme.extend;
const colours: Record<string, string | Record<string, string>> = extend.colors;

/** Config key → the variable it reads → the older hex token → the value the platform had before 4a. */
const BRAND: ReadonlyArray<readonly [string, string, string, string]> = [
  ['brand_primary', '--color-brand-primary', '--fne-black', '#0a0a0a'],
  ['brand_accent', '--color-brand-accent', '--fne-yellow', '#fbbf24'],
  ['brand_accent_hover', '--color-brand-accent-hover', '--fne-amber', '#f59e0b'],
  ['brand_accent_light', '--color-brand-accent-light', '--fne-yellow-light', '#fcd34d'],
  ['brand_accent_text', '--color-brand-accent-text', '--fne-amber-text', '#b45309'],
  ['brand_light', '--color-brand-light', '--fne-white', '#ffffff'],
  ['brand_gray_dark', '--color-brand-gray-dark', '--fne-gray-dark', '#1f1f1f'],
  ['brand_gray_medium', '--color-brand-gray-medium', '--fne-gray-medium', '#6b7280'],
  // Older names of the same three colours.
  ['brand_blue', '--color-brand-primary', '--fne-black', '#0a0a0a'],
  ['brand_yellow', '--color-brand-accent', '--fne-yellow', '#fbbf24'],
  ['brand_beige', '--color-brand-light', '--fne-white', '#ffffff'],
];

const FAMILIES = ['gray', 'yellow', 'amber', 'red', 'green', 'blue'] as const;
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

/** The six hex digits of every `--color-legacy-*` the token file declares (phase 4b). */
const LEGACY_DECLARED: string[] = [
  ...new Set(
    [...TOKENS_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--color-legacy-([0-9a-f]{6})\s*:/g)].map((match) => match[1])
  ),
].sort();
const BRAND_KIT = ['0a0a0a', 'fbbf24', 'ffffff', 'f59e0b', 'fcd34d', '1f1f1f', '6b7280'];

/** Font key → the list of faces it had before 4a, as Tailwind wrote it into the stylesheet. */
const FONTS: Readonly<Record<string, string>> = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  serif: (stockTheme.fontFamily.serif as string[]).join(', '),
  mono: (stockTheme.fontFamily.mono as string[]).join(', '),
  mont: 'Mont, sans-serif',
  eames: 'Eames Century Modern, serif',
};

/** `rounded-*` step → its variable. `none` and `full` are not values of a look and stay Tailwind's. */
const RADII: Readonly<Record<string, string>> = {
  sm: '--rounded-sm',
  DEFAULT: '--rounded',
  md: '--rounded-md',
  lg: '--rounded-lg',
  xl: '--rounded-xl',
  '2xl': '--rounded-2xl',
  '3xl': '--rounded-3xl',
};

const escapeForRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every declaration of `name` in the token file (comments removed first). */
function declarations(name: string): string[] {
  const withoutComments = TOKENS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const pattern = new RegExp(`(?:^|[\\s;{])${escapeForRegExp(name)}\\s*:\\s*([^;]+);`, 'g');
  return [...withoutComments.matchAll(pattern)].map((match) => match[1].trim().replace(/\s+/g, ' '));
}

function readToken(name: string): string | null {
  const found = declarations(name);
  return found.length > 0 ? found[0] : null;
}

function triplet(hex: string): string {
  const digits = hex.replace('#', '');
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)).join(' ');
}

const colourReading = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

describe('FNE brand tokens', () => {
  it.each(BRAND)('%s reads %s, which holds the same colour as %s (%s)', (key, variable, hexToken, before) => {
    expect(colours[key]).toBe(colourReading(variable));
    expect(readToken(variable), `${variable} is not declared in styles/fne-tokens.css`).toBe(triplet(before));
    expect(readToken(hexToken)?.toLowerCase()).toBe(before);
  });

  it.each(FAMILIES)('the %s family reads its variables, and they hold Tailwind\'s own values', (family) => {
    const inConfig = colours[family] as Record<string, string>;
    expect(Object.keys(inConfig).sort()).toEqual([...STEPS].sort());
    for (const step of STEPS) {
      const variable = `--color-${family}-${step}`;
      expect(inConfig[step]).toBe(colourReading(variable));
      expect(readToken(variable), `${variable} is not declared in styles/fne-tokens.css`).toBe(
        triplet(stockColours[family][step])
      );
    }
  });

  it('the font families read their variables, and they hold the faces the platform had', () => {
    expect(Object.keys(extend.fontFamily).sort()).toEqual(Object.keys(FONTS).sort());
    for (const [key, faces] of Object.entries(FONTS)) {
      expect(extend.fontFamily[key]).toEqual([`var(--font-${key})`]);
      expect(readToken(`--font-${key}`)).toBe(faces);
    }
  });

  it('the corner radii read their variables, and they hold Tailwind\'s own values', () => {
    expect(Object.keys(extend.borderRadius).sort()).toEqual(Object.keys(RADII).sort());
    for (const [step, variable] of Object.entries(RADII)) {
      expect(extend.borderRadius[step]).toBe(`var(${variable})`);
      expect(readToken(variable)).toBe(stockTheme.borderRadius[step]);
    }
  });

  it('declares every value the config reads exactly once', () => {
    const read = new Set<string>();
    const collect = (value: unknown): void => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(/var\((--[A-Za-z0-9_-]+)\)/g)) read.add(match[1]);
      } else if (typeof value === 'function') {
        collect(value({ opacityValue: '1' }));
      } else if (Array.isArray(value)) {
        value.forEach(collect);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(collect);
      }
    };
    collect(extend);

    // 8 brand colours, 6 families of 11 steps, the 20 legacy colours of phase 4b,
    // 5 font families, 7 radii, and the three gold tokens the config reads as whole colours.
    expect(read.size).toBe(8 + 6 * 11 + 20 + 5 + 7 + 3);
    for (const variable of read) {
      const count = declarations(variable).length;
      expect(count, `${variable} is declared ${count} times in styles/fne-tokens.css`).toBe(1);
    }
  });

  it('declares them on :root, in the file globals.css imports, and nowhere else', () => {
    const postcss = require('postcss');
    const read = new Set<string>();
    for (const [, variable] of BRAND) read.add(variable);
    for (const family of FAMILIES) for (const step of STEPS) read.add(`--color-${family}-${step}`);
    for (const key of Object.keys(FONTS)) read.add(`--font-${key}`);
    for (const variable of Object.values(RADII)) read.add(variable);
    for (const hex of LEGACY_DECLARED) read.add(`--color-legacy-${hex}`);

    // On :root itself: not inside a class, a media query or any other rule.
    const onRoot = new Set<string>();
    postcss.parse(TOKENS_CSS).walkDecls((decl: { prop: string; parent: { type: string; selector?: string; parent?: { type: string } } }) => {
      if (decl.parent.type === 'rule' && decl.parent.selector === ':root' && decl.parent.parent?.type === 'root') onRoot.add(decl.prop);
    });
    for (const variable of read) expect(onRoot.has(variable), `${variable} is not declared on :root`).toBe(true);

    // The import that brings them to every page.
    const stylesDir = join(REPO_ROOT, 'styles');
    expect(readFileSync(join(stylesDir, 'globals.css'), 'utf8')).toMatch(/^@import '\.\/fne-tokens\.css';$/m);

    // No other stylesheet of the platform declares one of the names (it would win or lose by load order).
    const { readdirSync } = require('node:fs');
    for (const file of (readdirSync(stylesDir) as string[]).filter((name) => name.endsWith('.css') && name !== 'fne-tokens.css')) {
      postcss.parse(readFileSync(join(stylesDir, file), 'utf8')).walkDecls((decl: { prop: string }) => {
        expect(read.has(decl.prop), `${decl.prop} is declared again in styles/${file}`).toBe(false);
      });
    }
  });

  it('names each stray colour by its own value, once, and offers it as legacy.<hex>', () => {
    const legacy = colours.legacy as Record<string, string>;
    expect(Object.keys(legacy).sort(), 'the config\'s list and the token file\'s declarations differ').toEqual(LEGACY_DECLARED);
    expect(LEGACY_DECLARED).toHaveLength(20);
    const named = new Set<string>();
    for (const [, variable] of BRAND) named.add(readToken(variable) as string);
    for (const family of FAMILIES) for (const step of STEPS) named.add(triplet(stockColours[family][step]));
    for (const hex of LEGACY_DECLARED) {
      const variable = `--color-legacy-${hex}`;
      expect(legacy[hex]).toBe(colourReading(variable));
      expect(declarations(variable), `${variable} must be declared exactly once`).toHaveLength(1);
      expect(readToken(variable), `${variable} must hold #${hex}`).toBe(triplet(`#${hex}`));
      // Never a second name for a colour that already has one, and never the brand kit.
      expect(named.has(triplet(`#${hex}`)), `#${hex} already has a name; read that one`).toBe(false);
      expect(BRAND_KIT).not.toContain(hex);
    }
  });

  it('uses every legacy name in the platform\'s code, and names every legacy colour it uses', () => {
    const { readdirSync, statSync } = require('node:fs');
    const SOURCE_DIRS = ['pages', 'components', 'src', 'lib', 'utils', 'constants', 'config', 'types', 'hooks', 'contexts'];
    const files: string[] = [join(REPO_ROOT, 'styles', 'notifications.css'), join(REPO_ROOT, 'styles', 'tour.css')];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir) as string[]) {
        if (name === 'node_modules' || name === '__tests__') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?|css)$/.test(name) && !/\.(test|spec)\./.test(name)) files.push(full);
      }
    };
    for (const dir of SOURCE_DIRS) {
      try {
        walk(join(REPO_ROOT, dir));
      } catch {
        // a folder the repository does not have
      }
    }
    const used = new Set<string>();
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/(?:--color-)?legacy-([0-9a-fA-F]{6})(?![0-9a-zA-Z])/g)) used.add(match[1]);
    }
    expect([...used].sort()).toEqual(LEGACY_DECLARED);
  });

  it('declares each older hex token exactly once', () => {
    for (const hexToken of new Set(BRAND.map(([, , token]) => token))) {
      const count = declarations(hexToken).length;
      expect(count, `${hexToken} is declared ${count} times`).toBe(1);
    }
  });

  it('still compiles opacity modifiers and the default ring colour', async () => {
    const postcss = require('postcss');
    const tailwindcss = require('tailwindcss');
    const classes = 'bg-brand_primary/40 bg-brand_accent text-gray-500 border-red-200/50 ring-2 rounded-md font-sans from-amber-100';
    const result = await postcss([
      tailwindcss({ ...tailwindConfig, content: [{ raw: `<div class="${classes}"></div>`, extension: 'html' }] }),
    ]).process('@tailwind base; @tailwind utilities;', { from: undefined });
    const css: string = result.css;

    // An opacity modifier lands inside the rgb(): the reason the values are triplets.
    expect(css).toContain('background-color: rgb(var(--color-brand-primary) / 0.4)');
    expect(css).toContain('border-color: rgb(var(--color-red-200) / 0.5)');
    // Without a modifier Tailwind keeps its own opacity variable, as before.
    expect(css).toMatch(/background-color: rgb\(var\(--color-brand-accent\) \/ var\(--tw-bg-opacity(, 1)?\)\)/);
    expect(css).toMatch(/color: rgb\(var\(--color-gray-500\) \/ var\(--tw-text-opacity(, 1)?\)\)/);
    // A gradient stop fades to the same colour at zero strength.
    expect(css).toContain('--tw-gradient-to: rgb(var(--color-amber-100) / 0)');
    // A `ring` that names no colour: blue 500 at half strength, not Tailwind's fallback.
    expect(css).toContain('--tw-ring-color: rgb(var(--color-blue-500) / 0.5)');
    expect(css).not.toContain('--tw-ring-color: rgb(147 197 253 / 0.5)');
    expect(extend.ringColor.DEFAULT).toBe('rgb(var(--color-blue-500) / 0.5)');
    // The border every element starts with (Tailwind's base layer) is grey 200.
    expect(css).toContain('border-color: rgb(var(--color-gray-200) / 1)');
    expect(css).toContain('border-radius: var(--rounded-md)');
    expect(css).toContain('font-family: var(--font-sans)');
  });

  it('keeps the gold gradient in one place — the config reads it, never restates it', () => {
    expect(readToken('--fne-gold-light')).toBe('#fdb833');
    expect(readToken('--fne-gold-dark')).toBe('#b47410');
    expect(TOKENS_CSS).toContain('--fne-gold-gradient: linear-gradient(135deg');

    expect(colours.brand_gold_light).toBe('var(--fne-gold-light)');
    expect(colours.brand_gold_dark).toBe('var(--fne-gold-dark)');
    expect(extend.backgroundImage['gold-gradient']).toBe('var(--fne-gold-gradient)');
  });
});
