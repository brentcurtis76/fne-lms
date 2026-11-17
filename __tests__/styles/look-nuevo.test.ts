// @vitest-environment node
/**
 * The new look's values (redesign phase 5a), `styles/look-nuevo.css`.
 *
 * What is pinned here, and why:
 *  1. NOTHING WITHOUT THE ATTRIBUTE. Every rule of the file requires `data-look="nuevo"` on an
 *     ancestor (or on `<html>` itself), so a page without the attribute is exactly today's page.
 *     `scripts/redesign/tokens-check.mjs` proves the same on the compiled stylesheet.
 *  2. OLD SCHOOL HARDWARE. No color-mix, no :has, no nesting, no container queries, no backdrop
 *     blur, no :not() with a complex selector inside, no at-rules but `@media (min-width: …)`
 *     breakpoints (5a send-back 1: a breakpoint variant of a shadow class needs its look rule inside
 *     the same breakpoint), whose every rule still starts with the look.
 *  3. THE VALUES ARE THE APPROVED ONES. Each family takes its scale, step for step; the brand accent
 *     text, the 30 legacy names and the radii take the values of the brief; nothing else is
 *     redeclared (the other seven brand names, the fonts: Besley is not loaded by the platform).
 *  4. ONLY KNOWN NAMES. Every name the values block gives is one `fne-tokens.css` declares, except
 *     the chart series and toast names, which exist ONLY under the look (today's look reads their
 *     fallbacks).
 *  5. NOTHING UNREADABLE. The platform's usual pairs measure at least 4.5:1 (WCAG AA), computed from
 *     the look's values. The pairs that do not are listed below with their ratio, on purpose: the
 *     lead decides, and a new one fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const LOOK_CSS = readFileSync(join(REPO_ROOT, 'styles', 'look-nuevo.css'), 'utf8');
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'styles', 'fne-tokens.css'), 'utf8');
const GLOBALS_CSS = readFileSync(join(REPO_ROOT, 'styles', 'globals.css'), 'utf8');
const postcss = require('postcss');

const LOOK_ROOT = '[data-look="nuevo"]';
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

type Decl = { prop: string; value: string; parent: { type: string; selector?: string; parent?: { type: string } } };

/** name → value of every custom property declared directly on `selector` in `css`. */
function block(css: string, selector: string): Map<string, string> {
  const found = new Map<string, string>();
  postcss.parse(css).walkDecls((decl: Decl) => {
    if (decl.parent.type === 'rule' && decl.parent.selector === selector && decl.parent.parent?.type === 'root' && decl.prop.startsWith('--')) {
      expect(found.has(decl.prop), `${decl.prop} is declared twice under ${selector}`).toBe(false);
      found.set(decl.prop, decl.value.trim().replace(/\s+/g, ' '));
    }
  });
  return found;
}

const LOOK = block(LOOK_CSS, LOOK_ROOT);
const TODAY = block(TOKENS_CSS, ':root');
/** A name's value under the look: the look's own, else today's. */
const underLook = (name: string): string => {
  const value = LOOK.get(name) ?? TODAY.get(name);
  if (!value) throw new Error(`${name} is declared nowhere`);
  return value;
};

// GRIS 500 is #656b78 (send-back 3, the lead's value), one step darker than the kit's gris medio
// (#6b7280, which NEUTRO 400 and the chart series keep), so muted text reads on gray 50 as well as today.
const GRIS = ['245 245 246', '231 232 234', '225 225 227', '196 196 198', '157 159 164', '101 107 120', '75 85 99', '46 46 46', '31 31 31', '10 10 10', '10 10 10'];
const NEUTRO = ['236 236 238', '231 232 234', '196 196 198', '157 159 164', '107 114 128', '31 31 31', '10 10 10', '31 31 31', '31 31 31', '10 10 10', '10 10 10'];
const EXITO = ['238 250 242', '226 246 233', '183 220 200', '127 191 163', '63 154 122', '15 125 96', '10 107 82', '8 90 69', '7 74 57', '5 58 45', '3 38 29'];
const ERROR = ['254 245 245', '253 236 236', '246 207 204', '235 163 158', '217 101 93', '198 58 49', '179 38 30', '143 29 23', '116 24 18', '92 19 15', '61 12 9'];
const AMBAR = ['255 251 235', '254 243 199', '253 230 138', '252 211 77', '251 191 36', '245 158 11', '180 83 9', '146 64 14', '120 53 15', '92 40 10', '69 26 3'];

const SCALES: ReadonlyArray<readonly [string, string[], string[]]> = [
  ['GRIS', GRIS, ['gray', 'slate']],
  ['NEUTRO', NEUTRO, ['blue', 'sky', 'indigo', 'purple', 'pink', 'cyan', 'teal']],
  ['EXITO', EXITO, ['green', 'emerald']],
  ['ERROR', ERROR, ['red', 'rose']],
  ['AMBAR', AMBAR, ['amber', 'yellow', 'orange']],
];
const FAMILIES = SCALES.flatMap(([, , families]) => families);

/** Legacy name (its hex) → its value under the look (brief 5a, 2b). */
const LEGACY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(['00243a', '002844', '00293f', '002a47', '002a4a', '003a5b', '004080', '004170', '004a7a', '004a7c', '0066a4'].map((hex) => [hex, '31 31 31'])),
  ...Object.fromEntries(['e6a429', 'e6a42d', 'e6a42e', 'e6a530', 'f5a623', 'f5b927', 'fca311'].map((hex) => [hex, '245 158 11'])),
  '8b6914': '146 64 14',
  b8860b: '146 64 14',
  e8e5e2: '231 232 234',
  e0f0ff: '236 236 238',
  '10b981': '10 107 82',
  ef4044: '179 38 30',
  '6366f1': '10 10 10',
  f97316: '245 158 11',
  '8b5cf6': '107 114 128',
  ec4899: '146 64 14',
  ea580c: '146 64 14',
  '06b6d4': '196 196 198',
};

const RADII: Readonly<Record<string, string>> = {
  '--rounded-sm': '0.1875rem',
  '--rounded': '0.25rem',
  '--rounded-md': '0.25rem',
  '--rounded-lg': '0.375rem',
  '--rounded-xl': '0.375rem',
  '--rounded-2xl': '0.375rem',
  '--rounded-3xl': '0.375rem',
};

/** Names that exist only under the look: today's look reads their fallbacks. */
const LOOK_ONLY = [
  '--color-serie-1', '--color-serie-2', '--color-serie-3', '--color-serie-4', '--color-serie-5',
  '--toast-text', '--toast-font-size', '--toast-radius', '--toast-line', '--toast-shadow', '--toast-edge-success',
  '--toast-stack-bottom', '--toast-stack-right',
];

describe('the new look: nothing applies without the attribute', () => {
  it('is imported by globals.css right after the token file', () => {
    expect(GLOBALS_CSS).toMatch(/^@import '\.\/fne-tokens\.css';\n(?:\/\*[^\n]*\*\/\n)?@import '\.\/look-nuevo\.css';$/m);
  });

  it('every rule requires data-look="nuevo" on <html> or an ancestor', () => {
    const problems: string[] = [];
    type Node = { type: string; name?: string; params?: string; parent?: Node };
    const isBreakpoint = (node: Node | undefined) =>
      node?.type === 'atrule' && node.name === 'media' && /^\(min-width: \d+px\)$/.test(node.params ?? '') && node.parent?.type === 'root';
    postcss.parse(LOOK_CSS).walkRules((rule: { selector: string; parent: Node }) => {
      if (rule.parent.type !== 'root' && !isBreakpoint(rule.parent)) problems.push(`nested rule: ${rule.selector}`);
      for (const part of rule.selector.split(',').map((s) => s.trim())) {
        if (!/^(html)?\[data-look="nuevo"\](\s|$)/.test(part)) problems.push(`does not start with the look: ${part}`);
      }
    });
    postcss.parse(LOOK_CSS).walkAtRules((at: Node) => {
      if (!isBreakpoint(at)) problems.push(`at-rule @${at.name} ${at.params}`);
    });
    expect(problems).toEqual([]);
  });

  it('asks nothing of the browser that old school hardware lacks', () => {
    const code = LOOK_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const forbidden of [/color-mix\(/, /:has\(/, /@container/, /backdrop-filter/, /:is\(/]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
    // :not() only around a single class.
    for (const match of code.matchAll(/:not\(([^)]*)\)/g)) expect(match[1]).toMatch(/^\.[A-Za-z][\w-]*$/);
  });
});

describe('the new look: the approved values', () => {
  it.each(SCALES)('%s: every family under it takes its eleven values, step for step', (_scale, values, families) => {
    for (const family of families) {
      STEPS.forEach((step, at) => {
        expect(underLook(`--color-${family}-${step}`), `${family}-${step}`).toBe(values[at]);
      });
    }
  });

  it('amber keeps today\'s 50 to 500 and 950 (not redeclared); only 600 to 900 change', () => {
    for (const step of [50, 100, 200, 300, 400, 500, 950]) expect(LOOK.has(`--color-amber-${step}`), `amber-${step}`).toBe(false);
    for (const step of [600, 700, 800, 900]) expect(LOOK.has(`--color-amber-${step}`), `amber-${step}`).toBe(true);
  });

  it('the accent text is ámbar texto under both of its names; the other brand names keep their values', () => {
    expect(LOOK.get('--color-brand-accent-text')).toBe('146 64 14');
    expect(LOOK.get('--fne-amber-text')).toBe('#92400e');
    for (const name of ['primary', 'accent', 'accent-hover', 'accent-light', 'light', 'gray-dark', 'gray-medium']) {
      expect(LOOK.has(`--color-brand-${name}`), name).toBe(false);
    }
    for (const name of ['--fne-black', '--fne-yellow', '--fne-white', '--fne-amber', '--fne-yellow-light', '--fne-gray-dark', '--fne-gray-medium']) {
      expect(LOOK.has(name), name).toBe(false);
    }
  });

  it('gives each of the 30 legacy names its value', () => {
    const declared = [...LOOK.keys()].filter((name) => name.startsWith('--color-legacy-')).map((name) => name.slice('--color-legacy-'.length)).sort();
    expect(declared).toEqual(Object.keys(LEGACY).sort());
    for (const [hex, value] of Object.entries(LEGACY)) expect(LOOK.get(`--color-legacy-${hex}`), hex).toBe(value);
  });

  it('gives the corner radii 3, 4 and 6 px', () => {
    for (const [name, value] of Object.entries(RADII)) expect(LOOK.get(name), name).toBe(value);
  });

  it('leaves the fonts alone (Besley is not loaded by the platform\'s own stylesheets)', () => {
    for (const name of ['--font-sans', '--font-serif', '--font-mono', '--font-mont', '--font-eames']) expect(LOOK.has(name), name).toBe(false);
    expect(GLOBALS_CSS).not.toMatch(/Besley/i);
    expect(TOKENS_CSS).not.toMatch(/Besley/i);
  });

  it('gives only names the token file declares, plus the ones that exist only under the look', () => {
    const unknown = [...LOOK.keys()].filter((name) => !TODAY.has(name) && !LOOK_ONLY.includes(name) && name !== '--fne-amber-text');
    expect(unknown).toEqual([]);
    expect(TODAY.has('--fne-amber-text') || /--fne-amber-text:/.test(TOKENS_CSS)).toBe(true);
    for (const name of LOOK_ONLY) {
      expect(LOOK.has(name), `${name} under the look`).toBe(true);
      expect(TOKENS_CSS.includes(`${name}:`), `${name} must not exist with today's look`).toBe(false);
    }
  });

  it('names the chart series in the owner\'s order', () => {
    expect([1, 2, 3, 4, 5].map((n) => LOOK.get(`--color-serie-${n}`))).toEqual(['10 10 10', '245 158 11', '107 114 128', '146 64 14', '196 196 198']);
  });

  it('sets the typography plugin\'s greys to GRIS', () => {
    const prose = new Map<string, string>();
    postcss.parse(LOOK_CSS).walkDecls((decl: Decl) => {
      if (decl.parent.selector === `${LOOK_ROOT} .prose,\n${LOOK_ROOT} .prose-gray`) prose.set(decl.prop, decl.value);
    });
    const gray = (step: number) => `rgb(var(--color-gray-${step}))`;
    expect(Object.fromEntries(prose)).toEqual({
      '--tw-prose-body': gray(600),
      '--tw-prose-headings': gray(900),
      '--tw-prose-links': gray(900),
      '--tw-prose-bold': gray(900),
      '--tw-prose-counters': gray(500),
      '--tw-prose-bullets': gray(500),
      '--tw-prose-hr': gray(200),
      '--tw-prose-quotes': gray(900),
      '--tw-prose-quote-borders': gray(200),
      '--tw-prose-captions': gray(500),
      '--tw-prose-code': gray(900),
      '--tw-prose-pre-bg': gray(800),
      '--tw-prose-th-borders': gray(200),
      '--tw-prose-td-borders': gray(200),
    });
  });

  it('the keyboard ring is two rings, white inside and black outside, one step more specific than focus:outline-none', () => {
    // `.focus\:outline-none:focus` is (0,2,0); `html[data-look="nuevo"] :focus-visible` is (0,2,1).
    const focus: Record<string, string> = {};
    postcss.parse(LOOK_CSS).walkRules((rule: { selector: string; walkDecls: (fn: (d: Decl) => void) => void }) => {
      if (rule.selector === 'html[data-look="nuevo"] :focus-visible') rule.walkDecls((d) => (focus[d.prop] = d.value));
    });
    expect(focus).toEqual({
      outline: '2px solid rgb(10 10 10)',
      'outline-offset': '2px',
      'box-shadow': '0 0 0 2px rgb(255 255 255)',
    });
  });
});

// ---------------------------------------------------------------------------
// Contrast (WCAG 2.x relative luminance).
// ---------------------------------------------------------------------------

function luminance(rgb: string): number {
  const [r, g, b] = rgb.split(' ').map((c) => {
    const s = Number(c) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '255 255 255';
const color = (family: string, step: number) => underLook(`--color-${family}-${step}`);

/** Every usual pair of the brief: [what, foreground, background]. */
const PAIRS: Array<[string, string, string]> = [];
for (const family of FAMILIES) {
  for (const step of [500, 600, 700]) PAIRS.push([`white on ${family}-${step}`, WHITE, color(family, step)]);
  for (const text of [700, 800, 900]) for (const bg of [50, 100]) PAIRS.push([`${family}-${text} on ${family}-${bg}`, color(family, text), color(family, bg)]);
}
PAIRS.push(['brand-accent-text on white', underLook('--color-brand-accent-text'), WHITE]);
PAIRS.push(['gray-500 on white', color('gray', 500), WHITE]);
PAIRS.push(['gray-600 on white', color('gray', 600), WHITE]);
PAIRS.push(['gray-600 on gray-50', color('gray', 600), color('gray', 50)]);
PAIRS.push(['gray-600 on gray-100', color('gray', 600), color('gray', 100)]);
// Send-back 3: table heads, tab labels and help texts are muted grey on the light-grey page background.
PAIRS.push(['gray-500 on gray-50', color('gray', 500), color('gray', 50)]);
PAIRS.push(['slate-500 on slate-50', color('slate', 500), color('slate', 50)]);

/**
 * Pairs under 4.5:1 with the brief's values, left for the lead to decide (not changed silently).
 * ÁMBAR 500 is the brand kit's amarillo intenso (#f59e0b), the same value amber 500 has today.
 */
const BELOW_AA: Readonly<Record<string, number>> = {
  'white on amber-500': 2.15,
  'white on yellow-500': 2.15,
  'white on orange-500': 2.15,
};

describe('the new look: the usual pairs stay readable', () => {
  it('measures at least 4.5:1 for every usual pair, except the listed ones', () => {
    const below: Record<string, number> = {};
    for (const [what, fg, bg] of PAIRS) {
      const ratio = contrast(fg, bg);
      if (ratio < 4.5) below[what] = Math.round(ratio * 100) / 100;
    }
    expect(below).toEqual(BELOW_AA);
  });

  it('checks a sensible number of pairs', () => {
    expect(PAIRS.length).toBe(FAMILIES.length * 9 + 7);
  });
});

// ---------------------------------------------------------------------------
// Shadows (5a send-back 1): the look's three shadows on Tailwind's shadow steps.
// ---------------------------------------------------------------------------

const SMALL = '0 1px 2px rgb(10 10 10 / 0.08)';
const MEDIUM = '0 1px 2px rgb(10 10 10 / 0.06), 0 10px 24px -14px rgb(10 10 10 / 0.3)';
const LARGE = '0 24px 64px -24px rgb(10 10 10 / 0.55)';
const colored = (shadow: string) => shadow.replace(/rgb\(10 10 10 \/ [\d.]+\)/g, 'var(--tw-shadow-color)');

/**
 * Every selector of the compiled stylesheet that sets `--tw-shadow` (the base `*` rules aside), and
 * what the look does with it. Compared with a freshly compiled stylesheet by a one-off script in the
 * send-back's report; a class added to the platform later is not covered until it is added here.
 */
const SHADOW_STEPS: Readonly<Record<string, string>> = {
  '.shadow-sm': SMALL,
  '.shadow': SMALL,
  '.shadow-md': MEDIUM,
  '.shadow-lg': MEDIUM,
  '.shadow-xl': LARGE,
  '.shadow-2xl': LARGE,
  '.hover\\:shadow-sm:hover': SMALL,
  '.hover\\:shadow-md:hover': MEDIUM,
  '.hover\\:shadow-lg:hover': MEDIUM,
  '.hover\\:shadow-xl:hover': LARGE,
  '.hover\\:shadow-2xl:hover': LARGE,
};
/** Kept as they are without the look, against the steps above: no shadow from the large breakpoint on, and a shadow colour. */
const SHADOW_KEPT: Readonly<Record<string, { media: string | null; shadow: string; colored?: string }>> = {
  '.lg\\:shadow-none': { media: '(min-width: 1024px)', shadow: '0 0 #0000', colored: '0 0 #0000' },
  '.shadow-\\[\\#FFC107\\]\\/20': { media: null, shadow: 'var(--tw-shadow-colored)' },
};
/** Left alone (not in the compiled stylesheet today): the plain no-shadow class, the inner shadow, arbitrary shadows. */

type ShadowRule = { selector: string; media: string | null; decls: Record<string, string>; order: number };
function shadowRules(): ShadowRule[] {
  const rules: ShadowRule[] = [];
  let order = 0;
  postcss.parse(LOOK_CSS).walkRules((rule: { selector: string; parent: { type: string; params?: string }; walkDecls: (fn: (d: Decl) => void) => void }) => {
    order++;
    const decls: Record<string, string> = {};
    rule.walkDecls((d) => (decls[d.prop] = d.value.trim().replace(/\s+/g, ' ')));
    if (!('--tw-shadow' in decls) && !('--tw-shadow-colored' in decls)) return;
    const media = rule.parent.type === 'atrule' ? rule.parent.params ?? null : null;
    for (const part of rule.selector.split(',').map((s) => s.trim())) rules.push({ selector: part, media, decls, order });
  });
  return rules;
}

describe('the new look: shadows', () => {
  const rules = shadowRules();
  const bySelector = (selector: string) => rules.filter((r) => r.selector === `html[data-look="nuevo"] ${selector}`);

  it('covers exactly the pinned shadow selectors, and nothing else', () => {
    const covered = rules.map((r) => r.selector.replace(/^html\[data-look="nuevo"\] /, '')).sort();
    expect(covered).toEqual([...Object.keys(SHADOW_STEPS), ...Object.keys(SHADOW_KEPT)].sort());
  });

  it.each(Object.entries(SHADOW_STEPS))('%s takes the look\'s shadow, and the same shape for a colour', (selector, shadow) => {
    const [rule, ...more] = bySelector(selector);
    expect(more).toEqual([]);
    expect(rule.media).toBeNull();
    expect(rule.decls).toEqual({ '--tw-shadow': shadow, '--tw-shadow-colored': colored(shadow) });
  });

  it('never sets box-shadow itself, so the rings keep composing with the shadows', () => {
    for (const r of rules) expect(Object.keys(r.decls), r.selector).not.toContain('box-shadow');
  });

  it('keeps no-shadow-from-lg and the shadow colour winning over the steps, as without the look', () => {
    const lastStep = Math.max(...Object.keys(SHADOW_STEPS).filter((s) => !s.includes(':hover')).map((s) => bySelector(s)[0].order));
    for (const [selector, kept] of Object.entries(SHADOW_KEPT)) {
      const [rule] = bySelector(selector);
      expect(rule.media, selector).toBe(kept.media);
      expect(rule.decls['--tw-shadow'], selector).toBe(kept.shadow);
      expect(rule.decls['--tw-shadow-colored'], selector).toBe(kept.colored);
      // Same specificity as the resting steps (0,2,1), so it must come after them.
      expect(rule.order, selector).toBeGreaterThan(lastStep);
    }
  });

  it('a hover rule of the look is more specific than a resting rule of the look', () => {
    for (const selector of Object.keys(SHADOW_STEPS).filter((s) => s.endsWith(':hover'))) {
      // `html[data-look="nuevo"] .x:hover` is (0,3,1); `html[data-look="nuevo"] .y` is (0,2,1).
      expect(bySelector(selector)[0].selector).toMatch(/^html\[data-look="nuevo"\] \.[^ ]+:hover$/);
    }
    for (const selector of Object.keys(SHADOW_STEPS).filter((s) => !s.endsWith(':hover'))) {
      expect(bySelector(selector)[0].selector).toMatch(/^html\[data-look="nuevo"\] \.[^ :]+$/);
    }
  });
});
