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
 *   3. IT ALSO POLICES THE SERVER SIDE. Supabase's password-capable
 *      `updateUserById` and `createUser` primitives are default-deny everywhere,
 *      regardless of the payload shape. Only three narrow modules may mention
 *      them, and those modules export fixed-purpose operations instead of a
 *      user-id-plus-payload escape hatch. Imports of those modules are parsed as
 *      well, so aliases, namespace/default imports, require(), dynamic import(),
 *      and barrel re-exports cannot widen the surface silently.
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
// THE RAW PRIMITIVE MODULES. Every entry is a deliberate decision, and each one
// is explained -- the final report has to be able to justify all of them.
// ---------------------------------------------------------------------------

/**
 * The only files permitted to mention Supabase's password-capable admin
 * primitives. There are no route allow-list entries.
 */
export const RAW_AUTH_PRIMITIVE_MODULES = new Map([
  [
    'lib/auth/password-completion.ts',
    'The trusted password-mutation boundary. Its private writer is reachable only after a ceremony establishes the account and purpose.',
  ],
  [
    'lib/auth/admin-user-maintenance.ts',
    'Fixed-purpose existing-account maintenance: one export changes only email and one clears only the administrative reset marker.',
  ],
  [
    'lib/auth/account-provisioning.ts',
    'Fixed-purpose provisioning constructs the accepted fields itself; callers cannot pass an arbitrary Supabase create-user payload.',
  ],
]);

/**
 * Public exports that may be imported from each low-level primitive module.
 * Static, non-aliased named imports are the only accepted import form. The
 * The password-completion surface is pinned too: this makes the raw writer not
 * only private today, but impossible to expose to a route later without making
 * this guard fail.
 */
export const LOW_LEVEL_IMPORT_SURFACES = new Map([
  [
    'lib/auth/password-completion',
    new Set([
      'COMPLETION_MESSAGES',
      'completeAdministrativeReset',
      'completeForcedPasswordChange',
      'completeRecoveryPasswordChange',
      'completeVoluntaryPasswordChange',
      'isCompletionFailure',
      'Reauthenticator',
    ]),
  ],
  [
    'lib/auth/admin-user-maintenance',
    new Set(['updateAuthUserEmail', 'clearAdministrativeResetMarker']),
  ],
  [
    'lib/auth/account-provisioning',
    new Set(['provisionAuthAccount']),
  ],
]);

/** Server-only modules a browser file must never import. */
export const SERVER_ONLY_MODULES = [
  'lib/auth/password-completion',
  'lib/auth/admin-password-reset',
  'lib/auth/recovery-proof',
  'lib/auth/recovery-grant',
  'lib/auth/recovery-crypto',
  'lib/auth/recovery-request-queue',
  'lib/auth/admin-user-maintenance',
  'lib/auth/account-provisioning',
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

function moduleKey(file) {
  return relative(ROOT, file).split(sep).join('/').replace(/\.[cm]?[jt]sx?$/, '');
}

const RAW_AUTH_PRIMITIVES = new Set(['updateUserById', 'createUser']);

function rawPrimitiveReference(node) {
  if (ts.isPropertyAccessExpression(node) && RAW_AUTH_PRIMITIVES.has(node.name.text)) {
    return node.name.text;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression) &&
    RAW_AUTH_PRIMITIVES.has(node.argumentExpression.text)
  ) {
    return node.argumentExpression.text;
  }
  if (ts.isBindingElement(node)) {
    const property = node.propertyName ?? node.name;
    if (ts.isIdentifier(property) && RAW_AUTH_PRIMITIVES.has(property.text)) {
      return property.text;
    }
    if (ts.isStringLiteralLike(property) && RAW_AUTH_PRIMITIVES.has(property.text)) {
      return property.text;
    }
  }
  return null;
}

function lowLevelImportSurface(file, spec) {
  const target = resolveSpecifier(file, spec);
  if (!target) return null;
  const key = moduleKey(target);
  const exports = LOW_LEVEL_IMPORT_SURFACES.get(key);
  return exports ? { key, exports } : null;
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
    const rawPrimitive = rawPrimitiveReference(node);
    if (rawPrimitive && !RAW_AUTH_PRIMITIVE_MODULES.has(rel)) {
      add(
        node,
        browser ? 'BROWSER_RAW_AUTH_PRIMITIVE' : 'RAW_AUTH_PRIMITIVE_OUTSIDE_MODULE',
        `${rawPrimitive} is a password-capable Supabase admin primitive. It may appear only in the fixed-purpose modules under lib/auth; routes and other modules must use their narrow exports.`
      );
    }

    // --- Calls -------------------------------------------------------------
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);

      if (name === 'updateUser' && callHasObjectProperty(node, ['password'])) {
        if (browser) {
          add(node, 'BROWSER_PASSWORD_WRITE',
            'auth.updateUser({ password }) in browser-reachable code. Passwords are written only by lib/auth/password-completion.ts, through a ceremony that establishes the account.');
        }
      }

      if (
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments.length > 0 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const surface = lowLevelImportSurface(file, node.arguments[0].text);
        if (surface) {
          add(
            node,
            'DYNAMIC_LOW_LEVEL_IMPORT',
            `${surface.key} may only be consumed through a static, non-aliased named import of its fixed-purpose exports; require() and dynamic import() can bypass that reviewable surface.`
          );
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
      const targetRel = target ? moduleKey(target) : null;

      if (browser && targetRel) {
        if (SERVER_ONLY_MODULES.includes(targetRel)) {
          add(node, 'BROWSER_IMPORTS_SERVER_MODULE',
            `Browser-reachable code imports ${targetRel}, which is server-only (service-role key, mailer credentials, or a raw auth primitive).`);
        }
      }

      const surface = lowLevelImportSurface(file, spec);
      if (surface) {
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const validShape =
          clause &&
          !clause.name &&
          named &&
          ts.isNamedImports(named) &&
          named.elements.length > 0;

        if (!validShape) {
          add(
            node,
            'LOW_LEVEL_IMPORT_SHAPE',
            `${surface.key} may only be consumed through static named imports of its fixed-purpose exports; default and namespace imports are forbidden.`
          );
        } else {
          for (const el of named.elements) {
            const imported = (el.propertyName ?? el.name).text;
            const aliased = Boolean(el.propertyName) || el.name.text !== imported;
            if (!surface.exports.has(imported) || aliased) {
              add(
                el,
                'LOW_LEVEL_IMPORT_SURFACE',
                `${surface.key} exposes only non-aliased imports of: ${[...surface.exports].join(', ')}.`
              );
            }
          }
        }
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const surface = lowLevelImportSurface(file, node.moduleSpecifier.text);
      if (surface) {
        add(
          node,
          'LOW_LEVEL_REEXPORT',
          `${surface.key} must not be re-exported through a barrel; callers must import its fixed-purpose exports directly.`
        );
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
