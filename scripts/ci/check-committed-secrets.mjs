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
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Assembled, never bare — see the header note about self-matching.
const JWT_PREFIX = 'ey' + 'J';
const SB_SECRET_PREFIX = 'sb_' + 'secret_';
const SB_PUBLISHABLE_PREFIX = 'sb_' + 'publishable_';

/**
 * Selection is a binary DENYLIST, not a text allow-list.
 *
 * The first version of this guard listed the extensions to scan. Independent
 * review round 1 found that list omitted `.py`, and the repository has six
 * tracked Python scripts. The underlying defect is the allow-list itself: it
 * fails open for every file type nobody remembered, and the same review would
 * have found the same bug again for the next one. Auditing the tree turned up
 * more of them, including two that matter a great deal:
 *
 *   - `lib/supabaseClient` — extensionless, and in the directory where a
 *     Supabase key would actually live;
 *   - `public/public-website-fne.html`, `public/meet/zoom-client-view.html` —
 *     PUBLICLY SERVED files, which is precisely the shape of the original
 *     incident (a credential in a page, delivered to every visitor);
 *   - `pages/admin/course-builder/[id].tsx.broken` — a page kept under a
 *     non-code extension;
 *   - a Vitest `.snap`, which can capture whatever a test rendered.
 *
 * So the rule is inverted: scan every tracked file EXCEPT known-binary asset
 * types. A new text format is covered the day it appears, with no edit here.
 * The cost is reading a few hundred extra small text files, which is cheap.
 *
 * Note: `.p12` / `.pfx` / `.jks` / `.der` are on this list because they are
 * binary, not because they are harmless — they ARE credential containers. This
 * guard classifies credential-shaped TEXT; a committed keystore is a different
 * check and is not claimed here.
 */
export const BINARY_EXTENSIONS = new Set([
  // images
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.avif', '.bmp', '.tif', '.tiff',
  // documents and archives
  '.pdf', '.docx', '.xlsx', '.pptx', '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar',
  // fonts
  '.otf', '.ttf', '.woff', '.woff2', '.eot',
  // media
  '.mp3', '.mp4', '.m4a', '.wav', '.mov', '.avi', '.webm', '.ogg',
  // compiled artefacts
  '.node', '.wasm', '.dylib', '.so', '.dll', '.exe', '.class', '.jar', '.pyc',
  // binary key/cert containers (see note above)
  '.p12', '.pfx', '.jks', '.keystore', '.der',
]);

/**
 * True when a tracked path should be read and classified.
 *
 * `lastIndexOf('.') > 0` rather than `>= 0`, so a dotfile such as `.npmrc` or
 * `.env.example` is treated as having no extension and IS scanned.
 */
export function isScannableFile(file) {
  const base = file.split('/').pop() ?? file;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : '';
  return !BINARY_EXTENSIONS.has(ext);
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

/** Tracked files worth scanning. */
export function trackedFiles(cwd = process.cwd()) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean).filter(isScannableFile).sort();
}

export function scanRepository(cwd = process.cwd()) {
  const files = trackedFiles(cwd);
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(resolve(cwd, file.split('/').join(sep)), 'utf8');
    } catch (error) {
      // FAIL CLOSED. A selected tracked file that cannot be read is an unknown,
      // and this guard's whole contract is that an unknown is a finding. The
      // previous `continue` meant a file could drop out of the scan silently and
      // the run would still report success over a smaller set.
      //
      // Only the errno CODE is reported — never the error message, the file
      // contents, or any value. The fingerprint is of the PATH (not a secret),
      // so the finding keeps the same shape as every other one.
      findings.push({
        rule: 'UNREADABLE_FILE',
        file,
        line: 0,
        fingerprint: fingerprint(file),
        message: `Selected tracked file could not be read (${error?.code ?? 'unknown'}); failing closed rather than skipping it`,
      });
      continue;
    }
    findings.push(...scanText(text, file));
  }
  return { files, findings };
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

  console.log(`Committed-secret guard OK — ${files.length} tracked file(s) scanned, 0 findings`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = main();
