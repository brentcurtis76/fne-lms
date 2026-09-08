// @vitest-environment node
/**
 * S1 — the auth diagnostic pages are gone, and a production build cannot bring
 * them back by accident.
 *
 * These seven pages were publicly routable in production. Between them they
 * printed Supabase configuration (including a partial anon key) to any visitor,
 * offered a form that signed in as an arbitrary account, and one of them carried
 * a real administrator's e-mail address and password as literals in the bundle.
 *
 * A deleted file is only half a fix: `pages/` is convention-routed, so anyone
 * restoring one of these filenames — or adding a same-named route under a
 * different extension, or under `src/pages/` — republishes the surface without
 * a single import to review. This test walks the routable tree and fails if any
 * of the forbidden routes resolves again.
 *
 * Deliberately route-based, not content-based: the credential itself must not
 * reappear anywhere in the repository, tests included, so nothing here asserts
 * on it. The literal-scan half of the guard is a separate CI script.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');

/** Extensions Next.js will route from `pages/`. */
const PAGE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mdx'];

/** The roots Next.js resolves `pages/` from, in precedence order. */
const PAGE_ROOTS = ['pages', join('src', 'pages')];

/**
 * Routes removed by S1. Written as route paths rather than file paths so a
 * reintroduction under any supported extension, or under `src/pages/`, is
 * caught by the same assertion.
 */
const FORBIDDEN_ROUTES = [
  '/test-auth-simple',
  '/test-auth',
  '/debug-auth',
  '/debug-auth-enhanced',
  '/test-login-flow',
  '/login-helper',
  '/auth-status',
] as const;

/** Every route the `pages/` tree currently produces, API routes included. */
function collectRoutes(): string[] {
  const routes: string[] = [];

  for (const root of PAGE_ROOTS) {
    const absoluteRoot = join(REPO_ROOT, root);
    if (!existsSync(absoluteRoot)) continue;

    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir)) {
        const absolute = join(dir, entry);
        if (statSync(absolute).isDirectory()) {
          walk(absolute, `${prefix}/${entry}`);
          continue;
        }

        const extension = PAGE_EXTENSIONS.find((ext) => entry.endsWith(ext));
        if (!extension) continue;

        const base = entry.slice(0, -extension.length);
        // `_app`, `_document`, `_error` and co-located type/test files are not routes.
        if (base.startsWith('_')) continue;
        if (/\.(test|spec|d)$/.test(base)) continue;

        routes.push(base === 'index' ? prefix || '/' : `${prefix}/${base}`);
      }
    };

    walk(absoluteRoot, '');
  }

  return routes;
}

describe('S1 — removed auth diagnostic routes', () => {
  const routes = collectRoutes();

  it('finds the routable page tree (guards the guard)', () => {
    // If this ever collapses to nothing, every assertion below passes vacuously.
    expect(routes).toContain('/login');
    expect(routes).toContain('/reset-password');
    expect(routes).toContain('/change-password');
    expect(routes.length).toBeGreaterThan(50);
  });

  it.each(FORBIDDEN_ROUTES)('%s does not resolve to a page', (forbidden) => {
    expect(routes).not.toContain(forbidden);
  });

  it('no forbidden route is reachable under any supported extension or page root', () => {
    const reintroduced = FORBIDDEN_ROUTES.filter((route) => routes.includes(route));
    expect(reintroduced).toEqual([]);
  });
});
