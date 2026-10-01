// @vitest-environment jsdom
import { expect, it } from 'vitest';

// Paired with storage-isolation-a.test.ts: whichever file runs second
// fails if Web Storage leaks between test files (see tests/setup.ts).
it('starts with empty Web Storage, then writes to it', () => {
  expect(localStorage.getItem('storage-isolation-probe')).toBeNull();
  expect(sessionStorage.getItem('storage-isolation-probe')).toBeNull();
  localStorage.setItem('storage-isolation-probe', 'b');
  sessionStorage.setItem('storage-isolation-probe', 'b');
  expect(localStorage.getItem('storage-isolation-probe')).toBe('b');
});
