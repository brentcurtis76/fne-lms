/**
 * Put back the jsdom globals a suite redefines with `Object.defineProperty`.
 *
 * WHY THIS IS SHARED RATHER THAN PER-FILE
 *
 * `vitest.config.ts` sets `threads: false`, and vitest sets the environment up
 * ONCE around the whole file loop rather than per file (`entry.js` wraps the
 * loop in `withEnv`). So every jsdom suite in a run shares one `window` and one
 * `navigator`, and `isolate` does not help: it resets the module registry
 * between files, not the DOM. A viewport or user agent left behind by one file
 * is inherited by whichever file the sequencer places next — and the suites that
 * assert the plain-link path do not set their own, so they silently assert
 * against someone else's browser.
 *
 * `vi.unstubAllGlobals()` does NOT cover this. It reverts `vi.stubGlobal` only.
 * A property installed with `Object.defineProperty` is invisible to it and
 * survives the file. (For anything set with `vi.stubGlobal` — `matchMedia`, say
 * — `vi.unstubAllGlobals()` is the right tool and this helper is not needed.)
 *
 * WHEN THE SNAPSHOT IS TAKEN
 *
 * At module evaluation, i.e. at import time — before any hook of the importing
 * file runs, and once per test file, since `isolate` invalidates the module
 * cache at each file boundary. Each file therefore restores exactly the state it
 * was handed. Once every polluting file calls this, what each one is handed is
 * the pristine jsdom default, and the arrangement is self-correcting.
 *
 * WHY `navigator` IS HANDLED BY SNAPSHOT AND NOT BY A LIST
 *
 * A hand-maintained list of property names is exactly the thing that goes stale:
 * the first version of this helper enumerated four properties, and a full-run
 * probe then found `mediaDevices` and `permissions` still leaking, because the
 * suites that set them do it through a `setNavigator(values)` loop whose keys no
 * grep for `defineProperty(navigator, '<name>')` can see.
 *
 * In a pristine jsdom, `navigator` has NO own properties at all — everything
 * (`userAgent`, `platform`, `maxTouchPoints`, …) lives on `Navigator.prototype`
 * as a getter. Measured: `Object.getOwnPropertyNames(navigator)` is `[]`. So the
 * correct restore is not "put these four back" but "remove every own property
 * that was not there when we started, and restore the descriptors of the ones
 * that were". Deleting the own property re-exposes the prototype getter, which
 * is what makes the reading correct again. That needs no list and cannot go
 * stale.
 *
 * `window` is the opposite case — it has hundreds of legitimate own properties
 * and tests add globals to it on purpose — so it stays an explicit list.
 */

/** The `window` properties the jsdom suites here redefine. */
const WINDOW_FACTS = ['innerWidth', 'innerHeight'] as const;

const hasDom = typeof window !== 'undefined';

const ORIGINAL_WINDOW_FACTS = hasDom
  ? WINDOW_FACTS.map((property) => ({
      property,
      descriptor: Object.getOwnPropertyDescriptor(window, property),
    }))
  : [];

const ORIGINAL_NAVIGATOR_OWN = hasDom
  ? Object.getOwnPropertyNames(window.navigator).map((property) => ({
      property,
      descriptor: Object.getOwnPropertyDescriptor(window.navigator, property),
    }))
  : [];

const ORIGINAL_NAVIGATOR_NAMES = new Set(ORIGINAL_NAVIGATOR_OWN.map((f) => f.property));

function restore(target: object, property: string, descriptor?: PropertyDescriptor): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    delete (target as Record<string, unknown>)[property];
  }
}

/**
 * Restore `window` and `navigator` to the state they were in when this module
 * was imported. Safe to call in a non-DOM environment, where it does nothing.
 */
export function restoreBrowserFacts(): void {
  if (!hasDom) return;

  for (const { property, descriptor } of ORIGINAL_WINDOW_FACTS) {
    restore(window, property, descriptor);
  }

  // Anything installed on `navigator` since import goes, whatever it is called.
  for (const property of Object.getOwnPropertyNames(window.navigator)) {
    if (!ORIGINAL_NAVIGATOR_NAMES.has(property)) {
      delete (window.navigator as unknown as Record<string, unknown>)[property];
    }
  }
  for (const { property, descriptor } of ORIGINAL_NAVIGATOR_OWN) {
    restore(window.navigator, property, descriptor);
  }
}
