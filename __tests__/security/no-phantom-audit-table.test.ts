// @vitest-environment node
/**
 * S3 — nothing writes to `audit_logs` again.
 *
 * The original defect was invisible because it was well-formed: eight call
 * sites inserted a correct-looking row into `public.audit_logs`, a table that
 * has never existed in the baseline, in any migration, or in the live database.
 * PostgREST answered 42P01 every time and every call site logged the error and
 * continued, so the platform reported a complete security audit trail while
 * persisting none of it.
 *
 * The fix is only durable if the phantom name cannot come back — a copy-paste
 * from an older branch would recreate the exact same silent hole. This scans the
 * tracked source tree for the table name in a query position.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');

/** Tracked files under these roots are production code. */
const SCANNED_PATHS = ['pages', 'lib', 'components', 'utils', 'hooks', 'contexts', 'src', 'scripts'];

/**
 * Drops matches that are inside a comment.
 *
 * These scans are pattern-based, and this branch DOCUMENTS what it removed — the
 * fallback constant, the base-36 shape, `Math.random()` — in the comments right
 * above the replacements. A guard that cannot tell an explanation from a
 * reintroduction would either fail on its own documentation or have to be
 * written without any.
 */
function isCommentLine(grepLine: string): boolean {
  // `path:lineNumber:content`
  const content = grepLine.split(':').slice(2).join(':').trimStart();
  return (
    content.startsWith('//') ||
    content.startsWith('*') ||
    content.startsWith('/*') ||
    content.startsWith('--')
  );
}

function grepTracked(pattern: string, paths: string[] = SCANNED_PATHS): string[] {
  try {
    const output = execFileSync('git', ['grep', '-n', '-I', '-E', pattern, '--', ...paths], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return output.split('\n').filter(Boolean).filter((line) => !isCommentLine(line));
  } catch (error: unknown) {
    // git grep exits 1 with no output when there are no matches — the pass case.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

describe('S3 — the phantom audit_logs table', () => {
  it('the scan actually finds things (guards the guard)', () => {
    // A scan that silently matches nothing would make every assertion vacuous.
    expect(grepTracked('recordSecurityAudit\\(').length).toBeGreaterThan(5);
  });

  it('no production code queries `audit_logs`', () => {
    expect(grepTracked("from\\(\\s*['\"]audit_logs['\"]")).toEqual([]);
  });

  it('the audit writer names the real table', async () => {
    const { SECURITY_AUDIT_TABLE } = await import('../../lib/security/audit');
    expect(SECURITY_AUDIT_TABLE).toBe('security_audit_events');
  });

  it('exactly one migration creates that table', () => {
    const files = grepTracked('CREATE TABLE IF NOT EXISTS public\\.security_audit_events', [
      'supabase/migrations',
    ]).map((line) => line.split(':')[0]);
    expect([...new Set(files)]).toEqual([
      'supabase/migrations/20260818120000_security_audit_events.sql',
    ]);
  });
});

/**
 * S11 — the shared fallback password is gone, and cannot come back.
 *
 * `pages/api/admin/bulk-create-users.ts` substituted a literal constant for any
 * row whose password was missing or under eight characters. Because the parser's
 * generated passwords could never satisfy the policy (S13), that was not an edge
 * case: it was the default outcome, so a single committed password was the
 * initial credential for an entire import.
 */
describe('S11 — no hardcoded credentials in the source tree', () => {
  it('no assignment of a string literal to a password-shaped identifier', () => {
    const hits = grepTracked(
      "(finalPassword|temporaryPassword|globalPassword|defaultPassword|initialPassword)\\s*=\\s*['\"][^'\"]{4,}['\"]"
    );
    expect(hits).toEqual([]);
  });

  it('no string-literal password in an auth or user-creation call', () => {
    const hits = grepTracked("password:\\s*['\"][^'\"]{4,}['\"]");
    expect(hits).toEqual([]);
  });

  it('the specific fallback constant is absent from the whole repository', () => {
    // Assembled at runtime rather than written out, so this file does not match
    // its own scan — and so the removed constant is not reintroduced as a
    // literal in a test, which is still a literal in the repository.
    const needle = ['Fne', 'Password', '123!'].join('');
    const hits = grepTracked(needle, ['.']);
    expect(hits).toEqual([]);
  });

  it('no production code imports the removed in-process credential store', () => {
    expect(grepTracked('temporaryPasswordStore')).toEqual([]);
    expect(grepTracked('retrieve-import-passwords')).toEqual([]);
  });
});

/**
 * S6 — `Math.random()` is not a credential source.
 */
describe('S6 — no Math.random() near credential generation', () => {
  it('no credential surface uses Math.random()', () => {
    // Scoped to the modules that mint or handle credentials. `Math.random()` is
    // fine for a DOM key or a client-side id, and a repo-wide ban would be
    // noise; what must never come back is a credential drawn from it.
    const hits = grepTracked('Math\\.random', [
      'lib/auth',
      'lib/security',
      'utils/passwordGenerator.ts',
      'utils/bulkUserParser.ts',
      'components/PasswordResetModal.tsx',
      'pages/api/admin/bulk-create-users.ts',
      'pages/api/admin/create-user.ts',
      'pages/api/admin/reset-password.ts',
      'pages/api/admin/tractor-signups',
      'pages/api/auth',
      'pages/change-password.tsx',
      'pages/reset-password.tsx',
    ]);
    expect(hits).toEqual([]);
  });
});
