// @vitest-environment jsdom
/**
 * LIC-D6 (GENERA fixes F14): the creation form no longer submits a tender for
 * a school with no linked client — the submit control is disabled with the
 * reason. Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SCHOOLS = [
  { id: 1, name: 'Escuela Sin Cliente', cliente_id: null },
  { id: 2, name: 'Escuela Con Cliente', cliente_id: 'cliente-2' },
];

const { clienteRow } = vi.hoisted(() => ({
  clienteRow: { current: null as Record<string, unknown> | null },
}));

vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/MainLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@supabase/auth-helpers-react', () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const q: any = {
        select: () => q, order: () => q, eq: () => q,
        single: async () => ({
          data: clienteRow.current ?? { id: 'cliente-2', nombre_legal: 'Fundación Inventada', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0', direccion: 'Calle Ficticia 1', comuna: 'Comuna Ficticia', nombre_representante: 'Representante Inventado', rut_representante: '1-9', fecha_escritura: '2020-01-01', nombre_notario: 'Notario Inventado' },
          error: null,
        }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'schools' ? SCHOOLS : [{ id: 'prog-1', nombre: 'Programa Inventado' }], error: null }).then(ok),
      };
      return q;
    },
  };
  return { useSupabaseClient: () => client };
});

import NuevaLicitacionPage from '@/pages/licitaciones/nueva';

const fetchMock = vi.fn();
const MESSAGE = 'Esta escuela no tiene un cliente vinculado. Vincule un cliente antes de crear la licitación.';

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/my-roles') return { ok: true, json: async () => ({ roles: [{ role_type: 'admin' }] }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); clienteRow.current = null; });

async function pickSchool(id: string) {
  render(<NuevaLicitacionPage />);
  await screen.findByRole('option', { name: 'Escuela Sin Cliente' });
  fireEvent.change(document.getElementById('field-school_id') as HTMLSelectElement, { target: { value: id } });
}

describe('Nueva licitación — a school with no client cannot be submitted', () => {
  it('disables «Crear Licitacion» and says why', async () => {
    await pickSchool('1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear Licitacion' })).toBeDisabled());
    expect(screen.getAllByText(MESSAGE).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/licitaciones', expect.anything());
  });

  it('keeps «Crear Licitacion» enabled for a school with a client', async () => {
    await pickSchool('2');
    await screen.findByText(/Colegio Inventado|Fundación Inventada/);
    expect(screen.getByRole('button', { name: 'Crear Licitacion' })).toBeEnabled();
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });
});

describe('Nueva licitación — the notary data is never required (Brent, 20 Nov 2026)', () => {
  const base = {
    id: 'cliente-2', nombre_legal: 'Fundación Inventada', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0',
    direccion: 'Calle Ficticia 1', comuna: 'Comuna Ficticia', nombre_representante: 'Representante Inventado',
  };

  it('opens without the notary name and the escritura date: no «informacion legal» sentence, «Crear Licitacion» enabled', async () => {
    clienteRow.current = { ...base, rut_representante: '12.345.678-5', fecha_escritura: '', nombre_notario: '' };
    await pickSchool('2');
    await screen.findByText(/Colegio Inventado|Fundación Inventada/);
    expect(screen.queryByText(/informacion legal/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear Licitacion' })).toBeEnabled();
  });

  it('keeps today’s behaviour for a client without the representative’s RUT: the sentence shows, the button stays enabled', async () => {
    clienteRow.current = { ...base, rut_representante: '', fecha_escritura: '', nombre_notario: '' };
    await pickSchool('2');
    await screen.findByText(/Colegio Inventado|Fundación Inventada/);
    expect(screen.getAllByText(/El cliente no tiene toda la informacion legal requerida\. Edite el cliente en la seccion de Escuelas\./).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Crear Licitacion' })).toBeEnabled();
  });
});
