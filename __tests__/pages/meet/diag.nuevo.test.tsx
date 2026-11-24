// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Diagnóstico del equipo» (`/meet/diag`) in the new look (scenarios sc.md,
 * part H). No frame and no second tree: the look chooses the classes of the same elements. Pinned here:
 * the same words, elements and `data-testid`s in both looks (with and without the join form), the press
 * targets and fields at least 44 px by class, the camera button and the copy button doing what they do
 * today, and a look that arrives later moving no element (the SDK root is the same node). Synthetic data.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { restoreBrowserFacts } from '../../helpers/browser-facts';

const look = vi.hoisted(() => ({ value: 'clasico' as 'clasico' | 'nuevo' }));
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: look.value, setLook: () => {} }) }));

const getUserMedia = vi.fn();
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  getUserMedia.mockReset();
  getUserMedia.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]) },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  restoreBrowserFacts();
});

import MeetDiagPage from '../../../pages/meet/diag';

async function drawIn(which: 'clasico' | 'nuevo', joinAvailable: boolean) {
  cleanup();
  look.value = which;
  const view = render(<MeetDiagPage joinAvailable={joinAvailable} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}
const testids = (root: HTMLElement) => Array.from(root.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'));
const tags = (root: HTMLElement) => Array.from(root.querySelectorAll('*')).map((el) => el.tagName);
// The words, without the measurements' values and the report (they carry the time of the reading).
const words = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('h1, h2, p, th[scope="col"], th[scope="row"], button, a, label span'))
    .filter((el) => !el.closest('td'))
    .map((el) => el.textContent);

describe('/meet/diag, new look: the same page, other classes', () => {
  for (const joinAvailable of [false, true]) {
    it(`joinAvailable=${joinAvailable}: same words, elements and testids; other classes`, async () => {
      const before = (await drawIn('clasico', joinAvailable)).container;
      const clasico = { words: words(before), testids: testids(before), tags: tags(before), main: before.querySelector('main')!.className };
      const after = (await drawIn('nuevo', joinAvailable)).container;
      expect(words(after)).toEqual(clasico.words);
      expect(testids(after)).toEqual(clasico.testids);
      expect(tags(after)).toEqual(clasico.tags);
      expect(after.querySelector('main')!.className).not.toBe(clasico.main);
      expect(screen.getByText('Diagnóstico del equipo')).toBeTruthy();
      expect(screen.getByText('Reuniones · Diagnóstico')).toBeTruthy();
      for (const id of ['diag-media-probe-button', 'diag-copy-button', 'diag-back-link']) {
        expect(screen.getByTestId(id).className).toContain('min-h-[44px]');
      }
      if (joinAvailable) {
        for (const id of ['diag-join-button', 'diag-join-meeting-number', 'diag-join-passcode']) {
          expect(screen.getByTestId(id).className).toContain('min-h-[44px]');
        }
        expect(screen.getByTestId('diag-join-passcode').hasAttribute('required')).toBe(true);
        expect((screen.getByTestId('diag-join-button') as HTMLButtonElement).disabled).toBe(true);
      } else {
        expect(screen.getByTestId('diag-join-placeholder').textContent).toBe('Prueba de conexión: disponible próximamente.');
      }
    });
  }

  it('the state words keep today’s labels', async () => {
    const { container } = await drawIn('nuevo', false);
    const shown = new Set(Array.from(container.querySelectorAll('tbody td:last-child span')).map((el) => el.textContent));
    for (const word of shown) expect(['OK', 'Atención', 'Falla', 'Dato', 'Sin medir']).toContain(word);
    expect(shown.size).toBeGreaterThan(0);
  });

  it('«Probar cámara y micrófono» asks the browser, as today', async () => {
    await drawIn('nuevo', false);
    fireEvent.click(screen.getByTestId('diag-media-probe-button'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('«Copiar resultados» copies the same report, or says it could not', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await drawIn('nuevo', false);
    fireEvent.click(screen.getByTestId('diag-copy-button'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(writeText).toHaveBeenCalledWith((screen.getByTestId('diag-report-json') as HTMLTextAreaElement).value);
    expect(screen.getByTestId('diag-copy-ok').textContent).toBe('Copiado.');

    writeText.mockRejectedValue(new Error('no'));
    fireEvent.click(screen.getByTestId('diag-copy-button'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId('diag-copy-error').textContent).toBe(
      'No se pudo copiar automáticamente. Selecciona el texto de abajo y cópialo a mano.'
    );
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });

  it('a look that arrives later changes classes only: the same nodes, the SDK root kept', async () => {
    const { container, rerender } = await drawIn('clasico', true);
    const root = screen.getByTestId('diag-join-sdk-root');
    const rootClass = root.className;
    const count = container.querySelectorAll('*').length;
    look.value = 'nuevo';
    rerender(<MeetDiagPage joinAvailable />);
    expect(screen.getByTestId('diag-join-sdk-root')).toBe(root);
    expect(root.className).toBe(rootClass);
    expect(container.querySelectorAll('*').length).toBe(count);
    expect(container.querySelector('main')!.className).not.toContain('bg-gray-50');
  });
});
