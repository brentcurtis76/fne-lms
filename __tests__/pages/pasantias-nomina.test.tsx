// @vitest-environment jsdom
/**
 * PASANT-PARTICIPANT-INTAKE (FIRST §5, §8) — the ACTUAL coordinator page,
 * `pages/pasantias/nomina.tsx`. Only `next/head` is replaced (so its tags land
 * in the rendered markup) and `fetch` is answered explicitly by each test.
 *
 * Server side: empty props, the two headers, and HTML with no school or
 * personal data. Client side: the form never pre-fills, errors are announced
 * and focused, "Otra" opens and clears its detail, a retried create reuses its
 * clientRequestId, and a replay that stored other values keeps what was typed.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('next/head', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import NominaPage, { getServerSideProps } from '../../pages/pasantias/nomina';

// 1 + 40 + 2 = 43 base64url characters, the shape the page's fragment reader
// requires. (r1 had 45, so the page correctly treated the link as missing.)
const TOKEN = 'N' + 'q7W8e9R0t1'.repeat(4) + '-_';
const SCHOOL = 'Colegio Sintético de Prueba';

const ROSTER = {
  schoolName: SCHOOL,
  program: 'inspira',
  programName: 'Pasantía INSPIRA',
  status: 'open',
  version: 1,
  submittedAt: null,
  lastSubmittedAt: null,
  expiresAt: '2027-03-01T00:00:00.000Z',
};

function participant(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    version: 1,
    firstNames: 'Valentina',
    lastNames: 'Sintetica',
    rut: '12345678-5',
    passportNumber: null,
    flightsFunding: 'sep',
    lodgingFunding: 'colegio',
    arrivalDate: null,
    departureDate: null,
    focus: null,
    dietaryRestrictions: [],
    dietaryOther: null,
    updatedAt: '2026-10-27T12:00:00.000Z',
    ...overrides,
  };
}

type Reply = { status: number; body: unknown } | 'network';
let replies: Reply[] = [];
const fetchMock = vi.fn();

function reply(r: Reply) {
  replies.push(r);
}

beforeEach(() => {
  replies = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => {
    const next = replies.shift();
    if (!next) return Promise.reject(new Error('unexpected fetch'));
    if (next === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ status: next.status, json: () => Promise.resolve(next.body) });
  });
  vi.stubGlobal('fetch', fetchMock);
  window.location.hash = `#k=${TOKEN}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function bodyOf(callIndex: number): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[callIndex][1].body));
}

async function openWithEmptyRoster() {
  reply({ status: 200, body: { roster: ROSTER, participants: [] } });
  render(<NominaPage />);
  await screen.findByTestId('intake-school');
  await screen.findByTestId('intake-form');
}

function fillValid() {
  fireEvent.change(screen.getByTestId('intake-first-names'), { target: { value: 'Valentina' } });
  fireEvent.change(screen.getByTestId('intake-last-names'), { target: { value: 'Sintetica' } });
  fireEvent.change(screen.getByTestId('intake-rut'), { target: { value: '12.345.678-5' } });
  fireEvent.change(screen.getByTestId('intake-flights-funding'), { target: { value: 'sep' } });
  fireEvent.change(screen.getByTestId('intake-lodging-funding'), { target: { value: 'colegio' } });
  fireEvent.click(screen.getByTestId('intake-ack'));
}

describe('server render', () => {
  it('getServerSideProps returns empty props and sets exactly the two headers', async () => {
    const setHeader = vi.fn();
    const result = await getServerSideProps({ res: { setHeader } } as any);
    expect(result).toEqual({ props: {} });
    expect(setHeader.mock.calls).toEqual([
      ['Cache-Control', 'private, no-store, max-age=0'],
      ['X-Robots-Tag', 'noindex, nofollow'],
    ]);
  });

  it('the HTML carries the robots and referrer tags and no school or personal data', () => {
    const html = renderToString(<NominaPage />);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(html).toContain('<meta name="referrer" content="no-referrer"/>');
    expect(html).toContain('Cargando nómina');
    expect(html).not.toContain(SCHOOL);
    expect(html).not.toContain(TOKEN);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('link handling', () => {
  it('uses a well-formed synthetic token fixture (43 base64url characters)', () => {
    expect(TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('a malformed fragment token (wrong length) is treated as missing and calls nothing', async () => {
    window.location.hash = `#k=${TOKEN}xy`;
    render(<NominaPage />);
    expect(await screen.findByTestId('intake-state-missing')).toHaveTextContent(
      'Enlace incompleto o no disponible — contacta a FNE'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a missing token shows the unavailable message and calls nothing', async () => {
    window.location.hash = '';
    render(<NominaPage />);
    expect(await screen.findByTestId('intake-state-missing')).toHaveTextContent(
      'Enlace incompleto o no disponible — contacta a FNE'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the token only as "Authorization: Intake", keeps the fragment, and shows the school', async () => {
    await openWithEmptyRoster();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/pasantias/participants');
    expect(init.headers.Authorization).toBe(`Intake ${TOKEN}`);
    expect(String(url)).not.toContain(TOKEN);
    expect(window.location.hash).toBe(`#k=${TOKEN}`);
    expect(screen.getByTestId('intake-school')).toHaveTextContent(SCHOOL);
  });

  it('a dead link (401 LINK_UNAVAILABLE) shows the unavailable message', async () => {
    reply({ status: 401, body: { code: 'LINK_UNAVAILABLE' } });
    render(<NominaPage />);
    expect(await screen.findByTestId('intake-state-unavailable')).toHaveTextContent('contacta a FNE');
  });
});

describe('the ficha', () => {
  it('never pre-fills funding, dates, focus or dietary', async () => {
    await openWithEmptyRoster();
    expect(screen.getByTestId('intake-flights-funding')).toHaveValue('');
    expect(screen.getByTestId('intake-lodging-funding')).toHaveValue('');
    expect(screen.getByTestId('intake-arrival-date')).toHaveValue('');
    expect(screen.getByTestId('intake-departure-date')).toHaveValue('');
    expect(screen.getByTestId('intake-focus')).toHaveValue('');
    expect(screen.getByTestId('intake-dietary-vegano')).not.toBeChecked();
    // The program's own dates, labelled with weekdays.
    expect(screen.getByRole('option', { name: /jueves 4 de febrero de 2027/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /sábado 30 de enero/ })).not.toBeInTheDocument();
  });

  it('shows errors under the fields, announces them and focuses the first invalid field, sending nothing', async () => {
    await openWithEmptyRoster();
    fireEvent.click(screen.getByTestId('intake-ack'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    const first = screen.getByTestId('intake-first-names');
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first.getAttribute('aria-describedby')).toContain('intake-error-firstNames');
    expect(screen.getByTestId('intake-error-flightsFunding')).toBeInTheDocument();
    expect(screen.getByTestId('intake-live')).toHaveTextContent('Revisa los 5 campos marcados.');
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial GET
  });

  it('requires the acknowledgement before saving', async () => {
    await openWithEmptyRoster();
    fillValid();
    fireEvent.click(screen.getByTestId('intake-ack')); // untick
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    expect(screen.getByTestId('intake-error-acknowledged')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('"Otra" reveals a required detail that is cleared when unchecked', async () => {
    await openWithEmptyRoster();
    expect(screen.queryByTestId('intake-dietary-other')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('intake-dietary-otra'));
    fireEvent.change(screen.getByTestId('intake-dietary-other'), { target: { value: 'Sin mariscos' } });
    fireEvent.click(screen.getByTestId('intake-dietary-otra'));
    expect(screen.queryByTestId('intake-dietary-other')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('intake-dietary-otra'));
    expect(screen.getByTestId('intake-dietary-other')).toHaveValue('');
  });

  it('shows unsaved, then saved', async () => {
    await openWithEmptyRoster();
    fillValid();
    expect(screen.getByTestId('intake-save-state')).toHaveAttribute('data-state', 'unsaved');
    reply({ status: 201, body: { participant: participant(), roster: { ...ROSTER, version: 2 }, replayed: false } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    await waitFor(() => expect(screen.getByTestId('intake-save-state')).toHaveAttribute('data-state', 'saved'));
    expect(screen.getByTestId('intake-list')).toHaveTextContent('Valentina Sintetica');
    expect(screen.getByTestId('intake-count')).toHaveTextContent('(1/60)');
  });

  it('a retried create reuses the same clientRequestId', async () => {
    await openWithEmptyRoster();
    fillValid();
    reply('network');
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    expect(await screen.findByText(/No pudimos conectar/)).toBeInTheDocument();
    reply({ status: 201, body: { participant: participant(), roster: ROSTER, replayed: false } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    await screen.findByTestId('intake-list');
    const first = bodyOf(1);
    const second = bodyOf(2);
    expect(first.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.clientRequestId).toBe(first.clientRequestId);
    expect(first.acknowledged).toBe(true);
    expect(first).not.toHaveProperty('program');
  });

  it('a replay that stored other values shows the stored row and keeps what was typed, as an edit', async () => {
    await openWithEmptyRoster();
    fillValid();
    reply({
      status: 200,
      body: { participant: participant({ lastNames: 'Guardado', version: 3 }), roster: ROSTER, replayed: true },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    expect(await screen.findByTestId('intake-form-notice')).toHaveTextContent('ya se había guardado');
    expect(screen.getByTestId('intake-last-names')).toHaveValue('Sintetica');
    expect(screen.getByTestId('intake-save')).toHaveTextContent('Guardar cambios');
    expect(screen.getByTestId('intake-list')).toHaveTextContent('Valentina Guardado');

    reply({ status: 200, body: { participant: participant({ version: 4 }), roster: ROSTER, replayed: false } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    const put = fetchMock.mock.calls[2];
    expect(put[0]).toBe('/api/pasantias/participants/11111111-2222-4333-8444-555555555555');
    expect(put[1].method).toBe('PUT');
    expect(bodyOf(2).expectedVersion).toBe(3);
  });

  it('a replayed create that already holds the draft is reported as stored, not as a new save', async () => {
    await openWithEmptyRoster();
    fillValid();
    reply({ status: 200, body: { participant: participant(), roster: ROSTER, replayed: true } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    const live = screen.getByTestId('intake-live');
    await waitFor(() => expect(live).toHaveTextContent('ya estaba guardada con estos datos; no se registró nada nuevo.'));
    expect(live).toHaveAttribute('data-kind', 'info');
    expect(live).not.toHaveTextContent(/Ficha de .* guardada\./);
    // The stored row is shown; no "Guardado" claim for a request that wrote nothing.
    expect(screen.getByTestId('intake-list')).toHaveTextContent('Valentina Sintetica');
    expect(screen.queryByTestId('intake-save-state')).not.toBeInTheDocument();
  });

  it('a no-op edit says nothing changed and nothing new was recorded', async () => {
    reply({ status: 200, body: { roster: ROSTER, participants: [participant()] } });
    render(<NominaPage />);
    await screen.findByTestId('intake-list');
    fireEvent.click(screen.getByTestId('intake-edit-11111111-2222-4333-8444-555555555555'));
    fireEvent.click(screen.getByTestId('intake-ack'));
    reply({ status: 200, body: { participant: participant(), roster: ROSTER, replayed: true } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    const live = screen.getByTestId('intake-live');
    await waitFor(() => expect(live).toHaveTextContent('No había cambios'));
    expect(live).toHaveTextContent('no se registró nada nuevo');
    expect(live).toHaveAttribute('data-kind', 'info');
    expect(screen.queryByTestId('intake-save-state')).not.toBeInTheDocument();
  });

  it('a STALE edit whose stored row already holds the draft is reported as stored, not saved', async () => {
    reply({ status: 200, body: { roster: ROSTER, participants: [participant()] } });
    render(<NominaPage />);
    await screen.findByTestId('intake-list');
    fireEvent.click(screen.getByTestId('intake-edit-11111111-2222-4333-8444-555555555555'));
    fireEvent.click(screen.getByTestId('intake-ack'));
    fireEvent.change(screen.getByTestId('intake-last-names'), { target: { value: 'Reintento' } });
    reply({ status: 409, body: { code: 'STALE', current: participant({ lastNames: 'Reintento', version: 2 }) } });
    reply({ status: 200, body: { roster: ROSTER, participants: [participant({ lastNames: 'Reintento', version: 2 })] } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    const live = screen.getByTestId('intake-live');
    await waitFor(() => expect(live).toHaveTextContent('ya tenía estos datos guardados; no se registró nada nuevo.'));
    expect(live).toHaveAttribute('data-kind', 'info');
    await waitFor(() => expect(screen.getByTestId('intake-list')).toHaveTextContent('Valentina Reintento'));
  });

  it('a real write is the only thing reported as saved', async () => {
    await openWithEmptyRoster();
    fillValid();
    reply({ status: 201, body: { participant: participant(), roster: ROSTER, replayed: false } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    await waitFor(() => expect(screen.getByTestId('intake-live')).toHaveAttribute('data-kind', 'success'));
    expect(screen.getByTestId('intake-live')).toHaveTextContent('Ficha de Valentina Sintetica guardada.');
  });

  it('a duplicate RUT lands on the RUT field', async () => {
    await openWithEmptyRoster();
    fillValid();
    reply({ status: 409, body: { code: 'DUPLICATE_RUT', error: 'Este RUT ya está en la nómina.' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    expect(await screen.findByTestId('intake-error-rut')).toHaveTextContent('Este RUT ya está en la nómina.');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('intake-rut')));
  });
});

describe('sending', () => {
  it('sends the roster, shows it as sent, and an edit shows it reopened', async () => {
    reply({ status: 200, body: { roster: ROSTER, participants: [participant()] } });
    render(<NominaPage />);
    await screen.findByTestId('intake-list');
    expect(screen.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'open');

    const sent = { ...ROSTER, status: 'submitted', version: 2, submittedAt: '2026-10-27T15:00:00.000Z', lastSubmittedAt: '2026-10-27T15:00:00.000Z' };
    reply({ status: 200, body: { roster: sent } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-finalize'));
    });
    await waitFor(() => expect(screen.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'submitted'));
    expect(bodyOf(1)).toEqual({ expectedRosterVersion: 1 });
    expect(screen.getByTestId('intake-finalize')).toBeDisabled();
    expect(screen.getByTestId('intake-roster-status')).toHaveTextContent('No se envían correos');

    fireEvent.click(screen.getByTestId('intake-edit-11111111-2222-4333-8444-555555555555'));
    fireEvent.click(screen.getByTestId('intake-ack'));
    fireEvent.change(screen.getByTestId('intake-last-names'), { target: { value: 'Editada' } });
    reply({
      status: 200,
      body: {
        participant: participant({ lastNames: 'Editada', version: 2 }),
        roster: { ...sent, status: 'open', version: 3, submittedAt: null },
        replayed: false,
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    await waitFor(() => expect(screen.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'reopened'));
    expect(screen.getByTestId('intake-roster-status')).toHaveTextContent('La nómina volvió a edición; envíala nuevamente');
    expect(screen.getByTestId('intake-finalize')).toBeEnabled();
  });
});
