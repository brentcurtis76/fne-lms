// @vitest-environment node
/**
 * F3 — a structural guard: the browser does not write passwords or enforcement
 * state.
 *
 * The unit suites prove that the pages currently post to the trusted endpoints.
 * They cannot prove that a future edit will not quietly reintroduce
 * `supabase.auth.updateUser({ password })` — which is exactly how this defect
 * survived a round of review: `/change-password` called it first and only
 * reached the audited endpoint on a 422 that never came.
 *
 * So this walks the source instead. It is deliberately crude and deliberately
 * loud: a legitimate new call site has to come here and say why.
 *
 * ==========================================================================
 * THIS IS NO LONGER THE PRIMARY CONTROL. IT IS DEFENCE IN DEPTH.
 * ==========================================================================
 *
 * An independent review found three holes in this file, all real: it never opens
 * `lib/`, despite browser pages importing lib modules constantly; it matches only
 * `.ts`/`.tsx`, so `utils/storage.js` and `lib/realtimeNotifications.js` are
 * invisible to it; and a regex over text is defeated by whitespace, an alias, or
 * a member expression built at runtime.
 *
 * `scripts/ci/check-browser-boundaries.mjs` is the replacement: it computes what
 * "browser" means from the import graph plus a default-deny rule, parses every
 * file with the TypeScript compiler's own parser, covers `.js`/`.jsx`, and
 * polices the SERVER side as well. Its negative controls are in
 * `__tests__/security/browser-boundary.test.ts`.
 *
 * This file stays because two crude checks that agree are worth more than one,
 * and because it fails fast without loading a compiler.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/** Everything that ships to a browser. API routes are server code and excluded. */
const BROWSER_ROOTS = ['pages', 'components', 'contexts', 'hooks', 'utils', 'src'];
const EXCLUDED_DIRS = new Set(['node_modules', '.next', '__tests__', 'api']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const BROWSER_FILES = BROWSER_ROOTS.flatMap((root) => walk(join(ROOT, root)));

/** Strip block and line comments so the prose in this repository is not a hit. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function offenders(pattern: RegExp): string[] {
  return BROWSER_FILES.filter((file) => pattern.test(code(readFileSync(file, 'utf8')))).map((f) =>
    f.slice(ROOT.length + 1)
  );
}

describe('the browser writes no passwords', () => {
  it('finds real browser source to scan (the walk is not silently empty)', () => {
    expect(BROWSER_FILES.length).toBeGreaterThan(100);
    expect(BROWSER_FILES.some((f) => f.endsWith('pages/reset-password.tsx'))).toBe(true);
    expect(BROWSER_FILES.some((f) => f.endsWith('pages/change-password.tsx'))).toBe(true);
  });

  it('no browser file calls auth.updateUser with a password', () => {
    // `/reset-password` and `/change-password` both did. Password writes now go
    // to /api/auth/recovery/complete and /api/auth/force-password-change, which
    // check the policy server-side, clear the flag through the database, and
    // write an audit row.
    expect(offenders(/updateUser\s*\(\s*\{[^}]*\bpassword\b/s)).toEqual([]);
  });

  it('no browser file writes profiles.must_change_password', () => {
    // The database trigger refuses this anyway (20260819120000), but a call
    // site that tries is a call site that believes it worked.
    expect(offenders(/must_change_password\s*:/)).toEqual([]);
  });

  it('no browser file inserts into the security audit table', () => {
    // `authenticated` holds SELECT only, so such a write can only fail — and an
    // audit row a browser CAN write is an audit row a browser can forge.
    expect(offenders(/from\(\s*['"`]security_audit_events['"`]\s*\)/)).toEqual([]);
    expect(offenders(/\brecordSecurityAudit\s*\(/)).toEqual([]);
  });

  it('no browser file writes to the phantom audit_logs table either', () => {
    expect(offenders(/from\(\s*['"`]audit_logs['"`]\s*\)/)).toEqual([]);
  });
});
