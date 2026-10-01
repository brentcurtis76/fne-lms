// @vitest-environment node
/**
 * SM-B015 guard: server code must not take the caller's identity from the
 * session cookie.
 *
 * auth-helpers accepts a legacy JSON session cookie as-is, so the `user`
 * that `getSession()` returns is whatever the cookie claims; only its access
 * token means anything, and only after the auth server verifies it. API
 * routes use requireVerifiedCaller / requireVerifiedRole /
 * requireVerifiedSuperadmin / getApiUser (lib/api-auth.ts); getServerSideProps
 * uses getServerSideUser.
 *
 * This test fails when
 *   - a file under pages/api calls `getSession(` outside the allowlist, or
 *     reads `session.user` / `session?.user` at all;
 *   - a page's getServerSideProps does either.
 * Browser code (React components calling the client's getSession) is not
 * server identity and is not checked.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/**
 * API files that call getSession() only to obtain the access token and then
 * verify it with getUser(access_token) themselves. Each entry was reviewed.
 */
const GET_SESSION_ALLOWLIST = new Set<string>([
  'pages/api/transformation/assessments/[id]/finalize.ts',
  'pages/api/transformation/assessments/[id]/evaluate-objective.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Source without line and block comments, so prose about the old pattern does not trip the guard. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Same length, string contents replaced by spaces: for finding braces only. */
function blankStrings(source: string): string {
  const blank = (m: string) => m[0] + ' '.repeat(m.length - 2) + m[m.length - 1];
  return source
    .replace(/'(?:\\.|[^'\\\n])*'/g, blank)
    .replace(/"(?:\\.|[^"\\\n])*"/g, blank)
    .replace(/`(?:\\.|[^`\\])*`/g, blank);
}

/** `session.user`, `session?.user`, `data.session.user`, and `const { user } = session`. */
const READS_SESSION_USER = /\bsession\s*\??\.\s*user\b|\{[^{}]*\buser\b[^{}]*\}\s*=\s*(?:[\w$.?]*\.)?session\b/;
/** Any reference to getSession: `.getSession(`, `['getSession'](`, aliases. */
const CALLS_GET_SESSION = /\bgetSession\b/;

/** Brace-matched block starting at `open` (index of a `{`). */
function blockAt(source: string, open: number): string {
  const scan = blankStrings(source);
  let depth = 0;
  for (let i = open; i < scan.length; i++) {
    if (scan[i] === '{') depth++;
    else if (scan[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

/**
 * The body of the function exported as getServerSideProps, whether written
 * `export const getServerSideProps = async (ctx) => {…}`,
 * `export async function getServerSideProps(ctx) {…}`, or
 * `const load = …; export { load as getServerSideProps }`.
 * When the export exists but its body cannot be located, the whole file is
 * returned, so an unusual shape fails closed instead of slipping through.
 */
function getServerSidePropsBody(source: string): string | null {
  const alias = source.match(/export\s*\{[^}]*\b(\w+)\s+as\s+getServerSideProps\b[^}]*\}/);
  const bare = /export\s*\{[^}]*\bgetServerSideProps\b[^}]*\}/.test(source);
  const exported = /export\s+(?:const|let|var|async\s+function|function)\s+getServerSideProps\b/.test(source);
  if (!alias && !bare && !exported) return null;
  const name = alias ? alias[1] : 'getServerSideProps';
  const fn = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  if (fn) {
    const paramsEnd = source.indexOf(')', fn.index);
    // A return-type annotation has braces of its own: scan the whole file.
    if (/^\s*:/.test(source.slice(paramsEnd + 1))) return source;
    const open = source.indexOf('{', paramsEnd);
    if (open > -1) return blockAt(source, open);
  }
  const arrow = new RegExp(`\\b${name}\\b[^=]*=\\s*(?:async\\s*)?\\([^)]*\\)[^=]*=>\\s*\\{`).exec(source);
  if (arrow) return blockAt(source, arrow.index + arrow[0].length - 1);
  return source;
}

const apiFiles = walk(join(ROOT, 'pages', 'api')).map((p) => relative(ROOT, p));
const pageFiles = walk(join(ROOT, 'pages'))
  .map((p) => relative(ROOT, p))
  .filter((p) => !p.startsWith('pages/api/'));

describe('no API route takes identity from the session cookie', () => {
  it('finds the API routes', () => {
    expect(apiFiles.length).toBeGreaterThan(100);
  });

  it('no API file reads session.user', () => {
    const offenders = apiFiles.filter((f) => READS_SESSION_USER.test(code(readFileSync(join(ROOT, f), 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('only allowlisted API files call getSession(), and each of them verifies with getUser', () => {
    const offenders = apiFiles.filter(
      (f) => CALLS_GET_SESSION.test(code(readFileSync(join(ROOT, f), 'utf8'))) && !GET_SESSION_ALLOWLIST.has(f)
    );
    expect(offenders).toEqual([]);
    for (const f of GET_SESSION_ALLOWLIST) {
      const src = code(readFileSync(join(ROOT, f), 'utf8'));
      expect(src, f).toMatch(/\.getUser\(\s*session\.access_token\s*\)/);
    }
  });
});

describe('no getServerSideProps takes identity from the session cookie', () => {
  const withGssp = pageFiles
    .map((f) => [f, getServerSidePropsBody(code(readFileSync(join(ROOT, f), 'utf8')))] as const)
    .filter(([, body]) => body !== null) as Array<readonly [string, string]>;

  it('finds pages with getServerSideProps', () => {
    expect(withGssp.length).toBeGreaterThan(10);
  });

  it('none calls getSession() or reads session.user', () => {
    const offenders = withGssp
      .filter(([, body]) => CALLS_GET_SESSION.test(body) || READS_SESSION_USER.test(body))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});

describe('the guard itself', () => {
  it('flags the old patterns and passes the new ones', () => {
    expect(READS_SESSION_USER.test(code('const id = session.user.id;'))).toBe(true);
    expect(READS_SESSION_USER.test(code('if (!session?.user) return;'))).toBe(true);
    expect(READS_SESSION_USER.test(code('const u = data.session.user;'))).toBe(true);
    expect(READS_SESSION_USER.test(code('const { user } = session;'))).toBe(true);
    expect(READS_SESSION_USER.test(code('const { user: u } = data.session;'))).toBe(true);
    expect(READS_SESSION_USER.test(code('// session.user.id was the bug'))).toBe(false);
    expect(READS_SESSION_USER.test(code('const { user } = await getApiUser(req, res);'))).toBe(false);
    expect(CALLS_GET_SESSION.test(code('await supabase.auth.getSession();'))).toBe(true);
    expect(CALLS_GET_SESSION.test(code("await s.auth['getSession']();"))).toBe(true);
    expect(CALLS_GET_SESSION.test(code('const caller = await requireVerifiedCaller(req, res);'))).toBe(false);
  });

  it('finds getServerSideProps in every export shape', () => {
    const arrow = 'export const getServerSideProps = async (ctx) => {\n  const s = await x.auth.getSession();\n  return { props: {} };\n};\nfunction Page() { useEffect(() => { x.auth.getSession(); }); }';
    expect(getServerSidePropsBody(arrow)).toContain('getSession');
    expect(getServerSidePropsBody(arrow)).not.toContain('useEffect');

    const fn = 'export async function getServerSideProps(ctx) {\n  const f = () => { return 1; };\n  const s = await x.auth.getSession();\n  return { props: {} };\n}';
    expect(getServerSidePropsBody(fn)).toContain('getSession');

    const aliased = 'const load = async (ctx) => {\n  const { user } = session;\n  return { props: {} };\n};\nexport { load as getServerSideProps };';
    expect(READS_SESSION_USER.test(getServerSidePropsBody(aliased) ?? '')).toBe(true);

    const aliasedFn = 'async function load(ctx) {\n  await x.auth.getSession();\n}\nexport { load as getServerSideProps };';
    expect(getServerSidePropsBody(aliasedFn)).toContain('getSession');

    const bareExport = 'async function getServerSideProps(ctx) {\n  await x.auth.getSession();\n}\nexport { getServerSideProps };';
    expect(getServerSidePropsBody(bareExport)).toContain('getSession');

    const typed = 'export async function getServerSideProps(ctx): Promise<{ props: any }> {\n  await x.auth.getSession();\n  return { props: {} };\n}';
    expect(CALLS_GET_SESSION.test(getServerSidePropsBody(code(typed)) ?? '')).toBe(true);

    const braceInString = 'export const getServerSideProps = async (ctx) => {\n  const s = "}";\n  await x.auth.getSession();\n  return { props: {} };\n};';
    expect(CALLS_GET_SESSION.test(getServerSidePropsBody(code(braceInString)) ?? '')).toBe(true);

    expect(getServerSidePropsBody('export default function Page() { x.auth.getSession(); }')).toBeNull();
  });
});
