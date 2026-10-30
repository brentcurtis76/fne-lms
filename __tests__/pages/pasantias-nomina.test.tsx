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
  // F01: the school's saved answer (existing scenarios assume it is saved).
  schoolFunding: { flightsFunding: 'sep', lodgingFunding: 'colegio', version: 1 },
};

/** F01: a roster whose school has not saved "Datos del colegio" yet. */
const ROSTER_NO_FUNDING = { ...ROSTER, schoolFunding: null };

function participant(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    version: 1,
    firstNames: 'Valentina',
    lastNames: 'Sintetica',
    rut: '12345678-5',
    passportNumber: null,
    arrivalDate: null,
    departureDate: null,
    focus: null,
    dietaryRestrictions: [],
    dietaryOther: null,
    updatedAt: '2026-10-27T12:00:00.000Z',
    ...overrides,
  };
}

/** `gate`: the reply is held until the test opens it (FX-2 pending-write tests). */
type Reply = { status: number; body: unknown; gate?: Promise<void> } | 'network';

function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
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
    const response = { status: next.status, json: () => Promise.resolve(next.body) };
    return next.gate ? next.gate.then(() => response) : Promise.resolve(response);
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
  // F01: the ficha has no funding fields any more (the old ids must not exist);
  // "never pre-filled" for funding is asserted on the school section below.
  it('never pre-fills dates, focus or dietary, and has no per-person funding field', async () => {
    await openWithEmptyRoster();
    expect(document.querySelector('[data-testid="intake-flights-funding"]')).toBeNull();
    expect(document.querySelector('[data-testid="intake-lodging-funding"]')).toBeNull();
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
    expect(screen.getByTestId('intake-error-rut')).toBeInTheDocument();
    // F01: names ×2 and RUT — the two funding fields left the ficha (was 5).
    expect(screen.getByTestId('intake-live')).toHaveTextContent('Revisa los 3 campos marcados.');
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

/* ---------------------------------------------------- corrections F01–F04 */

describe('Datos del colegio (F01)', () => {
  async function openWithoutFunding(participants: unknown[] = []) {
    reply({ status: 200, body: { roster: ROSTER_NO_FUNDING, participants } });
    render(<NominaPage />);
    await screen.findByTestId('intake-school-section');
  }

  it('starts on "Selecciona…" with nothing pre-chosen, and gates add / edit / send with the reason shown', async () => {
    await openWithoutFunding([participant()]);
    expect(screen.getByTestId('intake-school-flights')).toHaveValue('');
    expect(screen.getByTestId('intake-school-lodging')).toHaveValue('');
    expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'missing');
    expect(screen.getByTestId('intake-add')).toBeDisabled();
    expect(screen.getByTestId('intake-edit-11111111-2222-4333-8444-555555555555')).toBeDisabled();
    expect(screen.getByTestId('intake-finalize')).toBeDisabled();
    expect(screen.getByTestId('intake-school-required')).toHaveTextContent('Primero guarda los datos del colegio');
    // No ficha opens by itself before the school's answer exists.
    expect(screen.queryByTestId('intake-form')).not.toBeInTheDocument();
  });

  it('shows the saved answers once saved (never a default)', async () => {
    await openWithEmptyRoster();
    expect(screen.getByTestId('intake-school-flights')).toHaveValue('sep');
    expect(screen.getByTestId('intake-school-lodging')).toHaveValue('colegio');
    expect(screen.getByTestId('intake-school-section')).toHaveTextContent(SCHOOL);
    expect(screen.getByTestId('intake-school-section')).toHaveTextContent('Pasantía INSPIRA');
  });

  it('refuses to save an incomplete answer, with field errors and focus, sending nothing', async () => {
    await openWithoutFunding();
    fireEvent.change(screen.getByTestId('intake-school-flights'), { target: { value: 'sep' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    expect(screen.getByTestId('intake-error-schoolLodgingFunding')).toBeInTheDocument();
    expect(screen.queryByTestId('intake-error-schoolFlightsFunding')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('intake-school-lodging')));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a first save sends exactly the three keys with expectedFundingVersion null, then unlocks Pasantes', async () => {
    await openWithoutFunding();
    fireEvent.change(screen.getByTestId('intake-school-flights'), { target: { value: 'colegio' } });
    fireEvent.change(screen.getByTestId('intake-school-lodging'), { target: { value: 'sep' } });
    expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'unsaved');
    reply({
      status: 200,
      body: {
        roster: { ...ROSTER, version: 2, schoolFunding: { flightsFunding: 'colegio', lodgingFunding: 'sep', version: 1 } },
        replayed: false,
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/pasantias/participants/school');
    expect(init.method).toBe('PUT');
    expect(bodyOf(1)).toEqual({ flightsFunding: 'colegio', lodgingFunding: 'sep', expectedFundingVersion: null });
    await waitFor(() => expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'saved'));
    expect(screen.getByTestId('intake-live')).toHaveAttribute('data-kind', 'success');
    // FX-1 (F01 assertion corrected): the first ficha opens by itself once the
    // school's data exists, so "Agregar persona" is disabled ONLY because that
    // create ficha is open — the school gate itself is lifted.
    expect(await screen.findByTestId('intake-form')).toBeInTheDocument();
    expect(screen.queryByTestId('intake-school-required')).not.toBeInTheDocument();
    expect(screen.getByTestId('intake-finalize-hint')).not.toHaveTextContent('datos del colegio');
    expect(screen.getByTestId('intake-add')).toBeDisabled();
    fireEvent.click(screen.getByTestId('intake-cancel')); // clean draft → no confirm
    expect(screen.queryByTestId('intake-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('intake-add')).toBeEnabled();
  });

  it('an edit sends the saved version; a change on a sent roster says it reopened', async () => {
    const sent = { ...ROSTER, status: 'submitted', version: 3, submittedAt: '2026-10-27T15:00:00.000Z', lastSubmittedAt: '2026-10-27T15:00:00.000Z' };
    reply({ status: 200, body: { roster: sent, participants: [participant()] } });
    render(<NominaPage />);
    await screen.findByTestId('intake-list');
    fireEvent.change(screen.getByTestId('intake-school-lodging'), { target: { value: 'sep' } });
    // Unsaved school changes block sending.
    expect(screen.getByTestId('intake-finalize-hint')).toHaveTextContent('datos del colegio');
    reply({
      status: 200,
      body: {
        roster: { ...sent, status: 'open', version: 4, submittedAt: null, schoolFunding: { flightsFunding: 'sep', lodgingFunding: 'sep', version: 2 } },
        replayed: false,
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    expect(bodyOf(1)).toEqual({ flightsFunding: 'sep', lodgingFunding: 'sep', expectedFundingVersion: 1 });
    await waitFor(() => expect(screen.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'reopened'));
    expect(screen.getByTestId('intake-live')).toHaveTextContent('La nómina volvió a edición; envíala nuevamente.');
  });

  it('a replayed save is reported as already stored, not as a new save', async () => {
    await openWithEmptyRoster();
    fireEvent.change(screen.getByTestId('intake-school-flights'), { target: { value: 'colegio' } });
    fireEvent.change(screen.getByTestId('intake-school-flights'), { target: { value: 'sep' } });
    reply({ status: 200, body: { roster: ROSTER, replayed: true } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    const live = screen.getByTestId('intake-live');
    await waitFor(() => expect(live).toHaveAttribute('data-kind', 'info'));
    expect(live).toHaveTextContent('no se registró nada nuevo');
  });

  it('a STALE save shows the stored answer and keeps what was typed', async () => {
    await openWithEmptyRoster();
    fireEvent.change(screen.getByTestId('intake-school-lodging'), { target: { value: 'sep' } });
    reply({
      status: 409,
      body: {
        code: 'STALE',
        current: { ...ROSTER, version: 5, schoolFunding: { flightsFunding: 'colegio', lodgingFunding: 'colegio', version: 2 } },
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    expect(await screen.findByTestId('intake-school-notice')).toHaveTextContent('Pasajes: Costo Colegio · Estadía: Costo Colegio');
    expect(screen.getByTestId('intake-school-lodging')).toHaveValue('sep');
    expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'unsaved');
  });

  it('a participant save answered SCHOOL_DATA_MISSING explains it and reloads', async () => {
    await openWithEmptyRoster();
    fillValid();
    reply({ status: 422, body: { code: 'SCHOOL_DATA_MISSING', error: 'x' } });
    reply({ status: 200, body: { roster: ROSTER_NO_FUNDING, participants: [] } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    expect(await screen.findByText(/Primero guarda los datos del colegio/, { selector: '[data-testid="intake-live"]' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});

describe('required markers (F02)', () => {
  it('shows no star anywhere; required fields say «Obligatorio» and carry aria-required', async () => {
    await openWithEmptyRoster();
    expect(document.body.textContent).not.toContain('★');
    expect(screen.getByTestId('intake-required-legend')).toHaveTextContent('Los campos marcados «Obligatorio» deben completarse.');
    for (const id of ['intake-first-names', 'intake-last-names', 'intake-rut', 'intake-school-flights', 'intake-school-lodging', 'intake-ack']) {
      expect(screen.getByTestId(id)).toHaveAttribute('aria-required', 'true');
    }
    // Visible, neutral, readable by screen readers (part of the label text).
    const marks = screen.getAllByTestId('intake-required-mark');
    expect(marks.length).toBeGreaterThanOrEqual(6);
    for (const mark of marks) {
      expect(mark).toHaveTextContent('Obligatorio');
      expect(mark.className).toContain('text-gray-600');
      expect(mark).not.toHaveAttribute('aria-hidden');
    }
    expect(screen.getByLabelText(/Nombres/)).toBe(screen.getByTestId('intake-first-names'));
  });

  it('keeps the functional error states', async () => {
    await openWithEmptyRoster();
    fireEvent.click(screen.getByTestId('intake-ack'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    const first = screen.getByTestId('intake-first-names');
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first.className).toContain('border-red-600');
    expect(screen.getByTestId('intake-error-firstNames').className).toContain('text-red-700');
  });
});

describe('travel-dates notice (F03) and Todos (F04)', () => {
  it('shows the exact supplied notice for INSPIRA, keeping "(opcional)" and "Sin indicar"', async () => {
    await openWithEmptyRoster();
    expect(screen.getByTestId('intake-hint-dates')).toHaveTextContent(
      'El programa se realiza del lunes 18 de enero al jueves 28 de enero de 2027. Las fechas de llegada y regreso pueden variar por uno o dos días, dependiendo de los pasajes disponibles y sus costos. Esto se conversará con el colegio al momento de tener la disponibilidad de los vuelos a comprar.'
    );
    expect(screen.getByText('Llegada a Barcelona (opcional)')).toBeInTheDocument();
    expect(screen.getByTestId('intake-arrival-date')).toHaveValue('');
  });

  it('offers Todos last after the four levels and sends focus todos', async () => {
    await openWithEmptyRoster();
    const options = Array.from(
      (screen.getByTestId('intake-focus') as HTMLSelectElement).querySelectorAll('option')
    ).map((o) => o.textContent);
    expect(options).toEqual(['Sin indicar', 'Infantil', 'Primer Ciclo', 'Segundo Ciclo', 'Tercer Ciclo', 'Todos']);
    fillValid();
    fireEvent.change(screen.getByTestId('intake-focus'), { target: { value: 'todos' } });
    reply({ status: 201, body: { participant: participant({ focus: 'todos' }), roster: ROSTER, replayed: false } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    expect(bodyOf(1).focus).toBe('todos');
    expect(bodyOf(1)).not.toHaveProperty('flightsFunding');
    expect(await screen.findByTestId('intake-list')).toHaveTextContent('Foco: Todos');
  });
});

/* ----------------------------------------------- FX-2: one write at a time */

describe('coordinator writes are serialized (FX-2)', () => {
  const FUNDED_V2 = { ...ROSTER, version: 3, schoolFunding: { flightsFunding: 'sep', lodgingFunding: 'sep', version: 2 } };

  it('while a participant save is pending, the school save is disabled and does not dispatch; it works once the first settles', async () => {
    await openWithEmptyRoster();
    fillValid();
    fireEvent.change(screen.getByTestId('intake-school-lodging'), { target: { value: 'sep' } });
    const pending = gate();
    reply({ status: 201, body: { participant: participant(), roster: ROSTER, replayed: false }, gate: pending.promise });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // GET + the pending POST

    // Matching disabled UI…
    expect(screen.getByTestId('intake-school-fieldset')).toBeDisabled();
    expect(screen.getByTestId('intake-school-save')).toBeDisabled();
    expect(screen.getByTestId('intake-finalize')).toBeDisabled();
    // …and the handler guard: a dispatched click/submit still sends nothing.
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
      fireEvent.submit(screen.getByTestId('intake-school-save').closest('form') as HTMLFormElement);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.open();
    });
    await waitFor(() => expect(screen.getByTestId('intake-list')).toHaveTextContent('Valentina Sintetica'));
    expect(screen.getByTestId('intake-school-save')).toBeEnabled();
    // The independent school draft survived the participant reply (still dirty).
    expect(screen.getByTestId('intake-school-lodging')).toHaveValue('sep');

    reply({ status: 200, body: { roster: FUNDED_V2, replayed: false } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe('/api/pasantias/participants/school');
    expect(bodyOf(2)).toEqual({ flightsFunding: 'sep', lodgingFunding: 'sep', expectedFundingVersion: 1 });
  });

  it('while a school save is pending, the participant save and send are disabled and do not dispatch; they work once it settles', async () => {
    await openWithEmptyRoster();
    fillValid();
    fireEvent.change(screen.getByTestId('intake-school-lodging'), { target: { value: 'sep' } });
    const pending = gate();
    reply({ status: 200, body: { roster: FUNDED_V2, replayed: false }, gate: pending.promise });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // GET + the pending PUT

    expect(screen.getByTestId('intake-form-fieldset')).toBeDisabled();
    expect(screen.getByTestId('intake-save')).toBeDisabled();
    expect(screen.getByTestId('intake-add')).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
      fireEvent.submit(screen.getByTestId('intake-form'));
      fireEvent.click(screen.getByTestId('intake-finalize'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.open();
    });
    await waitFor(() => expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'saved'));
    expect(screen.getByTestId('intake-save')).toBeEnabled();
    // The independent participant draft survived the school reply.
    expect(screen.getByTestId('intake-last-names')).toHaveValue('Sintetica');

    reply({ status: 201, body: { participant: participant(), roster: { ...FUNDED_V2, version: 4 }, replayed: false } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe('/api/pasantias/participants');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
  });

  it('while a send is pending, the school save does not dispatch', async () => {
    reply({ status: 200, body: { roster: ROSTER, participants: [participant()] } });
    render(<NominaPage />);
    await screen.findByTestId('intake-list');
    const pending = gate();
    const sent = { ...ROSTER, status: 'submitted', version: 2, submittedAt: '2026-10-30T10:00:00.000Z', lastSubmittedAt: '2026-10-30T10:00:00.000Z' };
    reply({ status: 200, body: { roster: sent }, gate: pending.promise });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-finalize'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('intake-school-save')).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.open();
    });
    await waitFor(() => expect(screen.getByTestId('intake-roster-status')).toHaveAttribute('data-status', 'submitted'));
    expect(screen.getByTestId('intake-school-save')).toBeEnabled();
  });

  it('two different writes dispatched in the same event turn send exactly one request', async () => {
    await openWithEmptyRoster();
    fillValid();
    const pending = gate();
    reply({ status: 201, body: { participant: participant(), roster: ROSTER, replayed: false }, gate: pending.promise });
    // Both clicks land before React re-renders the disabled controls: only the
    // synchronous ref guard can stop the second.
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/pasantias/participants');
    await act(async () => {
      pending.open();
    });
    await waitFor(() => expect(screen.getByTestId('intake-list')).toBeInTheDocument());
  });

  it('a double click on the school save in one event turn sends one request', async () => {
    await openWithEmptyRoster();
    fireEvent.change(screen.getByTestId('intake-school-lodging'), { target: { value: 'sep' } });
    reply({ status: 200, body: { roster: FUNDED_V2, replayed: false } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-school-save'));
      fireEvent.click(screen.getByTestId('intake-school-save'));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/* ----------------------------------------- FX-3: the school draft follows */

describe('the school draft follows the saved answer only when clean (FX-3)', () => {
  const NEWER = { flightsFunding: 'colegio', lodgingFunding: 'colegio', version: 2 };

  it('a participant-save reply with newer schoolFunding moves a CLEAN draft to the new values (state: stored)', async () => {
    await openWithEmptyRoster();
    expect(screen.getByTestId('intake-school-flights')).toHaveValue('sep');
    fillValid();
    reply({
      status: 201,
      body: { participant: participant(), roster: { ...ROSTER, version: 3, schoolFunding: NEWER }, replayed: false },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    await waitFor(() => expect(screen.getByTestId('intake-school-flights')).toHaveValue('colegio'));
    expect(screen.getByTestId('intake-school-lodging')).toHaveValue('colegio');
    expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'stored');
  });

  it('a send reply with newer schoolFunding moves a CLEAN draft too', async () => {
    reply({ status: 200, body: { roster: ROSTER, participants: [participant()] } });
    render(<NominaPage />);
    await screen.findByTestId('intake-list');
    reply({
      status: 200,
      body: { roster: { ...ROSTER, status: 'submitted', version: 3, submittedAt: '2026-10-30T10:00:00.000Z', lastSubmittedAt: '2026-10-30T10:00:00.000Z', schoolFunding: NEWER } },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-finalize'));
    });
    await waitFor(() => expect(screen.getByTestId('intake-school-lodging')).toHaveValue('colegio'));
    expect(screen.getByTestId('intake-school-flights')).toHaveValue('colegio');
    expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'stored');
  });

  it('the same reply while the draft is DIRTY keeps what was typed (state: unsaved)', async () => {
    await openWithEmptyRoster();
    fillValid();
    fireEvent.change(screen.getByTestId('intake-school-flights'), { target: { value: 'colegio' } });
    fireEvent.change(screen.getByTestId('intake-school-lodging'), { target: { value: 'sep' } });
    expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'unsaved');
    reply({
      status: 201,
      body: { participant: participant(), roster: { ...ROSTER, version: 3, schoolFunding: NEWER }, replayed: false },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('intake-save'));
    });
    await waitFor(() => expect(screen.getByTestId('intake-list')).toHaveTextContent('Valentina Sintetica'));
    expect(screen.getByTestId('intake-school-flights')).toHaveValue('colegio');
    expect(screen.getByTestId('intake-school-lodging')).toHaveValue('sep');
    expect(screen.getByTestId('intake-school-state')).toHaveAttribute('data-state', 'unsaved');
  });
});
