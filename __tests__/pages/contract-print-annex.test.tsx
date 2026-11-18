// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

/**
 * F10a send-back 1, item 2 (GES-2.5): printing a saved annex. The print page
 * builds the annex template's input from the parent contract; for a manual
 * parent it must hand over the parent's description so clause 1 names it.
 * All data here is invented.
 */

type Row = Record<string, any>;
let rowsById: Record<string, Row> = {};

const fakeClient = {
  from: () => {
    let id: string | undefined;
    const chain: any = {
      select: () => chain,
      eq: (_col: string, value: string) => {
        id = value;
        return chain;
      },
      single: () => chain,
      then: (ok: any, ko: any) =>
        Promise.resolve(
          id && rowsById[id] ? { data: { ...rowsById[id] }, error: null } : { data: null, error: { message: 'not found' } }
        ).then(ok, ko),
    };
    return chain;
  },
};

vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => fakeClient }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'anx-1' }, back: vi.fn() }) }));
vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));

import ContractPrintPage from '../../pages/contract-print/[id]';

const clientes = {
  nombre_legal: 'Corporación de Ejemplo',
  nombre_fantasia: 'Colegio de Ejemplo',
  rut: '11.111.111-1',
  direccion: 'Calle Falsa 123',
  comuna: 'Providencia',
  ciudad: 'Santiago',
  nombre_representante: 'Representante de Ejemplo',
};
const annex = {
  id: 'anx-1',
  numero_contrato: 'C-200A1',
  fecha_contrato: '2026-09-08',
  precio_total_uf: 30,
  tipo_moneda: 'UF',
  is_anexo: true,
  parent_contrato_id: 'ctr-parent',
  anexo_numero: 1,
  anexo_fecha: '2026-09-08',
  numero_participantes: 2,
  nombre_ciclo: 'Primer Ciclo',
  clientes,
  programas: null,
  cuotas: [{ numero_cuota: 1, monto_uf: 30, fecha_vencimiento: '2026-09-09' }],
};
const parentBase = {
  id: 'ctr-parent',
  numero_contrato: 'C-200',
  fecha_contrato: '2026-06-22',
  precio_total_uf: 120,
  tipo_moneda: 'UF',
  is_anexo: false,
  clientes,
  cuotas: [],
};

async function clauseOne(): Promise<string> {
  await screen.findByText('Ingreso de nuevos destinatarios', { exact: false });
  const clause = document.querySelectorAll('section.annex-clause')[0];
  return clause?.querySelector('p')?.textContent ?? '';
}

describe('contract print page — annex of a manual contract', () => {
  beforeEach(() => {
    rowsById = {};
  });

  it('names a manual parent by its description', async () => {
    rowsById = {
      'anx-1': annex,
      'ctr-parent': {
        ...parentBase,
        programa_id: null,
        programas: null,
        es_manual: true,
        descripcion_manual: 'Asesoría sintética descrita a mano',
      },
    };
    render(<ContractPrintPage />);
    expect(await clauseOne()).toBe(
      'Se acuerda la incorporación de 2 líderes del Primer Ciclo del colegio al programa de asesoría "Asesoría sintética descrita a mano".'
    );
  });

  it('names a programme parent by its programme, as before', async () => {
    rowsById = {
      'anx-1': { ...annex, programa_id: 'prog-1', programas: { nombre: 'Programa de Ejemplo' } },
      'ctr-parent': {
        ...parentBase,
        programa_id: 'prog-1',
        programas: { nombre: 'Programa de Ejemplo', descripcion: '', horas_totales: 10, modalidad: 'presencial' },
        es_manual: false,
        descripcion_manual: null,
      },
    };
    render(<ContractPrintPage />);
    expect(await clauseOne()).toBe(
      'Se acuerda la incorporación de 2 líderes del Primer Ciclo del colegio al programa de asesoría "Programa de Ejemplo".'
    );
  });
});
