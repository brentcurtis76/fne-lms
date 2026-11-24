// @vitest-environment jsdom
/**
 * LIC-E2 (GENERA fixes F24, Brent 20 Nov 2026): a new version retires the
 * older versions' links. Before generating, the panel says so when the
 * history holds a live version; after generating, a failed retirement is
 * reported so the admin retires the older links by hand. Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicitacionDetail } from '@/types/licitaciones';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/propuestas/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/propuestas/validation')>();
  return { ...actual, validateProposalConfig: vi.fn(() => ({ valid: true, errors: [], warnings: [] })) };
});

import { toast } from 'react-hot-toast';
import ProposalConfigPanel from '@/components/licitaciones/ProposalConfigPanel';

const SENTENCE = 'Al generar una nueva versión, los enlaces de las versiones anteriores dejarán de funcionar.';
const FAILED = 'No se pudieron retirar los enlaces anteriores: retírelos con «Retirar enlace».';

const fetchMock = vi.fn();
const base = { licitacion_id: 'lic-1', estado: 'completada', created_at: '2026-11-10T12:00:00Z', access_code_plain: 'K7MQ2X', download_url: null, view_count: 0, viewed_at: null, error_message: null };
const live = (id: string, version: number, web_status: string) => ({ ...base, id, version, web_slug: `escuela-inventada-evoluciona-2026-v${version}-${id}`, web_status });

const PLANTILLA = { id: 'plant-1', nombre: 'Plantilla Inventada', ficha_id: 'ficha-1', tipo_servicio: 'evoluciona', bloques_orden: [], configuracion_default: null };
const FICHA = { id: 'ficha-1', folio: 1, nombre_servicio: 'Servicio Inventado', destinatarios: ['Docentes'], horas_presenciales: 10 };

let history: unknown[] = [];
let generateAnswer: Record<string, unknown> = {};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  history = [];
  generateAnswer = {};
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/licitaciones/lic-1/generate-propuesta' && init?.method === 'POST') {
      return { ok: true, json: async () => ({ data: { propuesta_id: 'prop-new', estado: 'completada', version: 3, web_slug: 'escuela-inventada-evoluciona-2026-v3-new', access_code: 'Q4RT8Z', ...generateAnswer } }) };
    }
    if (url === '/api/licitaciones/lic-1/propuestas') return { ok: true, json: async () => ({ data: { propuestas: history } }) };
    if (url === '/api/propuestas/plantillas') return { ok: true, json: async () => ({ data: { plantillas: [PLANTILLA] } }) };
    if (url === '/api/propuestas/fichas') return { ok: true, json: async () => ({ data: { fichas: [FICHA] } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function openPanel() {
  const lic = { id: 'lic-1', numero_licitacion: 'LIC-1', year: 2026, school: { id: 1, name: 'Escuela Inventada' }, cliente: null } as unknown as LicitacionDetail;
  render(<ProposalConfigPanel licitacionId="lic-1" licitacion={lic} />);
  fireEvent.click(screen.getByRole('button', { name: /Generar Propuesta FNE/ }));
  await screen.findByText(/Historial de Propuestas \(\d+\)/);
}

async function generate() {
  const option = await screen.findByRole('option', { name: 'Plantilla Inventada' });
  fireEvent.change(option.closest('select')!, { target: { value: 'plant-1' } });
  const button = screen.getByRole('button', { name: 'Generar Propuesta Final' });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Propuesta generada exitosamente'));
}

describe('ProposalConfigPanel — older links stop working (LIC-E2)', () => {
  it('says so near «Generar Propuesta Final» when the history holds a live version', async () => {
    history = [live('p2', 2, 'viewed'), live('p1', 1, 'expired')];
    await openPanel();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
  });

  it('says nothing when the history is empty', async () => {
    await openPanel();
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
  });

  it('says nothing when every version is already expired', async () => {
    history = [live('p2', 2, 'expired'), live('p1', 1, 'expired')];
    await openPanel();
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
  });

  it('a failed retirement (null) is reported with «Retirar enlace»', async () => {
    history = [live('p2', 2, 'published')];
    generateAnswer = { enlaces_anteriores_retirados: null };
    await openPanel();
    await generate();
    expect(toast.error).toHaveBeenCalledWith(FAILED);
  });

  it('a retirement that counted the older links shows the normal success only', async () => {
    history = [live('p2', 2, 'published')];
    generateAnswer = { enlaces_anteriores_retirados: 1 };
    await openPanel();
    await generate();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
