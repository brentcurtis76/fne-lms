// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).React = React;

import { createFakeSupabase, PROGRAMAS, clickButton, typeInto, fillCuotaDates } from './contract-form-harness';

let currentClient: any;
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => currentClient }));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import ContractForm from '../../../components/contracts/ContractForm';

/**
 * F20d (LIC-D5): a tender has at most one contract. Saving the contract of a
 * tender when a contract with this licitacion_id already exists inserts no
 * contract and no cuotas: the form reports success with the existing contract's
 * id, so the page links that one. With none, the save is as before.
 * Synthetic data only.
 */
const CLIENTE = {
  id: 'cliente-1',
  nombre_legal: 'Colegio Inventado SpA',
  nombre_fantasia: 'Colegio Inventado',
  rut: '76.123.456-0',
  direccion: 'Calle Falsa 123',
  comuna: 'Comuna Inventada',
  ciudad: 'Ciudad Inventada',
  nombre_representante: 'Persona Inventada',
  rut_representante: '',
  fecha_escritura: '',
  nombre_notario: '',
  nombre_contacto_administrativo: 'Contacto Inventado',
  email_contacto_administrativo: 'contacto@ejemplo.test',
  school_id: null,
};

const LIC_ID = 'lic-1';

const saveTenderContract = async () => {
  const onSuccess = vi.fn();
  const { container } = render(
    <ContractForm
      programas={PROGRAMAS}
      clientes={[CLIENTE as any]}
      licitacionId={LIC_ID}
      licitacionData={{ cliente_id: 'cliente-1', programa_id: 'prog-b', precio_total_uf: 100, tipo_moneda: 'UF' } as any}
      onSuccess={onSuccess}
      onCancel={vi.fn()}
    />,
  );
  clickButton('Siguiente');
  const dates = container.querySelectorAll('input[type="date"]');
  typeInto(dates[1], '2099-12-31');
  clickButton('Siguiente');
  fillCuotaDates(container);
  typeInto(container.querySelector('input[type="number"]') as Element, '100');
  clickButton(/Guardar Contrato/);
  await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  return onSuccess;
};

let alertSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

describe('ContractForm — a tender has one contract', () => {
  it('a contract with this licitacion_id exists: no contract or cuota is inserted, success carries the existing id', async () => {
    currentClient = createFakeSupabase({ contratoByLicitacion: { id: 'contrato-existente' } });
    const onSuccess = await saveTenderContract();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('contrato-existente');
    expect(currentClient.__writes.filter((w: any) => w.table === 'contratos' && w.op === 'insert')).toHaveLength(0);
    expect(currentClient.__writes.filter((w: any) => w.table === 'cuotas' && w.op === 'insert')).toHaveLength(0);
    expect(currentClient.__reads.some((r: any) => r.table === 'contratos' && r.filters.licitacion_id === LIC_ID)).toBe(true);
  });

  it('none exists: the contract is inserted with the licitacion_id and its cuotas, as before', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = await saveTenderContract();
    expect(onSuccess).toHaveBeenCalledWith('contrato-nuevo');
    const insert = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(insert.payload[0]).toMatchObject({ licitacion_id: LIC_ID, cliente_id: 'cliente-1', programa_id: 'prog-b' });
    expect(currentClient.__writes.filter((w: any) => w.table === 'cuotas' && w.op === 'insert')).toHaveLength(1);
  });
});
