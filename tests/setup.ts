import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// vitest runs with threads:false, so every test file shares one process.env.
// Several modules (e.g. lib/notificationService.ts) construct a Supabase client
// at import time and throw on a missing/invalid URL. Guarantee a valid baseline
// here so a sibling suite that leaves a bad value behind (e.g. the string
// "undefined") can't break unrelated imports. Setup files re-run before each
// test file, so this re-validates the baseline throughout the run. Suites may
// still override these within their own hooks. Test-only — no production impact.
if (!/^https?:\/\//i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
}

// Node >= 25 ships its own global localStorage/sessionStorage (undefined
// unless --localstorage-file is given). Vitest's jsdom environment does not
// copy globals that already exist, so jsdom's Web Storage is shadowed and every
// storage-backed suite fails on such a Node (CI runs Node 22 and is not
// affected). In a DOM environment, put a working jsdom Storage back.
const OWN_STORAGE = Symbol.for('genera.test.jsdomStorage');
if (typeof document !== 'undefined') {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    let usable = false;
    try {
      const current = globalThis[key] as (Storage & { [OWN_STORAGE]?: true }) | undefined;
      // Our own replacement is renewed per test file, like jsdom's would be.
      usable = typeof current?.getItem === 'function' && !current[OWN_STORAGE];
    } catch {
      usable = false;
    }
    if (!usable) {
      const storage = new JSDOM('', { url: globalThis.location?.href || 'http://localhost:3000/' }).window[key];
      Object.defineProperty(storage, OWN_STORAGE, { value: true });
      Object.defineProperty(globalThis, key, { value: storage, configurable: true, writable: true });
    }
  }
}

afterEach(() => {
  cleanup();
});
