// @vitest-environment node
/**
 * F2 — the initialisation race, closed at its source.
 *
 * supabase-js defaults `detectSessionInUrl` to true. The shared browser client
 * is constructed in `_app`'s module scope, so on any page load it
 * asynchronously looked for `#access_token=…` (or `?code=…`), consumed it, and
 * REWROTE the address bar. `/reset-password` needs that same material to decide
 * whether the page load carried recovery proof — and whether the page's effect
 * or the client's pass ran first was timing. When the client won, a perfectly
 * valid recovery link produced an "invalid link" screen.
 *
 * Narrowing the window was not the fix; removing the competitor was. Nothing
 * else in this application uses an implicit-flow URL, so the option can simply
 * be off — and this suite fails if that stops being true.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

describe('the shared browser client', () => {
  const source = readFileSync(join(ROOT, 'lib', 'supabase-wrapper.ts'), 'utf8');

  it('turns implicit URL detection OFF', () => {
    expect(source).toContain('detectSessionInUrl: false');
  });

  it('passes the option on BOTH construction paths', () => {
    // Server-side and client-side singleton. A missing one is a client that
    // still races on some renders.
    const constructions = source.match(/createPagesBrowserClient\(/g) ?? [];
    expect(constructions).toHaveLength(2);
    const withOptions = source.match(/createPagesBrowserClient\(BROWSER_AUTH_OPTIONS/g) ?? [];
    expect(withOptions).toHaveLength(2);
  });
});

describe('nothing depends on implicit URL detection', () => {
  const EXCLUDED = new Set(['node_modules', '.next', '__tests__']);

  function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      if (EXCLUDED.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  }

  const FILES = ['pages', 'components', 'lib', 'contexts', 'hooks', 'utils', 'src'].flatMap((d) =>
    walk(join(ROOT, d))
  );

  it('finds real source to scan', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('has no OAuth sign-in, which is the other thing that would need it', () => {
    // If one appears, this decision has to be revisited: an OAuth redirect
    // lands as a URL that something must consume.
    const offenders = FILES.filter((f) =>
      readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .includes('signInWithOAuth')
    ).map((f) => f.slice(ROOT.length + 1));

    expect(offenders).toEqual([]);
  });

  it('the recovery page consumes the URL explicitly instead', () => {
    const page = readFileSync(join(ROOT, 'pages', 'reset-password.tsx'), 'utf8');
    expect(page).toContain('readRecoveryMaterial(window.location.search, window.location.hash)');
    expect(page).toContain('supabase.auth.setSession(');
    expect(page).toContain('supabase.auth.verifyOtp(');
    expect(page).toContain('supabase.auth.exchangeCodeForSession(');
  });
});
