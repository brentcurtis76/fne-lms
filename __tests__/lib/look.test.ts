// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLook,
  isLook,
  LOOK_ATTRIBUTE,
  LOOK_PREFERENCE_KEY,
  lookFromPreferences,
  lookOfAccount,
  mayChooseLook,
  preferencesWithLook,
} from '../../lib/look';

/**
 * Redesign 4d — the one rule of what an account's look is, and how it reaches the page.
 * The promise this file guards: an account that never chose is exactly as before — no
 * attribute on <html>, and nothing is ever kept in the browser (a copy there would belong
 * to the computer, not the account).
 */

const root = () => document.documentElement;

afterEach(() => {
  root().removeAttribute(LOOK_ATTRIBUTE);
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('the stored choice', () => {
  it('names: the profile key and the attribute', () => {
    expect(LOOK_PREFERENCE_KEY).toBe('ui_look');
    expect(LOOK_ATTRIBUTE).toBe('data-look');
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

  it('an account is shown its stored look only while it is offered the choice', () => {
    expect(lookOfAccount({ can_run_qa_tests: true, learning_preferences: { ui_look: 'nuevo' } })).toBe('nuevo');
    expect(lookOfAccount({ can_run_qa_tests: true, learning_preferences: {} })).toBe('clasico');
    // No longer a tester, or never one (a person who wrote the key into their own row by hand).
    expect(lookOfAccount({ can_run_qa_tests: false, learning_preferences: { ui_look: 'nuevo' } })).toBe('clasico');
    expect(lookOfAccount({ learning_preferences: { ui_look: 'nuevo' } })).toBe('clasico');
    expect(lookOfAccount(null)).toBe('clasico');
    expect(lookOfAccount(undefined)).toBe('clasico');
  });
});

describe('the look on the page', () => {
  it('today\'s look leaves <html> without the attribute', () => {
    applyLook('clasico');
    expect(root().hasAttribute(LOOK_ATTRIBUTE)).toBe(false);
  });

  it('the new look sets the attribute; going back removes it', () => {
    applyLook('nuevo');
    expect(root().getAttribute(LOOK_ATTRIBUTE)).toBe('nuevo');
    applyLook('nuevo');
    expect(root().getAttribute(LOOK_ATTRIBUTE)).toBe('nuevo');
    applyLook('clasico');
    expect(root().hasAttribute(LOOK_ATTRIBUTE)).toBe(false);
  });

  it('nothing is kept in the browser, whatever the look', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    applyLook('nuevo');
    applyLook('clasico');
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
