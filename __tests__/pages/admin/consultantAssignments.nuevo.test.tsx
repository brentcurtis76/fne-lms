// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Consultorías» in the new look (scenarios sc.md, part F). Today's words in
 * today's order, the kit's header with its search and main action, the four numbers over every row,
 * the table and its empty sentences, the pop-up unchanged, and «Eliminar» asking in the kit's window
 * (opening, «Cancelar», Escape: nothing sent; the focus starts on «Cancelar»). Invented data only.
 */
import React from 'react';
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch, fakeConfirm, requests } from '../../helpers/sessionsFakes';
import type { Scenario } from '../../helpers/sessionsFakes';
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
vi.mock('@/contexts/LookContext', async () => {
  const f = await import('../../helpers/sessionsFakes');
  return { useLook: () => ({ look: f.fakes.look, setLook: () => {} }) };
});
vi.mock('@/components/layout/MainLayout', async () => ({ default: (await import('../../helpers/sessionsFakes')).marker('MainLayout', true) }));
vi.mock('@/components/ConsultantAssignmentModal', async () => ({ default: (await import('../../helpers/sessionsFakes')).marker('Modal') }));

import ConsultantAssignmentsPage from '@/pages/admin/consultant-assignments';

async function draw(scenario: Scenario = assignmentsScenario()) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  resetScTwo(JSON.parse(JSON.stringify(ANSWERS)));
  fakes.look = 'nuevo';
  render(<ConsultantAssignmentsPage />);
  await settle();
}
const rows = () => Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
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

describe('«Consultorías», new look', () => {
  it('draws the new view, not today’s, with the breadcrumb in the frame', async () => {
    await draw();
    expect(screen.getByTestId('assignments-nuevo')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Consultorías' }, { label: 'Asignación de Consultores' }]);
    expect(fakes.props.MainLayout.currentPage).toBe('consultants');
  });

  it('the header: title, description, one search and the main action', async () => {
    await draw();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Consultorías');
    expect(screen.getByText('Gestión de asignaciones consultor-estudiante para seguimiento y mentorías')).toBeTruthy();
    expect(screen.getAllByPlaceholderText('Buscar por nombre o email...')).toHaveLength(1);
    expect(screen.getAllByText('Nueva Asignación')).toHaveLength(1);
  });

  it('the filters, with today’s choices and «Solo activas» at arrival', async () => {
    await draw();
    const [type, status] = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    expect(Array.from(type.options).map((o) => o.textContent)).toEqual(['Todos los tipos', 'Completa', 'Monitoreo', 'Mentoría', 'Evaluación', 'Apoyo']);
    expect(Array.from(status.options).map((o) => o.textContent)).toEqual(['Todas las asignaciones', 'Solo activas', 'Solo inactivas']);
    expect(type.value).toBe('all');
    expect(status.value).toBe('active');
  });

  it('the four numbers count every row, not the filtered ones', async () => {
    await draw();
    const number = (label: string) => screen.getByText(label).previousElementSibling?.textContent;
    expect(number('Asignaciones Activas')).toBe('4');
    expect(number('Completas')).toBe('1');
    expect(number('Consultores Únicos')).toBe('3');
    // Individual rows count 1; the community 12, the school 1, the generation 0 (then counted as 1).
    expect(number('Estudiantes Afectados')).toBe(String(1 + 12 + 1 + 1 + 1));
    fireEvent.change(document.querySelectorAll('select')[1], { target: { value: 'inactive' } });
    await settle();
    expect(number('Asignaciones Activas')).toBe('4');
  });

  it('the table: heads, people, scopes, pills, permissions, dates, state, actions', async () => {
    await draw();
    expect(Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual([
      'Consultor', 'Estudiante', 'Tipo', 'Permisos', 'Duración', 'Estado', 'Acciones',
    ]);
    expect(rows()).toHaveLength(4);
    const first = rowOf('Tomás Ficticio');
    expect(within(first).getByText('Rosa Inventada')).toBeTruthy();
    expect(within(first).getByText('rosa@example.invalid')).toBeTruthy();
    expect(within(first).getByText('Completa')).toBeTruthy();
    for (const p of ['Progreso', 'Asignar', 'Mensajes']) expect(within(first).getByText(p)).toBeTruthy();
    expect(within(first).getByText('Activa')).toBeTruthy();
    expect(within(first).getByText('Fin: Sin límite')).toBeTruthy();
    expect(within(rowOf('Comunidad: Comunidad Inventada Sur')).getByText('12 estudiantes afectados')).toBeTruthy();
    expect(within(rowOf('Escuela: Colegio Inventado Oeste')).getByText('1 estudiante afectado')).toBeTruthy();
    expect(within(rowOf('Escuela: Colegio Inventado Oeste')).getByText('Sin nombre')).toBeTruthy();
    expect(within(rowOf('Escuela: Colegio Inventado Oeste')).getByText('Sin email')).toBeTruthy();
    expect(within(rowOf('Generación: Generación Ficticia 2026')).getByText('0 estudiantes afectados')).toBeTruthy();
    for (const row of rows()) {
      expect(within(row).getByText('Editar').tagName).toBe('BUTTON');
      expect(within(row).getByText('Eliminar').tagName).toBe('BUTTON');
    }
  });

  it('the inactive row and its «Inactiva»; the two empty sentences', async () => {
    await draw();
    fireEvent.change(document.querySelectorAll('select')[1], { target: { value: 'inactive' } });
    await settle();
    expect(within(rowOf('Lucía Imaginaria')).getByText('Inactiva')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o email...'), { target: { value: 'zzz' } });
    await settle();
    expect(screen.getByText('No se encontraron asignaciones que coincidan con los filtros.')).toBeTruthy();

    await draw(assignmentsScenario({}, []));
    fireEvent.change(document.querySelectorAll('select')[1], { target: { value: 'all' } });
    await settle();
    expect(screen.getByText('No hay asignaciones creadas aún.')).toBeTruthy();
  });

  it('«Nueva Asignación» and «Editar» open the page’s own pop-up', async () => {
    await draw();
    expect(fakes.props.Modal.isOpen).toBe(false);
    fireEvent.click(screen.getByText('Nueva Asignación'));
    await settle();
    expect(fakes.props.Modal.isOpen).toBe(true);
    expect(fakes.props.Modal.editingAssignment).toBe(null);
    fakes.props.Modal.onClose();
    await settle();
    fireEvent.click(within(rowOf('Tomás Ficticio')).getByText('Editar'));
    await settle();
    expect(fakes.props.Modal.editingAssignment.id).toBe('asg-1');
  });

  describe('«Eliminar» asks in the kit’s window', () => {
    it('opens with today’s question, the focus on «Cancelar»; «Cancelar» sends nothing and gives the focus back', async () => {
      await draw();
      const opener = within(rowOf('Tomás Ficticio')).getByText('Eliminar');
      opener.focus();
      fireEvent.click(opener);
      await settle();
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('¿Está seguro de que desea eliminar esta asignación?')).toBeTruthy();
      expect(within(dialog).getByText('Confirmar')).toBeTruthy();
      expect(document.activeElement?.textContent).toBe('Cancelar');
      fireEvent.click(within(dialog).getByText('Cancelar'));
      await settle();
      expect(screen.queryByRole('dialog')).toBe(null);
      expect(document.activeElement).toBe(opener);
      expect(requests().some((e: any) => e && typeof e === 'object' && (e.method === 'DELETE' || 'confirm' in e))).toBe(false);
    });

    it('Escape closes it and sends nothing', async () => {
      await draw();
      fireEvent.click(within(rowOf('Tomás Ficticio')).getByText('Eliminar'));
      await settle();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await settle();
      expect(screen.queryByRole('dialog')).toBe(null);
      expect(requests().some((e: any) => e && typeof e === 'object' && e.method === 'DELETE')).toBe(false);
    });

    it('«Confirmar» deletes that row (the browser is never asked)', async () => {
      await draw();
      fireEvent.click(within(rowOf('Comunidad: Comunidad Inventada Sur')).getByText('Eliminar'));
      await settle();
      fireEvent.click(within(screen.getByRole('dialog')).getByText('Confirmar'));
      await settle();
      const sent = requests().filter((e: any) => e && typeof e === 'object' && e.method === 'DELETE') as any[];
      expect(sent.map((e) => e.fetch)).toEqual(['/api/admin/consultant-assignments?id=asg-2']);
      expect(requests()).toContainEqual({ 'toast.success': ['Asignación eliminada exitosamente'] });
      expect(requests().some((e: any) => e && typeof e === 'object' && 'confirm' in e)).toBe(false);
    });
  });

  it('reads the scope of each group row as today (one count per group, one name per id)', async () => {
    await draw();
    const queries = requests().filter((e: any) => e && typeof e === 'object' && 'from' in e) as any[];
    expect(queries.filter((q) => q.from === 'user_roles').map((q) => q.eq[0][0]).sort()).toEqual(['community_id', 'generation_id', 'school_id']);
    expect(queries.filter((q) => q.from !== 'user_roles' && q.from !== 'profiles').map((q) => q.from).sort()).toEqual([
      'generations', 'growth_communities', 'schools',
    ]);
  });

  it('while loading, and for a non-admin: today’s screens (no frame)', async () => {
    cleanup();
    resetFakes(assignmentsScenario({ role: 'pending' }));
    resetScTwo(ANSWERS);
    fakes.look = 'nuevo';
    const { container } = render(<ConsultantAssignmentsPage />);
    await settle();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    expect(fakes.mounts.MainLayout).toBeUndefined();
  });
});
