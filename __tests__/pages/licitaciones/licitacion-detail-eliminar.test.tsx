// @vitest-environment jsdom
/**
 * GENERA fixes F24a (Brent, 20 Nov 2026, "No, keep it off"): an awarded or
 * closed tender cannot be deleted, so the detail page offers «Eliminar» only
 * where the delete route's own state rule (puedeEliminarLicitacion) allows it.
 * Render harness copied from licitacion-detail-step2.test.tsx.
 * Synthetic data only.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { h } = vi.hoisted(() => ({
  h: { detail: {} as Record<string, unknown>, role: 'admin', evaluacion: {} as Record<string, unknown> },
}));

vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'lic-1' }, push: vi.fn() }) }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/MainLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/licitaciones/Step3Bases', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step4Propuestas', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step6Adjudicacion', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step7Contrato', () => ({ default: () => <div>Paso de contrato (simulado)</div> }));
vi.mock('@/components/licitaciones/DocumentCenter', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/ProposalConfigPanel', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/ArchiveView', () => ({ default: () => <div>Vista de archivo (simulada)</div> }));

import LicitacionDetailPage from '@/pages/licitaciones/[id]';

const fetchMock = vi.fn();

const tender = (estado: string) => ({
  id: 'lic-1', numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada', year: 2026,
  estado, email_licitacion: 'licitacion@inventado.test',
  fecha_publicacion: null, fecha_limite_solicitud_bases: null, fecha_limite_consultas: null,
  fecha_inicio_propuestas: null, fecha_limite_propuestas: null, fecha_limite_evaluacion: null,
  school_id: 1, cliente_id: 'cliente-1',
  school: { id: 1, name: 'Escuela Inventada' },
  cliente: { nombre_legal: 'Fundación Inventada', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0', nombre_representante: 'Representante Inventado', comuna: 'Comuna Ficticia' },
});

beforeEach(() => {
  h.role = 'admin';
  h.evaluacion = { committee: [{ id: 'm-1' }], ates: [{ id: 'ate-1' }], scores: [] };
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/my-roles') return { ok: true, json: async () => ({ roles: [{ role_type: h.role }] }) };
    if (url === '/api/licitaciones/lic-1') return { ok: true, json: async () => ({ data: { licitacion: h.detail } }) };
    if (url === '/api/licitaciones/lic-1/evaluacion') return { ok: true, json: async () => ({ data: h.evaluacion }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function renderPage() {
  render(<LicitacionDetailPage />);
  await screen.findByText('Licitación inventada');
}

describe('Tender detail — «Eliminar» only where the tender may be deleted', () => {
  it('offers «Eliminar» to an admin before the award (publicacion_pendiente)', async () => {
    h.detail = tender('publicacion_pendiente');
    await renderPage();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('does not offer it for an awarded tender (contrato_pendiente)', async () => {
    h.detail = tender('contrato_pendiente');
    await renderPage();
    await screen.findByText('Paso de contrato (simulado)');
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('does not offer it for a closed tender shown with the workflow view (cerrada)', async () => {
    h.detail = tender('cerrada');
    await renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-1/evaluacion'));
    await screen.findByText('Paso de contrato (simulado)');
    expect(screen.queryByText('Vista de archivo (simulada)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('still offers it for a historical record shown with the archive view (the route\'s exception, unchanged here)', async () => {
    h.detail = tender('cerrada');
    h.evaluacion = { committee: [], ates: [], scores: [] };
    await renderPage();
    await screen.findByText('Vista de archivo (simulada)');
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('does not offer it to a non-admin, even before the award', async () => {
    h.role = 'encargado_licitacion';
    h.detail = tender('publicacion_pendiente');
    await renderPage();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});
