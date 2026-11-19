// @vitest-environment jsdom
/**
 * GENERA fixes F20, LIC-D1 (the screens): steps 3 and 4 no longer offer what
 * the tender's state refuses; a tender in an earlier state shows every control
 * as today. Synthetic data only.
 */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Step3Bases from '@/components/licitaciones/Step3Bases';
import Step4Propuestas from '@/components/licitaciones/Step4Propuestas';
import DocumentCenter from '@/components/licitaciones/DocumentCenter';
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
let atesServed: any[] = [ATE];

const licitacion = (estado: string) => ({
  id: 'lic-1', numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada', year: 2026,
  estado, school_id: 1, fecha_limite_propuestas: '2026-11-20',
}) as any;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/ates')) return { ok: true, json: async () => ({ data: { ates: atesServed } }) };
    if (url.endsWith('/consultas')) return { ok: true, json: async () => ({ data: { consultas: [] } }) };
    if (url.endsWith('/documentos')) return { ok: true, json: async () => ({ data: { documentos: [BASES_DOC] } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  atesServed = [ATE];
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

// join fix 1: no «Generar Bases» once the tender is awarded; the existing bases stay listed.
describe('Step3Bases — «Generar Bases»', () => {
  const SENTENCE = 'La licitación ya fue adjudicada: no se pueden generar nuevas Bases.';

  it('propuestas_pendientes: the control as today', async () => {
    await step3('propuestas_pendientes');
    const boton = screen.getByRole('button', { name: /Generar Bases/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(screen.queryByText(SENTENCE)).toBeNull();
  });

  it.each(['contrato_pendiente', 'cerrada'])('%s: no «Generar Bases» control; the sentence; the bases stay listed', async (estado) => {
    await step3(estado);
    expect(screen.queryByRole('button', { name: /Generar Bases/ })).toBeNull();
    expect(screen.getByText(SENTENCE)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Bases_inventadas.docx')).toBeTruthy());
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

// join fix 3a: an «Avanzar a …» button only in the one state it advances from.
describe('«Avanzar a …» only from the step it advances', () => {
  // An ATE with its bases sent and its proposal received: both steps could advance.
  const ATE_LISTA = { ...ATE, fecha_envio_bases: '2026-11-05', propuesta_url: 'licitaciones/lic-1/p.pdf', propuesta_filename: 'p.pdf', fecha_propuesta: '2026-11-10' };
  const AVANZAR = /Avanzar a /;

  it('recepcion_bases_pendiente: step 3 offers «Avanzar a Recepción de Propuestas» as today', async () => {
    atesServed = [ATE_LISTA];
    await step3('recepcion_bases_pendiente');
    expect(screen.getByRole('button', { name: 'Avanzar a Recepción de Propuestas' })).toBeTruthy();
  });

  it('propuestas_pendientes: step 4 offers «Avanzar a Evaluación» as today', async () => {
    atesServed = [ATE_LISTA];
    await step4('propuestas_pendientes');
    expect(screen.getByRole('button', { name: 'Avanzar a Evaluación' })).toBeTruthy();
  });

  it('propuestas_pendientes: step 3 no longer offers its button', async () => {
    atesServed = [ATE_LISTA];
    await step3('propuestas_pendientes');
    expect(screen.queryByRole('button', { name: AVANZAR })).toBeNull();
  });

  it.each(['evaluacion_pendiente', 'adjudicacion_pendiente', 'contrato_generado', 'cerrada'])(
    '%s: no «Avanzar a …» button in step 3 nor in step 4',
    async (estado) => {
      atesServed = [ATE_LISTA];
      await step3(estado);
      expect(screen.queryByRole('button', { name: AVANZAR })).toBeNull();
      cleanup();
      await step4(estado);
      expect(screen.queryByRole('button', { name: AVANZAR })).toBeNull();
    },
  );
});

// join fix 3b: the documents centre offers the delete icon only where the tender's state allows deleting.
describe('DocumentCenter — delete icon', () => {
  async function centro(estado: string) {
    render(<DocumentCenter licitacionId="lic-1" numeroLicitacion="LIC-1-2026-001" isAdmin estado={estado} />);
    await waitFor(() => expect(screen.getByTitle('Descargar')).toBeTruthy());
  }

  it('propuestas_pendientes: the admin sees the delete icon as today', async () => {
    await centro('propuestas_pendientes');
    expect(screen.getByTitle('Eliminar documento')).toBeTruthy();
  });

  it('cerrada: no delete icon for the admin; the document stays listed', async () => {
    await centro('cerrada');
    expect(screen.queryByTitle('Eliminar documento')).toBeNull();
    expect(screen.getByTitle('Descargar')).toBeTruthy();
  });
});
