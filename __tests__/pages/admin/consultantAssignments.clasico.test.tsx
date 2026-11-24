// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Consultorías» with the switch OFF (today's look, also while the look is
 * unknown) is today's screen: today's header piece, no breadcrumb, today's words and the browser's own
 * question before a deletion. Invented data only.
 */
import React from 'react';
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch, fakeConfirm, requests } from '../../helpers/sessionsFakes';
import { resetScTwo } from '../../helpers/scTwoFakes';
import { ANSWERS, assignmentsScenario } from './consultantAssignments.fixtures';

vi.mock('next/router', async () => {
  const f = await import('../../helpers/sessionsFakes');
  return { useRouter: () => f.fakes.router };
});
vi.mock('@supabase/auth-helpers-react', async () => {
  const f = await import('../../helpers/scTwoFakes');
  return { useSupabaseClient: () => f.chainClient };
});
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/utils/roleUtils', async () => {
  const f = await import('../../helpers/sessionsFakes');
  return { getUserPrimaryRole: (id: string) => f.roleOf(id) };
});
vi.mock('react-hot-toast', async () => {
  const f = await import('../../helpers/sessionsFakes');
  return { toast: f.toast };
});
vi.mock('@/components/layout/MainLayout', async () => ({ default: (await import('../../helpers/sessionsFakes')).marker('MainLayout', true) }));
vi.mock('@/components/ConsultantAssignmentModal', async () => ({ default: (await import('../../helpers/sessionsFakes')).marker('Modal') }));

// The real look context, with no provider: the look is unknown, so it is today's.
import ConsultantAssignmentsPage from '@/pages/admin/consultant-assignments';

async function draw(confirmAnswer = false) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(assignmentsScenario({ confirm: confirmAnswer }))));
  resetScTwo(JSON.parse(JSON.stringify(ANSWERS)));
  render(<ConsultantAssignmentsPage />);
  await settle();
}
const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('confirm', vi.fn(fakeConfirm));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('«Consultorías», today’s look', () => {
  it('today’s header piece and table, no breadcrumb, no new view', async () => {
    await draw();
    expect(screen.queryByTestId('assignments-nuevo')).toBe(null);
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([]);
    expect(fakes.props.MainLayout.pageTitle).toBe('');
    // The responsive header draws a desktop and a phone variant, as today.
    expect(screen.getAllByText('Nueva Asignación').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByPlaceholderText('Buscar por nombre o email...').length).toBe(2);
    for (const text of ['Asignaciones Activas', 'Completas', 'Consultores Únicos', 'Estudiantes Afectados', 'Todos los tipos', 'Solo activas']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(document.querySelector('.bg-white.rounded-lg.shadow-lg.p-6')).toBeTruthy();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(4);
  });

  it('«Eliminar» asks the browser today’s question; «Cancelar» sends nothing; no kit window', async () => {
    await draw(false);
    fireEvent.click(within(rowOf('Tomás Ficticio')).getByText('Eliminar'));
    await settle();
    expect(requests()).toContainEqual({ confirm: ['¿Está seguro de que desea eliminar esta asignación?'] });
    expect(screen.queryByRole('dialog')).toBe(null);
    expect(requests().some((e: any) => e && typeof e === 'object' && e.method === 'DELETE')).toBe(false);
  });

  it('«Eliminar» with «Aceptar»: the DELETE and the toast', async () => {
    await draw(true);
    fireEvent.click(within(rowOf('Comunidad: Comunidad Inventada Sur')).getByText('Eliminar'));
    await settle();
    const sent = requests().filter((e: any) => e && typeof e === 'object' && e.method === 'DELETE') as any[];
    expect(sent.map((e) => e.fetch)).toEqual(['/api/admin/consultant-assignments?id=asg-2']);
    expect(requests()).toContainEqual({ 'toast.success': ['Asignación eliminada exitosamente'] });
  });
});
