import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';
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

// Node >= 25 ships its own global localStorage/sessionStorage (localStorage
// is undefined unless --localstorage-file is given; sessionStorage is a
// process-wide store). Vitest's jsdom environment does not copy globals that
// already exist, so jsdom's Web Storage is shadowed: storage-backed suites
// fail and values can leak between test files. CI runs Node 22 and is not
// affected. When a storage global was not installed by the jsdom environment
// (its accessor differs from the one Vitest uses for `document`), install a
// fresh jsdom Storage for this file and restore the original afterwards.
if (typeof document !== 'undefined') {
  const envAccessor = Object.getOwnPropertyDescriptor(globalThis, 'document')?.get?.toString();
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    const fromJsdomEnv = Boolean(envAccessor && original?.get && original.get.toString() === envAccessor);
    if (fromJsdomEnv) continue;
    const storage = new JSDOM('', { url: globalThis.location?.href || 'http://localhost:3000/' }).window[key];
    Object.defineProperty(globalThis, key, { value: storage, configurable: true, writable: true });
    afterAll(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete (globalThis as Record<string, unknown>)[key];
    });
  }
}

afterEach(() => {
  cleanup();
});
