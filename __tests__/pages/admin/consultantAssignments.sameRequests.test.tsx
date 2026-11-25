// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Consultorías» (`/admin/consultant-assignments`) asks the same things and
 * moves the browser the same way in both looks. Each case draws the page in today's look and in the new
 * look on the same invented data, does the same thing through each view's own controls, and compares
 * what reached the server or moved the browser (`auth.*`, the role helper, every Supabase query, every
 * `fetch`, every router move, every toast, the browser's question). The deletion is the one place the
 * question differs (the browser's in today's look, the kit's window in the new one): the requests after
 * «yes» and after «no» are compared, the question itself is left out of the comparison.
 */
import React from 'react';
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch, fakeConfirm, requests } from '../../helpers/sessionsFakes';
import type { Scenario } from '../../helpers/sessionsFakes';
import { resetScTwo } from '../../helpers/scTwoFakes';
import { ANSWERS, LIST_GET, assignmentsScenario, deleteOf } from './consultantAssignments.fixtures';

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

type Look = 'clasico' | 'nuevo';
const copy = (s: Scenario): Scenario => JSON.parse(JSON.stringify(s));

async function draw(scenario: Scenario, look: Look) {
  cleanup();
  resetFakes(copy(scenario));
  resetScTwo(JSON.parse(JSON.stringify(ANSWERS)));
  fakes.look = look;
  render(<ConsultantAssignmentsPage />);
  await settle();
}
async function both(scenario: Scenario, steps: (look: Look) => Promise<void> = async () => {}) {
  const out: Record<Look, unknown[]> = { clasico: [], nuevo: [] };
  for (const look of ['clasico', 'nuevo'] as Look[]) {
    await draw(scenario, look);
    await steps(look);
    out[look] = requests();
  }
  return out;
}
const withoutQuestion = (entries: unknown[]) => entries.filter((e) => !(e && typeof e === 'object' && 'confirm' in e));
/** Props as data: a function counts only as being one. */
const shape = (props: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === 'function' ? 'function' : v]));
const rowOf = (text: string) => screen.getAllByText(text)[0].closest('tr') as HTMLElement;

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

describe('arriving: the same calls and redirects', () => {
  const cases: [string, Scenario][] = [
    ['the admin (every enrichment query)', assignmentsScenario()],
    ['a consultor (→ /dashboard)', assignmentsScenario({ role: 'consultor' })],
    ['nobody signed in (→ /login)', assignmentsScenario({ session: null })],
    ['the list failing (the toast)', assignmentsScenario({ fetch: { [LIST_GET]: { status: 500, body: {} } } })],
    ['a session without a token (the toast «Error de autenticación»)', assignmentsScenario({ session: { user: { id: 'admin-inventado' } } })],
  ];
  for (const [name, scenario] of cases) {
    it(name, async () => {
      const out = await both(scenario);
      expect(out.nuevo).toEqual(out.clasico);
      expect(out.clasico.length).toBeGreaterThan(0);
    });
  }

  it('no profile row: «Acceso Denegado» in both looks, no redirect, no list read', async () => {
    const shown: string[] = [];
    for (const look of ['clasico', 'nuevo'] as Look[]) {
      cleanup();
      resetFakes(copy(assignmentsScenario()));
      resetScTwo({ ...ANSWERS, profile: null });
      fakes.look = look;
      render(<ConsultantAssignmentsPage />);
      await settle();
      shown.push(document.body.textContent ?? '');
      expect(requests().some((e: any) => e && e['router.push'])).toBe(false);
      expect(requests().some((e: any) => e && e.fetch)).toBe(false);
    }
    expect(shown[0]).toContain('Acceso Denegado');
    expect(shown[1]).toBe(shown[0]);
  });
});

describe('doing things: the same requests', () => {
  it('«Eliminar», then «no»: nothing sent in either look', async () => {
    const out = await both(assignmentsScenario(), async (look) => {
      fireEvent.click(within(rowOf('Comunidad: Comunidad Inventada Sur')).getByText('Eliminar'));
      await settle();
      if (look === 'nuevo') {
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancelar'));
        await settle();
      }
    });
    expect(withoutQuestion(out.nuevo)).toEqual(withoutQuestion(out.clasico));
    expect(out.clasico).toContainEqual({ confirm: ['¿Está seguro de que desea eliminar esta asignación?'] });
    expect(out.nuevo.some((e: any) => e && typeof e === 'object' && 'confirm' in e)).toBe(false);
    expect(out.clasico.some((e: any) => e && e.method === 'DELETE')).toBe(false);
  });

  it('«Eliminar», then «yes»: the same DELETE, toast and new read', async () => {
    const scenario = assignmentsScenario({ confirm: true });
    const out = await both(scenario, async (look) => {
      fireEvent.click(within(rowOf('Comunidad: Comunidad Inventada Sur')).getByText('Eliminar'));
      await settle();
      if (look === 'nuevo') {
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Confirmar'));
        await settle();
      }
    });
    expect(withoutQuestion(out.nuevo)).toEqual(withoutQuestion(out.clasico));
    const sent = out.clasico.filter((e: any) => e && e.method === 'DELETE');
    expect(sent).toHaveLength(1);
    expect(`DELETE ${(sent[0] as any).fetch}`).toBe(deleteOf('asg-2'));
    expect(out.clasico).toContainEqual({ 'toast.success': ['Asignación eliminada exitosamente'] });
  });

  it('«Eliminar», «yes», and the server refusing: the same error toast', async () => {
    const scenario = assignmentsScenario({ confirm: true });
    scenario.fetch![deleteOf('asg-2')] = { status: 500, body: {} };
    const out = await both(scenario, async (look) => {
      fireEvent.click(within(rowOf('Comunidad: Comunidad Inventada Sur')).getByText('Eliminar'));
      await settle();
      if (look === 'nuevo') {
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Confirmar'));
        await settle();
      }
    });
    expect(withoutQuestion(out.nuevo)).toEqual(withoutQuestion(out.clasico));
    expect(out.clasico).toContainEqual({ 'toast.error': ['Error al eliminar asignación'] });
  });

  it('«Nueva Asignación» and «Editar» open the same pop-up with the same props', async () => {
    const props: Record<Look, unknown[]> = { clasico: [], nuevo: [] };
    for (const look of ['clasico', 'nuevo'] as Look[]) {
      await draw(assignmentsScenario(), look);
      props[look].push(shape(fakes.props.Modal));
      fireEvent.click(screen.getAllByText('Nueva Asignación')[0]);
      await settle();
      props[look].push(shape(fakes.props.Modal));
      fireEvent.click(within(rowOf('Tomás Ficticio')).getByText('Editar'));
      await settle();
      const { onClose } = fakes.props.Modal;
      props[look].push(shape(fakes.props.Modal));
      // Closing the pop-up from its own X/«Cancelar» (the page's handler).
      await (async () => onClose())();
      await settle();
      props[look].push({ isOpen: fakes.props.Modal.isOpen, editingAssignment: fakes.props.Modal.editingAssignment });
      expect(requests().filter((e: any) => e && e.fetch).length).toBe(1);
    }
    expect(props.nuevo).toEqual(props.clasico);
    expect((props.clasico[2] as any).isOpen).toBe(true);
    expect((props.clasico[2] as any).editingAssignment.id).toBe('asg-1');
  });

  it('an assignment saved in the pop-up: the same new read', async () => {
    const out = await both(assignmentsScenario(), async () => {
      fakes.props.Modal.onAssignmentCreated();
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.filter((e: any) => e && e.fetch).length).toBe(2);
  });

  it('signing out from the frame', async () => {
    const out = await both(assignmentsScenario(), async () => {
      await fakes.props.MainLayout.onLogout();
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContain('auth.signOut');
  });

  it('the frame gets the same props, but for the breadcrumb of the new look', async () => {
    const seen: Record<Look, any> = { clasico: null, nuevo: null };
    for (const look of ['clasico', 'nuevo'] as Look[]) {
      await draw(assignmentsScenario(), look);
      const { children, onLogout, user, ...rest } = fakes.props.MainLayout;
      void children;
      seen[look] = { ...rest, onLogout: typeof onLogout, user: user?.id };
    }
    expect(seen.clasico.breadcrumbs).toEqual([]);
    expect(seen.nuevo.breadcrumbs).toEqual([{ label: 'Consultorías' }, { label: 'Asignación de Consultores' }]);
    expect({ ...seen.nuevo, breadcrumbs: [] }).toEqual(seen.clasico);
  });
});

describe('the same rows for each filter and search', () => {
  const consultants = () =>
    Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  const steps: [string, () => void][] = [
    ['arrival («Solo activas»)', () => {}],
    ['«Todas las asignaciones»', () => fireEvent.change(document.querySelectorAll('select')[1], { target: { value: 'all' } })],
    ['«Solo inactivas»', () => fireEvent.change(document.querySelectorAll('select')[1], { target: { value: 'inactive' } })],
    ['type «Mentoría»', () => fireEvent.change(document.querySelectorAll('select')[0], { target: { value: 'mentoring' } })],
    ['search «rosa»', () => fireEvent.change(screen.getAllByPlaceholderText('Buscar por nombre o email...')[0], { target: { value: 'rosa' } })],
    ['search «zzz»', () => fireEvent.change(screen.getAllByPlaceholderText('Buscar por nombre o email...')[0], { target: { value: 'zzz' } })],
  ];
  for (const [name, step] of steps) {
    it(name, async () => {
      const seen: Record<Look, number[]> = { clasico: [], nuevo: [] };
      const firsts: Record<Look, string[]> = { clasico: [], nuevo: [] };
      for (const look of ['clasico', 'nuevo'] as Look[]) {
        await draw(assignmentsScenario(), look);
        step();
        await settle();
        seen[look] = [document.querySelectorAll('tbody tr').length];
        firsts[look] = consultants().map((c) => c.replace(/^Consultor/, ''));
      }
      expect(seen.nuevo).toEqual(seen.clasico);
      expect(firsts.nuevo).toEqual(firsts.clasico);
    });
  }
});
