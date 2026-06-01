import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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

afterEach(() => {
  cleanup();
});
