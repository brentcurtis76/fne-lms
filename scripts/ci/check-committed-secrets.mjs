#!/usr/bin/env node
/**
 * Fail-closed guard against credentials committed to this repository.
 *
 * This exists because a production service-role JWT and a hardcoded production
 * project URL reached `main` inside orphaned helper scripts, where nothing was
 * looking. A grep for one known string would not have caught them and will not
 * catch the next one, so this guard classifies credential-SHAPED text instead:
 * anything that looks like a credential must either classify as safe or fail.
 *
 * Design rules, in order of importance:
 *
 *   1. NEVER print a matched value. Findings carry file, line, category and a
 *      truncated SHA-256 fingerprint only. The fingerprint is what an allowlist
 *      entry references, so a synthetic fixture can be permitted without the
 *      value ever appearing in this file, in CI logs, or in a review.
 *   2. Fail closed. Credential-shaped text that cannot be classified safely is a
 *      finding (`UNCLASSIFIABLE_CREDENTIAL`), not a pass. An allowlist entry is
 *      the only way to accept one, and each entry states why.
 *   3. `service_role` is never allowlistable. A JWT whose decoded role is
 *      `service_role` bypasses RLS entirely; there is no synthetic reason to
 *      commit one, so that rule has no exception path at all.
 *   4. No dependencies. The `Migration safety guard` job runs before `npm ci`,
 *      so this uses Node builtins only.
 *
 * The literal prefixes below are assembled from fragments on purpose: this file
 * is itself a tracked file that the guard scans, and a bare literal would make
 * the guard report itself.
 *
 * Negative controls: __tests__/security/committed-secrets-guard.test.ts
 */
// Deliberately NO node:fs import. The guard reads tracked content exclusively
// from Git's object store; it never opens a path in the working tree. The
// round-3 review proved why that matters: a path indexed as a regular file can
// be replaced on disk by a symlink, and a filesystem read follows it OUTSIDE
// the repository. No filesystem read, no escape.
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Assembled, never bare — see the header note about self-matching.
const JWT_PREFIX = 'ey' + 'J';
const SB_SECRET_PREFIX = 'sb_' + 'secret_';
const SB_PUBLISHABLE_PREFIX = 'sb_' + 'publishable_';

/**
 * Selection is settled: EVERY tracked Git entry is inspected. Nothing about a
 * filename or its bytes decides scope.
 *
 * Two rounds of independent review were each spent on the same bug in a
 * different costume:
 *
 *   - Round 0 used an allow-list of extensions to scan. It omitted `.py`, and
 *     six tracked Python scripts went uninspected.
 *   - Round 1 inverted it to a denylist of binary extensions. That failed too,
 *     for a reason a filename cannot express: **eight tracked `.png`/`.ico`
 *     paths in this repository are plain ASCII text.** Two are literally the
 *     string `404: Not Found` (a failed download committed as-is), three are
 *     `data:` URI base64 blobs, two are base64-encoded `.ico`, one is nearly
 *     empty. Every one of them was skipped by extension, and a credential
 *     pasted into any of them would have been invisible to CI.
 *
 * A content-sniffing heuristic ("does it look like text?") is the same mistake a
 * third time: it hands an attacker a rule to dress around, and it makes the
 * guard's coverage depend on a judgement call at scan time.
 *
 * So there is no judgement call, and there is exactly ONE boundary:
 *
 *   THE GUARD SCANS THE GIT INDEX. NOTHING ELSE.
 *
 * Paths, modes and stages come from `git ls-files -s -z`; the bytes scanned are
 * the INDEXED BLOBS themselves, fetched by object id through one strictly
 * validated `git cat-file --batch` call. The working tree is never opened —
 * not for regular files, not for symlinks. Round 3 briefly kept an "additional"
 * working-tree scan, and its review showed why that was a bug, not a feature:
 * a path indexed as a regular file can be replaced on disk by a symlink, and a
 * filesystem read follows it outside the repository. Dropping the read removes
 * the escape and the entire class behind it.
 *
 * The consequence is a clean contract: this guard protects content that can be
 * COMMITTED. A value that exists only in an unstaged working-tree copy or in a
 * gitignored file is outside its boundary — it enters scope the moment it is
 * staged, which is the moment it can reach `main`. Real binary assets are
 * scanned like everything else: blob bytes are decoded `latin1` (a
 * byte-preserving 1:1 map), so a contiguous ASCII credential inside a PNG is
 * found like any other.
 *
 * Everything the index hands us that cannot be fully validated fails closed:
 * unresolved merge stages (no side is chosen or scanned), gitlinks and unknown
 * modes (never accessed), missing or non-blob objects, and any malformed or
 * desynchronized `cat-file --batch` framing.
 *
 * What this deliberately does NOT claim, unchanged from earlier rounds — these
 * are stated boundaries, not silent gaps:
 *
 *   - credentials that exist only in Git history;
 *   - values deliberately split across lines or double-encoded;
 *   - secrets compressed or encrypted inside a binary container;
 *   - working-tree-only or gitignored content (in scope once staged);
 *   - provider-side state (whether a key is actually accepted).
 */

/** Git index modes this guard knows how to inspect. */
export const MODE_REGULAR = '100644';
export const MODE_EXECUTABLE = '100755';
export const MODE_SYMLINK = '120000';
export const MODE_GITLINK = '160000';

/**
 * Every index record, as `{ mode, oid, stage, path }` — one per record, with
 * NOTHING collapsed.
 *
 * `git ls-files -s -z` emits `<mode> SP <object> SP <stage> TAB <path> NUL`.
 * The header before the first TAB contains no tabs, so a path containing tabs,
 * spaces, quotes, non-ASCII or even newlines survives intact: records are
 * NUL-separated and `-z` suppresses quoting.
 *
 * During an unresolved merge a path appears at stages 1/2/3. Earlier rounds
 * kept only the first record per path, which silently discarded the other
 * sides of a conflict; every record is now returned and `scanRepository` fails
 * closed on any nonzero stage instead of choosing a side.
 */
export function trackedEntries(cwd = process.cwd()) {
  const out = execFileSync('git', ['ls-files', '-s', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

  const entries = [];
  for (const record of out.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    if (tab === -1) continue;
    const [mode, oid, stage] = record.slice(0, tab).split(/ +/);
    const path = record.slice(tab + 1);
    entries.push({ mode, oid, stage, path });
  }

  return entries.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.stage < b.stage ? -1 : a.stage > b.stage ? 1 : 0
  );
}

/** An object id: 40 hex (SHA-1) or 64 hex (SHA-256 repositories). */
const OID_SHAPE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * Parse `git cat-file --batch` output STRICTLY, against the exact ordered list
 * of object ids that were requested. Returns a Map of oid → `{ bytes, code }`:
 * `bytes` is the blob's raw Buffer when — and only when — every framing rule
 * below holds, else `null` with a short safe `code` the caller reports.
 *
 * `--batch` answers in request order as `<oid> SP <type> SP <size> LF
 * <raw bytes> LF` (or `<oid> SP missing LF`). An object is accepted only when:
 *
 *   - the header is structurally valid and its oid is EXACTLY the one this
 *     position requested;
 *   - the type is exactly `blob` (a `tree`/`commit`/`tag` is framed past so
 *     later objects stay parseable, but yields `not-a-blob` — the round-3
 *     reviewer built a 100644 index entry pointing at a TREE, and the previous
 *     parser scanned its raw bytes as if they were file content);
 *   - the size is a non-negative safe integer, exactly that many body bytes
 *     are present, and the next byte is the required LF.
 *
 * Any violation desynchronizes the frame, and a desynchronized frame cannot be
 * trusted RETROACTIVELY either — an earlier "object" might have been an
 * accident of the same corruption — so the whole response fails closed:
 * every requested oid maps to `{ bytes: null, code: 'malformed-batch' }`.
 * The same happens when validly framed objects are followed by trailing
 * unparsed bytes. Raw batch output is never printed anywhere.
 */
export function parseBatchOutput(out, expectedOids) {
  const failAll = (code) => new Map(expectedOids.map((oid) => [oid, { bytes: null, code }]));
  const blobs = new Map();

  let offset = 0;
  for (const expected of expectedOids) {
    const newline = out.indexOf(0x0a, offset);
    if (newline === -1) return failAll('malformed-batch');

    const header = out.toString('utf8', offset, newline).split(' ');
    offset = newline + 1;
    const oid = header[0];
    if (oid !== expected || !OID_SHAPE.test(oid)) return failAll('malformed-batch');

    if (header.length === 2 && header[1] === 'missing') {
      blobs.set(oid, { bytes: null, code: 'missing-object' });
      continue;
    }

    const type = header[1];
    const size = Number(header[2]);
    if (header.length !== 3 || !/^\d+$/.test(header[2]) || !Number.isSafeInteger(size)) {
      return failAll('malformed-batch');
    }
    if (offset + size > out.length || out[offset + size] !== 0x0a) {
      return failAll('malformed-batch');
    }
    const body = out.subarray(offset, offset + size);
    offset += size + 1;

    blobs.set(oid, type === 'blob' ? { bytes: body, code: null } : { bytes: null, code: 'not-a-blob' });
  }

  if (offset !== out.length) return failAll('malformed-batch');
  return blobs;
}

/**
 * Fetch the raw bytes of the given object ids in ONE `git cat-file --batch`
 * subprocess (≈100 MB across ~2,455 objects in this repository, ≈1.5 s
 * end to end). Duplicate requests are collapsed to one fetch; the returned
 * Map is keyed by oid, so the mapping stays deterministic for duplicates.
 * A subprocess failure fails every oid closed.
 */
export function readIndexBlobs(cwd, oids) {
  const unique = [...new Set(oids)];
  if (unique.length === 0) return new Map();

  let out;
  try {
    out = execFileSync('git', ['cat-file', '--batch'], {
      cwd,
      input: unique.join('\n') + '\n',
      maxBuffer: 1024 * 1024 * 1024,
    });
  } catch {
    return new Map(unique.map((oid) => [oid, { bytes: null, code: 'batch-failed' }]));
  }

  return parseBatchOutput(out, unique);
}

/**
 * Fingerprint-allowlisted synthetic fixtures.
 *
 * Key   = truncated SHA-256 of the matched value (see `fingerprint`).
 * Value = why this specific value is safe to keep in the tree.
 *
 * `service_role` JWTs can never appear here; `classifyJwt` refuses the category
 * before the allowlist is consulted.
 */
export const ALLOWLIST = new Map([
  [
    'bf1725a8f98b',
    'Published Supabase local-development demo anon key. Ships in the Supabase ' +
      'CLI and its public docs for 127.0.0.1 stacks and authorizes nothing outside ' +
      'a local container. lib/supabase-test.ts:9 selects it only when ' +
      "NODE_ENV === 'test', paired with http://127.0.0.1:54321.",
  ],
  [
    'db71d1a6b661',
    'Fabricated Zoom JWT fixture. __tests__/scripts/zoom-spike-redactor.test.ts:49 ' +
      'feeds it to the spike redactor to prove JWT-shaped values collapse to ' +
      '"jwt-redacted". Never issued by Zoom; it is the input to a redaction proof.',
  ],
  [
    '256286fd4bd0',
    'Synthetic service-key-shaped placeholder used by the four Zoom store suites ' +
      'to construct a service client in tests. Explicitly documented as a ' +
      'placeholder in docs/plan/zoom/reviews/fase-3-review-request.md:112. Not a ' +
      'real Supabase secret key and not accepted by any project.',
  ],
  [
    '6a580c6113e6',
    'Fabricated session-token-shaped literal. ' +
      '__tests__/lib/auth/recovery-grant.test.ts:222 passes it to peekRecoveryGrant ' +
      'to prove an ordinary session token is rejected as "invalid" before any ' +
      'database access. It is a negative control, not a credential.',
  ],
  [
    '9e80e5552996',
    'Fabricated JWT-shaped literal. __tests__/lib/security/audit.test.ts:256 feeds ' +
      'it to sanitiseAuditMetadata to prove token-shaped values are replaced with ' +
      '"[redacted-token]" before an audit row is written.',
  ],
]);

/** Truncated SHA-256. Never reversible for a high-entropy secret. */
export function fingerprint(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 12);
}

/**
 * Hosts where a password-bearing Postgres URL is a local development default
 * rather than a credential. `supabase status` prints exactly these.
 */
const LOCAL_DB_HOSTS = new Set([
  'localhost', '127.0.0.1', '::1', '0.0.0.0', 'db', 'postgres', 'host.docker.internal',
]);

/** Passwords that carry no secret: local defaults and obvious placeholders. */
const BENIGN_PASSWORDS = new Set([
  'postgres', 'password', 'changeme', 'secret', 'example', 'test', 'placeholder', 'redacted',
]);

/** A value that references a secret rather than containing one. */
export function isReference(value) {
  return (
    /^\$\{\{/.test(value) ||          // ${{ secrets.X }}
    /^\$\{/.test(value) ||            // ${X}
    /^\$[A-Za-z_]/.test(value) ||     // $X
    /^process\.env\./.test(value) ||
    /^env\./.test(value) ||
    /^secrets\./.test(value) ||
    /^<[^>]*>$/.test(value) ||        // <your-password>
    /^\.{3,}$/.test(value) ||
    /^x{3,}$/i.test(value) ||
    /^\*{3,}$/.test(value)
  );
}

function isPlaceholderPassword(value) {
  if (isReference(value)) return true;
  if (BENIGN_PASSWORDS.has(value.toLowerCase())) return true;
  return /^(your|my|the)[-_]?/i.test(value) || /(placeholder|redacted|example|dummy|fake)/i.test(value);
}

/** base64url -> parsed JSON object, or null if it is not decodable JSON. */
export function decodeJwtPayload(segment) {
  try {
    const b64 = String(segment).replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Classify one JWT-shaped literal.
 *
 * Returns a category string. `SERVICE_ROLE_JWT` is terminal: the caller must not
 * consult the allowlist for it.
 */
export function classifyJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return 'UNCLASSIFIABLE_CREDENTIAL';

  const payload = decodeJwtPayload(parts[1]);
  if (!payload) return 'UNCLASSIFIABLE_CREDENTIAL';

  const role = typeof payload.role === 'string' ? payload.role.toLowerCase() : null;
  if (role === 'service_role') return 'SERVICE_ROLE_JWT';
  return 'UNREVIEWED_JWT';
}

/**
 * Scan one file's text. Returns findings; never returns the matched value.
 *
 * @param {string} text
 * @param {string} file  path used in the finding, for review only
 */
export function scanText(text, file = '<input>') {
  const findings = [];
  const lines = String(text).split(/\r?\n/);

  const jwtRe = new RegExp(`${JWT_PREFIX}[A-Za-z0-9_-]{4,}\\.[A-Za-z0-9_-]{4,}\\.[A-Za-z0-9_-]{4,}`, 'g');
  const sbSecretRe = new RegExp(`${SB_SECRET_PREFIX}[A-Za-z0-9_-]{6,}`, 'g');
  const pgUrlRe = /postgres(?:ql)?:\/\/([^\s:@/'"`]+):([^\s@/'"`]*)@([^\s/:'"`]+)/g;
  const dbPwRe =
    /\b(PGPASSWORD|POSTGRES_PASSWORD|DB_PASSWORD|DATABASE_PASSWORD|SUPABASE_DB_PASSWORD|POSTGRESQL_PASSWORD)\s*[:=]\s*['"]?([^\s'"#,)}\]]+)/g;

  const add = (rule, line, value, message) => {
    findings.push({ rule, file, line, fingerprint: fingerprint(value), message });
  };

  lines.forEach((rawLine, index) => {
    const line = index + 1;

    // --- Rule 1 & 5: JWT literals -----------------------------------------
    for (const match of rawLine.matchAll(jwtRe)) {
      const token = match[0];
      const category = classifyJwt(token);

      if (category === 'SERVICE_ROLE_JWT') {
        // Terminal. No allowlist path: a service_role key bypasses RLS.
        add(category, line, token, 'JWT decodes to role=service_role; this bypasses RLS and is never allowlistable');
        continue;
      }

      const fp = fingerprint(token);
      if (ALLOWLIST.has(fp)) continue;

      add(
        category,
        line,
        token,
        category === 'UNCLASSIFIABLE_CREDENTIAL'
          ? 'Credential-shaped literal could not be decoded and classified; failing closed'
          : 'JWT literal is not an allowlisted synthetic fixture'
      );
    }

    // --- Rule 2: sb_secret_ literals --------------------------------------
    for (const match of rawLine.matchAll(sbSecretRe)) {
      const value = match[0];
      const fp = fingerprint(value);
      if (ALLOWLIST.has(fp)) continue;
      add('SUPABASE_SECRET_KEY', line, value, 'Supabase secret key literal is not an allowlisted synthetic fixture');
    }

    // --- Rule 3: password-bearing Postgres URLs ---------------------------
    for (const match of rawLine.matchAll(pgUrlRe)) {
      const [whole, , password, host] = match;
      if (!password) continue; // no password component carries no secret
      const localDefault = LOCAL_DB_HOSTS.has(host.toLowerCase()) && isPlaceholderPassword(password);
      if (localDefault || isReference(password)) continue;
      add('DATABASE_URL_PASSWORD', line, whole, `Password-bearing Postgres URL for host ${host}`);
    }

    // --- Rule 4: database password environment assignments ----------------
    for (const match of rawLine.matchAll(dbPwRe)) {
      const [, name, value] = match;
      if (isPlaceholderPassword(value)) continue;
      add('DATABASE_PASSWORD_ASSIGNMENT', line, value, `${name} is assigned a literal password`);
    }
  });

  return findings;
}

/** Backwards-compatible view: the distinct paths of every tracked entry. */
export function trackedFiles(cwd = process.cwd()) {
  return [...new Set(trackedEntries(cwd).map((entry) => entry.path))];
}

/**
 * Inspect every tracked entry — FROM THE INDEX ONLY.
 *
 * The content scanned for each stage-0 entry is the INDEXED BLOB, fetched by
 * object id. The working tree is never opened: no readFileSync, no
 * readlinkSync, no divergence comparison. Round 3 kept an "additional"
 * working-tree read and its review turned that into an exploit — replace a
 * regular indexed file on disk with a symlink and the read follows it OUTSIDE
 * the repository. With no filesystem read there is nothing to follow.
 *
 * The boundary this enforces is committed-content: a secret that exists only
 * in an unstaged working-tree copy produces no finding here, and enters scope
 * the moment `git add` stages it — which is the moment it can reach `main`.
 */
export function scanRepository(cwd = process.cwd()) {
  const entries = trackedEntries(cwd);
  const findings = [];

  const unreadable = (file, code) =>
    findings.push({
      rule: 'UNREADABLE_FILE',
      file,
      line: 0,
      fingerprint: fingerprint(file),
      // Only a short safe CODE — never an error message, an absolute path,
      // object contents, or any value.
      message: `Tracked entry could not be read (${code ?? 'unknown'}); failing closed rather than skipping it`,
    });

  // Group records by path and fail closed on ANY nonzero stage, naming every
  // stage:mode pair and scanning no side — this guard does not pick winners in
  // a conflict, and the finding itself blocks CI. Note that git's plumbing CAN
  // hold a stage-0 record alongside nonzero stages for the same path
  // (`update-index --index-info` accepts the mixture), so the rule is "any
  // nonzero stage blocks the path", not "conflicted paths have no stage 0".
  const byPath = new Map();
  for (const entry of entries) {
    if (!byPath.has(entry.path)) byPath.set(entry.path, []);
    byPath.get(entry.path).push(entry);
  }
  const files = [...byPath.keys()].sort();

  const scannable = [];
  for (const [file, records] of byPath) {
    if (records.some((record) => record.stage !== '0')) {
      findings.push({
        rule: 'UNRESOLVED_INDEX_ENTRY',
        file,
        line: 0,
        fingerprint: fingerprint(file),
        message:
          `Index holds unresolved merge stages for this path (` +
          records.map((record) => `stage ${record.stage} mode ${record.mode}`).join(', ') +
          `); failing closed without choosing a side`,
      });
      continue;
    }
    scannable.push(records[0]); // one stage-0 record survives grouping
  }

  // One strictly validated subprocess fetches every blob this scan is entitled
  // to read. Gitlink object ids are deliberately NOT requested: a submodule is
  // never accessed.
  const blobs = readIndexBlobs(
    cwd,
    scannable
      .filter(({ mode }) => mode === MODE_REGULAR || mode === MODE_EXECUTABLE || mode === MODE_SYMLINK)
      .map(({ oid }) => oid)
  );

  for (const { mode, oid, path: file } of scannable) {
    if (mode === MODE_REGULAR || mode === MODE_EXECUTABLE || mode === MODE_SYMLINK) {
      // The indexed blob is the ONLY content source. For a symlink the blob IS
      // the committed target text, scanned as text and never followed. `latin1`
      // maps each byte to U+0000–U+00FF one-for-one, so a contiguous ASCII
      // credential survives intact even inside a real binary asset.
      const blob = blobs.get(oid);
      if (!blob || blob.bytes === null) {
        unreadable(file, blob?.code ?? 'missing-object');
        continue;
      }
      findings.push(...scanText(blob.bytes.toString('latin1'), file));
      continue;
    }

    // Gitlinks (submodules) and anything else: fail closed without touching it.
    // A submodule is a separate repository with its own history; inspecting it
    // is out of scope, and silently ignoring it would be the same fail-open bug
    // this guard has now been corrected for three times.
    findings.push({
      rule: 'UNSUPPORTED_TRACKED_ENTRY',
      file,
      line: 0,
      fingerprint: fingerprint(file),
      message: `Tracked entry has mode ${mode}, which this guard does not inspect; failing closed without reading it`,
    });
  }

  return { entries, files, findings };
}

export function main(args = process.argv.slice(2)) {
  if (args.length > 1) {
    console.error('usage: node scripts/ci/check-committed-secrets.mjs [repo-root]');
    return 2;
  }

  const cwd = resolve(args[0] || '.');
  const { files, findings } = scanRepository(cwd);

  if (findings.length) {
    console.error(`Committed-secret guard FAILED (${findings.length} finding(s)).`);
    console.error('Values are never printed. Each finding shows a truncated SHA-256 fingerprint.');
    for (const f of findings) {
      console.error(`- [${f.rule}] ${f.file}:${f.line} fp=${f.fingerprint} — ${f.message}`);
    }
    console.error('');
    console.error('If a finding is a genuine synthetic fixture, add its fingerprint to ALLOWLIST');
    console.error('in scripts/ci/check-committed-secrets.mjs with a written reason.');
    console.error('A service_role JWT is never allowlistable: rotate it and remove the literal.');
    return 1;
  }

  console.log(
    `Committed-secret guard OK — ${files.length} tracked path(s), authoritative content scanned from the Git index only, 0 findings`
  );
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = main();
