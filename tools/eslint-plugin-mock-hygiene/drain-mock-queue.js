/**
 * `drain-mock-queue` — a test file that queues module mocks must also statically
 * import a real module.
 *
 * WHY THIS RULE EXISTS
 *
 * `vi.mock()` does not register a mock. It pushes onto `VitestMocker.pendingIds`,
 * a *static* array on the mocker class (vitest 0.34's
 * `vendor-execute…js`). The queue is drained lazily by `resolveMocks()`, which
 * runs the next time anything resolves a module — and `mockPath()` reads the
 * current test filepath *at drain time* to decide which file the factory belongs
 * to.
 *
 * A file that queues a mock and then never resolves another module therefore
 * leaves its factory sitting in the queue when it finishes. The next file to
 * resolve a module drains it and has the factory registered against itself. It
 * inherits a mock it never asked for, of a module it may import for real.
 *
 * That is not hypothetical: it is what
 * `pages/api/qa/__tests__/scenarios.completion-filter.test.ts` did to whichever
 * file the sequencer happened to place after it, which surfaced either as
 * "[vitest] No <x> export is defined on the <y> mock" at collect time, or as a
 * silently no-op'd auth helper letting a 405 guard return 200.
 *
 * `vitest.config.ts` sets `threads: false`, so the whole suite shares one
 * process and one static array. `mockMap` itself is isolated correctly per file
 * — the queue is the hole, not the registry.
 *
 * WHAT COUNTS AS DRAINING
 *
 * A static `import` of any module other than `vitest` itself. Imports of
 * `vitest` do not count: they are internal requests that never reach the mocker,
 * which is precisely how the donor file above slipped through. Type-only imports
 * do not count either: they are erased before the module ever runs.
 *
 * A dynamic `await import()` inside a test body does not count. It drains the
 * queue only if that test actually executes — a `.skip`, a `-t` filter or a
 * `bail` leaves the queue full and the next file holding the bag. The static
 * import is the only form that is guaranteed to run, immediately after the
 * hoisted `vi.mock` calls, in the file that owns them.
 *
 * KNOWN LIMITATION, deliberately not fixed
 *
 * `vi.mock(...)` is matched syntactically, with no scope analysis, so a locally
 * declared `const vi = { mock() {} }` in a test file would be flagged too. That
 * shape does not exist in this repo and shadowing vitest's `vi` inside a test
 * file would be a worse problem than this rule. Resolving the binding is more
 * machinery than the false positive is worth.
 */

'use strict';

const QUEUEING_METHODS = new Set(['mock', 'doMock', 'unmock', 'doUnmock']);

/** `vitest` itself never reaches the mocker, so importing it drains nothing. */
function isVitestItself(source) {
  return source === 'vitest' || source.startsWith('vitest/');
}

/**
 * True when this declaration actually causes a module resolution at run time.
 * `import type {...}` is erased; so is an import whose every named specifier is
 * individually `type`. A bare `import 'x'` has no specifiers and always runs.
 */
function isValueImport(node) {
  if (node.importKind === 'type') return false;
  if (node.specifiers.length === 0) return true;
  return node.specifiers.some((spec) => spec.importKind !== 'type');
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'require a test file that queues vi.mock/doMock/unmock/doUnmock to statically import a non-vitest module, so its mock queue drains inside the file that owns it',
      recommended: true,
    },
    schema: [],
    messages: {
      orphanQueue:
        "`vi.{{method}}()` only queues onto vitest's static pendingIds array; the queue is drained by the next module resolution and the factory is registered against whichever file is running THEN. This file statically imports nothing but `vitest`, so its queue drains into the next test file, which inherits a mock it never asked for. Add a static import of the module under test (a dynamic `await import()` inside a test does not count — it does not run if the test is skipped or filtered).",
    },
  },

  create(context) {
    const queueCalls = [];
    let hasDrainingImport = false;

    return {
      ImportDeclaration(node) {
        if (isVitestItself(node.source.value)) return;
        if (!isValueImport(node)) return;
        hasDrainingImport = true;
      },

      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.object.type !== 'Identifier' || callee.object.name !== 'vi') return;
        if (callee.property.type !== 'Identifier') return;
        if (!QUEUEING_METHODS.has(callee.property.name)) return;
        queueCalls.push({ node, method: callee.property.name });
      },

      'Program:exit'() {
        if (hasDrainingImport || queueCalls.length === 0) return;
        // Report every call: whichever one a reader lands on should explain itself.
        for (const { node, method } of queueCalls) {
          context.report({ node, messageId: 'orphanQueue', data: { method } });
        }
      },
    };
  },
};
