/**
 * `npm run dev` must refuse to start unless the Supabase URL Next.js will load
 * in development is a loopback `http:` address (GENERA-DEVSAFE-01).
 *
 * Every case runs the real entrypoint in a child process against synthetic env
 * files in a temp directory — never the repository's own `.env*` files — with a
 * minimal child environment, so the developer's shell cannot leak in.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = process.cwd();
const SCRIPTS = ['scripts/check-local-supabase.js', 'scripts/pre-dev-check.sh'];
const ENTRYPOINTS = {
  checker: (root: string) => [process.execPath, path.join(root, SCRIPTS[0])],
  'pre-dev-check.sh': (root: string) => [path.join(root, SCRIPTS[1])],
} as const;

// Sentinels that must never appear in output (A7).
const SENTINEL_KEY = 'sentinel-service-role-key-5c1d9e';
const SENTINEL_TOKEN = 'sentinel-anon-token-a8b27f';
const SENTINEL_HOST = 'sentinel-remote-4e7b.example.supabase.co';
const REMOTE_URL = `https://${SENTINEL_HOST}`;
const LOCAL_URL = 'http://127.0.0.1:54421';
// Every temp project path carries this marker, so a printed path is detectable.
const SENTINEL_PATH = 'sentinel-path-9f3c21';
// Built without a literal `${...}` so it is not mistaken for a template string.
const SELF_REFERENCE = '$' + '{LOOP}';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type EnvFiles = Record<string, Record<string, string>>;

function makeProject(files: EnvFiles): string {
  const dir = mkdtempSync(path.join(tmpdir(), `pre-dev-check-${SENTINEL_PATH}-`));
  tempDirs.push(dir);
  for (const [name, vars] of Object.entries(files)) {
    const body = Object.entries(vars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    writeFileSync(path.join(dir, name), `${body}\n`);
  }
  return dir;
}

/** Base file with a remote URL plus secret-looking sentinels. */
function remoteBase(url = REMOTE_URL): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SENTINEL_TOKEN,
    SUPABASE_SERVICE_ROLE_KEY: SENTINEL_KEY,
  };
}

function run(
  entry: keyof typeof ENTRYPOINTS,
  cwd: string,
  extraEnv: Record<string, string> = {},
  root = REPO
) {
  const [command, ...args] = ENTRYPOINTS[entry](root);
  // Minimal environment: no NODE_ENV (would switch Next to test mode), no
  // inherited Supabase variables. PATH keeps the same node binary resolvable.
  const env = {
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
    ...extraEnv,
  };
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  // A spawn failure (e.g. EPERM) yields empty output, which would pass every
  // absence check vacuously.
  expect(result.error).toBeUndefined();
  expect(typeof result.status).toBe('number');
  const output = `${result.stdout}\n${result.stderr}`;

  // A7: no fixture value, path, URL or raw loader message ever reaches stdout or stderr.
  const forbidden = [
    SENTINEL_KEY,
    SENTINEL_TOKEN,
    SENTINEL_HOST,
    SENTINEL_PATH,
    cwd,
    'evil.test',
    '54421',
    '://',
    'Failed to load',
    'RangeError',
  ];
  for (const secret of forbidden) {
    expect(output).not.toContain(secret);
  }
  // Refusals always explain themselves with the fixed prefix.
  if (result.status !== 0) expect(output).toMatch(/\[pre-dev-check\] .*refusing to start dev/i);
  return { status: result.status, output };
}

describe.each(Object.keys(ENTRYPOINTS) as Array<keyof typeof ENTRYPOINTS>)(
  'pre-dev Supabase guard via %s',
  (entry) => {
    it('A1: allows a loopback override over a remote base file', () => {
      const dir = makeProject({
        '.env.local': remoteBase(),
        '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL },
      });
      expect(run(entry, dir).status).toBe(0);
    });

    it('A2: refuses a remote base file with no override', () => {
      const dir = makeProject({ '.env.local': remoteBase() });
      const { status, output } = run(entry, dir);
      expect(status).not.toBe(0);
      expect(output).toContain('NEXT_PUBLIC_SUPABASE_URL');
      expect(output).toContain('remote');
    });

    it('A3: process env wins over a local override file', () => {
      const dir = makeProject({
        '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL },
      });
      const { status, output } = run(entry, dir, { NEXT_PUBLIC_SUPABASE_URL: REMOTE_URL });
      expect(status).not.toBe(0);
      expect(output).toContain('remote');
    });

    it('A4: escape hatch allows a remote URL with a warning', () => {
      const dir = makeProject({ '.env.local': remoteBase() });
      const { status, output } = run(entry, dir, { GENERA_ALLOW_REMOTE_SUPABASE: '1' });
      expect(status).toBe(0);
      expect(output).toContain('WARNING');
      expect(output).toContain('NEXT_PUBLIC_SUPABASE_URL');
    });

    it('A4: escape hatch cannot be enabled from an env file', () => {
      const dir = makeProject({
        '.env.local': { ...remoteBase(), GENERA_ALLOW_REMOTE_SUPABASE: '1' },
      });
      expect(run(entry, dir).status).not.toBe(0);
    });

    it('A4: escape hatch only accepts the value 1', () => {
      const dir = makeProject({ '.env.local': remoteBase() });
      expect(run(entry, dir, { GENERA_ALLOW_REMOTE_SUPABASE: 'true' }).status).not.toBe(0);
    });

    it('A5: refuses a missing variable', () => {
      const dir = makeProject({ '.env.local': { SUPABASE_SERVICE_ROLE_KEY: SENTINEL_KEY } });
      const { status, output } = run(entry, dir);
      expect(status).not.toBe(0);
      expect(output).toContain('missing');
    });

    it('A5: refuses when no env files exist at all', () => {
      expect(run(entry, makeProject({})).status).not.toBe(0);
    });

    it('A5: refuses an empty variable', () => {
      const dir = makeProject({ '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: '' } });
      const { status, output } = run(entry, dir);
      expect(status).not.toBe(0);
      expect(output).toContain('empty');
    });

    it('A5: an empty override does not fall through to a local base value', () => {
      const dir = makeProject({
        '.env.local': { NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL },
        '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: '' },
      });
      expect(run(entry, dir).status).not.toBe(0);
    });

    it('A5: refuses an unparsable variable', () => {
      const dir = makeProject({
        '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: `not a url ${SENTINEL_TOKEN}` },
      });
      const { status, output } = run(entry, dir);
      expect(status).not.toBe(0);
      expect(output).toContain('unparsable');
    });

    it('A5: escape hatch does not bypass a missing variable', () => {
      const dir = makeProject({});
      expect(run(entry, dir, { GENERA_ALLOW_REMOTE_SUPABASE: '1' }).status).not.toBe(0);
    });

    it.each([
      'http://127.0.0.1.evil.test',
      'http://localhost@evil.test',
      'https://localhost.evil.test',
      'http://localhost.evil.test:54421',
      'http://evil.test/127.0.0.1',
    ])('A6: refuses look-alike host %s', (url) => {
      const dir = makeProject({ '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: url } });
      const { status, output } = run(entry, dir);
      expect(status).not.toBe(0);
      expect(output).toContain('remote');
    });

    it.each(['https://127.0.0.1:54421', 'https://localhost:54421'])(
      'decision 2: refuses non-http loopback %s',
      (url) => {
        const dir = makeProject({ '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: url } });
        const { status, output } = run(entry, dir);
        expect(status).not.toBe(0);
        expect(output).toContain('non-http');
      }
    );

    it.each(['http://127.0.0.1:54421', 'http://localhost:3000', 'http://[::1]:54421', 'http://localhost'])(
      'decision 2: allows loopback %s',
      (url) => {
        const dir = makeProject({ '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: url } });
        expect(run(entry, dir).status).toBe(0);
      }
    );

    /** Override file whose URL expands cyclically, which makes Next's loader error. */
    const cyclicOverride = {
      NEXT_PUBLIC_SUPABASE_URL: SELF_REFERENCE,
      LOOP: SELF_REFERENCE,
      SUPABASE_SERVICE_ROLE_KEY: SENTINEL_KEY,
    };

    it('R1a: an env loader error prints fixed text only and refuses a remote base', () => {
      const dir = makeProject({
        '.env.local': remoteBase(),
        '.env.development.local': cyclicOverride,
      });
      const { status, output } = run(entry, dir);
      expect(status).not.toBe(0);
      expect(output).toContain('an env file could not be loaded');
    });

    it('R1a: an env loader error fails closed even when the remaining files are local', () => {
      const dir = makeProject({
        '.env.local': { NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL },
        '.env.development.local': cyclicOverride,
      });
      const { status, output } = run(entry, dir);
      expect(status).not.toBe(0);
      expect(output).toContain('an env file could not be loaded');
    });

    it('R1a: escape hatch does not bypass an env loader error', () => {
      const dir = makeProject({
        '.env.local': remoteBase(),
        '.env.development.local': cyclicOverride,
      });
      const { status, output } = run(entry, dir, { GENERA_ALLOW_REMOTE_SUPABASE: '1' });
      expect(status).not.toBe(0);
      expect(output).not.toContain('WARNING');
    });

    it('R1b: refusal and warning guidance contain no URL', () => {
      const dir = makeProject({ '.env.local': remoteBase() });
      const refused = run(entry, dir);
      const warned = run(entry, dir, { GENERA_ALLOW_REMOTE_SUPABASE: '1' });
      expect(refused.output).toContain('loopback host');
      expect(warned.output).toContain('WARNING');
      for (const { output } of [refused, warned]) expect(output).not.toMatch(/https?:/);
    });

    it('fails closed when @next/env cannot be resolved', () => {
      // Scripts copied outside the repository have no node_modules to resolve from.
      const root = makeProject({});
      mkdirSync(path.join(root, 'scripts'));
      for (const script of SCRIPTS) copyFileSync(path.join(REPO, script), path.join(root, script));
      const dir = makeProject({ '.env.development.local': { NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL } });
      const { status, output } = run(entry, dir, {}, root);
      expect(status).not.toBe(0);
      expect(output).toContain('Cannot load @next/env');
    });
  }
);
