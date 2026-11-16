// @vitest-environment jsdom
/**
 * GENERA fixes F14 — step 2 (Publicación) of the tender detail page.
 * LIC-A3: the publication text follows the date typed and stays available,
 * with «Copiar texto», after confirmation.
 * Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { h } = vi.hoisted(() => ({ h: { detail: {} as Record<string, unknown>, timeline: {} as Record<string, string>, role: 'admin' } }));

vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'lic-1' }, push: vi.fn() }) }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/MainLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/licitaciones/Step3Bases', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step4Propuestas', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step6Adjudicacion', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step7Contrato', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/DocumentCenter', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/ProposalConfigPanel', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/ArchiveView', () => ({ default: () => null }));

import LicitacionDetailPage from '@/pages/licitaciones/[id]';

const fetchMock = vi.fn();

const pending = () => ({
  id: 'lic-1', numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada', year: 2026,
  estado: 'publicacion_pendiente', email_licitacion: 'licitacion@inventado.test',
  fecha_publicacion: null, fecha_limite_solicitud_bases: null, fecha_limite_consultas: null,
  fecha_inicio_propuestas: null, fecha_limite_propuestas: null, fecha_limite_evaluacion: null,
  school_id: 1, cliente_id: 'cliente-1',
  school: { id: 1, name: 'Escuela Inventada' },
  cliente: { nombre_legal: 'Fundación Inventada', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0', nombre_representante: 'Representante Inventado', comuna: 'Comuna Ficticia' },
});

const confirmed = () => ({
  ...pending(), estado: 'recepcion_bases_pendiente', fecha_publicacion: '2026-11-02',
  fecha_limite_solicitud_bases: '2026-11-09', fecha_limite_consultas: '2026-11-12',
  fecha_inicio_propuestas: '2026-11-13', fecha_limite_propuestas: '2026-11-20', fecha_limite_evaluacion: '2026-11-25',
});

beforeEach(() => {
  h.role = 'admin';
  h.timeline = {
    fecha_limite_solicitud_bases: '2026-11-09', fecha_limite_consultas: '2026-11-12', fecha_inicio_propuestas: '2026-11-13',
    fecha_limite_propuestas: '2026-11-20', fecha_limite_evaluacion: '2026-11-25',
  };
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/my-roles') return { ok: true, json: async () => ({ roles: [{ role_type: h.role }] }) };
    if (url.startsWith('/api/licitaciones/lic-1/timeline')) return { ok: true, json: async () => ({ data: { timeline: h.timeline } }) };
    if (url === '/api/licitaciones/lic-1') return { ok: true, json: async () => ({ data: { licitacion: h.detail } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function renderPage() {
  render(<LicitacionDetailPage />);
  await screen.findByText('Licitación inventada');
}

describe('Step 2 — the publication text carries the real deadline (LIC-A3)', () => {
  it('shows the placeholder with no date, and the computed deadline once a date is typed', async () => {
    h.detail = pending();
    await renderPage();
    expect(screen.getByText(/hasta el \[fecha pendiente\]/)).toBeInTheDocument();
    fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '2026-11-02' } });
    await waitFor(() => expect(screen.getByText(/hasta el 9 de noviembre de 2026 al/)).toBeInTheDocument());
    expect(screen.queryByText(/\[fecha pendiente\]/)).not.toBeInTheDocument();
  });

  it('keeps the text, with its stored deadline and «Copiar texto», after confirmation', async () => {
    h.detail = confirmed();
    await renderPage();
    expect(screen.getByText(/hasta el 9 de noviembre de 2026 al/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copiar texto/ })).toBeEnabled();
  });

  it('works the same for the Encargado', async () => {
    h.role = 'encargado_licitacion';
    h.detail = confirmed();
    await renderPage();
    expect(screen.getByText(/hasta el 9 de noviembre de 2026 al/)).toBeInTheDocument();
  });
});

describe('Step 2 — «Ajustar fechas (admin)» works after a reload (LIC-D9)', () => {
  it('shows the five date fields filled with the stored dates and sends a change to the route', async () => {
    h.detail = confirmed();
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar fechas (admin)' }));
    const inputs = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    expect(inputs.map(i => i.value)).toEqual(['2026-11-09', '2026-11-12', '2026-11-13', '2026-11-20', '2026-11-25']);
    fireEvent.change(inputs[3], { target: { value: '2026-11-27' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar fechas ajustadas' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-1', expect.objectContaining({ method: 'PATCH' })));
    const call = fetchMock.mock.calls.find(([u, o]) => u === '/api/licitaciones/lic-1' && o?.method === 'PATCH');
    expect(JSON.parse(call![1].body).timeline).toEqual({
      fecha_limite_solicitud_bases: '2026-11-09', fecha_limite_consultas: '2026-11-12', fecha_inicio_propuestas: '2026-11-13',
      fecha_limite_propuestas: '2026-11-27', fecha_limite_evaluacion: '2026-11-25',
    });
  });

  it('does not offer a manual adjustment before confirmation, where it would be dropped', async () => {
    h.detail = pending();
    await renderPage();
    fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '2026-11-02' } });
    await screen.findByText(/hasta el 9 de noviembre de 2026 al/);
    expect(screen.queryByRole('button', { name: /Ajustar fechas/ })).not.toBeInTheDocument();
  });
});
