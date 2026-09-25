// @vitest-environment node
import { createRequire } from 'module';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The runtime configs call Sentry.init at import time. The SDK is replaced by
// spies so no client, transport or network request can ever be created here.
const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  httpIntegration: vi.fn(() => ({ name: 'Http' })),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
}));
vi.mock('@sentry/nextjs', () => sdk);

const ROOT = path.resolve(__dirname, '../..');
const SYNTHETIC_DSN = 'http://syntheticpublickey@127.0.0.1:59999/1';
const SYNTHETIC_SECRET = 'synthetic-service-role-secret';
const RUNTIMES = ['client', 'server', 'edge'] as const;
type Runtime = (typeof RUNTIMES)[number];

async function loadRuntimeConfig(runtime: Runtime, env: { dsn?: string; mode: string }) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', env.mode);
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', env.dsn ?? '');
  await import(`../../sentry.${runtime}.config.ts`);
}

function initOptions() {
  expect(sdk.init).toHaveBeenCalledTimes(1);
  return sdk.init.mock.calls[0][0];
}

function syntheticEvent() {
  return {
    request: {
      cookies: { 'sb-access-token': 'synthetic' },
      headers: {
        authorization: 'Bearer synthetic',
        Authorization: 'Bearer synthetic',
        cookie: 'sb=synthetic',
        Cookie: 'sb=synthetic',
        'user-agent': 'vitest',
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('next.config.js — withSentryConfig (D1)', () => {
  const requireCjs = createRequire(__filename);

  async function loadNextConfig() {
    const configPath = path.join(ROOT, 'next.config.js');
    delete requireCjs.cache[configPath];
    const exported = requireCjs(configPath);
    return typeof exported === 'function'
      ? exported('phase-production-build', { defaultConfig: {} })
      : exported;
  }

  function webpackArgs(config: any, isServer: boolean, nextRuntime?: string, dev = false) {
    const { webpack } = requireCjs(
      requireCjs.resolve('next/dist/compiled/webpack/webpack', { paths: [ROOT] })
    );
    const webpackConfig = {
      resolve: { fallback: {} },
      optimization: {},
      module: { rules: [] },
      plugins: [],
      entry: () => Promise.resolve({ 'pages/_app': ['./pages/_app.tsx'], main: ['./main.js'] }),
    };
    const options = { buildId: 'test', dev, isServer, nextRuntime, dir: ROOT, config, defaultLoaders: { babel: {} }, webpack, totalPages: 1 };
    return [webpackConfig, options] as const;
  }

  function sentryLoaders(webpackConfig: any): string[] {
    const paths = JSON.stringify(webpackConfig.module.rules).match(/@sentry[\\/]+nextjs[^"]*loaders[^"]*/g) ?? [];
    return paths.map((p) => path.basename(p));
  }

  async function clientPluginNames() {
    const config = await loadNextConfig();
    const [webpackConfig, options] = webpackArgs(config, false);
    const client = await config.webpack(webpackConfig, options);
    return client.plugins.map((p: any) => p?.constructor?.name);
  }

  it('keeps the existing headers, env, lint and build settings', async () => {
    const config = await loadNextConfig();

    expect(config.reactStrictMode).toBe(true);
    expect(config.poweredByHeader).toBe(false);
    expect(config.eslint).toEqual({ ignoreDuringBuilds: false, dirs: ['pages', 'components', 'lib', 'utils'] });
    expect(config.typescript).toEqual({ ignoreBuildErrors: false });
    expect(Object.keys(config.env)).toEqual(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
    expect(await config.generateBuildId()).toMatch(/^build-\d+$/);

    const headers = await config.headers();
    expect(headers.map((h: any) => h.source)).toEqual(['/:path*', '/meet/:path*']);
    expect(headers[0].headers).toContainEqual({ key: 'X-Frame-Options', value: 'SAMEORIGIN' });
    expect(headers[0].headers).toContainEqual({
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=()',
    });
  });

  it('runs the existing webpack hook and injects the client config into the browser bundle', async () => {
    const config = await loadNextConfig();

    const [clientConfig, clientOptions] = webpackArgs(config, false);
    const client = await config.webpack(clientConfig, clientOptions);
    expect(client.resolve.fallback).toEqual({ fs: false });
    expect((await client.entry())['pages/_app']).toEqual(['./sentry.client.config.ts', './pages/_app.tsx']);

    const [devConfig, devOptions] = webpackArgs(config, false, undefined, true);
    const dev = await config.webpack(devConfig, devOptions);
    expect(dev.optimization).toMatchObject({ removeAvailableModules: false, removeEmptyChunks: false, splitChunks: false });
  });

  it('registers Sentry loaders for the Node server and Edge compilations', async () => {
    const config = await loadNextConfig();

    for (const runtime of ['nodejs', 'edge']) {
      const [webpackConfig, options] = webpackArgs(config, true, runtime);
      const server = await config.webpack(webpackConfig, options);
      expect(server.resolve.fallback).toEqual({});
      // wrappingLoader wraps API routes, data fetchers and middleware and
      // imports sentry.server.config / sentry.edge.config into them.
      expect(sentryLoaders(server)).toContain('wrappingLoader.js');
    }
  });

  it('keeps the Sentry upload plugins off when no auth token is configured', async () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    expect(await clientPluginNames()).not.toContain('SentryCliPlugin');

    // Contrast: a (synthetic) token turns the plugin on. It is only
    // constructed here, never run, so nothing is uploaded.
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'synthetic-token');
    expect(await clientPluginNames()).toContain('SentryCliPlugin');
  });
});

describe('client replay opt-out (D2)', () => {
  it.each(['development', 'production'])('replay sample rates are 0 and no replay integration in %s', async (mode) => {
    await loadRuntimeConfig('client', { dsn: SYNTHETIC_DSN, mode });

    const options = initOptions();
    expect(options.dsn).toBe(SYNTHETIC_DSN);
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
    expect(sdk.replayIntegration).not.toHaveBeenCalled();
    expect(options.integrations.map((i: { name: string }) => i.name)).not.toContain('Replay');
  });

  it.each(RUNTIMES)('%s beforeSend still strips cookies and auth headers', async (runtime) => {
    await loadRuntimeConfig(runtime, { dsn: SYNTHETIC_DSN, mode: 'production' });

    const scrubbed = initOptions().beforeSend(syntheticEvent(), {});
    expect(scrubbed.request.headers).toEqual({ 'user-agent': 'vitest' });
    if (runtime !== 'edge') expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.tags.runtime).toBe(runtime);
  });
});

describe('student data scrubbing (D1)', () => {
  // Synthetic marker only; it stands in for a student identifier.
  const MARKER = 'synthetic-minor-7f3a';

  function studentEvent(url = `https://genera.example.test/user/${MARKER}/perfil?alumno=${MARKER}#${MARKER}`) {
    const event = syntheticEvent();
    return {
      ...event,
      request: {
        ...event.request,
        url,
        query_string: `alumno=${MARKER}`,
        data: { rut: MARKER, nombre: MARKER },
        headers: { ...event.request.headers, referer: `https://genera.example.test/user/${MARKER}`, Referer: MARKER },
      },
      user: { id: MARKER, email: `${MARKER}@example.invalid`, username: MARKER, roles: ['docente'] },
      breadcrumbs: [
        { category: 'navigation', data: { from: `/user/${MARKER}`, to: `/login?alumno=${MARKER}` } },
        { category: 'fetch', data: { method: 'GET', url: `https://db.example.test/rest/v1/perfiles?id=eq.${MARKER}` } },
        { category: 'http', data: { url: `https://db.example.test/${MARKER}`, 'http.query': `id=${MARKER}`, 'http.fragment': MARKER } },
      ],
    };
  }

  it.each(RUNTIMES)('%s beforeSend leaves no marker in URL, breadcrumbs, request data or user', async (runtime) => {
    await loadRuntimeConfig(runtime, { dsn: SYNTHETIC_DSN, mode: 'production' });

    const scrubbed = initOptions().beforeSend(studentEvent(), {});
    expect(JSON.stringify(scrubbed)).not.toContain(MARKER);
    expect(scrubbed.request.url).toBe('https://genera.example.test');
    expect(scrubbed.request.headers).toEqual({ 'user-agent': 'vitest' });
    if (runtime !== 'edge') expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.breadcrumbs.map((b: any) => b.data.url)).toEqual([undefined, 'https://db.example.test', 'https://db.example.test']);
    expect(scrubbed.tags.runtime).toBe(runtime);
    if (runtime === 'client') expect(scrubbed.tags.primary_role).toBe('docente');
  });

  function tracedEvent() {
    return {
      ...studentEvent(),
      transaction: `/user/${MARKER}/perfil`,
      tags: { transaction: `/user/${MARKER}/perfil` },
      spans: [
        {
          op: 'http.client',
          description: `GET https://db.example.test/rest/v1/perfiles?id=eq.${MARKER}`,
          data: { 'http.url': `https://db.example.test/rest/v1/perfiles?id=eq.${MARKER}`, 'http.method': 'GET' },
        },
      ],
    };
  }

  it.each(RUNTIMES)('%s keeps tracing sampled at exactly 0 in development and production', async (runtime) => {
    for (const mode of ['development', 'production']) {
      vi.clearAllMocks();
      await loadRuntimeConfig(runtime, { dsn: SYNTHETIC_DSN, mode });

      const options = initOptions();
      expect(options.tracesSampleRate).toBe(0);
      expect(options.tracesSampler).toBeUndefined();
      expect(options.enableTracing).toBeUndefined();
    }
  });

  it.each(RUNTIMES)('%s beforeSendTransaction drops an explicitly submitted transaction with marked name and spans', async (runtime) => {
    await loadRuntimeConfig(runtime, { dsn: SYNTHETIC_DSN, mode: 'production' });

    expect(initOptions().beforeSendTransaction({ ...tracedEvent(), type: 'transaction' }, {})).toBeNull();
  });

  it.each(RUNTIMES)('%s beforeSend removes the transaction name and spans from an error event', async (runtime) => {
    await loadRuntimeConfig(runtime, { dsn: SYNTHETIC_DSN, mode: 'production' });

    const scrubbed = initOptions().beforeSend(tracedEvent(), {});
    expect(JSON.stringify(scrubbed)).not.toContain(MARKER);
    expect(scrubbed).not.toHaveProperty('transaction');
    expect(scrubbed).not.toHaveProperty('spans');
    expect(scrubbed.tags).not.toHaveProperty('transaction');
    expect(scrubbed.tags.runtime).toBe(runtime);
  });

  it.each(RUNTIMES)('%s drops a URL it cannot parse and accepts an event without request', async (runtime) => {
    await loadRuntimeConfig(runtime, { dsn: SYNTHETIC_DSN, mode: 'production' });
    const { beforeSend } = initOptions();

    const scrubbed = beforeSend(studentEvent(`/user/${MARKER}?alumno=${MARKER}`), {});
    expect(JSON.stringify(scrubbed)).not.toContain(MARKER);
    expect(scrubbed.request.url).toBeUndefined();
    expect(beforeSend({}, {}).tags.runtime).toBe(runtime);
  });
});

describe('missing DSN (D3)', () => {
  it.each(RUNTIMES)('%s config loads without initializing Sentry or logging secrets', async (runtime) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SYNTHETIC_SECRET);

    await expect(loadRuntimeConfig(runtime, { mode: 'production' })).resolves.toBeUndefined();

    expect(sdk.init).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    const logged = [console.warn, console.log].flatMap((fn) => vi.mocked(fn).mock.calls.flat()).join('\n');
    expect(logged).toContain('DSN not configured');
    expect(logged).not.toContain(SYNTHETIC_SECRET);
    expect(logged).not.toMatch(/https?:\/\//);
  });
});
