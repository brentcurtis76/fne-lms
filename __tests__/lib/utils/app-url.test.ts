// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAbsoluteUrl, getAppBaseUrl } from '../../../lib/utils/app-url';

const ENV_KEYS = [
  'NEXT_PUBLIC_BASE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_ENV',
  'NODE_ENV',
] as const;

// vitest runs with threads:false, so process.env is shared across files —
// snapshot and restore by deleting rather than assigning `undefined` (which
// would leave the literal string "undefined" behind).
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe('getAppBaseUrl — configured origin', () => {
  it('prefers the configured public base URL and drops trailing slashes', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://genera.example.cl/';
    expect(getAppBaseUrl({ headers: { host: 'attacker.test' } })).toBe('https://genera.example.cl');
  });

  it('falls back through SITE_URL and APP_URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.cl';
    expect(getAppBaseUrl()).toBe('https://site.example.cl');

    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.cl';
    expect(getAppBaseUrl()).toBe('https://app.example.cl');
  });
});

describe('getAppBaseUrl — development / preview', () => {
  it('uses the request host when nothing is configured', () => {
    expect(getAppBaseUrl({ headers: { host: 'genera.test' } })).toBe('https://genera.test');
  });

  it('uses http for localhost hosts', () => {
    expect(getAppBaseUrl({ headers: { host: 'localhost:3000' } })).toBe('http://localhost:3000');
  });

  it('falls back to localhost when there is no request and no config', () => {
    expect(getAppBaseUrl()).toBe('http://localhost:3000');
    expect(getAppBaseUrl(null)).toBe('http://localhost:3000');
  });

  it('a Vercel PREVIEW deployment still accepts the request host', () => {
    // VERCEL_ENV distinguishes preview from production; both run a production
    // build, so NODE_ENV alone cannot tell them apart.
    process.env.VERCEL_ENV = 'preview';
    process.env.NODE_ENV = 'production';
    expect(getAppBaseUrl({ headers: { host: 'my-branch.vercel.app' } })).toBe(
      'https://my-branch.vercel.app'
    );
  });
});

describe('getAppBaseUrl — production hardening', () => {
  it('throws when nothing is configured', () => {
    process.env.NODE_ENV = 'production';
    expect(() => getAppBaseUrl()).toThrow(/URL pública/i);
  });

  it('throws rather than trusting the Host header', () => {
    process.env.NODE_ENV = 'production';
    // The header is attacker-controlled and would otherwise be baked into
    // e-mail and .ics artifacts that outlive the request.
    expect(() => getAppBaseUrl({ headers: { host: 'attacker.test' } })).toThrow();
    try {
      getAppBaseUrl({ headers: { host: 'attacker.test' } });
    } catch (err) {
      expect((err as Error).message).not.toContain('attacker.test');
    }
  });

  it('VERCEL_ENV=production throws even when NODE_ENV says otherwise', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'development';
    expect(() => getAppBaseUrl({ headers: { host: 'attacker.test' } })).toThrow();
  });

  it('accepts VERCEL_PROJECT_PRODUCTION_URL and prepends https', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'genera.fne.cl';
    expect(getAppBaseUrl({ headers: { host: 'attacker.test' } })).toBe('https://genera.fne.cl');
  });

  it('accepts VERCEL_PROJECT_PRODUCTION_URL that already carries a scheme', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'https://genera.fne.cl/';
    expect(getAppBaseUrl()).toBe('https://genera.fne.cl');
  });

  it('an explicitly configured origin still wins over the deployment URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'genera.fne.cl';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://custom.example.cl';
    expect(getAppBaseUrl()).toBe('https://custom.example.cl');
  });

  it('rejects a configured value that is not a valid http(s) URL', () => {
    process.env.NODE_ENV = 'production';
    // No scheme — would otherwise be concatenated straight into every link.
    process.env.NEXT_PUBLIC_BASE_URL = 'genera.example.cl';
    expect(() => getAppBaseUrl()).toThrow();

    process.env.NEXT_PUBLIC_BASE_URL = 'javascript:alert(1)';
    expect(() => getAppBaseUrl()).toThrow();
  });

  it('rejects a malformed VERCEL_PROJECT_PRODUCTION_URL rather than guessing', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'not a host';
    expect(() => getAppBaseUrl()).toThrow();
  });

  it('a non-production build ignores an invalid configured value and falls back', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'genera.example.cl';
    expect(getAppBaseUrl({ headers: { host: 'localhost:3000' } })).toBe('http://localhost:3000');
  });
});

describe('buildAbsoluteUrl', () => {
  it('joins base and path', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://genera.example.cl';
    expect(buildAbsoluteUrl('/meet/session/abc')).toBe('https://genera.example.cl/meet/session/abc');
    expect(buildAbsoluteUrl('meet/session/abc')).toBe('https://genera.example.cl/meet/session/abc');
  });

  it('propagates the production failure instead of emitting a Host-derived link', () => {
    process.env.NODE_ENV = 'production';
    expect(() => buildAbsoluteUrl('/meet/session/abc', { headers: { host: 'attacker.test' } })).toThrow();
  });
});
