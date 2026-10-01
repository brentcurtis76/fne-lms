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

const READS_SESSION_USER = /\bsession\s*\??\.\s*user\b/;
const CALLS_GET_SESSION = /\.getSession\s*\(/;

/** The body of `export const getServerSideProps = ...` / `export async function getServerSideProps`. */
function getServerSidePropsBody(source: string): string | null {
  const start = source.search(/export\s+(const|async\s+function)\s+getServerSideProps\b/);
  if (start < 0) return null;
  const open = source.indexOf('{', source.indexOf('=>', start) > -1 ? source.indexOf('=>', start) : start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
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
    expect(READS_SESSION_USER.test(code('// session.user.id was the bug'))).toBe(false);
    expect(CALLS_GET_SESSION.test(code('await supabase.auth.getSession();'))).toBe(true);
    expect(CALLS_GET_SESSION.test(code('const caller = await requireVerifiedCaller(req, res);'))).toBe(false);
    expect(
      getServerSidePropsBody('export const getServerSideProps = async (ctx) => {\n  const { data: { session } } = await s.auth.getSession();\n  return { props: {} };\n};\nfunction Page() { useEffect(() => {}); }')
    ).toContain('getSession');
  });
});
