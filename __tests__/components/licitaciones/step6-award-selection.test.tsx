// @vitest-environment jsdom
/**
 * LIC-D2 (GENERA fixes F20c): the award is confirmed for the provider selected
 * on the screen. Confirming first saves what is on the screen and stops when
 * that save fails; the confirmation then carries the selected provider's id.
 * «Generar Carta» stops when its save fails. Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicitacionDetail } from '@/types/licitaciones';

const { toastMock } = vi.hoisted(() => ({ toastMock: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ toast: toastMock }));

import Step6Adjudicacion from '@/components/licitaciones/Step6Adjudicacion';

const ATE_A = { id: 'ate-a', nombre_ate: 'ATE Alfa Inventada', puntaje_total: 90, monto_propuesto: 400 };
const ATE_B = { id: 'ate-b', nombre_ate: 'ATE Beta Inventada', puntaje_total: 80, monto_propuesto: 450 };

const fetchMock = vi.fn();
let saveOk = true;
let saveAnswer: Record<string, unknown> = { data: { licitacion: {} } };

function lic(over: Partial<LicitacionDetail> = {}): LicitacionDetail {
  return {
    id: 'lic-1', numero_licitacion: 'LIC-1-2026-001', estado: 'adjudicacion_pendiente', tipo_moneda: 'UF',
    ganador_ate_id: 'ate-a', carta_adjudicacion_url: 'licitaciones/lic-1/carta.docx', ganador_es_fne: null, contrato_id: null,
    ...over,
  } as unknown as LicitacionDetail;
}

const calls = () => fetchMock.mock.calls.map(([url, opts]) => ({
  url: url as string,
  body: opts?.body ? JSON.parse(opts.body as string) : undefined,
}));

beforeEach(() => {
  saveOk = true;
  saveAnswer = { data: { licitacion: {} } };
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('open', vi.fn());
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/ates')) return { ok: true, json: async () => ({ data: { ates: [ATE_A, ATE_B] } }) };
    if (url.endsWith('/adjudicacion')) {
      return saveOk
        ? { ok: true, json: async () => saveAnswer }
        : { ok: false, json: async () => ({ error: 'Error inventado al guardar' }) };
    }
    if (url.endsWith('/generate-carta')) return { ok: true, json: async () => ({ data: { url: null } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function selectB() {
  const radioB = await screen.findByRole('radio', { name: /ATE Beta Inventada/ });
  fireEvent.click(radioB);
  expect(radioB).toBeChecked();
}

describe('Step 6 — the confirmation is for the provider on the screen (LIC-D2)', () => {
  it('saves B first, then confirms with B\'s id, while A is the stored winner', async () => {
    const onRefresh = vi.fn();
    render(<Step6Adjudicacion licitacion={lic()} isAdmin onRefresh={onRefresh} />);
    await selectB();
    fireEvent.click(screen.getByRole('button', { name: /Proveedor FNE/ }));
    await waitFor(() => expect(calls().some(c => c.url.endsWith('/adjudicacion-confirmar'))).toBe(true));

    const posted = calls().filter(c => c.url.endsWith('/adjudicacion') || c.url.endsWith('/adjudicacion-confirmar'));
    expect(posted.map(c => c.url)).toEqual([
      '/api/licitaciones/lic-1/adjudicacion',
      '/api/licitaciones/lic-1/adjudicacion-confirmar',
    ]);
    expect(posted[0].body).toMatchObject({ ganador_ate_id: 'ate-b' });
    expect(posted[1].body).toEqual({ es_fne: true, ganador_ate_id: 'ate-b' });
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('the external confirmation also carries the selected id', async () => {
    render(<Step6Adjudicacion licitacion={lic()} isAdmin onRefresh={vi.fn()} />);
    await selectB();
    fireEvent.click(screen.getByRole('button', { name: /Proveedor Externo/ }));
    await waitFor(() => expect(calls().some(c => c.url.endsWith('/adjudicacion-confirmar'))).toBe(true));
    const confirmCall = calls().find(c => c.url.endsWith('/adjudicacion-confirmar'))!;
    expect(confirmCall.body).toEqual({ es_fne: false, ganador_ate_id: 'ate-b' });
  });

  it('sends no confirmation when the save fails, and shows the error', async () => {
    saveOk = false;
    const onRefresh = vi.fn();
    render(<Step6Adjudicacion licitacion={lic()} isAdmin onRefresh={onRefresh} />);
    await selectB();
    fireEvent.click(screen.getByRole('button', { name: /Proveedor FNE/ }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Error inventado al guardar'));
    expect(calls().some(c => c.url.endsWith('/adjudicacion-confirmar'))).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('«Generar Carta» generates nothing when the save before it fails', async () => {
    saveOk = false;
    render(<Step6Adjudicacion licitacion={lic({ carta_adjudicacion_url: null })} isAdmin onRefresh={vi.fn()} />);
    await selectB();
    fireEvent.click(screen.getByRole('button', { name: /Generar Carta de Adjudicacion/ }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Error inventado al guardar'));
    expect(calls().some(c => c.url.endsWith('/generate-carta'))).toBe(false);
  });
});

describe('Step 6 — a Carta made for earlier values asks for a new one (LIC-D2)', () => {
  const STALE_MSG = 'La Carta de adjudicación ya no corresponde a los datos guardados. Genérela de nuevo antes de confirmar.';
  const ASK = 'Genere la Carta de adjudicación antes de confirmar la adjudicación.';

  it('after a save that voids the Carta, the foundation button is not offered until a new Carta exists', async () => {
    const onRefresh = vi.fn();
    const view = render(<Step6Adjudicacion licitacion={lic()} isAdmin onRefresh={onRefresh} />);
    expect(await screen.findByRole('button', { name: /Proveedor FNE/ })).toBeEnabled();

    saveAnswer = { data: { licitacion: {}, carta_invalidada: true }, message: STALE_MSG };
    fireEvent.change(screen.getByLabelText(/Monto adjudicado/), { target: { value: '1300' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Adjudicacion/ }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());

    // At once, before the page's refresh has landed …
    expect(screen.getByRole('button', { name: /Proveedor FNE/ })).toBeDisabled();
    expect(screen.getByText(ASK)).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith(STALE_MSG);
    // … and after it (the tender now comes without a Carta).
    view.rerender(<Step6Adjudicacion licitacion={lic({ carta_adjudicacion_url: null })} isAdmin onRefresh={onRefresh} />);
    expect(screen.getByRole('button', { name: /Proveedor FNE/ })).toBeDisabled();
    expect(screen.getByText(ASK)).toBeInTheDocument();

    // A new generation (its save changes nothing) brings the button back.
    saveAnswer = { data: { licitacion: {}, carta_invalidada: false } };
    fireEvent.click(screen.getByRole('button', { name: /Generar Carta de Adjudicacion/ }));
    await waitFor(() => expect(calls().some(c => c.url.endsWith('/generate-carta'))).toBe(true));
    view.rerender(<Step6Adjudicacion licitacion={lic({ carta_adjudicacion_url: 'licitaciones/lic-1/carta-nueva.docx' })} isAdmin onRefresh={onRefresh} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Proveedor FNE/ })).toBeEnabled());
    expect(screen.queryByText(ASK)).not.toBeInTheDocument();
  });
});

describe('Step 6 — the award form in the tender\'s currency (LIC-B2, LIC-B8)', () => {
  it('a UF tender: the label says UF and the summary shows the awarded amount', async () => {
    render(<Step6Adjudicacion licitacion={lic()} isAdmin onRefresh={vi.fn()} />);
    expect(await screen.findByLabelText('Monto adjudicado (UF)')).toBeInTheDocument();
  });

  it('a CLP tender: the label says CLP', async () => {
    render(<Step6Adjudicacion licitacion={lic({ tipo_moneda: 'CLP' })} isAdmin onRefresh={vi.fn()} />);
    expect(await screen.findByLabelText('Monto adjudicado (CLP)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Monto adjudicado (UF)')).not.toBeInTheDocument();
  });

  it('the summary of a UF tender shows the award, not the provider\'s evaluation amount in pesos', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true, json: async () => ({ data: { ates: [{ ...ATE_A, es_ganador: true }, ATE_B] } }),
    }));
    render(<Step6Adjudicacion licitacion={lic({ estado: 'contrato_pendiente', monto_adjudicado_uf: 450.5 } as never)} isAdmin onRefresh={vi.fn()} />);
    expect(await screen.findByText('Monto: UF 450,50')).toBeInTheDocument();
    expect(screen.queryByText(/CLP/)).not.toBeInTheDocument();
  });

  it('the summary of a CLP tender with no award saved falls back to the proposed amount, in pesos', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true, json: async () => ({ data: { ates: [{ ...ATE_A, es_ganador: true, monto_propuesto: 15000000 }] } }),
    }));
    render(<Step6Adjudicacion licitacion={lic({ estado: 'adjudicada_externo', tipo_moneda: 'CLP', monto_adjudicado_uf: null } as never)} isAdmin onRefresh={vi.fn()} />);
    expect(await screen.findByText('Monto: $15.000.000')).toBeInTheDocument();
    expect(screen.queryByText(/CLP/)).not.toBeInTheDocument();
  });
});

describe('Step 6 — a value cleared on the screen is saved as cleared (send-back 1)', () => {
  it('clearing the payment conditions then confirming sends null for them, before the confirmation', async () => {
    render(<Step6Adjudicacion
      licitacion={lic({ condiciones_pago: 'Pago inventado', contacto_coordinacion_email: 'c@inventado.test', monto_adjudicado_uf: 400 } as never)}
      isAdmin onRefresh={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText(/Condiciones de pago/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Correo coordinacion/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Monto adjudicado/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Proveedor Externo/ }));
    await waitFor(() => expect(calls().some(c => c.url.endsWith('/adjudicacion-confirmar'))).toBe(true));
    const saveCall = calls().find(c => c.url.endsWith('/adjudicacion'))!;
    expect(saveCall.body).toEqual({
      ganador_ate_id: 'ate-a',
      monto_adjudicado_uf: null,
      condiciones_pago: null,
      fecha_oferta_ganadora: null,
      contacto_coordinacion_nombre: null,
      contacto_coordinacion_email: null,
      contacto_coordinacion_telefono: null,
    });
  });
});
