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
import { createHash } from 'node:crypto';
import {
  scanText,
  scanRepository,
  trackedFiles,
  trackedEntries,
  parseBatchOutput,
  readIndexBlobs,
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

describe('the index-only boundary (round 4 — supersedes the round-1 working-tree premise)', () => {
  // Rounds 0–3 treated a missing working-tree copy as a fail-closed finding.
  // Round 4 removed every filesystem read: the guard scans committed content
  // (the index) and nothing else, so working-tree state — present, absent,
  // divergent, or hostile — is simply not consulted. The three round-1 tests
  // that pinned the old premise are retired; their history is preserved in the
  // review request. What must hold now:

  it('a deleted working-tree copy neither hides the staged secret nor adds a finding', () => {
    const dir = tempRepo();
    const abs = addTracked(dir, 'secret.py', `KEY = "${SERVICE_ROLE_JWT}"\n`);
    unlinkSync(abs);

    const { files, findings } = scanRepository(dir);

    expect(files).toContain('secret.py');
    // The staged secret is reported from the index — and ONLY it. No
    // UNREADABLE_FILE for the missing copy: the working tree is out of scope.
    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['SERVICE_ROLE_JWT']);
    expect(JSON.stringify(findings)).not.toContain(SERVICE_ROLE_JWT);
    expect(JSON.stringify(findings)).not.toContain(dir);
  });

  it('a deleted working-tree copy of a SAFE staged file reports nothing at all', () => {
    const dir = tempRepo();
    const abs = addTracked(dir, 'a.py', 'print(1)\n');
    unlinkSync(abs);
    expect(scanRepository(dir).findings).toEqual([]);
  });

  it('a secret present ONLY in an unstaged working-tree copy is outside the boundary', () => {
    // This is the committed-content contract, stated as a test: the guard
    // protects what can reach `main`. An unstaged edit cannot — it enters
    // scope the moment `git add` stages it (proved by the staged-secret tests).
    const dir = tempRepo();
    const abs = addTracked(dir, 'lib/config.ts', 'const KEY = process.env.KEY;\n');
    writeFileSync(abs, `const KEY = "${SERVICE_ROLE_JWT}";\n`, 'utf8'); // never staged

    expect(scanRepository(dir).findings).toEqual([]);
  });

  it('a regular indexed entry replaced on disk by a symlink to an OUTSIDE secret is never followed', () => {
    // The round-3 reviewer's exploit: with a working-tree read in the guard,
    // this planted symlink made readFileSync open a file OUTSIDE the
    // repository. With no filesystem read there is nothing to follow — the
    // outside value must not appear anywhere in the result.
    const outside = mkdtempSync(join(tmpdir(), 'genera-outside-'));
    tempRepos.push(outside); // cleaned up with the rest
    writeFileSync(join(outside, 'victim.txt'), `KEY = "${SERVICE_ROLE_JWT}"\n`, 'utf8');

    const dir = tempRepo();
    const abs = addTracked(dir, 'safe.txt', 'nothing here\n');
    unlinkSync(abs);
    symlinkSync(join(outside, 'victim.txt'), abs); // absolute outside target

    const alsoRelative = addTracked(dir, 'safe2.txt', 'still nothing\n');
    unlinkSync(alsoRelative);
    symlinkSync(`../../${'x'.repeat(3)}/nowhere-victim`, alsoRelative); // ../../ escape shape

    const { files, findings } = scanRepository(dir);

    expect(files.sort()).toEqual(['safe.txt', 'safe2.txt']);
    expect(findings).toEqual([]);
    expect(JSON.stringify(findings)).not.toContain(SERVICE_ROLE_JWT);
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

  it('a staged secret in a .png-named path is found from the index even with the file deleted on disk', () => {
    // Round 4: no working-tree read, so deletion neither hides the staged
    // content nor produces a finding of its own. (Until round 3 this test
    // asserted a fail-closed UNREADABLE_FILE for the missing copy — that
    // premise is retired with the index-only boundary; see the review request.)
    const dir = tempRepo();
    const abs = addTracked(dir, 'scripts/vanished.png', `KEY = "${SERVICE_ROLE_JWT}"\n`);
    unlinkSync(abs);

    const { findings } = scanRepository(dir);

    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['SERVICE_ROLE_JWT']);
    expect(findings[0].file).toBe('scripts/vanished.png');
    expect(JSON.stringify(findings)).not.toContain(dir);
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
// Round 3 (updated in round 4). The content scanned is the indexed blob.
//
// The round-2 reviewer staged a secret, overwrote the working-tree copy with
// safe text, and the guard reported clean — it enumerated from the index but
// read from disk. Round 3 made the indexed blob authoritative; round 4 removed
// the working-tree read entirely (its review showed a planted symlink made
// that read escape the repository). These tests pin what holds throughout:
// staged content is always found, and unresolved merge stages fail closed
// instead of being collapsed to one side.
// ---------------------------------------------------------------------------

describe('round 3: the indexed blob is authoritative', () => {
  it('finds a STAGED secret hidden behind a clean working-tree copy (the round-2 reviewer bypass)', () => {
    const dir = tempRepo();
    const abs = addTracked(dir, 'lib/config.ts', `const KEY = "${SERVICE_ROLE_JWT}";\n`);
    // Overwrite the working tree WITHOUT updating the index.
    writeFileSync(abs, 'const KEY = process.env.KEY;\n', 'utf8');

    const { findings } = scanRepository(dir);

    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['SERVICE_ROLE_JWT']);
    expect(findings[0].file).toBe('lib/config.ts');
    expect(JSON.stringify(findings)).not.toContain(SERVICE_ROLE_JWT);
  });

  it('an unstaged working-tree divergence is out of scope until staged — then in scope', () => {
    // Round 4 flipped this test: until round 3 the guard also scanned the
    // working tree and this case yielded a finding. Index-only means it does
    // not — and staging the same content makes it a finding again, which is
    // the boundary working as stated.
    const dir = tempRepo();
    const abs = addTracked(dir, 'lib/config.ts', 'const KEY = process.env.KEY;\n');
    writeFileSync(abs, `const KEY = "${SERVICE_ROLE_JWT}";\n`, 'utf8'); // not staged
    expect(scanRepository(dir).findings).toEqual([]);

    execFileSync('git', ['add', '-f', '--', 'lib/config.ts'], { cwd: dir }); // now staged
    expect(scanRepository(dir).findings.map((f: { rule: string }) => f.rule)).toEqual(['SERVICE_ROLE_JWT']);
  });

  it('a staged secret yields exactly one finding, whatever the working tree looks like', () => {
    // Round 4: there is no working-tree scan to duplicate or dedupe against —
    // one staged secret, one finding, with the on-disk copy identical,
    // divergent, or gone.
    const dir = tempRepo();
    addTracked(dir, 'a.ts', `const KEY = "${SERVICE_ROLE_JWT}";\n`);
    expect(scanRepository(dir).findings).toHaveLength(1);

    const dir2 = tempRepo();
    const abs = addTracked(dir2, 'b.ts', `const KEY = "${SERVICE_ROLE_JWT}"; // staged\n`);
    writeFileSync(abs, `const KEY = "${SERVICE_ROLE_JWT}"; // on disk\n`, 'utf8');
    expect(scanRepository(dir2).findings).toHaveLength(1);
  });

  it('finds a STAGED symlink secret hidden behind a retargeted working-tree link', () => {
    const dir = tempRepo();
    const abs = addTrackedSymlink(dir, 'odd-link', `./${SERVICE_ROLE_JWT}`);
    unlinkSync(abs);
    symlinkSync('safe-target.txt', abs); // retargeted WITHOUT re-adding

    const { findings } = scanRepository(dir);

    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['SERVICE_ROLE_JWT']);
    expect(findings[0].file).toBe('odd-link');
  });

  it('fails closed on unresolved merge stages without choosing or scanning a side', () => {
    const dir = tempRepo();
    const blob = (content: string) =>
      execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: content })
        .toString()
        .trim();
    const base = blob('base\n');
    const ours = blob(`KEY = "${SERVICE_ROLE_JWT}"\n`); // a secret on ONE side
    const theirs = blob('theirs\n');
    // Three DIFFERENT modes, so the finding provably carries each pair rather
    // than one mode repeated.
    execFileSync('git', ['update-index', '--index-info'], {
      cwd: dir,
      input:
        `100644 ${base} 1\tconflict.txt\n` +
        `100755 ${ours} 2\tconflict.txt\n` +
        `120000 ${theirs} 3\tconflict.txt\n`,
    });

    // No stage is hidden from enumeration…
    const records = trackedEntries(dir).filter((e: { path: string }) => e.path === 'conflict.txt');
    expect(records.map((e: { stage: string; mode: string }) => `${e.stage}:${e.mode}`)).toEqual([
      '1:100644',
      '2:100755',
      '3:120000',
    ]);

    // …and the scan fails closed as ONE finding naming every exact stage:mode
    // pair, scanning no side.
    const { findings } = scanRepository(dir);
    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['UNRESOLVED_INDEX_ENTRY']);
    expect(findings[0].file).toBe('conflict.txt');
    for (const pair of ['stage 1 mode 100644', 'stage 2 mode 100755', 'stage 3 mode 120000']) {
      expect(findings[0].message).toContain(pair);
    }
    expect(findings[0].fingerprint).toMatch(/^[0-9a-f]{12}$/);
    const serialised = JSON.stringify(findings);
    expect(serialised).not.toContain(SERVICE_ROLE_JWT);
    expect(serialised).not.toContain(dir);
  });

  it('fails closed on a stage-0 record MIXED with a nonzero stage — git plumbing accepts the mixture', () => {
    // `update-index --index-info` will happily hold stage 0 alongside stage 2
    // for one path, which is why the rule is "any nonzero stage blocks the
    // path", not "conflicted paths have no stage 0". The round-3 comment
    // claiming the mixture cannot exist was wrong; the handling was already
    // safe, and this pins it.
    const dir = tempRepo();
    const blob = (content: string) =>
      execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: content })
        .toString()
        .trim();
    const zero = blob('resolved-looking\n');
    const two = blob(`KEY = "${SERVICE_ROLE_JWT}"\n`);
    execFileSync('git', ['update-index', '--index-info'], {
      cwd: dir,
      input: `100644 ${zero} 0\tmix.txt\n100755 ${two} 2\tmix.txt\n`,
    });

    const records = trackedEntries(dir).filter((e: { path: string }) => e.path === 'mix.txt');
    expect(records.map((e: { stage: string; mode: string }) => `${e.stage}:${e.mode}`)).toEqual([
      '0:100644',
      '2:100755',
    ]);

    const { findings } = scanRepository(dir);
    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['UNRESOLVED_INDEX_ENTRY']);
    expect(findings[0].file).toBe('mix.txt');
    for (const pair of ['stage 0 mode 100644', 'stage 2 mode 100755']) {
      expect(findings[0].message).toContain(pair);
    }
    const serialised = JSON.stringify(findings);
    expect(serialised).not.toContain(SERVICE_ROLE_JWT);
    expect(serialised).not.toContain(dir);
  });

  it('fails closed when a stage-0 entry names an object the store cannot produce', () => {
    const dir = tempRepo();
    execFileSync(
      'git',
      ['update-index', '--add', '--cacheinfo', `100644,${'deadbeef'.repeat(5)},ghost.txt`],
      { cwd: dir }
    );
    writeFileSync(join(dir, 'ghost.txt'), 'harmless on disk\n', 'utf8');

    const { findings } = scanRepository(dir);

    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['UNREADABLE_FILE']);
    expect(findings[0].message).toContain('missing-object');
    expect(JSON.stringify(findings)).not.toContain(dir);
  });

  it('parses hostile path names NUL-safely: spaces, quotes, non-ASCII, tabs, newlines', () => {
    const dir = tempRepo();
    const names = ["we ird 'na\"me ñ.txt", 'tab\there.txt', 'line\nbreak.txt'];
    for (const name of names) addTracked(dir, name, `KEY = "${SERVICE_ROLE_JWT}"\n`);

    const { files, findings } = scanRepository(dir);

    for (const name of names) expect(files, name).toContain(name);
    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(
      names.map(() => 'SERVICE_ROLE_JWT')
    );
    expect(findings.map((f: { file: string }) => f.file).sort()).toEqual([...names].sort());
  });
});

// ---------------------------------------------------------------------------
// Round 4. Strict `git cat-file --batch` framing.
//
// The round-3 parser accepted a short body, a wrong terminator, and any object
// type — which let a 100644 index entry pointing at a TREE scan its raw tree
// bytes as if they were file content and pass with zero findings. These tests
// pin the strict parser: every acceptance condition, every failure category.
// ---------------------------------------------------------------------------

describe('round 4: strict batch framing', () => {
  const OID_A = 'a'.repeat(40);
  const OID_B = 'b'.repeat(40);

  /** Build a well-formed --batch record for a blob. */
  function record(oid: string, type: string, body: Buffer): Buffer {
    return Buffer.concat([Buffer.from(`${oid} ${type} ${body.length}\n`, 'utf8'), body, Buffer.from('\n')]);
  }

  it('accepts a correctly framed BINARY blob, byte for byte', () => {
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0a, 0x00, 0xff, 0x0a, 0x41]); // LFs and NULs inside
    const out = parseBatchOutput(record(OID_A, 'blob', body), [OID_A]);
    const entry = out.get(OID_A)!;
    expect(entry.code).toBeNull();
    expect(Buffer.compare(entry.bytes!, body)).toBe(0);
  });

  it('parses several objects in sequence and stays framed across binary bodies', () => {
    const b1 = Buffer.from('first\n', 'utf8');
    const b2 = Buffer.from([0x00, 0x0a, 0x00]);
    const out = parseBatchOutput(Buffer.concat([record(OID_A, 'blob', b1), record(OID_B, 'blob', b2)]), [OID_A, OID_B]);
    expect(Buffer.compare(out.get(OID_A)!.bytes!, b1)).toBe(0);
    expect(Buffer.compare(out.get(OID_B)!.bytes!, b2)).toBe(0);
  });

  it('reports `missing` as missing-object without desynchronizing later objects', () => {
    const b2 = Buffer.from('after-missing\n', 'utf8');
    const out = parseBatchOutput(
      Buffer.concat([Buffer.from(`${OID_A} missing\n`, 'utf8'), record(OID_B, 'blob', b2)]),
      [OID_A, OID_B]
    );
    expect(out.get(OID_A)).toEqual({ bytes: null, code: 'missing-object' });
    expect(Buffer.compare(out.get(OID_B)!.bytes!, b2)).toBe(0);
  });

  it('fails EVERYTHING closed on a truncated body', () => {
    const whole = record(OID_A, 'blob', Buffer.from('0123456789', 'utf8'));
    const truncated = whole.subarray(0, whole.length - 4);
    const out = parseBatchOutput(truncated, [OID_A]);
    expect(out.get(OID_A)).toEqual({ bytes: null, code: 'malformed-batch' });
  });

  it('fails EVERYTHING closed when the terminating LF is wrong or absent', () => {
    const body = Buffer.from('0123', 'utf8');
    const bad = Buffer.concat([Buffer.from(`${OID_A} blob 4\n`, 'utf8'), body, Buffer.from('X')]);
    expect(parseBatchOutput(bad, [OID_A]).get(OID_A)).toEqual({ bytes: null, code: 'malformed-batch' });
    const missingLf = Buffer.concat([Buffer.from(`${OID_A} blob 4\n`, 'utf8'), body]);
    expect(parseBatchOutput(missingLf, [OID_A]).get(OID_A)).toEqual({ bytes: null, code: 'malformed-batch' });
  });

  it('a non-blob type is framed past but fails closed as not-a-blob, keeping later objects parseable', () => {
    const treeish = Buffer.from([0x31, 0x30, 0x30, 0x36, 0x34, 0x34, 0x20, 0x00]); // raw tree-ish bytes
    const b2 = Buffer.from('later\n', 'utf8');
    const out = parseBatchOutput(Buffer.concat([record(OID_A, 'tree', treeish), record(OID_B, 'blob', b2)]), [OID_A, OID_B]);
    expect(out.get(OID_A)).toEqual({ bytes: null, code: 'not-a-blob' });
    expect(Buffer.compare(out.get(OID_B)!.bytes!, b2)).toBe(0);
  });

  it('fails EVERYTHING closed when a returned oid is not the one requested at that position', () => {
    const out = parseBatchOutput(record(OID_B, 'blob', Buffer.from('x', 'utf8')), [OID_A]);
    expect(out.get(OID_A)).toEqual({ bytes: null, code: 'malformed-batch' });
  });

  it('fails EVERYTHING closed on trailing unparsed bytes — retroactively', () => {
    const good = record(OID_A, 'blob', Buffer.from('fine\n', 'utf8'));
    const out = parseBatchOutput(Buffer.concat([good, Buffer.from('junk')]), [OID_A]);
    // The earlier "good" object is NOT trusted once the frame is shown broken.
    expect(out.get(OID_A)).toEqual({ bytes: null, code: 'malformed-batch' });
  });

  it('fails EVERYTHING closed on a structurally invalid header', () => {
    const out = parseBatchOutput(Buffer.from('total garbage with no shape\n', 'utf8'), [OID_A]);
    expect(out.get(OID_A)).toEqual({ bytes: null, code: 'malformed-batch' });
    const badSize = Buffer.from(`${OID_A} blob -5\n\n`, 'utf8');
    expect(parseBatchOutput(badSize, [OID_A]).get(OID_A)).toEqual({ bytes: null, code: 'malformed-batch' });
  });

  it('readIndexBlobs collapses duplicate oid requests into one deterministic mapping', () => {
    const dir = tempRepo();
    const oid = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: 'dup-content\n' })
      .toString()
      .trim();
    const out = readIndexBlobs(dir, [oid, oid, oid]);
    expect(out.size).toBe(1);
    expect(out.get(oid)!.bytes!.toString('utf8')).toBe('dup-content\n');
  });

  it('readIndexBlobs against real git: missing object and real tree object both fail closed', () => {
    const dir = tempRepo();
    addTracked(dir, 'x.txt', 'x\n');
    const treeOid = execFileSync('git', ['write-tree'], { cwd: dir }).toString().trim();
    const ghost = 'deadbeef'.repeat(5);
    const out = readIndexBlobs(dir, [treeOid, ghost]);
    expect(out.get(treeOid)).toEqual({ bytes: null, code: 'not-a-blob' });
    expect(out.get(ghost)).toEqual({ bytes: null, code: 'missing-object' });
  });

  it('END TO END — the reviewer\'s malformed index: mode 100644 pointing at a TREE fails closed, never zero findings', () => {
    const dir = tempRepo();
    addTracked(dir, 'x.txt', 'x\n');
    const treeOid = execFileSync('git', ['write-tree'], { cwd: dir }).toString().trim();
    execFileSync('git', ['rm', '--cached', '-q', 'x.txt'], { cwd: dir });
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${treeOid},fake.txt`], { cwd: dir });

    const { findings } = scanRepository(dir);

    expect(findings.map((f: { rule: string }) => f.rule)).toEqual(['UNREADABLE_FILE']);
    expect(findings[0].file).toBe('fake.txt');
    expect(findings[0].message).toContain('not-a-blob');
    expect(JSON.stringify(findings)).not.toContain(dir);
  });
});

// ---------------------------------------------------------------------------
// The allowlist contract must survive every refactor of file selection.
// ---------------------------------------------------------------------------

describe('allowlist contract (self-contained)', () => {
  // Until round 5 this describe proved the five entries byte-identical to the
  // reviewed branch heads by running `git show <old-sha>:<guard>`. That made a
  // UNIT test depend on branch-local Git history — and hosted CI checks out at
  // depth 1, where those commit objects do not exist, so PR #66's Gate 2 failed
  // deterministically on `git show 8117dfc7...` while the guard itself found
  // nothing. The contract is therefore asserted self-containedly: the ALLOWLIST
  // must contain EXACTLY the five independently reviewed fingerprints — the
  // same five the `allowlisted synthetic fixtures` describe proves against the
  // real tracked files, pass AND fail-when-removed. Any added, removed or
  // altered fingerprint changes this set and fails here; any weakening of what
  // an entry permits fails there. Nothing depends on history being fetchable.
  const REVIEWED_FINGERPRINTS = [
    '256286fd4bd0', // synthetic sb_secret_ placeholder (Zoom store suites)
    '6a580c6113e6', // fabricated session-token negative control (recovery-grant)
    '9e80e5552996', // JWT-shaped audit redaction fixture (audit suite)
    'bf1725a8f98b', // published Supabase localhost demo anon key (supabase-test)
    'db71d1a6b661', // fabricated Zoom JWT redaction fixture (spike redactor)
  ];

  it('contains exactly the five independently reviewed fingerprints', () => {
    expect([...ALLOWLIST.keys()].sort()).toEqual(REVIEWED_FINGERPRINTS);
    expect(ALLOWLIST.size).toBe(5);
  });

  /**
   * Deterministic, INJECTIVE canonicalization of allowlist entries: copy the
   * [fingerprint, reason] pairs, sort by fingerprint with the explicit ASCII
   * comparator, and JSON.stringify the sorted pairs. JSON string escaping and
   * array boundaries guarantee different entry assignments produce different
   * bytes — unlike round 6's "<fp>\n<reason>\n" concatenation, where a reason
   * containing a newline-delimited fingerprint-looking line could shift text
   * across the entry boundary and collide (regression test below).
   */
  function canonicalAllowlist(entries: Iterable<[string, string]>): string {
    return JSON.stringify([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  it('the exact fingerprint-and-reason contract matches the reviewed digest', () => {
    // Full SHA-256 over the injective JSON canonicalization above. This pins
    // the exact MEANINGFUL allowlist contract — which values are permitted,
    // and the recorded WHY — without consulting Git history, so it holds on a
    // depth-1 CI clone. Any added, removed or altered fingerprint OR any
    // reworded reason changes this digest.
    //
    // EXPECTED was recomputed from the guard whose ALLOWLIST is byte-identical
    // to the approved head 31a9f10b. To recompute after a REVIEWED change:
    //   node --input-type=module -e "import { ALLOWLIST } from './scripts/ci/check-committed-secrets.mjs'; import { createHash } from 'node:crypto'; console.log(createHash('sha256').update(JSON.stringify([...ALLOWLIST.entries()].sort(([a],[b])=>(a<b?-1:a>b?1:0))),'utf8').digest('hex'))"
    const EXPECTED = '640b5a9a63bbb077799e15ad8bd70c5cc47455e7a71de5bd8915db076ba802cb';

    // Per-entry sanity first, so a mismatch names the culprit before the
    // digest comparison fails.
    for (const fp of REVIEWED_FINGERPRINTS) {
      const reason = ALLOWLIST.get(fp);
      expect(reason, fp).toBeTypeOf('string');
      expect(String(reason).length, `reason for ${fp}`).toBeGreaterThan(40);
    }

    expect(
      createHash('sha256').update(canonicalAllowlist(ALLOWLIST.entries()), 'utf8').digest('hex')
    ).toBe(EXPECTED);
  });

  it('the canonicalization is injective where the round-6 newline scheme collided', () => {
    // Two maps with the SAME two fake 12-hex-shaped keys but DIFFERENT reason
    // assignments, built so the old "<fp>\n<reason>\n" concatenation
    // serializes them identically: a newline-delimited fingerprint-looking
    // line inside a reason shifts prose across the entry boundary. Harmless
    // runtime-built prose only — nothing credential-shaped.
    const fpA = 'a'.repeat(12);
    const fpB = 'b'.repeat(12);
    const mapOne = new Map<string, string>([
      [fpA, 'alpha prose'],
      [fpB, `beta prose
${fpB}
gamma prose`],
    ]);
    const mapTwo = new Map<string, string>([
      [fpA, `alpha prose
${fpB}
beta prose`],
      [fpB, 'gamma prose'],
    ]);

    const oldScheme = (entries: Iterable<[string, string]>) =>
      [...entries]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([fp, reason]) => `${fp}\n${reason}\n`)
        .join('');

    // Different assignments…
    expect(mapOne.get(fpA)).not.toBe(mapTwo.get(fpA));
    // …that the ROUND-6 scheme could not tell apart…
    expect(oldScheme(mapOne.entries())).toBe(oldScheme(mapTwo.entries()));
    // …and the JSON canonicalization does.
    expect(canonicalAllowlist(mapOne.entries())).not.toBe(canonicalAllowlist(mapTwo.entries()));
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
