// @vitest-environment node
/**
 * Charts with several series (redesign phase 5a): with the new look they use the kit's tones in the
 * owner's order (`--color-serie-1` … `--color-serie-5`, declared ONLY under `[data-look="nuevo"]` in
 * `styles/look-nuevo.css`). With today's look those names do not exist and each colour takes its
 * fallback, so the fallback must be exactly the colour that line read before 5a (commit 091ec1685).
 *
 * Pinned here, value by value:
 *  1. Every changed line, with how many times it appears, the serie it reads, and the colour it read
 *     before (a named value `rgb(var(--color-x))`, whose fallback is then `var(--color-x)`, or a
 *     brand-kit hex, whose fallback is then its triplet).
 *  2. Where a line makes the colour see-through, the same opacity as before.
 *  3. No use of a serie name without a fallback, and no use that is not pinned, anywhere in the
 *     platform's code.
 *  4. The names a fallback reads are declared in the token file, and those 4b pinned still hold the
 *     colour of 4b (the hex in `hex4b`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'styles', 'fne-tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

type Pin = {
  /** The line as it reads now, without its indentation. */
  line: string;
  /** How many times the line appears in the file. */
  count: number;
  /** The serie the line reads. */
  serie: number;
  /** The colour the line read before 5a. */
  before: string;
  /** The line before 5a, for the record (where it differs from the colour alone). */
  beforeLine?: string;
  /** Two hex characters of opacity the line applies, before and after. */
  alpha?: string;
  /** The hex 4b pinned for the name the fallback reads (stray-colours.test.ts kept these until 5a). */
  hex4b?: string;
};

const PINS: Record<string, Pin[]> = {
  // Modality pie (three slices from MODALITY_COLORS) and the bars per school (Total, Completadas).
  'pages/consultor/sessions/reports.tsx': [
    { line: "presencial: 'rgb(var(--color-serie-1, var(--color-blue-500)))',", count: 1, serie: 1, before: 'rgb(var(--color-blue-500))', hex4b: '#3B82F6' },
    { line: "online: 'rgb(var(--color-serie-2, var(--color-legacy-10b981)))',", count: 1, serie: 2, before: 'rgb(var(--color-legacy-10b981))', hex4b: '#10B981' },
    { line: "hibrida: 'rgb(var(--color-serie-3, 245 158 11))',", count: 1, serie: 3, before: '#F59E0B' },
    { line: '<Bar dataKey="total" fill="rgb(var(--color-serie-1, var(--color-blue-500)))" name="Total" />', count: 1, serie: 1, before: 'rgb(var(--color-blue-500))', hex4b: '#3B82F6' },
    { line: '<Bar dataKey="completed" fill="rgb(var(--color-serie-2, var(--color-legacy-10b981)))" name="Completadas" />', count: 1, serie: 2, before: 'rgb(var(--color-legacy-10b981))', hex4b: '#10B981' },
  ],
  // The bar per area (one row per area, seven areas: the list goes round again after five).
  'pages/directivo/assessments/dashboard.tsx': [
    { line: "personalizacion: 'rgb(var(--color-serie-1, var(--color-blue-500)))',", count: 1, serie: 1, before: 'rgb(var(--color-blue-500))', hex4b: '#3b82f6' },
    { line: "aprendizaje: 'rgb(var(--color-serie-2, var(--color-legacy-10b981)))',", count: 1, serie: 2, before: 'rgb(var(--color-legacy-10b981))', hex4b: '#10b981' },
    { line: "evaluacion: 'rgb(var(--color-serie-3, 245 158 11))',", count: 1, serie: 3, before: '#f59e0b' },
    { line: "proposito: 'rgb(var(--color-serie-4, var(--color-legacy-8b5cf6)))',", count: 1, serie: 4, before: 'rgb(var(--color-legacy-8b5cf6))', hex4b: '#8b5cf6' },
    { line: "familias: 'rgb(var(--color-serie-5, var(--color-legacy-ec4899)))',", count: 1, serie: 5, before: 'rgb(var(--color-legacy-ec4899))', hex4b: '#ec4899' },
    { line: "trabajo_docente: 'rgb(var(--color-serie-1, var(--color-legacy-06b6d4)))',", count: 1, serie: 1, before: 'rgb(var(--color-legacy-06b6d4))', hex4b: '#06b6d4' },
    { line: "liderazgo: 'rgb(var(--color-serie-2, var(--color-legacy-f97316)))',", count: 1, serie: 2, before: 'rgb(var(--color-legacy-f97316))', hex4b: '#f97316' },
  ],
  // The hours ring (three slices; the same constants draw its bar and its key).
  'components/hours/SchoolHoursReport.tsx': [
    { line: "const COLOR_CONSUMED = 'rgb(var(--color-serie-1, var(--color-legacy-003a5b)))';", count: 1, serie: 1, before: 'rgb(var(--color-legacy-003a5b))', hex4b: '#003A5B' },
    { line: "const COLOR_RESERVED = 'rgb(var(--color-serie-2, var(--color-legacy-0066a4)))';", count: 1, serie: 2, before: 'rgb(var(--color-legacy-0066a4))', hex4b: '#0066A4' },
    { line: "const COLOR_AVAILABLE = 'rgb(var(--color-serie-5, var(--color-legacy-e0f0ff)))';", count: 1, serie: 5, before: 'rgb(var(--color-legacy-e0f0ff))', hex4b: '#E0F0FF' },
  ],
  // Two lines (lessons, users) and two areas (hours). FNE_COLORS in the file: primary #0a0a0a,
  // secondary #fbbf24, success legacy-10b981, info blue-500 (pinned below).
  'components/reports/AnalyticsDashboard.tsx': [
    { line: 'stroke="rgb(var(--color-serie-1, 10 10 10))"', count: 1, serie: 1, before: '#0a0a0a', beforeLine: 'stroke={FNE_COLORS.primary}' },
    { line: 'stroke="rgb(var(--color-serie-2, 251 191 36))"', count: 1, serie: 2, before: '#fbbf24', beforeLine: 'stroke={FNE_COLORS.secondary}' },
    { line: 'stroke="rgb(var(--color-serie-1, var(--color-legacy-10b981)))"', count: 1, serie: 1, before: 'rgb(var(--color-legacy-10b981))', beforeLine: 'stroke={FNE_COLORS.success}' },
    { line: "fill={withAlpha('rgb(var(--color-serie-1, var(--color-legacy-10b981)))', '30')}", count: 1, serie: 1, before: 'rgb(var(--color-legacy-10b981))', alpha: '30', beforeLine: "fill={withAlpha(FNE_COLORS.success, '30')}" },
    { line: 'stroke="rgb(var(--color-serie-2, var(--color-blue-500)))"', count: 1, serie: 2, before: 'rgb(var(--color-blue-500))', beforeLine: 'stroke={FNE_COLORS.info}' },
    { line: "fill={withAlpha('rgb(var(--color-serie-2, var(--color-blue-500)))', '30')}", count: 1, serie: 2, before: 'rgb(var(--color-blue-500))', alpha: '30', beforeLine: "fill={withAlpha(FNE_COLORS.info, '30')}" },
  ],
  // Two lines (with their dots) and two areas. FNE_COLORS: primary #0a0a0a, secondary #fbbf24.
  // The areas glued `80` onto the hex (`#0a0a0a80`); withAlpha writes the same 8-bit opacity (0.502).
  'components/reports/AnalyticsVisualization.tsx': [
    { line: 'stroke="rgb(var(--color-serie-1, 10 10 10))"', count: 2, serie: 1, before: '#0a0a0a', beforeLine: 'stroke={FNE_COLORS.primary}' },
    { line: "dot={{ fill: 'rgb(var(--color-serie-1, 10 10 10))' }}", count: 1, serie: 1, before: '#0a0a0a', beforeLine: 'dot={{ fill: FNE_COLORS.primary }}' },
    { line: 'stroke="rgb(var(--color-serie-2, 251 191 36))"', count: 2, serie: 2, before: '#fbbf24', beforeLine: 'stroke={FNE_COLORS.secondary}' },
    { line: "dot={{ fill: 'rgb(var(--color-serie-2, 251 191 36))' }}", count: 1, serie: 2, before: '#fbbf24', beforeLine: 'dot={{ fill: FNE_COLORS.secondary }}' },
    { line: "fill={withAlpha('rgb(var(--color-serie-1, 10 10 10))', '80')}", count: 1, serie: 1, before: '#0a0a0a', alpha: '80', beforeLine: 'fill={`${FNE_COLORS.primary}80`}' },
    { line: "fill={withAlpha('rgb(var(--color-serie-2, 251 191 36))', '80')}", count: 1, serie: 2, before: '#fbbf24', alpha: '80', beforeLine: 'fill={`${FNE_COLORS.secondary}80`}' },
  ],
  // Two lines (completions, enrollments).
  'components/reports/LearningPathAnalytics.tsx': [
    { line: '<Line type="monotone" dataKey="completions" stroke="rgb(var(--color-serie-1, var(--color-blue-500)))" strokeWidth={2} name="Completaciones de curso" />', count: 1, serie: 1, before: 'rgb(var(--color-blue-500))' },
    { line: '<Line type="monotone" dataKey="enrollments" stroke="rgb(var(--color-serie-2, var(--color-legacy-10b981)))" strokeWidth={2} name="Nuevas asignaciones" />', count: 1, serie: 2, before: 'rgb(var(--color-legacy-10b981))' },
  ],
};

/** What FNE_COLORS held where a pin's `beforeLine` reads it (the constants are untouched by 5a). */
const FNE_COLORS_LINES: Record<string, string[]> = {
  'components/reports/AnalyticsDashboard.tsx': ["primary: '#0a0a0a',", "secondary: '#fbbf24',", "success: 'rgb(var(--color-legacy-10b981))',", "info: 'rgb(var(--color-blue-500))',"],
  'components/reports/AnalyticsVisualization.tsx': ["primary: '#0a0a0a',", "secondary: '#fbbf24',"],
};

const triplet = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(' ');
/** The fallback that keeps `before` exactly. */
function fallbackFor(before: string): string {
  const named = /^rgb\(var\((--color-[a-z0-9-]+)\)\)$/.exec(before);
  if (named) return `var(${named[1]})`;
  if (/^#[0-9a-fA-F]{6}$/.test(before)) return triplet(before.toLowerCase());
  throw new Error(`cannot read the colour ${before}`);
}

const USE = /var\(--color-serie-(\d)(?:, ((?:var\(--[a-z0-9-]+\))|\d{1,3} \d{1,3} \d{1,3}))?\)/g;
const lines = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf8').split('\n').map((line) => line.trim());

describe('charts with several series: today\'s colour is the fallback of every serie name', () => {
  it.each(Object.keys(PINS))('%s: every changed line, with its serie and the colour it read', (file) => {
    const fileLines = lines(file);
    for (const pin of PINS[file]) {
      expect(fileLines.filter((line) => line === pin.line).length, pin.line).toBe(pin.count);
      const uses = [...pin.line.matchAll(USE)];
      expect(uses, pin.line).toHaveLength(1);
      const [, serie, fallback] = uses[0];
      expect(Number(serie), pin.line).toBe(pin.serie);
      expect(fallback, `${pin.line}: the fallback must be what the line read before (${pin.before})`).toBe(fallbackFor(pin.before));
      const alpha = /, '([0-9a-fA-F]{2})'\)\}$/.exec(pin.line)?.[1];
      expect(alpha, pin.line).toBe(pin.alpha);
    }
  });

  it('the FNE_COLORS the old lines read still hold the same colours', () => {
    for (const [file, expected] of Object.entries(FNE_COLORS_LINES)) {
      const fileLines = lines(file);
      for (const line of expected) expect(fileLines, `${file}: ${line}`).toContain(line);
    }
  });

  it('every name a fallback reads is declared once, and the ones 4b pinned still hold their colour', () => {
    for (const pins of Object.values(PINS)) {
      for (const pin of pins) {
        const named = /^rgb\(var\(--color-([a-z0-9-]+)\)\)$/.exec(pin.before);
        if (!named) continue;
        const found = [...TOKENS_CSS.matchAll(new RegExp(`(?:^|[\\s;{])--color-${named[1]}\\s*:\\s*([^;]+);`, 'g'))];
        expect(found, named[1]).toHaveLength(1);
        if (pin.hex4b) expect(found[0][1].trim().replace(/\s+/g, ' '), named[1]).toBe(triplet(pin.hex4b.toLowerCase()));
      }
    }
  });

  it('uses no serie name without a fallback, and none that is not pinned, in the platform\'s code', () => {
    const roots = ['pages', 'components', 'src', 'lib', 'utils', 'constants', 'config', 'types', 'hooks', 'contexts'];
    const found: Record<string, number> = {};
    const walk = (absolute: string): void => {
      let stats;
      try {
        stats = statSync(absolute);
      } catch {
        return;
      }
      if (stats.isDirectory()) {
        for (const name of readdirSync(absolute)) if (name !== 'node_modules' && name !== '__tests__') walk(join(absolute, name));
      } else if (/\.(tsx?|jsx?|css)$/.test(absolute)) {
        const text = readFileSync(absolute, 'utf8');
        const file = relative(REPO_ROOT, absolute).split(sep).join('/');
        for (const match of text.matchAll(/--color-serie-/g)) {
          void match;
          found[file] = (found[file] ?? 0) + 1;
        }
        for (const match of text.matchAll(USE)) expect(match[2], `${file}: ${match[0]} has no fallback`).toBeDefined();
      }
    };
    for (const root of roots) walk(join(REPO_ROOT, root));
    const pinned: Record<string, number> = {};
    for (const [file, pins] of Object.entries(PINS)) pinned[file] = pins.reduce((sum, pin) => sum + pin.count, 0);
    expect(found).toEqual(pinned);
  });

  it('the serie names exist only under the new look', () => {
    expect(TOKENS_CSS).not.toMatch(/--color-serie-/);
    const look = readFileSync(join(REPO_ROOT, 'styles', 'look-nuevo.css'), 'utf8');
    expect(look.match(/--color-serie-\d:/g)).toHaveLength(5);
  });
});
