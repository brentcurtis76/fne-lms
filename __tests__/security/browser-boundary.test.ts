// @vitest-environment node
/**
 * The browser/server security boundary — and, more importantly, the negative
 * controls that make it evidence.
 *
 * The scan this replaces walked six directories, matched two file extensions and
 * ran regexes over the text. A reviewer found three holes: it never opened
 * `lib/`, never opened `.js`/`.jsx`, and matched text rather than syntax. So the
 * replacement is only worth having if it can be SHOWN to catch each forbidden
 * shape — in a `lib` module, in a `.js` file, and past prose that mentions the
 * same words.
 *
 * Every case below runs the real checker over a real file on disk. The fixtures
 * live under `__tests__/security/__boundary_fixtures__/` and are excluded from
 * the repository-wide run by the checker's own test/tooling filter, which is
 * asserted here too — a fixture that leaked into the real scan would fail CI for
 * the wrong reason.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  run,
  scanFile,
  computeBrowserGraph,
  RAW_AUTH_PRIMITIVE_MODULES,
  LOW_LEVEL_IMPORT_SURFACES,
  SERVER_ONLY_MODULES,
} from '../../scripts/ci/check-browser-boundaries.mjs';

const FIXTURES = join(process.cwd(), '__tests__', 'security', '__boundary_fixtures__');

function rules(file: string, browser: boolean): string[] {
  return scanFile(join(FIXTURES, file), { browser }).map((f: any) => f.rule);
}

// ---------------------------------------------------------------------------
// The scan is not silently empty, and it covers what the review said it must.
// ---------------------------------------------------------------------------

describe('the scan reaches the code it claims to', () => {
  const result = run();
  const modules: string[] = result.browserModules;

  it('finds a real repository to scan', () => {
    expect(result.stats.filesScanned).toBeGreaterThan(500);
    expect(result.stats.browserModules).toBeGreaterThan(200);
  });

  it('includes lib/ modules — the first hole the reviewer found', () => {
    expect(modules.filter((f) => f.startsWith('lib/')).length).toBeGreaterThan(50);
    expect(modules).toContain('lib/supabase-wrapper.ts');
    expect(modules).toContain('lib/auth/password-policy.ts');
  });

  it('includes .js and .jsx modules — the second hole', () => {
    expect(modules).toContain('utils/storage.js');
    expect(modules).toContain('lib/realtimeNotifications.js');
  });

  it('includes browser modules nothing imports yet — the blind spot a pure import graph has', () => {
    // Both are named in the review as browser Storage/Realtime paths, and
    // neither is referenced anywhere in the application today.
    expect(modules).toContain('lib/supabaseEnhanced.ts');
    expect(modules).toContain('contexts/AvatarContext.tsx');
  });

  it('includes the pages the authentication work touches', () => {
    for (const page of [
      'pages/reset-password.tsx',
      'pages/change-password.tsx',
      'pages/login.tsx',
    ]) {
      expect(modules).toContain(page);
    }
  });

  it('does NOT classify the server-only modules as browser code', () => {
    for (const server of [
      'lib/auth/password-completion.ts',
      'lib/auth/admin-password-reset.ts',
      'lib/auth/recovery-proof.ts',
      'lib/auth/recovery-grant.ts',
      'lib/auth/recovery-crypto.ts',
      'lib/auth/recovery-request-queue.ts',
      'lib/auth/admin-user-maintenance.ts',
      'lib/auth/account-provisioning.ts',
      'lib/security/audit.ts',
      'lib/email/invitations.ts',
      'lib/email/outbox.ts',
    ]) {
      expect(modules).not.toContain(server);
    }
  });

  it('excludes the synthetic fixtures from the repository-wide run', () => {
    expect(modules.some((f) => f.includes('__boundary_fixtures__'))).toBe(false);
    expect(result.findings.some((f: any) => f.file.includes('__boundary_fixtures__'))).toBe(
      false
    );
  });

  it('the repository itself is clean', () => {
    expect(result.findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NEGATIVE CONTROLS — each forbidden shape, injected deliberately.
// ---------------------------------------------------------------------------

describe('browser rules: each violation is caught', () => {
  it('a browser page calling auth.updateUser({ password })', () => {
    expect(rules('browser-updates-password.tsx', true)).toContain('BROWSER_PASSWORD_WRITE');
  });

  it('a browser module writing profiles.must_change_password', () => {
    expect(rules('browser-writes-flag.ts', true)).toContain('BROWSER_PROTECTED_COLUMN_WRITE');
  });

  it('a browser module touching the security audit table, by table name AND by writer', () => {
    const found = rules('browser-writes-audit.ts', true);
    expect(found).toContain('BROWSER_AUDIT_TABLE');
    expect(found).toContain('BROWSER_AUDIT_WRITER');
  });

  it('a .js browser module writing the phantom audit_logs table', () => {
    // Deliberately a .js file: the previous scan matched only .ts/.tsx.
    expect(rules('browser-writes-phantom-audit.js', true)).toContain(
      'BROWSER_PHANTOM_AUDIT_TABLE'
    );
  });

  it('a .jsx browser module importing a server-only module', () => {
    expect(rules('browser-imports-server-module.jsx', true)).toContain(
      'BROWSER_IMPORTS_SERVER_MODULE'
    );
  });
});

describe('server rules: the trusted boundary is closed from the other side too', () => {
  it('a server module writing a password outside the boundary', () => {
    expect(rules('server-writes-password.ts', false)).toContain(
      'RAW_AUTH_PRIMITIVE_OUTSIDE_MODULE'
    );
  });

  it('a server module provisioning an account outside the primitive module', () => {
    expect(rules('server-provisions-account.ts', false)).toContain(
      'RAW_AUTH_PRIMITIVE_OUTSIDE_MODULE'
    );
  });

  it('does not depend on seeing an inline password property', () => {
    expect(rules('server-writes-variable-payload.ts', false)).toContain(
      'RAW_AUTH_PRIMITIVE_OUTSIDE_MODULE'
    );
    expect(rules('server-writes-spread-payload.ts', false)).toContain(
      'RAW_AUTH_PRIMITIVE_OUTSIDE_MODULE'
    );
  });

  it('catches taking an alias to a raw primitive', () => {
    expect(rules('server-aliases-raw-primitive.ts', false)).toContain(
      'RAW_AUTH_PRIMITIVE_OUTSIDE_MODULE'
    );
  });

  it('rejects aliased, namespace, and default imports of low-level modules', () => {
    expect(rules('server-aliases-low-level-import.ts', false)).toContain(
      'LOW_LEVEL_IMPORT_SURFACE'
    );
    expect(rules('server-namespace-low-level-import.ts', false)).toContain(
      'LOW_LEVEL_IMPORT_SHAPE'
    );
    expect(rules('server-default-low-level-import.ts', false)).toContain(
      'LOW_LEVEL_IMPORT_SHAPE'
    );
  });

  it('rejects require, dynamic import, and barrel re-export forms', () => {
    expect(rules('server-requires-low-level-module.ts', false)).toContain(
      'DYNAMIC_LOW_LEVEL_IMPORT'
    );
    expect(rules('server-dynamic-imports-low-level-module.ts', false)).toContain(
      'DYNAMIC_LOW_LEVEL_IMPORT'
    );
    expect(rules('server-reexports-low-level-module.ts', false)).toContain(
      'LOW_LEVEL_REEXPORT'
    );
  });

  it('the same password write is ALSO caught when the file is browser code', () => {
    expect(rules('server-writes-password.ts', true)).toContain('BROWSER_RAW_AUTH_PRIMITIVE');
  });
});

// ---------------------------------------------------------------------------
// POSITIVE CONTROL — the thing a regex gets wrong.
// ---------------------------------------------------------------------------

describe('parsing, not matching', () => {
  it('a clean browser module that MENTIONS the forbidden shapes in prose and strings is not flagged', () => {
    expect(rules('clean-browser-module.tsx', true)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The allow-lists are the security argument, so they are pinned.
// ---------------------------------------------------------------------------

describe('the raw primitive boundary', () => {
  it('permits raw primitives in exactly three fixed-purpose modules, with no route entry', () => {
    expect([...RAW_AUTH_PRIMITIVE_MODULES.keys()].sort()).toEqual([
      'lib/auth/account-provisioning.ts',
      'lib/auth/admin-user-maintenance.ts',
      'lib/auth/password-completion.ts',
    ]);
  });

  it('contains a written justification for every raw primitive module', () => {
    for (const [path, why] of RAW_AUTH_PRIMITIVE_MODULES) {
      expect(path.startsWith('pages/'), path).toBe(false);
      expect(typeof why, path).toBe('string');
      expect(why.length, path).toBeGreaterThan(40);
    }
  });

  it('pins the only exports importable from the low-level wrapper modules', () => {
    expect([...LOW_LEVEL_IMPORT_SURFACES.keys()].sort()).toEqual([
      'lib/auth/account-provisioning',
      'lib/auth/admin-user-maintenance',
      'lib/auth/password-completion',
    ]);
    expect([...LOW_LEVEL_IMPORT_SURFACES.get('lib/auth/account-provisioning')!]).toEqual([
      'provisionAuthAccount',
    ]);
    expect([...LOW_LEVEL_IMPORT_SURFACES.get('lib/auth/password-completion')!].sort()).toEqual([
      'COMPLETION_MESSAGES',
      'Reauthenticator',
      'completeAdministrativeReset',
      'completeForcedPasswordChange',
      'completeRecoveryPasswordChange',
      'completeVoluntaryPasswordChange',
      'isCompletionFailure',
    ]);
  });

  it('names the server-only modules the browser may not import', () => {
    expect(SERVER_ONLY_MODULES).toContain('lib/auth/password-completion');
    expect(SERVER_ONLY_MODULES).toContain('lib/security/audit');
    expect(SERVER_ONLY_MODULES).toContain('lib/email/invitations');
  });
});

// ---------------------------------------------------------------------------
// The graph itself.
// ---------------------------------------------------------------------------

describe('the browser graph', () => {
  it('has entrypoints and resolves relative imports transitively', () => {
    const { entries, modules } = computeBrowserGraph();
    expect(entries.length).toBeGreaterThan(100);
    // A module only reachable through a chain of relative imports.
    expect([...modules].some((f: string) => f.includes('lib/auth/password-policy'))).toBe(true);
  });
});
