// @vitest-environment node
/**
 * The toasts with today's look are exactly what they were; with the new look (redesign 5a) they
 * take values declared only under `[data-look="nuevo"]` in `styles/look-nuevo.css`.
 *
 * How: every value that differs reads `var(--toast-<name>, <today's value>)`. With today's look the
 * names do not exist, so the browser takes the fallback. This pins that each fallback is the literal
 * that was there before 5a (commit 091ec1685), that nothing else moved, and that the look file
 * declares each name under the look and nowhere else.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toastStyles, toasterConfig } from '../../constants/toastStyles';

const REPO_ROOT = join(__dirname, '..', '..');
const LOOK_CSS = readFileSync(join(REPO_ROOT, 'styles', 'look-nuevo.css'), 'utf8');
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'styles', 'fne-tokens.css'), 'utf8');
const APP = readFileSync(join(REPO_ROOT, 'pages', '_app.tsx'), 'utf8');

/** What a browser computes with today's look: every `var(--toast-…, x)` becomes x. */
const today = (value: string): string => value.replace(/var\(--toast-[a-z-]+, ((?:[^()]|\([^()]*\))*)\)/g, '$1');

/** The base style before 5a, character for character. */
const BASE_BEFORE = {
  background: '#ffffff',
  color: '#1f1f1f',
  padding: '16px',
  borderRadius: '8px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  maxWidth: '420px',
  fontSize: '14px',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
};
/** Added in 5a for the new look's line; `none` is what a toast had without them (their initial value). */
const ADDED_LINES = { borderTop: 'none', borderRight: 'none', borderBottom: 'none' };

const EDGE_BEFORE = {
  success: '4px solid #fbbf24',
  error: '4px solid rgb(var(--color-legacy-ef4044))',
  info: '4px solid #0a0a0a',
  loading: '4px solid #0a0a0a',
};
const ICON_BEFORE = {
  success: 'rgb(var(--color-legacy-10b981))',
  error: 'rgb(var(--color-legacy-ef4044))',
  info: '#0a0a0a',
  loading: '#0a0a0a',
};

const resolved = (style: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(style).map(([key, value]) => [key, typeof value === 'string' ? today(value) : value]));

describe('toasts with today\'s look', () => {
  it('the base style resolves to exactly the values it had', () => {
    expect(resolved(toasterConfig.style)).toEqual({ ...BASE_BEFORE, ...ADDED_LINES });
  });

  it.each(Object.keys(EDGE_BEFORE) as Array<keyof typeof EDGE_BEFORE>)('a %s toast keeps its edge, icon and timing', (type) => {
    const options = toastStyles[type];
    const { borderLeft, ...rest } = options.style;
    expect(today(borderLeft)).toBe(EDGE_BEFORE[type]);
    expect(resolved(rest)).toEqual({ ...BASE_BEFORE, ...ADDED_LINES });
    expect(options.iconTheme).toEqual({ primary: ICON_BEFORE[type], secondary: '#ffffff' });
  });

  it('keeps the durations and the per-type wiring', () => {
    expect([toastStyles.success.duration, toastStyles.error.duration, toastStyles.info.duration, toasterConfig.duration]).toEqual([3000, 5000, 3000, 4000]);
    expect(toasterConfig.blank).toBe(toastStyles.info);
    expect(toasterConfig.custom).toBe(toastStyles.info);
  });

  it('the stack sits where it did: 24 px from the bottom and the right', () => {
    expect(APP).toContain("bottom: 'var(--toast-stack-bottom, 24px)',");
    expect(APP).toContain("right: 'var(--toast-stack-right, 24px)',");
  });
});

describe('toasts with the new look', () => {
  const names = new Set<string>();
  for (const value of [...Object.values(toasterConfig.style), ...Object.values(toastStyles).map((o) => o.style.borderLeft)]) {
    for (const match of String(value).matchAll(/var\((--toast-[a-z-]+),/g)) names.add(match[1]);
  }
  for (const match of APP.matchAll(/var\((--toast-[a-z-]+),/g)) names.add(match[1]);

  it('every name the toasts read is declared under the look, and not with today\'s look', () => {
    expect([...names].sort()).toEqual([
      '--toast-edge-success', '--toast-font-size', '--toast-line', '--toast-radius', '--toast-shadow',
      '--toast-stack-bottom', '--toast-stack-right', '--toast-text',
    ]);
    for (const name of names) {
      expect(LOOK_CSS, name).toContain(`${name}:`);
      expect(TOKENS_CSS.includes(`${name}:`), name).toBe(false);
    }
  });

  it('the values are the approved toast', () => {
    const value = (name: string) => new RegExp(`${name}: ([^;]+);`).exec(LOOK_CSS)?.[1];
    expect(value('--toast-text')).toBe('rgb(10 10 10)');
    expect(value('--toast-font-size')).toBe('13px');
    expect(value('--toast-radius')).toBe('4px');
    expect(value('--toast-line')).toBe('1px solid rgb(10 10 10 / 0.12)');
    expect(value('--toast-shadow')).toBe('0 1px 2px rgb(10 10 10 / 0.06), 0 10px 24px -14px rgb(10 10 10 / 0.3)');
    expect(value('--toast-edge-success')).toBe('rgb(10 107 82)');
    expect(value('--toast-stack-bottom')).toBe('80px');
    expect(value('--toast-stack-right')).toBe('20px');
    // Error and info edges and every icon read names that the look already gives the right colour:
    // legacy-ef4044 is 179 38 30, legacy-10b981 is 10 107 82, info and loading are black.
    expect(LOOK_CSS).toMatch(/--color-legacy-ef4044: 179 38 30;/);
    expect(LOOK_CSS).toMatch(/--color-legacy-10b981: 10 107 82;/);
  });
});
