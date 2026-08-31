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
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, unlinkSync, symlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  scanText,
  scanRepository,
  trackedFiles,
  trackedEntries,
  classifyJwt,
  decodeJwtPayload,
  fingerprint,
  isReference,
  ALLOWLIST,
} from '../../scripts/ci/check-committed-secrets.mjs';

const REPO_ROOT = resolve(__dirname, '../..');

// --- a real throwaway git repository, so scanRepository is exercised for real ---

const tempRepos: string[] = [];

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'genera-secret-guard-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  tempRepos.push(dir);
  return dir;
}

/** Write a file and stage it, so `git ls-files` reports it as tracked. */
function addTracked(dir: string, rel: string, content: string) {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  // -f so a global core.excludesFile cannot make this test environment-dependent.
  execFileSync('git', ['add', '-f', '--', rel], { cwd: dir });
  return abs;
}

afterAll(() => {
  for (const dir of tempRepos) rmSync(dir, { recursive: true, force: true });
});

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
// File selection. Round-1 finding 1: the guard omitted .py, and the repository
// has six tracked Python scripts. Fixed by inverting to a binary denylist, so
// these tests pin the INVERSION, not just Python.
// ---------------------------------------------------------------------------

describe('file selection', () => {
  it('scans a tracked .py file, and catches a service_role key inside it', () => {
    const dir = tempRepo();
    addTracked(dir, 'scripts/seed.py', `SUPABASE_KEY = "${SERVICE_ROLE_JWT}"\n`);

    const { files, findings } = scanRepository(dir);

    expect(files).toContain('scripts/seed.py');
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('SERVICE_ROLE_JWT');
    expect(findings[0].file).toBe('scripts/seed.py');
    expect(JSON.stringify(findings)).not.toContain(SERVICE_ROLE_JWT);
  });

  it('scans the other formats the allow-list used to miss', () => {
    const cases: Array<[string, string]> = [
      ['public/index.html', 'html — publicly served, the original incident shape'],
      ['lib/supabaseClient', 'extensionless, in the directory a key would live in'],
      ['pages/x.tsx.broken', 'a page kept under a non-code extension'],
      ['lib/__snapshots__/a.snap', 'a snapshot can capture whatever a test rendered'],
      ['docs/evidence.tap', 'tap evidence'],
      ['docs/ledger.csv', 'csv ledger'],
      ['styles/app.css', 'css'],
      ['scripts/tool.rb', 'a language nobody listed'],
      ['Dockerfile', 'no extension at all'],
      ['.npmrc', 'a dotfile — must not be read as an extension'],
    ];

    for (const [rel, why] of cases) {
      const dir = tempRepo();
      addTracked(dir, rel, `KEY = "${SERVICE_ROLE_JWT}"\n`);
      const { files, findings } = scanRepository(dir);
      expect(files, `${rel} (${why}) should be selected`).toContain(rel);
      expect(findings.map((f) => f.rule), `${rel} (${why})`).toEqual(['SERVICE_ROLE_JWT']);
    }
  });

  it('the repository\'s six tracked Python files are in scope and scan cleanly', () => {
    const selected = trackedFiles(REPO_ROOT).filter((f: string) => f.endsWith('.py'));
    expect(selected).toEqual([
      'scripts/generate-migration-v2.py',
      'scripts/generate-migration.py',
      'scripts/generate-qa-guide.py',
      'scripts/rewrite-qa-comprehensive.py',
      'scripts/spikes/ner/index.py',
      'scripts/spikes/ner/measure_ner.py',
    ]);

    for (const file of selected) {
      expect(scanText(readFileSync(resolve(REPO_ROOT, file), 'utf8'), file), file).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Round-1 finding 2: an unreadable selected file must fail closed, not vanish.
// ---------------------------------------------------------------------------

describe('unreadable files fail closed', () => {
  it('reports a finding when a tracked file cannot be read', () => {
    const dir = tempRepo();
    const abs = addTracked(dir, 'scripts/vanished.py', 'print("hello")\n');
    // Staged (so git ls-files still lists it) but absent from disk. Deterministic
    // everywhere — unlike chmod, which behaves differently when tests run as root.
    unlinkSync(abs);

    const { files, findings } = scanRepository(dir);

    expect(files).toContain('scripts/vanished.py');
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('UNREADABLE_FILE');
    expect(findings[0].file).toBe('scripts/vanished.py');
    expect(findings[0].message).toContain('ENOENT');
    expect(findings[0].message).toContain('failing closed');
  });

  it('is a real change: the old behaviour would have reported success', () => {
    const dir = tempRepo();
    const abs = addTracked(dir, 'a.py', 'print(1)\n');
    addTracked(dir, 'b.py', 'print(2)\n');
    unlinkSync(abs);

    const { findings } = scanRepository(dir);

    // The point of the finding: previously this scan returned zero findings over
    // a silently smaller file set, and the run reported OK.
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f: { rule: string }) => f.rule === 'UNREADABLE_FILE')).toBe(true);
  });

  it('discloses only the errno code — never contents, message text, or a value', () => {
    const dir = tempRepo();
    const abs = addTracked(dir, 'secret.py', `KEY = "${SERVICE_ROLE_JWT}"\n`);
    unlinkSync(abs);

    const [finding] = scanRepository(dir).findings;
    const serialised = JSON.stringify(finding);

    expect(finding.rule).toBe('UNREADABLE_FILE');
    expect(serialised).not.toContain(SERVICE_ROLE_JWT);
    // The absolute path would leak the operator's directory layout into CI logs.
    expect(serialised).not.toContain(dir);
    expect(finding.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(Object.keys(finding).sort()).toEqual(['file', 'fingerprint', 'line', 'message', 'rule']);
  });

  it('a readable tree still reports nothing', () => {
    const dir = tempRepo();
    addTracked(dir, 'ok.py', 'print("no credential here")\n');
    expect(scanRepository(dir).findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Round 2. Scope is the Git index, not the filename and not the bytes.
//
// Round 1's binary denylist was defeated by this repository's own contents:
// eight tracked .png/.ico paths are plain ASCII. These tests pin the rule that
// replaced it — every tracked entry is inspected, dispatched on its index mode.
// ---------------------------------------------------------------------------

/** A real PNG: signature + IHDR-ish bytes, with `payload` embedded contiguously. */
function pngBytes(payload = ''): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // \x89PNG\r\n\x1a\n
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]), // IHDR
    Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd, 0x00]), // arbitrary binary
    Buffer.from(payload, 'latin1'),
    Buffer.from([0x00, 0xde, 0xad, 0xbe, 0xef]),
  ]);
}

function addTrackedBytes(dir: string, rel: string, bytes: Buffer) {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  execFileSync('git', ['add', '-f', '--', rel], { cwd: dir });
  return abs;
}

function addTrackedSymlink(dir: string, rel: string, target: string) {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  symlinkSync(target, abs);
  execFileSync('git', ['add', '-f', '--', rel], { cwd: dir });
  return abs;
}

describe('round 2: every tracked entry is inspected', () => {
  it('finds a synthetic service_role value regardless of filename', () => {
    const cases: Array<[string, string]> = [
      ['scripts/seed.py', 'python'],
      ['public/logo.png', 'a .png that is really plain text — the round-1 bypass'],
      ['lib/supabaseClient', 'extensionless'],
      ['.npmrc', 'a dotfile'],
      ['docs/notes.qqq', 'an extension nobody has ever listed'],
      ['a.tar.gz', 'a double extension that looks like an archive but is text'],
    ];

    for (const [rel, why] of cases) {
      const dir = tempRepo();
      addTracked(dir, rel, `KEY = "${SERVICE_ROLE_JWT}"\n`);
      const { findings } = scanRepository(dir);
      expect(findings.map((f: { rule: string }) => f.rule), `${rel} (${why})`).toEqual(['SERVICE_ROLE_JWT']);
      expect(JSON.stringify(findings)).not.toContain(SERVICE_ROLE_JWT);
    }
  });

  it('finds a contiguous ASCII value inside REAL binary PNG bytes', () => {
    const dir = tempRepo();
    addTrackedBytes(dir, 'public/real.png', pngBytes(SERVICE_ROLE_JWT));

    const { entries, findings } = scanRepository(dir);

    expect(entries.find((e: { path: string }) => e.path === 'public/real.png')?.mode).toBe('100644');
    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['SERVICE_ROLE_JWT']);
    expect(findings[0].file).toBe('public/real.png');
  });

  it('inspects a credential-free binary asset and reports nothing — inspected, not skipped', () => {
    const dir = tempRepo();
    addTrackedBytes(dir, 'public/clean.png', pngBytes());

    const { files, findings } = scanRepository(dir);

    expect(files).toContain('public/clean.png'); // in scope
    expect(findings).toEqual([]); // and clean
  });

  it('scans a symlink as its link TEXT and never follows it', () => {
    const dir = tempRepo();
    // The target is deliberately UNTRACKED and full of a synthetic credential.
    // If the guard followed the link, this uncommitted content would become a
    // finding — which is exactly the isolation being asserted against.
    writeFileSync(join(dir, 'untracked-target.txt'), `KEY = "${SERVICE_ROLE_JWT}"\n`, 'utf8');
    addTrackedSymlink(dir, 'link-to-secret', 'untracked-target.txt');

    const { entries, findings } = scanRepository(dir);

    expect(entries.find((e: { path: string }) => e.path === 'link-to-secret')?.mode).toBe('120000');
    expect(findings).toEqual([]);
  });

  it('scans the link text itself, so a credential IN THE TARGET NAME is caught', () => {
    const dir = tempRepo();
    addTrackedSymlink(dir, 'odd-link', `./${SERVICE_ROLE_JWT}`);

    const { findings } = scanRepository(dir);

    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['SERVICE_ROLE_JWT']);
    expect(findings[0].file).toBe('odd-link');
  });

  it('handles a BROKEN symlink from its link text, without following it', () => {
    const dir = tempRepo();
    addTrackedSymlink(dir, 'broken-link', '../nowhere/does-not-exist');

    const { entries, findings } = scanRepository(dir);

    expect(entries.find((e: { path: string }) => e.path === 'broken-link')?.mode).toBe('120000');
    // A dangling target is irrelevant: the committed content is the target text.
    expect(findings).toEqual([]);
  });

  it('fails closed on a gitlink/submodule without reading it', () => {
    const dir = tempRepo();
    addTracked(dir, 'keep.txt', 'nothing here\n');
    // A gitlink records a submodule COMMIT id. Git rejects an all-zero sha
    // ("cache entry has null sha1"), but the object need not exist locally —
    // which is the normal case for an uninitialised submodule, and exactly the
    // situation the guard must refuse to follow.
    const submoduleCommit = 'abcdef0123456789abcdef0123456789abcdef01';
    execFileSync(
      'git',
      ['update-index', '--add', '--cacheinfo', `160000,${submoduleCommit},vendor/sub`],
      { cwd: dir }
    );

    const { entries, findings } = scanRepository(dir);

    expect(entries.find((e: { path: string }) => e.path === 'vendor/sub')?.mode).toBe('160000');
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('UNSUPPORTED_TRACKED_ENTRY');
    expect(findings[0].file).toBe('vendor/sub');
    expect(findings[0].message).toContain('160000');
    expect(findings[0].fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(findings[0])).not.toContain(dir);
  });

  it('still fails closed on a missing tracked regular file', () => {
    const dir = tempRepo();
    const abs = addTracked(dir, 'scripts/vanished.png', 'plain text\n');
    unlinkSync(abs);

    const { findings } = scanRepository(dir);

    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('UNREADABLE_FILE');
    expect(findings[0].message).toContain('ENOENT');
    expect(JSON.stringify(findings[0])).not.toContain(dir);
  });

  it('records a mode for every entry in the real repository, and knows every one', () => {
    const modes = new Set(trackedEntries(REPO_ROOT).map((e: { mode: string }) => e.mode));
    for (const mode of modes) expect(['100644', '100755', '120000'], `unexpected mode ${mode}`).toContain(mode);
  });

  it('the eight text-disguised image files are in scope and scan clean', () => {
    const disguised = [
      'lib/propuestas/assets/logos/fne-logo.png',
      'public/children-collaboration-steam.png',
      'public/favicon-32x32.png',
      'public/favicon-fne.ico',
      'public/favicon.ico',
      'public/images/course-placeholder.png',
      'public/images/fne-logo.png',
      'public/students-steam-collaboration.png',
    ];
    const tracked = new Set(trackedFiles(REPO_ROOT));
    for (const file of disguised) {
      expect(tracked.has(file), `${file} must be in scope`).toBe(true);
      expect(scanText(readFileSync(resolve(REPO_ROOT, file)).toString('latin1'), file), file).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// The allowlist contract must survive every refactor of file selection.
// ---------------------------------------------------------------------------

describe('allowlist contract is unchanged from the previous head', () => {
  const PREVIOUS_HEAD = '8117dfc773a6c4e252769228ec54349fd95b0122';

  function allowlistBlock(source: string): string {
    const start = source.indexOf('export const ALLOWLIST');
    const end = source.indexOf(']);', start);
    expect(start, 'ALLOWLIST block not found').toBeGreaterThan(-1);
    return source.slice(start, end + 3);
  }

  it('the five entries are byte-identical to 8117dfc7', () => {
    const previous = execFileSync(
      'git',
      ['show', `${PREVIOUS_HEAD}:scripts/ci/check-committed-secrets.mjs`],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    );
    const current = readFileSync(resolve(REPO_ROOT, 'scripts/ci/check-committed-secrets.mjs'), 'utf8');

    expect(allowlistBlock(current)).toBe(allowlistBlock(previous));
    expect(ALLOWLIST.size).toBe(5);
  });

  it('service_role still has no allowlist path', () => {
    const fp = fingerprint(SERVICE_ROLE_JWT);
    ALLOWLIST.set(fp, 'round-2 attempt to allowlist a service_role key');
    try {
      expect(rules(`const k = '${SERVICE_ROLE_JWT}';`)).toEqual(['SERVICE_ROLE_JWT']);
    } finally {
      ALLOWLIST.delete(fp);
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
