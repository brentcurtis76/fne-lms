// @vitest-environment jsdom
/**
 * GENERA fixes F20, LIC-D1 (the screens): steps 3 and 4 no longer offer what
 * the tender's state refuses; a tender in an earlier state shows every control
 * as today. Synthetic data only.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Step3Bases from '@/components/licitaciones/Step3Bases';
import Step4Propuestas from '@/components/licitaciones/Step4Propuestas';
import {
  MENSAJE_CERRADA,
  MENSAJE_EVALUACION_INICIADA,
} from '@/lib/licitaciones/estados';

const ATE = {
  id: 'ate-1', licitacion_id: 'lic-1', nombre_ate: 'ATE Inventada', rut_ate: null, nombre_contacto: null,
  email: null, telefono: null, fecha_solicitud_bases: '2026-11-03', fecha_envio_bases: null,
  propuesta_url: null, propuesta_filename: null, propuesta_size: null, fecha_propuesta: null, notas: null,
};
const BASES_DOC = {
  id: 'doc-1', licitacion_id: 'lic-1', tipo: 'bases_generadas', nombre: 'Bases', file_name: 'Bases_inventadas.docx',
  storage_path: 'licitaciones/lic-1/bases.docx', created_at: '2026-11-04T12:00:00Z',
};

const fetchMock = vi.fn();

const licitacion = (estado: string) => ({
  id: 'lic-1', numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada', year: 2026,
  estado, school_id: 1, fecha_limite_propuestas: '2026-11-20',
}) as any;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/ates')) return { ok: true, json: async () => ({ data: { ates: [ATE] } }) };
    if (url.endsWith('/consultas')) return { ok: true, json: async () => ({ data: { consultas: [] } }) };
    if (url.endsWith('/documentos')) return { ok: true, json: async () => ({ data: { documentos: [BASES_DOC] } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

async function step3(estado: string) {
  render(<Step3Bases licitacion={licitacion(estado)} isAdmin onAdvance={() => {}} onRefresh={() => {}} />);
  await waitFor(() => expect(screen.getByText('ATE Inventada')).toBeTruthy());
}

async function step4(estado: string) {
  render(<Step4Propuestas licitacion={licitacion(estado)} isAdmin onAdvance={() => {}} onRefresh={() => {}} />);
  await waitFor(() => expect(screen.getByText('ATE Inventada')).toBeTruthy());
}

describe('Step3Bases', () => {
  it('propuestas_pendientes: every control as today', async () => {
    await step3('propuestas_pendientes');
    expect(screen.getByRole('button', { name: /Agregar nueva ATE/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar ATE ATE Inventada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marcar bases enviadas a ATE Inventada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Registrar consulta/ })).toBeTruthy();
    expect(screen.getByTitle('Eliminar documento')).toBeTruthy();
    expect(screen.queryByText(MENSAJE_EVALUACION_INICIADA)).toBeNull();
    expect(screen.queryByText(MENSAJE_CERRADA)).toBeNull();
  });

  it('evaluacion_pendiente: no «agregar ATE», no edit, no delete, no bases sent; the sentence', async () => {
    await step3('evaluacion_pendiente');
    expect(screen.queryByRole('button', { name: /Agregar nueva ATE/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar ATE ATE Inventada' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marcar bases enviadas a ATE Inventada' })).toBeNull();
    expect(screen.getByText(MENSAJE_EVALUACION_INICIADA)).toBeTruthy();
    // questions and document deletion are still open before the end states
    expect(screen.getByRole('button', { name: /Registrar consulta/ })).toBeTruthy();
    expect(screen.getByTitle('Eliminar documento')).toBeTruthy();
  });

  it('cerrada: no question can be added and no document deleted; the sentence', async () => {
    await step3('cerrada');
    expect(screen.queryByRole('button', { name: /Registrar consulta/ })).toBeNull();
    expect(screen.queryByTitle('Eliminar documento')).toBeNull();
    expect(screen.getByText(MENSAJE_CERRADA)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Agregar nueva ATE/ })).toBeNull();
  });
});

describe('Step4Propuestas', () => {
  it('propuestas_pendientes: upload and «Agregar ATE» as today', async () => {
    await step4('propuestas_pendientes');
    expect(screen.getByRole('button', { name: /Subir propuesta/ })).toBeTruthy();
    expect(screen.getByLabelText(/Archivo de propuesta/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Agregar ATE/ })).toBeTruthy();
    expect(screen.queryByText(MENSAJE_EVALUACION_INICIADA)).toBeNull();
  });

  it('evaluacion_pendiente: no proposal upload and no «Agregar ATE»; the sentence', async () => {
    await step4('evaluacion_pendiente');
    expect(screen.queryByRole('button', { name: /Subir propuesta/ })).toBeNull();
    expect(screen.queryByLabelText(/Archivo de propuesta/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Agregar ATE/ })).toBeNull();
    expect(screen.getByText(MENSAJE_EVALUACION_INICIADA)).toBeTruthy();
  });
});
