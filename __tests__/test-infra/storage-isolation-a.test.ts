// @vitest-environment jsdom
import { expect, it } from 'vitest';

// Paired with storage-isolation-b.test.ts: whichever file runs second
// fails if Web Storage leaks between test files (see tests/setup.ts).
it('starts with empty Web Storage, then writes to it', () => {
  expect(localStorage.getItem('storage-isolation-probe')).toBeNull();
  expect(sessionStorage.getItem('storage-isolation-probe')).toBeNull();
  localStorage.setItem('storage-isolation-probe', 'a');
  sessionStorage.setItem('storage-isolation-probe', 'a');
  expect(localStorage.getItem('storage-isolation-probe')).toBe('a');
});
