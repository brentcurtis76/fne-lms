// @vitest-environment node
/**
 * F15b (RD-c): the two old sign-in addresses, `/auth/login` and `/auth/signin`,
 * answered 404 while live pages still sent people there. next.config.js now
 * answers them with temporary redirects to the plain sign-in page. Query
 * values are not carried over.
 *
 * The config is loaded the way __tests__/config/sentry-config.test.ts loads it:
 * through a CommonJS require, unwrapping what `withSentryConfig` returns.
 */
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const requireCjs = createRequire(__filename);

async function loadNextConfig() {
  const configPath = path.join(ROOT, 'next.config.js');
  delete requireCjs.cache[configPath];
  const exported = requireCjs(configPath);
  return typeof exported === 'function'
    ? exported('phase-production-build', { defaultConfig: {} })
    : exported;
}

describe('next.config.js — old sign-in addresses (RD-c)', () => {
  it('redirects /auth/login and /auth/signin to /login, not permanently', async () => {
    const config = await loadNextConfig();
    expect(typeof config.redirects).toBe('function');
    const redirects = await config.redirects();
    expect(redirects).toEqual([
      { source: '/auth/login', destination: '/login', permanent: false },
      { source: '/auth/signin', destination: '/login', permanent: false },
    ]);
  });
});
