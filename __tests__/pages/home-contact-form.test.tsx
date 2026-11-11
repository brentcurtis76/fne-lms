// @vitest-environment jsdom
/**
 * The homepage contact form's two bot-screening additions, as the browser
 * sends them: a trap field nobody filling the form honestly can reach, and the
 * time between the form appearing and its submission. What /api/contact does
 * with them is `__tests__/api/contact.test.ts`; the rules themselves are
 * `__tests__/lib/formSpamGuard.test.ts`. All values are synthetic.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/script', () => ({ default: () => null }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

import HomePage from '../../pages/index';

const START = new Date('2026-11-11T12:00:00.000Z').getTime();

function field(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`no #${id}`);
  return element as HTMLInputElement;
}

function fillAsAPerson() {
  fireEvent.change(field('nombre'), { target: { value: 'Carolina Muñoz Sepúlveda' } });
  fireEvent.change(field('email'), { target: { value: 'direccion@colegio-los-aromos.example' } });
  fireEvent.change(field('institucion'), { target: { value: 'Colegio Los Aromos de Ejemplo' } });
  fireEvent.change(field('interes'), { target: { value: 'inicia' } });
  fireEvent.change(field('mensaje'), { target: { value: 'Queremos saber más del programa.' } });
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function postedBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/contact');
  return JSON.parse((init as RequestInit).body as string);
}

let now = START;

beforeEach(() => {
  now = START;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('homepage contact form — trap field', () => {
  it('is out of the tab order and the accessibility tree, off-screen, and empty', () => {
    render(<HomePage />);
    const trap = screen.getByTestId('contact-website') as HTMLInputElement;

    expect(trap.name).toBe('website');
    expect(trap.value).toBe('');
    expect(trap.tabIndex).toBe(-1);
    expect(trap.required).toBe(false);
    expect(trap.getAttribute('autocomplete')).toBe('off');

    const wrapper = trap.closest('[aria-hidden="true"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('left-[-9999px]');
    // Off-screen, not `display:none`: a script that skips hidden inputs still fills it.
    expect(wrapper?.classList.contains('hidden')).toBe(false);
  });

  it('does not sit first in the form, so the visible spacing is unchanged', () => {
    render(<HomePage />);
    const form = screen.getByTestId('contact-website').closest('form');
    expect(form?.firstElementChild?.querySelector('#nombre')).not.toBeNull();
  });
});

describe('homepage contact form — what is posted', () => {
  it('a person: the six fields as before, an empty trap field and the elapsed time', async () => {
    const fetchMock = mockFetch(200, { success: true, message: 'Mensaje enviado exitosamente.' });
    render(<HomePage />);

    fillAsAPerson();
    now = START + 95000;
    fireEvent.submit(field('nombre').closest('form') as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock)).toEqual({
      nombre: 'Carolina Muñoz Sepúlveda',
      email: 'direccion@colegio-los-aromos.example',
      institucion: 'Colegio Los Aromos de Ejemplo',
      cargo: '',
      interes: 'inicia',
      mensaje: 'Queremos saber más del programa.',
      website: '',
      elapsedMs: 95000,
    });
    expect(await screen.findByText('Mensaje enviado exitosamente.')).toBeInTheDocument();
  });

  it('a script that fills the trap field: its value is posted for the route to judge', async () => {
    const fetchMock = mockFetch(200, { success: true });
    render(<HomePage />);

    fillAsAPerson();
    fireEvent.change(screen.getByTestId('contact-website'), { target: { value: 'https://spam.example' } });
    now = START + 400;
    fireEvent.submit(field('nombre').closest('form') as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock)).toMatchObject({ website: 'https://spam.example', elapsedMs: 400 });
  });

  it('a refused submission shows the route’s message, which names another way to write', async () => {
    const refusal =
      'No pudimos enviar tu mensaje desde este formulario. Por favor escríbenos directamente a info@nuevaeducacion.org.';
    mockFetch(422, { error: refusal });
    render(<HomePage />);

    fillAsAPerson();
    now = START + 95000;
    fireEvent.submit(field('nombre').closest('form') as HTMLFormElement);

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    // What the person typed is still there to copy.
    expect(field('mensaje').value).toBe('Queremos saber más del programa.');
  });
});
