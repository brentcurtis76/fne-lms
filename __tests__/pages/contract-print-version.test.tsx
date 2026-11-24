// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

/**
 * F22a (T3): the print page prints each contract's own text. A contract without a
 * version prints the old text, a contract on version 2 the corrected text, and an
 * admin can move ONE unsigned programme contract to the corrected text with an
 * in-page confirmation. All data here is invented.
 */

type Row = Record<string, any>;
let rowsById: Record<string, Row> = {};
let updates: Array<{ table: string; payload: any; filters: Row; selected: string | undefined }> = [];
let updateAnswer: 'apply' | 'error' | 'no-rows' = 'apply';

const fakeClient = {
  from: (table: string) => {
    const filters: Row = {};
    let op: 'select' | 'update' = 'select';
    let payload: any;
    let selected: string | undefined;
    const chain: any = {
      select: (columns?: string) => {
        if (op === 'update') selected = columns;
        return chain;
      },
      update: (value: any) => {
        op = 'update';
        payload = value;
        return chain;
      },
      eq: (col: string, value: string) => {
        filters[col] = value;
        return chain;
      },
      single: () => chain,
      then: (ok: any, ko: any) => {
        if (op === 'update') {
          updates.push({ table, payload, filters: { ...filters }, selected });
          if (updateAnswer === 'error') return Promise.resolve({ data: null, error: { code: '42501', message: 'F22: plantilla_version' } }).then(ok, ko);
          if (updateAnswer === 'no-rows') return Promise.resolve({ data: [], error: null }).then(ok, ko);
          const row = rowsById[filters.id];
          rowsById[filters.id] = { ...row, ...payload };
          return Promise.resolve({ data: [{ id: filters.id, plantilla_version: payload.plantilla_version }], error: null }).then(ok, ko);
        }
        const id = filters.id;
        return Promise.resolve(
          id && rowsById[id] ? { data: { ...rowsById[id] }, error: null } : { data: null, error: { message: 'not found' } }
        ).then(ok, ko);
      },
    };
    return chain;
  },
};

vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => fakeClient }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'ctr-1' }, back: vi.fn() }) }));
vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));

import ContractPrintPage from '../../pages/contract-print/[id]';

const clientes = {
  nombre_legal: 'Corporación Sintética del Valle',
  nombre_fantasia: 'Colegio Sintético del Valle',
  rut: '76.000.111-2',
  direccion: 'Calle Inventada 456',
  comuna: 'Providencia',
  ciudad: 'Santiago',
  nombre_representante: 'Representante Sintética',
  rut_representante: '13.000.222-3',
  fecha_escritura: '2019-04-05',
  nombre_notario: 'Notario Inventado',
  comuna_notaria: 'Santiago',
};
const programmeContract = (overrides: Row = {}): Row => ({
  id: 'ctr-1',
  numero_contrato: 'SINT-F22-PRINT-1',
  fecha_contrato: '2027-03-01',
  fecha_fin: '2027-12-31',
  precio_total_uf: 90,
  tipo_moneda: 'UF',
  is_anexo: false,
  es_manual: false,
  firmado: false,
  programa_id: 'prog-1',
  plantilla_version: null,
  clientes,
  programas: { nombre: 'Programa Sintético', descripcion: '', horas_totales: 40, modalidad: 'mixta' },
  cuotas: [{ numero_cuota: 1, monto_uf: 90, fecha_vencimiento: '2027-04-30' }],
  ...overrides,
});

const OLD_TEXT = 'educación cristiana';
const NEW_TEXT = 'es una institución educacional.';
const pageText = () => document.body.textContent ?? '';
const waitForDocument = () => screen.findByText('Vista previa del contrato');

describe('contract print page — the contract text version', () => {
  beforeEach(() => {
    rowsById = {};
    updates = [];
    updateAnswer = 'apply';
  });

  it('a contract without a version prints the old text and says so', async () => {
    rowsById = { 'ctr-1': programmeContract() };
    render(<ContractPrintPage />);
    await waitForDocument();
    expect(pageText()).toContain(OLD_TEXT);
    expect(pageText()).not.toContain(NEW_TEXT);
    expect(screen.getByText('Texto del contrato: versión anterior')).toBeInTheDocument();
  });

  it('a contract on version 2 prints the corrected text, says so, and offers no move', async () => {
    rowsById = { 'ctr-1': programmeContract({ plantilla_version: 2 }) };
    render(<ContractPrintPage />);
    await waitForDocument();
    expect(pageText()).toContain(NEW_TEXT);
    expect(pageText()).not.toContain(OLD_TEXT);
    expect(screen.getByText('Texto del contrato: versión actualizada')).toBeInTheDocument();
    expect(screen.queryByTestId('contract-text-upgrade')).toBeNull();
  });

  it('an unsigned programme contract on the old text moves to the corrected text after «Confirmar»', async () => {
    rowsById = { 'ctr-1': programmeContract(), 'ctr-2': programmeContract({ id: 'ctr-2' }) };
    render(<ContractPrintPage />);
    await waitForDocument();
    const button = screen.getByTestId('contract-text-upgrade');
    expect(button).toHaveTextContent('Usar el texto actualizado');

    fireEvent.click(button);
    expect(
      screen.getByText('Este contrato pasará a imprimirse con el texto actualizado. No se puede volver al texto anterior.')
    ).toBeInTheDocument();
    expect(updates).toHaveLength(0);
    expect(screen.getByTestId('contract-text-upgrade-cancel')).toHaveTextContent('Cancelar');
    fireEvent.click(screen.getByTestId('contract-text-upgrade-confirm'));

    await screen.findByText('Texto del contrato: versión actualizada');
    expect(updates).toEqual([
      { table: 'contratos', payload: { plantilla_version: 2 }, filters: { id: 'ctr-1' }, selected: 'id, plantilla_version' },
    ]);
    expect(rowsById['ctr-2'].plantilla_version).toBeNull();
    expect(pageText()).toContain(NEW_TEXT);
    expect(pageText()).not.toContain(OLD_TEXT);
    expect(screen.queryByTestId('contract-text-upgrade')).toBeNull();
  });

  it('«Cancelar» closes the confirmation without any update', async () => {
    rowsById = { 'ctr-1': programmeContract() };
    render(<ContractPrintPage />);
    await waitForDocument();
    fireEvent.click(screen.getByTestId('contract-text-upgrade'));
    fireEvent.click(screen.getByTestId('contract-text-upgrade-cancel'));
    expect(screen.queryByTestId('contract-text-upgrade-confirm')).toBeNull();
    expect(screen.getByTestId('contract-text-upgrade')).toBeInTheDocument();
    expect(updates).toHaveLength(0);
  });

  it('no button for a signed contract', async () => {
    rowsById = { 'ctr-1': programmeContract({ firmado: true }) };
    render(<ContractPrintPage />);
    await waitForDocument();
    expect(screen.getByText('Texto del contrato: versión anterior')).toBeInTheDocument();
    expect(screen.queryByTestId('contract-text-upgrade')).toBeNull();
  });

  it('no button for an annex', async () => {
    rowsById = {
      'ctr-1': programmeContract({
        is_anexo: true,
        parent_contrato_id: 'ctr-parent',
        anexo_numero: 1,
        anexo_fecha: '2027-05-01',
        numero_participantes: 2,
        nombre_ciclo: 'Primer Ciclo',
      }),
      'ctr-parent': programmeContract({ id: 'ctr-parent' }),
    };
    render(<ContractPrintPage />);
    await screen.findByText('Ingreso de nuevos destinatarios', { exact: false });
    expect(screen.queryByTestId('contract-text-upgrade')).toBeNull();
  });

  it('a refused update says so and keeps the old text', async () => {
    for (const answer of ['error', 'no-rows'] as const) {
      updateAnswer = answer;
      updates = [];
      rowsById = { 'ctr-1': programmeContract() };
      const view = render(<ContractPrintPage />);
      await waitForDocument();
      fireEvent.click(screen.getByTestId('contract-text-upgrade'));
      fireEvent.click(screen.getByTestId('contract-text-upgrade-confirm'));
      await screen.findByText('No se pudo cambiar el texto del contrato.');
      expect(updates).toHaveLength(1);
      expect(pageText()).toContain(OLD_TEXT);
      expect(pageText()).not.toContain(NEW_TEXT);
      expect(screen.getByText('Texto del contrato: versión anterior')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('a manual contract still shows «Contrato importado»', async () => {
    rowsById = { 'ctr-1': programmeContract({ es_manual: true, programa_id: null, programas: null }) };
    render(<ContractPrintPage />);
    await screen.findByText('Contrato importado');
    expect(screen.queryByTestId('contract-text-upgrade')).toBeNull();
    await waitFor(() => expect(updates).toHaveLength(0));
  });
});
