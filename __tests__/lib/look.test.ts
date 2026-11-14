// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLook,
  EARLY_LOOK_SCRIPT,
  isLook,
  LOOK_ATTRIBUTE,
  LOOK_PREFERENCE_KEY,
  LOOK_STORAGE_KEY,
  lookFromPreferences,
  mayChooseLook,
  preferencesWithLook,
} from '../../lib/look';

/**
 * Redesign 4d — the one rule of what an account's look is, and how it reaches the page.
 * The promise this file guards: an account that never chose is exactly as before — no
 * attribute on <html>, nothing stored.
 */

const root = () => document.documentElement;

afterEach(() => {
  root().removeAttribute(LOOK_ATTRIBUTE);
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('the stored choice', () => {
  it('names: the profile key, the attribute, the browser copy', () => {
    expect(LOOK_PREFERENCE_KEY).toBe('ui_look');
    expect(LOOK_ATTRIBUTE).toBe('data-look');
    expect(LOOK_STORAGE_KEY).toBe('genera.look');
  });

  it('only the exact value "nuevo" is the new look; everything else is today\'s', () => {
    expect(lookFromPreferences({ ui_look: 'nuevo' })).toBe('nuevo');
    for (const preferences of [undefined, null, {}, [], 'nuevo', 7, { ui_look: 'NUEVO' }, { ui_look: true }, { ui_look: 'clasico' }, { look: 'nuevo' }, [{ ui_look: 'nuevo' }]]) {
      expect(lookFromPreferences(preferences), JSON.stringify(preferences)).toBe('clasico');
    }
  });

  it('writing a look keeps every other key; today\'s look is the key\'s absence', () => {
    expect(preferencesWithLook({ pace: 'slow', ui_look: 'x' }, 'nuevo')).toEqual({ pace: 'slow', ui_look: 'nuevo' });
    expect(preferencesWithLook({ pace: 'slow', ui_look: 'nuevo' }, 'clasico')).toEqual({ pace: 'slow' });
    expect(preferencesWithLook(null, 'clasico')).toEqual({});
    expect(preferencesWithLook(['odd'], 'nuevo')).toEqual({ ui_look: 'nuevo' });
    const stored = { pace: 'slow' };
    preferencesWithLook(stored, 'nuevo');
    expect(stored).toEqual({ pace: 'slow' }); // never changed in place
  });

  it('isLook accepts the two looks and nothing else', () => {
    expect([isLook('nuevo'), isLook('clasico')]).toEqual([true, true]);
    expect([isLook(''), isLook('Nuevo'), isLook(null), isLook(undefined), isLook(1), isLook({})]).toEqual([false, false, false, false, false, false]);
  });

  it('the choice is offered to QA testers only', () => {
    expect(mayChooseLook({ can_run_qa_tests: true })).toBe(true);
    for (const profile of [null, undefined, {}, { can_run_qa_tests: false }, { can_run_qa_tests: null }, { can_run_qa_tests: 'true' as unknown as boolean }]) {
      expect(mayChooseLook(profile)).toBe(false);
    }
  });
});

describe('the look on the page', () => {
  it('today\'s look leaves <html> without the attribute and stores nothing', () => {
    applyLook('clasico');
    expect(root().hasAttribute(LOOK_ATTRIBUTE)).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });

  it('the new look sets the attribute and the browser copy; going back removes both', () => {
    applyLook('nuevo');
    expect(root().getAttribute(LOOK_ATTRIBUTE)).toBe('nuevo');
    expect(window.localStorage.getItem(LOOK_STORAGE_KEY)).toBe('nuevo');
    applyLook('clasico');
    expect(root().hasAttribute(LOOK_ATTRIBUTE)).toBe(false);
    expect(window.localStorage.getItem(LOOK_STORAGE_KEY)).toBeNull();
  });

  it('blocked storage does not stop the attribute', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => applyLook('nuevo')).not.toThrow();
    expect(root().getAttribute(LOOK_ATTRIBUTE)).toBe('nuevo');
  });
});

describe('the early script of <head>', () => {
  const run = () => new Function(EARLY_LOOK_SCRIPT)();

  it('does nothing in a browser that never showed the new look', () => {
    run();
    expect(root().hasAttribute(LOOK_ATTRIBUTE)).toBe(false);
    window.localStorage.setItem(LOOK_STORAGE_KEY, 'clasico');
    run();
    expect(root().hasAttribute(LOOK_ATTRIBUTE)).toBe(false);
  });

  it('applies the new look when this browser showed it last', () => {
    window.localStorage.setItem(LOOK_STORAGE_KEY, 'nuevo');
    run();
    expect(root().getAttribute(LOOK_ATTRIBUTE)).toBe('nuevo');
  });

  it('never throws, even with storage blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(run).not.toThrow();
    expect(root().hasAttribute(LOOK_ATTRIBUTE)).toBe(false);
  });

  it('is plain text with no tag in it (it is written into the page as is)', () => {
    expect(EARLY_LOOK_SCRIPT).not.toMatch(/[<>]/);
    expect(EARLY_LOOK_SCRIPT).toContain(LOOK_STORAGE_KEY);
    expect(EARLY_LOOK_SCRIPT).toContain(LOOK_ATTRIBUTE);
  });
});
