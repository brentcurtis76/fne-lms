// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAbsoluteUrl, getAppBaseUrl } from '../../../lib/utils/app-url';

const ENV_KEYS = [
  'NEXT_PUBLIC_BASE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
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

describe('getAppBaseUrl', () => {
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
});

describe('buildAbsoluteUrl', () => {
  it('joins base and path', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://genera.example.cl';
    expect(buildAbsoluteUrl('/meet/session/abc')).toBe('https://genera.example.cl/meet/session/abc');
    expect(buildAbsoluteUrl('meet/session/abc')).toBe('https://genera.example.cl/meet/session/abc');
  });
});
