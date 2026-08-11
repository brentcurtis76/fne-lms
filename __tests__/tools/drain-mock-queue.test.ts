// @vitest-environment node
/**
 * Contract for the local ESLint rule `mock-hygiene/drain-mock-queue`.
 *
 * The rule is the guard against the bug that produced this branch: `vi.mock()`
 * pushes onto vitest's *static* `pendingIds` array, the queue is drained by the
 * next module resolution, and the factory is registered against whichever file
 * is current at drain time. A file that queues a mock and statically imports
 * nothing but `vitest` spills its queue into the next test file.
 *
 * The cases below are the shapes that matter: the donor that actually caused it
 * (`vi.mock` + `vitest` + a type-only import), the near-miss that only drains if
 * its tests happen to run (dynamic `import()`), and the ordinary files that must
 * keep linting clean.
 *
 * The `vi.mock(...)` text inside these fixtures is a string, not a call, so this
 * file does not trip its own rule.
 */
import { RuleTester } from 'eslint';
import { describe } from 'vitest';
import rule from '../../tools/eslint-plugin-mock-hygiene/drain-mock-queue';

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

// RuleTester drives vitest's global describe/it itself; wrapping it keeps the
// reporter output grouped with the rest of the suite.
describe('mock-hygiene/drain-mock-queue', () => {
  ruleTester.run('drain-mock-queue', rule as never, {
    valid: [
      {
        name: 'the ordinary shape: a mock plus a static import of the module under test',
        code: `
          import { describe, it, vi } from 'vitest';
          import handler from '@/pages/api/thing';
          vi.mock('@/lib/api-auth', () => ({ getApiUser: vi.fn() }));
        `,
      },
      {
        name: 'a bare side-effect import resolves, so it drains',
        code: `
          import { vi } from 'vitest';
          import '@testing-library/jest-dom';
          vi.mock('@/lib/api-auth', () => ({}));
        `,
      },
      {
        name: 'a mixed type/value named import still has a value specifier',
        code: `
          import { vi } from 'vitest';
          import { type Foo, bar } from '@/lib/thing';
          vi.doMock('@/lib/api-auth', () => ({}));
        `,
      },
      {
        name: 'no queueing call at all — the rule has nothing to say',
        code: `
          import { describe, it, expect } from 'vitest';
          expect(1).toBe(1);
        `,
      },
      {
        name: 'a non-queueing vi.* call is left alone',
        code: `
          import { vi } from 'vitest';
          vi.clearAllMocks();
          vi.stubEnv('X', '1');
        `,
      },
      {
        name: 'a default import is a value import',
        code: `
          import { vi } from 'vitest';
          import handler from '@/pages/api/thing';
          vi.mock('@/lib/api-auth', () => ({}));
        `,
      },
    ],

    invalid: [
      {
        name: 'the donor that caused this branch: vitest + a type-only import only',
        code: `
          import { describe, it, expect, vi, beforeEach } from 'vitest';
          import type { NextApiRequest, NextApiResponse } from 'next';
          vi.mock('@/lib/api-auth', () => ({ getApiUser: vi.fn() }));
        `,
        errors: [{ messageId: 'orphanQueue' }],
      },
      {
        name: 'a dynamic import inside a test does not count — it may never run',
        code: `
          import { it, vi } from 'vitest';
          vi.mock('../../lib/supabase-wrapper', () => ({}));
          it.skip('never runs', async () => {
            const { getMeetings } = await import('../../utils/meetingUtils');
          });
        `,
        errors: [{ messageId: 'orphanQueue' }],
      },
      {
        name: 'importing only vitest subpaths still drains nothing',
        code: `
          import { vi } from 'vitest';
          import { expect } from 'vitest/expect';
          vi.unmock('@/lib/api-auth');
        `,
        errors: [{ messageId: 'orphanQueue' }],
      },
      {
        name: 'doUnmock in a hook leaks exactly like mock does',
        code: `
          import { afterEach, vi } from 'vitest';
          afterEach(() => {
            vi.doUnmock('../../../utils/roleUtils');
            vi.doUnmock('../../../lib/api-auth');
          });
        `,
        errors: [{ messageId: 'orphanQueue' }, { messageId: 'orphanQueue' }],
      },
      {
        name: 'every queueing call is reported, not just the first',
        code: `
          import { vi } from 'vitest';
          vi.mock('a/one', () => ({}));
          vi.mock('a/two', () => ({}));
          vi.mock('a/three', () => ({}));
        `,
        errors: [
          { messageId: 'orphanQueue' },
          { messageId: 'orphanQueue' },
          { messageId: 'orphanQueue' },
        ],
      },
    ],
  });
});
