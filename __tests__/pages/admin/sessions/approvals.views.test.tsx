// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: the two views of «Aprobaciones de Sesiones». The new look: the frame's
 * breadcrumb, a `PageHeader`, the kit's four tabs, the cards with today's words in today's order, the
 * notes and buttons only on pending cards, the empty sentences. Today's look: today's words, a plain
 * heading, no breadcrumb, no tab roles. Every person and session here is invented.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeFetch, resetFakes, settle } from '../../../helpers/sessionsFakes';
import { approvalsScenario } from '../../../helpers/adminSessionsFakes';
import type { AdminScenario } from '../../../helpers/adminSessionsFakes';

vi.mock('next/router', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { useRouter: () => f.fakes.router };
});
vi.mock('@supabase/auth-helpers-react', async () => {
  const a = await import('../../../helpers/adminSessionsFakes');
  return { useSupabaseClient: () => a.adminClient };
});
vi.mock('@/utils/roleUtils', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { getUserPrimaryRole: (id: string) => f.roleOf(id) };
});
vi.mock('react-hot-toast', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { toast: f.toast };
});
vi.mock('@/contexts/LookContext', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { useLook: () => ({ look: f.fakes.look, setLook: () => {} }) };
});
vi.mock('@/components/layout/MainLayout', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('MainLayout', true) }));

import SessionApprovalsPage from '@/pages/admin/sessions/approvals';

async function draw(look: 'clasico' | 'nuevo', scenario: AdminScenario = approvalsScenario()) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = look;
  render(<SessionApprovalsPage />);
  await settle();
}
const empty = (status: string) => ({ body: { data: { edit_requests: [] } }, status: 200, key: status });
function emptyScenario() {
  const s = approvalsScenario();
  for (const status of ['pending', 'approved', 'rejected', 'all']) {
    const { key, ...answer } = empty(status);
    s.fetch![`GET /api/sessions/edit-requests?status=${key}`] = answer;
  }
  return s;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the new look', () => {
  it('the frame and the header', async () => {
    await draw('nuevo');
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Consultorías' }, { label: 'Aprobaciones' }]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Aprobaciones de Sesiones');
    expect(screen.getByText('Revise y apruebe o rechace solicitudes de cambio de sesiones de consultores')).toBeTruthy();
  });

  it('the loading state already has the frame', async () => {
    cleanup();
    const s = approvalsScenario({ role: 'pending' });
    resetFakes(s);
    fakes.look = 'nuevo';
    render(<SessionApprovalsPage />);
    await settle();
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Consultorías' }, { label: 'Aprobaciones' }]);
  });

  it('four tabs, «Pendientes» chosen; the cards in today’s order and words', async () => {
    await draw('nuevo');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Pendientes', 'Aprobadas', 'Rechazadas', 'Todas']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Mesa inventada de gestión')).toBeTruthy();
    expect(within(panel).getByText('Sesión sin título')).toBeTruthy();
    expect(within(panel).getAllByText(/Fecha de sesión:/)[0].textContent).toMatch(/^Fecha de sesión: 01 dic\.? 2026$/);
    expect(within(panel).getAllByText(/Solicitado por:/)[0].textContent).toBe('Solicitado por: Ana Inventada');
    expect(within(panel).getByText('Solicitado por: Usuario desconocido')).toBeTruthy();
    expect(within(panel).getAllByText('Pendiente')).toHaveLength(2);
    expect(within(panel).getAllByText('Cambios propuestos:')).toHaveLength(2);
    expect(within(panel).getByText('Modalidad:')).toBeTruthy();
    expect(within(panel).getByText('Presencial').className).toContain('line-through');
    expect(within(panel).getByText('Híbrida')).toBeTruthy();
    expect(within(panel).getByText('Hora de término:')).toBeTruthy();
    expect(within(panel).getByText('Razón:')).toBeTruthy();
    expect(within(panel).getAllByLabelText('Notas (opcional para aprobar, requerido para rechazar)')).toHaveLength(2);
    expect(within(panel).getAllByPlaceholderText('Ingrese notas para el consultor...')).toHaveLength(2);
    expect(within(panel).getAllByText('Rechazar')).toHaveLength(2);
    expect(within(panel).getAllByText('Aprobar')).toHaveLength(2);
  });

  it('a reviewed card shows no notes and no buttons; an unreadable change says so', async () => {
    await draw('nuevo');
    fireEvent.click(screen.getByRole('tab', { name: 'Rechazadas' }));
    await settle();
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Rechazada')).toBeTruthy();
    expect(within(panel).getByText('Formato de cambios inválido')).toBeTruthy();
    expect(panel.querySelector('textarea')).toBeNull();
    expect(within(panel).queryByText('Aprobar')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Aprobadas' }));
    await settle();
    expect(within(screen.getByRole('tabpanel')).getByText('Aprobada')).toBeTruthy();
  });

  it('the four empty sentences', async () => {
    await draw('nuevo', emptyScenario());
    const sentences: Record<string, string> = {
      Pendientes: 'No hay solicitudes pendientes',
      Aprobadas: 'No hay solicitudes aprobadas',
      Rechazadas: 'No hay solicitudes rechazadas',
      Todas: 'No hay solicitudes de cambio',
    };
    for (const [tab, sentence] of Object.entries(sentences)) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      await settle();
      expect(within(screen.getByRole('tabpanel')).getByText(sentence)).toBeTruthy();
    }
  });
});

describe('today’s look', () => {
  it('today’s words, a plain heading, no breadcrumb, no tab roles', async () => {
    await draw('clasico');
    expect(fakes.props.MainLayout.breadcrumbs).toBeUndefined();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Aprobaciones de Sesiones');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    for (const word of ['Pendientes', 'Aprobadas', 'Rechazadas', 'Todas']) expect(screen.getByText(word).closest('button')).toBeTruthy();
    expect(screen.getAllByText('Cambios propuestos:')).toHaveLength(2);
    expect(screen.getAllByText('Notas (opcional para aprobar, requerido para rechazar)')).toHaveLength(2);
    expect(screen.getAllByText('Rechazar')).toHaveLength(2);
    expect(document.querySelector('[data-testid="approvals-nuevo"]')).toBeNull();
  });

  it('today’s empty sentence', async () => {
    await draw('clasico', emptyScenario());
    expect(screen.getByText('No hay solicitudes pendientes')).toBeTruthy();
  });
});
