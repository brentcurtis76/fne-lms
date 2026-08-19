#!/usr/bin/env node
/**
 * The browser/server security boundary, enforced against the AST and the import
 * graph rather than against a regex over a hand-picked directory list.
 *
 * WHY THIS REPLACES `__tests__/security/no-browser-password-mutation.test.ts`
 * AS THE PRIMARY CONTROL. That test walked `pages`, `components`, `contexts`,
 * `hooks`, `utils` and `src`, matched `.ts`/`.tsx`, and ran regexes over the
 * text. An independent review found three holes in it, all real:
 *
 *   * IT DID NOT SCAN `lib/`, and browser pages import lib modules constantly.
 *     A password write moved into `lib/` would have been invisible to it.
 *   * IT DID NOT SCAN `.js`/`.jsx`. This repository still has both, and
 *     `lib/realtimeNotifications.js` and `utils/storage.js` are shipped to the
 *     browser today.
 *   * A REGEX IS NOT A BOUNDARY. It matches text, so it is defeated by
 *     whitespace, by an alias, or by a member expression built at runtime -- and
 *     it fires on prose, which is why it had to strip comments first.
 *
 * WHAT THIS DOES INSTEAD.
 *
 *   1. IT COMPUTES WHAT "BROWSER" MEANS. Starting from every page under `pages/`
 *      that is not an API route, plus `_app` and `_document`, it follows RELATIVE
 *      imports transitively. The result is the set of modules a page can pull
 *      into a bundle -- `lib/` included, `.js` included -- rather than a list of
 *      directories somebody has to remember to extend. A module is treated as
 *      browser code if a page can reach it at all: `getServerSideProps` is
 *      tree-shaken out of the client bundle in practice, but a SECURITY boundary
 *      should not be drawn by a bundler optimisation.
 *
 *   2. IT PARSES. Every file is parsed with the TypeScript compiler's own parser
 *      and walked as a syntax tree, so a match is a real call expression or a real
 *      object property, never a mention in a comment or a string.
 *
 *   3. IT ALSO POLICES THE SERVER SIDE. The reason the browser rules exist is
 *      that password writes belong to one trusted module; a rule that only looks
 *      at the browser leaves the other half unstated. So the low-level write
 *      (`auth.admin.updateUserById` with a `password`) and account provisioning
 *      (`auth.admin.createUser` with a `password`) are allow-listed by path
 *      across the WHOLE repository, and the raw writer may only be imported by
 *      the trusted modules.
 *
 * USAGE
 *   node scripts/ci/check-browser-boundaries.mjs [--json]
 *
 * Exit 0 = clean, 1 = at least one violation, 2 = the scan could not run.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(process.cwd());

const SOURCE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Where the browser graph starts.
 *
 * Everything under `pages/` except `pages/api` (server code by Next.js's own
 * definition), PLUS every file under the conventional client roots.
 *
 * The second half matters and is not redundant. An import graph rooted only at
 * pages misses a module nothing imports YET -- and this repository has two of
 * exactly that kind, `lib/supabaseEnhanced.ts` (browser Storage uploads) and
 * `contexts/AvatarContext.tsx` (a browser Realtime subscription), both named in
 * the review as browser paths and both currently unreferenced. A boundary that
 * only sees what is wired up today would go green on them and then go red the
 * day somebody wires one in. Seeding from the client roots as well makes the set
 * a superset: reachable-from-a-page OR living where client code lives.
 */
const PAGE_ROOT = join(ROOT, 'pages');
const API_ROOT = join(ROOT, 'pages', 'api');
const CLIENT_ROOTS = ['components', 'contexts', 'hooks', 'utils', 'src'];

/** Directories no scan should ever descend into. */
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'coverage', 'playwright-report', 'test-results',
]);

/** Files that are tests, fixtures or scripts rather than shipped code. */
function isTestOrTooling(file) {
  const rel = relative(ROOT, file);
  return (
    rel.startsWith(`__tests__${sep}`) ||
    rel.startsWith(`tests${sep}`) ||
    rel.startsWith(`e2e${sep}`) ||
    rel.startsWith(`scripts${sep}`) ||
    rel.startsWith(`supabase${sep}`) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel) ||
    rel.includes(`${sep}__mocks__${sep}`)
  );
}

// ---------------------------------------------------------------------------
// THE ALLOW-LISTS. Every entry is a deliberate decision, and each one is
// explained -- the final report has to be able to justify all of them.
// ---------------------------------------------------------------------------

/**
 * The only files permitted to write a password onto an EXISTING account.
 * `updateUserById` with a `password` property.
 */
export const PASSWORD_WRITE_ALLOWLIST = new Map([
  [
    'lib/auth/password-completion.ts',
    'The trusted password-mutation boundary. The single call to auth.admin.updateUserById({password}) in the platform lives here, reached only through the four ceremonies, each of which establishes the account it acts on.',
  ],
  [
    'pages/api/admin/update-user.ts',
    'Administrative profile edit. It calls updateUserById to change an EMAIL, never a password — this entry exists so the checker can assert that: the rule fires only when a `password` property is present, and this file is listed so a future edit that adds one is a deliberate act rather than a silent one.',
  ],
]);

/**
 * The only files permitted to CREATE an account with a password. Provisioning is
 * a different ceremony from changing an existing credential, so it is a separate
 * list -- but it must use the same policy, the same CSPRNG and the same audit
 * rules, which the unit suites assert per route.
 */
export const ACCOUNT_PROVISION_ALLOWLIST = new Map([
  [
    'pages/api/admin/create-user.ts',
    'Manual single-account provisioning. Admin/equipo-directivo authorised, CSPRNG password from lib/auth/password-generator.ts, must_change_password set at insert, audited as user_created_manual.',
  ],
  [
    'pages/api/admin/bulk-create-users.ts',
    'Bulk provisioning from a parsed roster. Same generator, same policy, same flag, audited as user_created_bulk.',
  ],
  [
    'pages/api/admin/tractor-signups/grant.ts',
    'Invitation-based provisioning from an approved public signup. Same generator and flag; the account never learns this password — it is replaced through the recovery link the grant e-mails.',
  ],
]);

/**
 * The only importers of the raw writer inside the trusted module. Anything else
 * importing it would be a route that can pass an arbitrary user id, which is the
 * property the ceremonies exist to remove.
 */
export const RAW_WRITER_IMPORT_ALLOWLIST = new Map([
  [
    'lib/auth/admin-password-reset.ts',
    'The fourth ceremony. It owns the equipo-directivo scope rules and the flag-before-password ordering, and lives in its own module because those rules are substantial.',
  ],
]);

const RAW_WRITER_NAME = '__writePasswordThroughTrustedBoundary';

/** Server-only modules a browser file must never import. */
export const SERVER_ONLY_MODULES = [
  'lib/auth/password-completion',
  'lib/auth/admin-password-reset',
  'lib/auth/recovery-proof',
  'lib/security/audit',
  'lib/email/invitations',
  'lib/email/outbox',
];

// ---------------------------------------------------------------------------
// Module resolution — relative specifiers only. A bare specifier is a package.
// ---------------------------------------------------------------------------

function resolveSpecifier(fromFile, spec) {
  let base;
  if (spec.startsWith('.')) {
    base = resolve(dirname(fromFile), spec);
  } else if (spec.startsWith('@/')) {
    // tsconfig paths: "@/*" -> "./*"
    base = resolve(ROOT, spec.slice(2));
  } else {
    return null; // a package
  }

  for (const ext of ['', ...SOURCE_EXT]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  for (const ext of SOURCE_EXT) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function parse(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    /\.tsx?$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
  );
}

function importSpecifiers(sourceFile) {
  const out = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (SOURCE_EXT.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

/** Transitive closure over relative imports, from a set of entry files. */
function closure(entries) {
  const seen = new Set();
  const queue = [...entries];

  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const spec of importSpecifiers(parse(file, source))) {
      const target = resolveSpecifier(file, spec);
      if (target && !seen.has(target) && !isTestOrTooling(target)) queue.push(target);
    }
  }

  return seen;
}

/** Server code by location, whatever imports it. */
function isServerByLocation(file) {
  return file.startsWith(API_ROOT + sep) || file === join(ROOT, 'middleware.ts');
}

/**
 * WHICH FILES COUNT AS BROWSER CODE. The rule is default-deny, in three parts:
 *
 *   1. `pages/api/**` and `middleware.ts` are server, always. Next.js says so.
 *   2. Anything reachable from a page or from a client root is browser.
 *   3. ANYTHING ELSE IS ALSO BROWSER — unless it is reachable from a server
 *      entrypoint and from nothing else.
 *
 * Part 3 is what a pure import graph gets wrong, and it is not hypothetical:
 * `lib/supabaseEnhanced.ts` (browser Storage uploads) and
 * `contexts/AvatarContext.tsx` (a browser Realtime subscription) are both named
 * in the review as browser paths and NOTHING IMPORTS EITHER OF THEM TODAY. A
 * graph rooted at the pages goes green on both and turns red the day somebody
 * wires one in — which is precisely the class of blind spot the regex scan was
 * failed for. Defaulting an unreferenced module to "browser" costs at worst a
 * false positive on an orphaned server helper, which an allow-list entry settles
 * in one line; defaulting it to "server" costs a hole.
 */
export function computeBrowserGraph() {
  const browserEntries = [
    ...walkFiles(PAGE_ROOT).filter((f) => !f.startsWith(API_ROOT + sep)),
    ...CLIENT_ROOTS.flatMap((root) => walkFiles(join(ROOT, root))),
  ].filter((f) => !isTestOrTooling(f));

  const serverEntries = [
    ...walkFiles(API_ROOT),
    ...(existsSync(join(ROOT, 'middleware.ts')) ? [join(ROOT, 'middleware.ts')] : []),
  ].filter((f) => !isTestOrTooling(f));

  const browserReachable = closure(browserEntries);
  const serverReachable = closure(serverEntries);

  const modules = new Set();
  for (const file of walkFiles(ROOT)) {
    if (isTestOrTooling(file) || isServerByLocation(file)) continue;
    if (browserReachable.has(file) || !serverReachable.has(file)) modules.add(file);
  }

  return { entries: browserEntries, modules, browserReachable, serverReachable };
}

// ---------------------------------------------------------------------------
// AST predicates
// ---------------------------------------------------------------------------

/** The trailing member name of `a.b.c` -> 'c'; of `c()` -> 'c'. */
function calleeName(node) {
  const e = node.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e) && ts.isStringLiteral(e.argumentExpression)) {
    return e.argumentExpression.text;
  }
  return null;
}

/** Does any argument of this call carry an object property with one of these names? */
function callHasObjectProperty(node, names) {
  for (const arg of node.arguments ?? []) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    for (const prop of arg.properties) {
      const name = prop.name;
      if (!name) continue;
      const text = ts.isIdentifier(name)
        ? name.text
        : ts.isStringLiteral(name)
          ? name.text
          : null;
      if (text && names.includes(text)) return true;
    }
  }
  return false;
}

/** `.from('security_audit_events')` and friends. */
function callHasStringArgument(node, values) {
  return (node.arguments ?? []).some(
    (a) => ts.isStringLiteralLike(a) && values.includes(a.text)
  );
}

/** An object property assignment named `must_change_password` (not a read). */
function isProtectedColumnWrite(node) {
  if (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) return false;
  const name = node.name;
  const text = ts.isIdentifier(name)
    ? name.text
    : ts.isStringLiteral(name)
      ? name.text
      : null;
  return text === 'must_change_password';
}

function line(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

export function scanFile(file, { browser }) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const source = readFileSync(file, 'utf8');
  const sf = parse(file, source);
  const findings = [];

  const add = (node, rule, message) =>
    findings.push({ file: rel, line: line(sf, node), rule, message });

  const visit = (node) => {
    // --- Calls -------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);

      if (name === 'updateUser' && callHasObjectProperty(node, ['password'])) {
        if (browser) {
          add(node, 'BROWSER_PASSWORD_WRITE',
            'auth.updateUser({ password }) in browser-reachable code. Passwords are written only by lib/auth/password-completion.ts, through a ceremony that establishes the account.');
        }
      }

      if (name === 'updateUserById' && callHasObjectProperty(node, ['password'])) {
        if (browser) {
          add(node, 'BROWSER_PASSWORD_WRITE',
            'auth.admin.updateUserById({ password }) in browser-reachable code. This needs the service-role key and must never be in a bundle.');
        } else if (!PASSWORD_WRITE_ALLOWLIST.has(rel)) {
          add(node, 'SERVER_PASSWORD_WRITE_OUTSIDE_BOUNDARY',
            'auth.admin.updateUserById({ password }) outside the trusted password-mutation boundary. Add a ceremony to lib/auth/password-completion.ts instead, or justify a new allow-list entry.');
        }
      }

      if (name === 'createUser' && callHasObjectProperty(node, ['password'])) {
        if (browser) {
          add(node, 'BROWSER_ACCOUNT_PROVISION',
            'auth.admin.createUser({ password }) in browser-reachable code.');
        } else if (!ACCOUNT_PROVISION_ALLOWLIST.has(rel)) {
          add(node, 'SERVER_PROVISION_OUTSIDE_ALLOWLIST',
            'auth.admin.createUser({ password }) outside the provisioning allow-list. Provisioning must use the shared policy, the shared CSPRNG and the shared audit rules.');
        }
      }

      if (browser && name === 'from' && callHasStringArgument(node, ['security_audit_events'])) {
        add(node, 'BROWSER_AUDIT_TABLE',
          'The browser touches the security audit table. `authenticated` holds SELECT only, and an audit row a browser can write is an audit row a browser can forge.');
      }

      if (browser && name === 'from' && callHasStringArgument(node, ['audit_logs'])) {
        add(node, 'BROWSER_PHANTOM_AUDIT_TABLE',
          'The browser writes to public.audit_logs, which does not exist. Eight writers targeted it and recorded nothing; the real table is security_audit_events, written server-side.');
      }

      if (browser && name === 'recordSecurityAudit') {
        add(node, 'BROWSER_AUDIT_WRITER',
          'recordSecurityAudit() called from browser-reachable code. It needs a service-role client.');
      }
    }

    // --- Object properties --------------------------------------------------
    if (browser && isProtectedColumnWrite(node)) {
      add(node, 'BROWSER_PROTECTED_COLUMN_WRITE',
        'A browser-reachable module writes profiles.must_change_password. The database trigger refuses it anyway, but a call site that tries is a call site that believes it worked.');
    }

    // --- Imports ------------------------------------------------------------
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const target = resolveSpecifier(file, spec);
      const targetRel = target ? relative(ROOT, target).split(sep).join('/') : null;

      if (browser && targetRel) {
        const withoutExt = targetRel.replace(/\.[cm]?[jt]sx?$/, '');
        if (SERVER_ONLY_MODULES.includes(withoutExt)) {
          add(node, 'BROWSER_IMPORTS_SERVER_MODULE',
            `Browser-reachable code imports ${withoutExt}, which is server-only (service-role key, mailer credentials, or the raw password writer).`);
        }
      }

      // The raw writer, by name.
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          const imported = (el.propertyName ?? el.name).text;
          if (
            imported === RAW_WRITER_NAME &&
            !RAW_WRITER_IMPORT_ALLOWLIST.has(rel) &&
            rel !== 'lib/auth/password-completion.ts'
          ) {
            add(el, 'RAW_WRITER_IMPORTED',
              `${RAW_WRITER_NAME} is the low-level password write. Importing it lets a caller pass an arbitrary user id, which is exactly what the ceremonies remove.`);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return findings;
}

export function run() {
  const { entries, modules } = computeBrowserGraph();

  const allFiles = walkFiles(ROOT).filter((f) => !isTestOrTooling(f));
  const findings = [];

  for (const file of allFiles) {
    findings.push(...scanFile(file, { browser: modules.has(file) }));
  }

  return {
    findings,
    stats: {
      entrypoints: entries.length,
      pageEntrypoints: entries.length,
      browserModules: modules.size,
      filesScanned: allFiles.length,
    },
    browserModules: [...modules].map((f) => relative(ROOT, f).split(sep).join('/')).sort(),
  };
}

function main(argv) {
  const result = run();

  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return result.findings.length ? 1 : 0;
  }

  const { pageEntrypoints, browserModules, filesScanned } = result.stats;

  if (pageEntrypoints < 10 || browserModules < 50 || filesScanned < 100) {
    console.error(
      `::error::The browser-boundary scan found suspiciously little to scan (` +
        `${pageEntrypoints} page entrypoints, ${browserModules} browser modules, ` +
        `${filesScanned} files). Refusing to report success on an empty walk.`
    );
    return 2;
  }

  if (result.findings.length) {
    console.error('::error::Browser/server security boundary violated.');
    for (const f of result.findings) {
      console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
      console.error(`      ${f.message}`);
    }
    return 1;
  }

  console.log(
    `OK: ${filesScanned} files scanned; ${browserModules} modules reachable from ` +
      `${pageEntrypoints} page entrypoints; no browser password write, protected-column ` +
      `write, audit write, or server password write outside the trusted boundary.`
  );
  return 0;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-browser-boundaries.mjs');
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
