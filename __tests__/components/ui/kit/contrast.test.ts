// @vitest-environment node
/**
 * Redesign 5c send-back 1, defect 6 — the shared pieces stay readable in BOTH looks.
 *
 * Every text colour the pieces' class lists use is measured against the background it sits on, with the
 * values of today's look (`styles/fne-tokens.css`) and of the new look (`styles/look-nuevo.css` over
 * today's), the way `__tests__/styles/look-nuevo.test.ts` measures (WCAG 2.x relative luminance). Text
 * must reach 4.5:1. The Button's pairs are read from `buttonClasses()` itself, every variant, at rest and
 * under the pointer; the other pieces' pairs are listed by hand below, and a last check reads the kit's
 * source so that a text colour added to a piece without a pair here fails.
 *
 * Not measured, on purpose: a disabled control (WCAG 1.4.3 exempts inactive interface parts) and the
 * icons that are decoration next to words that say the same (they are hidden from screen readers).
 * The few icons and marks that carry meaning on their own are measured at 3:1 (WCAG 1.4.11).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buttonClasses, type ButtonVariant } from '../../../../components/ui/kit/Button';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const KIT_DIR = join(REPO_ROOT, 'components', 'ui', 'kit');
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'styles', 'fne-tokens.css'), 'utf8');
const LOOK_CSS = readFileSync(join(REPO_ROOT, 'styles', 'look-nuevo.css'), 'utf8');
const postcss = require('postcss');

type Look = 'today' | 'nuevo';
type RGB = [number, number, number];
const LOOKS: Look[] = ['today', 'nuevo'];

/** name → value of every custom property declared directly on `selector` at the top of `css`. */
function block(css: string, selector: string): Map<string, string> {
  const found = new Map<string, string>();
  postcss.parse(css).walkDecls((decl: { prop: string; value: string; parent: { type: string; selector?: string; parent?: { type: string } } }) => {
    if (decl.parent.type === 'rule' && decl.parent.selector === selector && decl.parent.parent?.type === 'root' && decl.prop.startsWith('--')) {
      found.set(decl.prop, decl.value.trim().replace(/\s+/g, ' '));
    }
  });
  return found;
}

const TODAY = block(TOKENS_CSS, ':root');
const NUEVO = block(LOOK_CSS, '[data-look="nuevo"]');

const WHITE: RGB = [255, 255, 255];

/**
 * A Tailwind colour name as the classes write it (`gray-500`, `brand_primary`, `white`, `#fbbf24`, with
 * an opacity `brand_primary/5` or `brand_primary/[0.07]`) → its colour in `look`, an opacity laid over `under`.
 */
function colour(look: Look, spec: string, under: RGB = WHITE): RGB {
  const [name, opacity] = spec.split('/');
  let base: RGB;
  if (name === 'white') base = [255, 255, 255];
  else if (name === 'black') base = [0, 0, 0];
  else if (name.startsWith('#')) base = [1, 3, 5].map((at) => parseInt(name.slice(at, at + 2), 16)) as RGB;
  else {
    const prop = `--color-${name.replace(/_/g, '-')}`;
    const value = (look === 'nuevo' ? NUEVO.get(prop) : undefined) ?? TODAY.get(prop);
    if (!value) throw new Error(`${spec}: ${prop} is declared nowhere`);
    base = value.split(' ').map(Number) as RGB;
  }
  if (opacity === undefined) return base;
  const alpha = opacity.startsWith('[') ? Number(opacity.slice(1, -1)) : Number(opacity) / 100;
  return base.map((channel, at) => channel * alpha + under[at] * (1 - alpha)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const rounded = (ratio: number) => Math.round(ratio * 100) / 100;

// ---------------------------------------------------------------------------
// The pairs of the pieces other than Button: [text, background] in each look.
// A background with an opacity is laid over white (the page and the boxes are white in both looks).
// ---------------------------------------------------------------------------

/** `kind`: what the class sets, `text` (default) or `placeholder` (the placeholder's text colour). */
type Pair = { what: string; kind?: 'text' | 'placeholder'; today?: [string, string]; nuevo?: [string, string] };

const PAIRS: Pair[] = [
  // Field and its controls.
  { what: 'Field: label', today: ['gray-700', 'white'], nuevo: ['brand_primary', 'white'] },
  { what: 'Field: help', today: ['gray-500', 'white'], nuevo: ['gray-600', 'white'] },
  { what: 'Field: error', today: ['red-600', 'white'], nuevo: ['red-600', 'white'] },
  { what: 'Field: required mark', today: ['red-600', 'white'], nuevo: ['red-600', 'white'] },
  { what: 'Field: the text typed', today: ['gray-900', 'white'], nuevo: ['brand_primary', 'white'] },
  { what: 'Field: placeholder', kind: 'placeholder', today: ['gray-500', 'white'], nuevo: ['gray-600', 'white'] },
  { what: 'Checkbox, Radio, Switch: words', today: ['gray-700', 'white'], nuevo: ['brand_primary', 'white'] },
  // Dialog.
  { what: 'Dialog: eyebrow', today: ['gray-500', 'white'], nuevo: ['gray-600', 'white'] },
  { what: 'Dialog: title', today: ['gray-900', 'white'], nuevo: ['brand_primary', 'white'] },
  { what: 'Dialog: description', today: ['gray-600', 'white'], nuevo: ['gray-600', 'white'] },
  { what: 'Dialog: body', today: ['gray-700', 'white'], nuevo: ['brand_primary', 'white'] },
  // Table and Pagination.
  { what: 'Table: column header', today: ['gray-500', 'gray-50'], nuevo: ['gray-600', 'gray-100'] },
  { what: 'Table: sortable header under the pointer', today: ['gray-700', 'gray-50'], nuevo: ['brand_primary', 'gray-100'] },
  { what: 'Table: cell', today: ['gray-900', 'white'], nuevo: ['brand_primary', 'white'] },
  { what: 'Table: cell, row under the pointer', today: ['gray-900', 'gray-50'], nuevo: ['brand_primary', 'gray-50'] },
  { what: 'Table: cell, selected row', today: ['gray-900', 'gray-100'], nuevo: ['brand_primary', 'brand_primary/5'] },
  { what: 'Table: column name on a phone', today: ['gray-600', 'white'], nuevo: ['gray-600', 'white'] },
  { what: 'Table: column name on a phone, row under the pointer', today: ['gray-600', 'gray-50'], nuevo: ['gray-600', 'gray-50'] },
  { what: 'Table: column name on a phone, selected row', today: ['gray-600', 'gray-100'], nuevo: ['gray-600', 'brand_primary/5'] },
  { what: 'Pagination: range', today: ['gray-700', 'white'], nuevo: ['gray-600', 'white'] },
  // Tabs.
  { what: 'Tabs: selected', today: ['brand_primary', 'white'], nuevo: ['brand_primary', 'white'] },
  { what: 'Tabs: not selected', today: ['gray-500', 'white'], nuevo: ['gray-600', 'white'] },
  { what: 'Tabs: not selected, under the pointer', today: ['gray-700', 'white'], nuevo: ['brand_primary', 'white'] },
  // Badge and Count.
  { what: 'Badge: neutral', today: ['gray-800', 'gray-100'], nuevo: ['gray-600', 'gray-100'] },
  { what: 'Badge: success', today: ['green-800', 'green-100'], nuevo: ['green-600', 'green-100'] },
  { what: 'Badge: warning', today: ['yellow-800', 'yellow-100'], nuevo: ['amber-700', 'amber-100'] },
  { what: 'Badge: error', today: ['red-800', 'red-100'], nuevo: ['red-600', 'red-100'] },
  { what: 'Badge: info', today: ['blue-800', 'blue-100'], nuevo: ['brand_gray_dark', 'blue-50'] },
  { what: 'Badge: accent', today: ['brand_primary', 'brand_accent/20'], nuevo: ['brand_primary', 'brand_accent'] },
  { what: 'Count', today: ['brand_primary', 'brand_accent'], nuevo: ['brand_primary', 'brand_accent'] },
  // Notice.
  { what: 'Notice: neutral', today: ['gray-800', 'gray-50'], nuevo: ['brand_primary', 'brand_primary/5'] },
  { what: 'Notice: success', today: ['green-800', 'green-50'], nuevo: ['brand_primary', 'green-100'] },
  { what: 'Notice: warning', today: ['yellow-800', 'yellow-50'], nuevo: ['brand_primary', 'amber-100'] },
  { what: 'Notice: error', today: ['red-800', 'red-50'], nuevo: ['brand_primary', 'red-100'] },
  // EmptyState, PageHeader, Card, loading marks.
  { what: 'EmptyState: title', today: ['gray-900', 'white'], nuevo: ['brand_primary', 'white'] },
  { what: 'EmptyState: description', today: ['gray-500', 'white'], nuevo: ['gray-600', 'white'] },
  // The new look draws the page header on the page itself, which may be white or gray-50.
  { what: 'PageHeader: title', today: ['gray-900', 'white'], nuevo: ['brand_primary', 'gray-50'] },
  { what: 'PageHeader: description', today: ['gray-600', 'white'], nuevo: ['gray-600', 'gray-50'] },
  { what: 'Card: title', today: ['gray-900', 'white'], nuevo: ['brand_primary', 'white'] },
  { what: 'Spinner: label', today: ['gray-600', 'white'], nuevo: ['gray-600', 'white'] },
  { what: 'LoadingBlock: words', today: ['gray-500', 'white'], nuevo: ['gray-600', 'white'] },
  // Redesign 6B: the new «Mi Panel» (components/panel/*Nuevo.tsx), drawn only in the new look. Its
  // page background is the frame's gray-50. Text written at 80% white on the dark bands (the welcome
  // band's lines, the numbers' eyebrow) is laid over its band, not over white: measured by hand in
  // the 6B report (about 10.9:1 on brand_gray_dark and 12.6:1 on brand_primary); the full white is measured here.
  { what: 'Panel 6B: section title on the page', nuevo: ['brand_primary', 'gray-50'] },
  { what: 'Panel 6B: section line on the page', nuevo: ['gray-600', 'gray-50'] },
  { what: 'Panel 6B: a card\'s secondary text', nuevo: ['gray-600', 'white'] },
  { what: 'Panel 6B: a card\'s title', nuevo: ['brand_primary', 'white'] },
  { what: 'Panel 6B: instructor, partner school, «Tú» (amber text)', nuevo: ['brand_accent_text', 'white'] },
  { what: 'Panel 6B: welcome band, greeting and «Mi Perfil»', nuevo: ['white', 'brand_gray_dark'] },
  { what: 'Panel 6B: «Educadores Activos» card', nuevo: ['white', 'brand_primary'] },
  { what: 'Panel 6B: «Solicita ayuda con diseño instruccional»', nuevo: ['amber-700', 'amber-100'] },
  { what: 'Panel 6B: a member\'s initial', nuevo: ['white', 'brand_primary'] },
  { what: 'Panel 6B: the viewer\'s initial (yellow)', nuevo: ['brand_primary', 'brand_accent'] },
  { what: 'Panel 6B: «+{n}» members', nuevo: ['gray-600', 'gray-100'] },
  { what: 'Panel 6B: a row under the pointer', nuevo: ['brand_primary', 'gray-50'] },
];

/** Icons and marks that carry meaning on their own: 3:1 (WCAG 1.4.11). */
const GRAPHICS: Pair[] = [
  { what: 'Dialog: the close X', today: ['gray-400', 'white'], nuevo: ['gray-600', 'white'] },
  { what: 'Dialog: the close X under the pointer', today: ['gray-500', 'white'], nuevo: ['brand_primary', 'brand_primary/[0.08]'] },
  { what: 'Checkbox: a ticked box', today: ['brand_accent', 'white'], nuevo: ['brand_primary', 'white'] },
  { what: 'Switch: on', today: ['brand_primary', 'white'], nuevo: ['brand_primary', 'white'] },
];

/**
 * Graphics under 3:1, left as the first build drew them for the lead to decide (not changed silently):
 * both are today's look copied from the platform's own screens (`ConfirmModal`'s X is the same grey; the
 * platform's tick boxes are yellow).
 */
const GRAPHICS_BELOW: Readonly<Record<string, number>> = {
  'today · Dialog: the close X': 2.54,
  'today · Checkbox: a ticked box': 1.67,
};

/**
 * Text colours in the kit's source that are not text: decoration next to words (hidden from screen
 * readers) or the tick box's own colour. `look colour` → why.
 */
const NOT_TEXT: Readonly<Record<string, string>> = {
  'today text gray-400': 'the magnifying glass, the empty state icon and the close X (measured above as a graphic)',
  'today text yellow-600': 'the warning Notice icon, next to its words',
  'today text green-600': 'the success Notice icon, next to its words',
  'today text brand_accent': 'the tick box\'s colour (measured above as a graphic)',
  'nuevo text brand_primary/[0.16]': 'the empty state\'s large faint icon, decoration',
};

function measure(pairs: Pair[], minimum: number): Record<string, number> {
  const below: Record<string, number> = {};
  for (const pair of pairs) {
    for (const look of LOOKS) {
      const colours = pair[look];
      if (!colours) continue;
      const ratio = contrast(colour(look, colours[0]), colour(look, colours[1]));
      if (ratio < minimum) below[`${look} · ${pair.what}`] = rounded(ratio);
    }
  }
  return below;
}

// ---------------------------------------------------------------------------
// Button: read from its own classes.
// ---------------------------------------------------------------------------

const VARIANTS: ButtonVariant[] = ['primary', 'default', 'outline', 'quiet', 'danger', 'danger-outline', 'confirm'];
/** What a button may sit on: a white box, or the new look's grey dialog footer and pages. */
const SURFACES = ['white', 'gray-50'];
const COLOUR = '(white|black|transparent|brand_[a-z_]+|[a-z]+-\\d{2,3})(\\/(?:\\d+|\\[[\\d.]+\\]))?';

/** The colours of the classes `prefix` + `kind-<colour>` among `classes` (`prefix` '' for no variant). */
function named(classes: string[], prefix: string, kind: 'text' | 'bg'): string[] {
  const pattern = new RegExp(`^${prefix.replace(/:/g, '\\:')}${kind}-${COLOUR}$`);
  return classes.flatMap((name) => {
    const match = name.match(pattern);
    return match ? [`${match[1]}${match[2] ?? ''}`] : [];
  });
}
const gradientStops = (classes: string[]) =>
  classes.filter((name) => name.startsWith('nuevo:bg-[linear-gradient')).flatMap((name) => name.match(/#[0-9a-f]{6}/gi) ?? []);
const unique = (values: string[]) => [...new Set(values)];

/** Every [text, background] a button of `variant` can show in `look`, at rest and under the pointer. */
function buttonPairs(variant: ButtonVariant, look: Look): Array<{ state: string; text: string; background: string; under: string }> {
  const classes = buttonClasses({ variant }).split(/\s+/);
  const text = named(classes, '', 'text');
  const bg = named(classes, '', 'bg');
  const hoverText = named(classes, 'hover:', 'text');
  const hoverBg = named(classes, 'hover:', 'bg');
  const pairs: Array<{ state: string; text: string; background: string; under: string }> = [];
  const add = (state: string, texts: string[], backgrounds: string[]) => {
    for (const t of unique(texts)) for (const b of unique(backgrounds)) for (const under of SURFACES) {
      pairs.push({ state, text: t, background: b === 'transparent' ? under : b, under });
    }
  };
  if (look === 'today') {
    add('at rest', text, bg);
    add('under the pointer', hoverText.length ? hoverText : text, hoverBg.length ? hoverBg : bg);
    return pairs;
  }
  // The new look: a `nuevo:` class wins over the plain one; against a plain `hover:` class it ties, so
  // both are measured.
  const nText = named(classes, 'nuevo:', 'text');
  const nBg = named(classes, 'nuevo:', 'bg');
  const nHoverText = named(classes, 'nuevo:hover:', 'text');
  const nHoverBg = named(classes, 'nuevo:hover:', 'bg');
  const stops = gradientStops(classes);
  const restText = nText.length ? nText : text;
  const restBg = nBg.length ? nBg : bg;
  add('at rest', restText, [...restBg, ...stops]);
  const dropsGradient = classes.includes('nuevo:hover:bg-none');
  add(
    'under the pointer',
    nHoverText.length ? nHoverText : [...restText, ...hoverText],
    nHoverBg.length ? nHoverBg : [...restBg, ...hoverBg, ...(dropsGradient ? [] : stops)]
  );
  return pairs;
}

// ---------------------------------------------------------------------------
// The text colours the kit's source uses.
// ---------------------------------------------------------------------------

function sourceTextColours(): Set<string> {
  const used = new Set<string>();
  const pattern = new RegExp(`(?:^|[\\s'"\`])((?:[\\w\\-\\[\\]=.()]+:)*)(text|placeholder)-${COLOUR}(?=[\\s'"\`])`, 'g');
  for (const file of readdirSync(KIT_DIR).filter((name) => name.endsWith('.tsx'))) {
    const source = readFileSync(join(KIT_DIR, file), 'utf8');
    for (const match of source.matchAll(pattern)) {
      const variants = match[1].split(':');
      const look: Look = variants.includes('nuevo') ? 'nuevo' : 'today';
      // `placeholder-gray-500` and `placeholder:text-gray-600` both colour the placeholder.
      const kind = match[2] === 'placeholder' || variants.includes('placeholder') ? 'placeholder' : 'text';
      used.add(`${look} ${kind} ${match[3]}${match[4] ?? ''}`);
    }
  }
  return used;
}

describe('the shared pieces: contrast in both looks', () => {
  it('reads every value it needs from the two token files', () => {
    expect(TODAY.get('--color-gray-500')).toBe('107 114 128');
    expect(NUEVO.get('--color-gray-600')).toBe('75 85 99');
  });

  it.each(VARIANTS)('Button %s: its text reaches 4.5:1 at rest and under the pointer, in both looks', (variant) => {
    const below: string[] = [];
    for (const look of LOOKS) {
      const pairs = buttonPairs(variant, look);
      expect(pairs.length, `${look}: no pairs read`).toBeGreaterThan(0);
      for (const { state, text, background, under } of pairs) {
        const ratio = contrast(colour(look, text), colour(look, background, colour(look, under)));
        if (ratio < 4.5) below.push(`${look} ${state}: ${text} on ${background} (over ${under}) = ${rounded(ratio)}`);
      }
    }
    expect(below).toEqual([]);
  });

  it('the other pieces\' text reaches 4.5:1 in both looks', () => {
    expect(measure(PAIRS, 4.5)).toEqual({});
  });

  it('the icons and marks that carry meaning reach 3:1, except the listed ones', () => {
    expect(measure(GRAPHICS, 3)).toEqual(GRAPHICS_BELOW);
  });

  it('every text colour the kit\'s source uses is measured here (or is listed as not text)', () => {
    const measured = new Set<string>();
    for (const pair of [...PAIRS, ...GRAPHICS]) {
      for (const look of LOOKS) if (pair[look]) measured.add(`${look} ${pair.kind ?? 'text'} ${pair[look]?.[0]}`);
    }
    for (const variant of VARIANTS) for (const look of LOOKS) for (const { text } of buttonPairs(variant, look)) measured.add(`${look} text ${text}`);
    const missing = [...sourceTextColours()].filter((used) => !measured.has(used) && !(used in NOT_TEXT)).sort();
    expect(missing).toEqual([]);
  });

  it('the source scan finds the colours it should (a broken pattern would find none)', () => {
    const used = sourceTextColours();
    expect(used.has('today text gray-500')).toBe(true);
    expect(used.has('nuevo text brand_primary')).toBe(true);
    expect(used.has('nuevo placeholder gray-600')).toBe(true);
    expect(used.size).toBeGreaterThan(10);
  });
});
