// @vitest-environment node
/**
 * Negative controls for the committed-secret guard.
 *
 * A guard that has never been observed to FAIL proves nothing. The incident this
 * guard exists for was a real service-role JWT sitting in orphaned helper
 * scripts, so every rule below is exercised against input built for this suite,
 * and every false-positive exception is proved twice: once showing the real
 * tracked file passes, and once with its allowlist entry removed, showing the
 * same file then fails. That second half is what makes the exception evidence
 * rather than an assumption.
 *
 * No credential literal appears in this file. Every JWT is assembled at runtime
 * from a JSON payload, which is also why this file does not trip the guard it
 * tests — a property asserted explicitly at the end.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  scanText,
  scanRepository,
  classifyJwt,
  decodeJwtPayload,
  fingerprint,
  isReference,
  ALLOWLIST,
} from '../../scripts/ci/check-committed-secrets.mjs';

const REPO_ROOT = resolve(__dirname, '../..');

// --- helpers: build credential-shaped input without embedding a credential ---

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** A structurally valid JWT with a caller-chosen payload. */
function makeJwt(payload: Record<string, unknown>): string {
  return [b64url({ alg: 'HS256', typ: 'JWT' }), b64url(payload), 'c2lnbmF0dXJlLXN5bnRoZXRpYw'].join('.');
}

/** JWT-shaped, but the payload segment is not decodable JSON. */
function makeUndecodableJwt(): string {
  return [b64url({ alg: 'HS256', typ: 'JWT' }), 'zzzzzzzzzzzzzzzz', 'c2ln'].join('.');
}

const SERVICE_ROLE_JWT = makeJwt({ iss: 'supabase', ref: 'synthetic', role: 'service_role' });
const ANON_JWT = makeJwt({ iss: 'supabase', ref: 'synthetic', role: 'anon' });
const SECRET_KEY_LITERAL = 'sb_' + 'secret_' + 'synthetic0000000000000000';
const PUBLISHABLE_LITERAL = 'sb_' + 'publishable_' + 'synthetic0000000000000000';

// Passwords and password-bearing URLs are assembled the same way as the JWTs
// above, for the same reason: written out whole they would be real matches in a
// tracked file, and this suite must not be the thing that trips its own guard.
// The `does not flag this test file` case at the bottom is what enforces that.
const PW = 'S3cret' + 'Value9';
const SHORT_PW = 'Z' + 'q7';
const remoteUrl = (scheme: string, password: string, host = 'db.example.com:5432') =>
  `${scheme}://admin:${password}@${host}/app`;

const rules = (text: string) => scanText(text, 'synthetic.ts').map((f) => f.rule);

// Restore any allowlist entry a test removes, even on failure.
const removed = new Map<string, string>();
afterEach(() => {
  for (const [fp, reason] of removed) ALLOWLIST.set(fp, reason);
  removed.clear();
});
function withoutAllowlistEntry(fp: string) {
  const reason = ALLOWLIST.get(fp);
  expect(reason, `expected ${fp} to be an allowlist entry`).toBeTypeOf('string');
  removed.set(fp, reason as string);
  ALLOWLIST.delete(fp);
}

// ---------------------------------------------------------------------------
// Rule 1 — service_role JWTs. Terminal, never allowlistable.
// ---------------------------------------------------------------------------

describe('rule: service_role JWT', () => {
  it('fails on a JWT whose decoded role is service_role', () => {
    expect(rules(`const k = '${SERVICE_ROLE_JWT}';`)).toEqual(['SERVICE_ROLE_JWT']);
  });

  it('classifies the role from the decoded payload, not from surrounding text', () => {
    expect(classifyJwt(SERVICE_ROLE_JWT)).toBe('SERVICE_ROLE_JWT');
    // No "service_role" substring anywhere in the line; the verdict comes from base64.
    const line = `const harmlessName = '${SERVICE_ROLE_JWT}';`;
    expect(line).not.toContain('service_role');
    expect(rules(line)).toEqual(['SERVICE_ROLE_JWT']);
  });

  it('is NOT allowlistable: adding its fingerprint does not suppress the finding', () => {
    const fp = fingerprint(SERVICE_ROLE_JWT);
    ALLOWLIST.set(fp, 'deliberate test attempt to allowlist a service_role key');
    removed.set(fp, ''); // ensure cleanup path runs
    try {
      expect(rules(`const k = '${SERVICE_ROLE_JWT}';`)).toEqual(['SERVICE_ROLE_JWT']);
    } finally {
      ALLOWLIST.delete(fp);
      removed.delete(fp);
    }
  });

  it('detects a service_role JWT regardless of quoting or embedding', () => {
    expect(rules(`x = "${SERVICE_ROLE_JWT}"`)).toEqual(['SERVICE_ROLE_JWT']);
    expect(rules(`curl -H "apikey: ${SERVICE_ROLE_JWT}" https://example.test`)).toEqual(['SERVICE_ROLE_JWT']);
    expect(rules(`# ${SERVICE_ROLE_JWT}`)).toEqual(['SERVICE_ROLE_JWT']);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — sb_secret_ literals.
// ---------------------------------------------------------------------------

describe('rule: sb_secret_ literals', () => {
  it('fails on a non-allowlisted sb_secret_ literal', () => {
    expect(rules(`const K = '${SECRET_KEY_LITERAL}';`)).toEqual(['SUPABASE_SECRET_KEY']);
  });

  it('passes once that exact fingerprint is allowlisted, and fails again when removed', () => {
    const fp = fingerprint(SECRET_KEY_LITERAL);
    ALLOWLIST.set(fp, 'synthetic fixture for this test');
    expect(rules(`const K = '${SECRET_KEY_LITERAL}';`)).toEqual([]);
    ALLOWLIST.delete(fp);
    expect(rules(`const K = '${SECRET_KEY_LITERAL}';`)).toEqual(['SUPABASE_SECRET_KEY']);
  });

  it('allows sb_publishable_ keys, which are public by design', () => {
    expect(rules(`const K = '${PUBLISHABLE_LITERAL}';`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — password-bearing Postgres URLs.
// ---------------------------------------------------------------------------

describe('rule: password-bearing Postgres URLs', () => {
  it('fails on postgres:// with a real-looking password on a remote host', () => {
    expect(rules(remoteUrl('postgres', PW))).toEqual(['DATABASE_URL_PASSWORD']);
  });

  it('fails on the postgresql:// spelling too', () => {
    expect(rules(remoteUrl('postgresql', PW))).toEqual(['DATABASE_URL_PASSWORD']);
  });

  it('allows the local Supabase default that `supabase status` prints', () => {
    expect(rules('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toEqual([]);
    expect(rules('postgres://postgres:postgres@localhost:54322/postgres')).toEqual([]);
  });

  it('allows a URL whose password is a reference rather than a value', () => {
    expect(rules('postgres://user:${{ secrets.DB_PASSWORD }}@db.example.com/app')).toEqual([]);
    expect(rules('postgres://user:$DB_PASSWORD@db.example.com/app')).toEqual([]);
  });

  it('allows a URL with no password component', () => {
    expect(rules('postgres://user@db.example.com:5432/app')).toEqual([]);
  });

  it('still fails on a remote host even when the password looks short', () => {
    expect(rules(remoteUrl('postgres', SHORT_PW, 'prod-db.example.com'))).toEqual(['DATABASE_URL_PASSWORD']);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — database password environment assignments.
// ---------------------------------------------------------------------------

describe('rule: database password assignments', () => {
  it('fails on each recognised database password variable', () => {
    for (const name of [
      'PGPASSWORD',
      'POSTGRES_PASSWORD',
      'DB_PASSWORD',
      'DATABASE_PASSWORD',
      'SUPABASE_DB_PASSWORD',
      'POSTGRESQL_PASSWORD',
    ]) {
      expect(rules(`${name}=${PW}`), name).toEqual(['DATABASE_PASSWORD_ASSIGNMENT']);
    }
  });

  it('fails on the quoted and YAML-style spellings', () => {
    expect(rules(`DB_PASSWORD="${PW}"`)).toEqual(['DATABASE_PASSWORD_ASSIGNMENT']);
    expect(rules(`  POSTGRES_PASSWORD: ${PW}`)).toEqual(['DATABASE_PASSWORD_ASSIGNMENT']);
  });

  it('allows references to a secret store', () => {
    expect(rules('POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD }}')).toEqual([]);
    expect(rules('PGPASSWORD=$SUPABASE_DB_PASSWORD')).toEqual([]);
    expect(rules('DB_PASSWORD=process.env.DB_PASSWORD')).toEqual([]);
  });

  it('allows documentation placeholders', () => {
    expect(rules('DB_PASSWORD=<your-password>')).toEqual([]);
    expect(rules('DB_PASSWORD=changeme')).toEqual([]);
    expect(rules('POSTGRES_PASSWORD=postgres')).toEqual([]);
    expect(rules('DB_PASSWORD=xxxxx')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — fail closed on unclassifiable credential-shaped input.
// ---------------------------------------------------------------------------

describe('rule: fail closed on unclassifiable input', () => {
  it('fails when a JWT-shaped literal cannot be decoded', () => {
    const token = makeUndecodableJwt();
    expect(decodeJwtPayload(token.split('.')[1])).toBeNull();
    expect(rules(`const t = '${token}';`)).toEqual(['UNCLASSIFIABLE_CREDENTIAL']);
  });

  it('fails on a decodable JWT that is not a recognised safe fixture', () => {
    expect(rules(`const t = '${ANON_JWT}';`)).toEqual(['UNREVIEWED_JWT']);
  });

  it('treats a payload that decodes to a non-object as unclassifiable', () => {
    const token = [b64url({ alg: 'HS256' }), b64url(['not', 'an', 'object']), 'c2ln'].join('.');
    expect(rules(`const t = '${token}';`)).toEqual(['UNCLASSIFIABLE_CREDENTIAL']);
  });
});

// ---------------------------------------------------------------------------
// The guard never discloses what it matched.
// ---------------------------------------------------------------------------

describe('non-disclosure', () => {
  it('never places the matched value in a finding', () => {
    const findings = scanText(`const k = '${SERVICE_ROLE_JWT}';`, 'synthetic.ts');
    expect(findings).toHaveLength(1);
    const serialised = JSON.stringify(findings);
    expect(serialised).not.toContain(SERVICE_ROLE_JWT);
    // Not even a distinctive slice of it.
    expect(serialised).not.toContain(SERVICE_ROLE_JWT.slice(10, 40));
  });

  it('reports only file, line, category and a truncated fingerprint', () => {
    const [finding] = scanText(`const k = '${SERVICE_ROLE_JWT}';`, 'some/file.ts');
    expect(Object.keys(finding).sort()).toEqual(['file', 'fingerprint', 'line', 'message', 'rule']);
    expect(finding.file).toBe('some/file.ts');
    expect(finding.line).toBe(1);
    expect(finding.fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it('fingerprints are stable, value-specific, and not the value', () => {
    expect(fingerprint(SERVICE_ROLE_JWT)).toBe(fingerprint(SERVICE_ROLE_JWT));
    expect(fingerprint(SERVICE_ROLE_JWT)).not.toBe(fingerprint(ANON_JWT));
    expect(fingerprint(SERVICE_ROLE_JWT)).not.toContain(SERVICE_ROLE_JWT.slice(0, 12));
  });

  it('reports the correct line number in a multi-line file', () => {
    const text = ['// header', '', `const k = '${SERVICE_ROLE_JWT}';`].join('\n');
    expect(scanText(text, 'f.ts')[0].line).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Reference detection, used by rules 3 and 4.
// ---------------------------------------------------------------------------

describe('reference detection', () => {
  it('recognises the forms this repository actually uses', () => {
    for (const ref of ['${{ secrets.X }}', '${X}', '$X', 'process.env.X', 'secrets.X', '<redacted>', 'xxxx']) {
      expect(isReference(ref), ref).toBe(true);
    }
  });

  it('does not treat an ordinary literal as a reference', () => {
    for (const value of ['hunter2XYZ', 'S3cretValue9', 'abc123']) {
      expect(isReference(value), value).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Every allowlist exception, proved against the real tracked file, and proved
// non-vacuous by removing the entry and watching the same file fail.
// ---------------------------------------------------------------------------

describe('allowlisted synthetic fixtures', () => {
  const CASES: Array<{ fp: string; file: string; what: string }> = [
    { fp: 'bf1725a8f98b', file: 'lib/supabase-test.ts', what: 'published Supabase localhost demo anon key' },
    { fp: 'db71d1a6b661', file: '__tests__/scripts/zoom-spike-redactor.test.ts', what: 'fabricated Zoom JWT fixture' },
    { fp: '256286fd4bd0', file: '__tests__/lib/zoom/webhook-store.test.ts', what: 'synthetic sb_secret_ placeholder' },
    { fp: '6a580c6113e6', file: '__tests__/lib/auth/recovery-grant.test.ts', what: 'synthetic session-token negative control' },
    { fp: '9e80e5552996', file: '__tests__/lib/security/audit.test.ts', what: 'JWT-shaped audit redaction fixture' },
  ];

  for (const { fp, file, what } of CASES) {
    it(`${file} passes because of the ${what}, and fails without it`, () => {
      const text = readFileSync(resolve(REPO_ROOT, file), 'utf8');

      expect(scanText(text, file), `${file} should pass with the allowlist intact`).toEqual([]);

      withoutAllowlistEntry(fp);
      const withoutEntry = scanText(text, file);
      expect(withoutEntry.length, `${file} should fail once ${fp} is removed`).toBeGreaterThan(0);
      expect(withoutEntry.every((f) => f.fingerprint === fp)).toBe(true);
    });
  }

  it('every allowlist entry carries a written reason', () => {
    for (const [fp, reason] of ALLOWLIST) {
      expect(fp, 'fingerprint format').toMatch(/^[0-9a-f]{12}$/);
      expect(String(reason).length, `reason for ${fp}`).toBeGreaterThan(40);
    }
  });
});

// ---------------------------------------------------------------------------
// The live tree. This is the regression half of the guard.
// ---------------------------------------------------------------------------

describe('the tracked tree', () => {
  it('contains no committed credential', () => {
    const { files, findings } = scanRepository(REPO_ROOT);
    expect(files.length).toBeGreaterThan(500);
    expect(findings).toEqual([]);
  });

  it('does not flag this test file, which builds every fixture at runtime', () => {
    const self = readFileSync(resolve(REPO_ROOT, '__tests__/security/committed-secrets-guard.test.ts'), 'utf8');
    expect(scanText(self, 'self.ts')).toEqual([]);
  });

  it('does not flag the guard script itself', () => {
    const guard = readFileSync(resolve(REPO_ROOT, 'scripts/ci/check-committed-secrets.mjs'), 'utf8');
    expect(scanText(guard, 'guard.mjs')).toEqual([]);
  });
});
