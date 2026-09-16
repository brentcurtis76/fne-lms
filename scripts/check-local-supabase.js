#!/usr/bin/env node
/**
 * Fail-closed guard for `npm run dev` (invoked by scripts/pre-dev-check.sh).
 *
 * Resolves NEXT_PUBLIC_SUPABASE_URL exactly the way `next dev` will, using
 * Next's own loader (`@next/env` loadEnvConfig with dev=true), so precedence is
 * process env > .env.development.local > .env.local > .env.development > .env.
 * Startup is refused unless that URL is plain `http:` on a loopback host.
 *
 * Escape hatch: GENERA_ALLOW_REMOTE_SUPABASE=1 in the shell environment (env
 * files cannot set it) prints a warning and allows a non-loopback URL. It does
 * not bypass a missing, empty or unparsable value.
 *
 * If Next's loader reports any env file error, startup is refused: the loaded
 * configuration is incomplete. Loader messages are never printed, because they
 * carry file-system paths and raw exception text.
 *
 * Output names the variable and a host classification only — never the URL,
 * a key, a token or a path.
 */
const VARIABLE = 'NEXT_PUBLIC_SUPABASE_URL';
const ESCAPE_HATCH = 'GENERA_ALLOW_REMOTE_SUPABASE';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** @returns {'loopback' | 'missing' | 'empty' | 'unparsable' | 'non-http' | 'remote'} */
function classify(value) {
  if (value === undefined) return 'missing';
  if (value.trim() === '') return 'empty';

  let url;
  try {
    url = new URL(value);
  } catch {
    return 'unparsable';
  }

  if (!LOOPBACK_HOSTS.has(url.hostname)) return 'remote';
  if (url.protocol !== 'http:') return 'non-http';
  return 'loopback';
}

function main() {
  // Read before loadEnvConfig mutates process.env, so env files cannot enable it.
  const allowRemote = process.env[ESCAPE_HATCH] === '1';

  let loadEnvConfig;
  try {
    ({ loadEnvConfig } = require('@next/env'));
  } catch {
    console.error('[pre-dev-check] Cannot load @next/env; refusing to start dev.');
    return 1;
  }

  // Silent logger: Next's default logger prints loaded file names, and its error
  // messages include absolute paths and raw exceptions. Record errors, print nothing.
  let loaderFailed = false;
  const log = {
    info: () => {},
    error: () => {
      loaderFailed = true;
    },
  };
  let combinedEnv;
  try {
    ({ combinedEnv } = loadEnvConfig(process.cwd(), true, log));
  } catch {
    loaderFailed = true;
  }
  if (loaderFailed) {
    console.error(
      [
        '[pre-dev-check] Refusing to start dev: an env file could not be loaded.',
        '[pre-dev-check] Check the .env* files for invalid syntax or self-referencing variable expansion.',
      ].join('\n')
    );
    return 1;
  }

  const classification = classify(combinedEnv[VARIABLE]);

  if (classification === 'loopback') return 0;

  const canBypass = classification === 'remote' || classification === 'non-http';
  if (canBypass && allowRemote) {
    const bar = '!'.repeat(72);
    console.warn(
      [
        bar,
        `[pre-dev-check] WARNING: ${VARIABLE} is not a local http loopback URL (classification: ${classification}).`,
        `[pre-dev-check] ${ESCAPE_HATCH}=1 is set, so dev will start against a NON-LOCAL Supabase.`,
        '[pre-dev-check] Any data you create or change may be real.',
        bar,
      ].join('\n')
    );
    return 0;
  }

  const lines = [
    `[pre-dev-check] Refusing to start dev: ${VARIABLE} is ${classification}.`,
    '[pre-dev-check] Local dev requires a plain http URL on a loopback host (127.0.0.1, localhost or ::1; any port).',
    '[pre-dev-check] Set it in .env.development.local to your local Supabase instance.',
  ];
  if (canBypass) {
    lines.push(`[pre-dev-check] To knowingly use a non-local Supabase, set ${ESCAPE_HATCH}=1.`);
  }
  console.error(lines.join('\n'));
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { classify };
