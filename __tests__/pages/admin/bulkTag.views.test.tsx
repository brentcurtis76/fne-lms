// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: the two views of «Clasificar Sesiones». The new look: the frame's
 * breadcrumb, a `PageHeader`, the info banner as a `Notice`, labelled filters, the kit's table with
 * today's heads and words, the selection bar with today's rules. Today's look: today's words and no
 * breadcrumb. Every person and session here is invented.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeFetch, resetFakes, settle } from '../../helpers/sessionsFakes';
import { bulkAddress, bulkScenario } from '../../helpers/adminSessionsFakes';
import type { AdminScenario } from '../../helpers/adminSessionsFakes';

vi.mock('next/router', async () => {
  const f = await import('../../helpers/sessionsFakes');
  return { useRouter: () => f.fakes.router };
});
vi.mock('@supabase/auth-helpers-react', async () => {
  const a = await import('../../helpers/adminSessionsFakes');
  return { useSupabaseClient: () => a.adminClient };
});
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

import BulkTagSessionsPage from '@/pages/admin/bulk-tag-sessions';

async function draw(look: 'clasico' | 'nuevo', scenario: AdminScenario = bulkScenario()) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = look;
  render(<BulkTagSessionsPage />);
  await settle();
}
const emptyScenario = () => {
  const s = bulkScenario();
  s.fetch![bulkAddress()] = { body: { data: { sessions: [], total: 0 } } };
  return s;
};

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
  it('the frame, the header and the notice', async () => {
    await draw('nuevo');
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Consultorías' }, { label: 'Clasificar Sesiones' }]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Clasificar Sesiones');
    expect(screen.getByText('Asignar tipo de hora a sesiones históricas sin clasificar')).toBeTruthy();
    const notice = screen.getByRole('status');
    expect(notice.textContent).toBe(
      'Las sesiones clasificadas aquí aparecerán en reportes pero NO afectarán los saldos de horas del contrato.'
    );
    expect(within(notice).getByText('NO').tagName).toBe('STRONG');
  });

  it('labelled filters, the count, the table heads and rows', async () => {
    await draw('nuevo');
    expect((screen.getByLabelText('Fecha desde') as HTMLInputElement).type).toBe('date');
    expect((screen.getByLabelText('Fecha hasta') as HTMLInputElement).type).toBe('date');
    const school = screen.getByLabelText('Colegio') as HTMLSelectElement;
    expect(Array.from(school.options).map((o) => o.text)).toEqual(['Todos los colegios', 'Colegio Inventado Norte', 'Colegio Ficticio Sur']);
    expect(screen.getByText('2 sesión(es) sin clasificar')).toBeTruthy();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['', 'Fecha', 'Título', 'Colegio', 'Consultor', 'Estado']);
    expect(screen.getByLabelText('Seleccionar todas las sesiones')).toBeTruthy();
    expect(screen.getByText('Ana Inventada')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Completada')).toBeTruthy();
    expect(screen.getByText('Programada')).toBeTruthy();
    expect(screen.queryByText(/Página \d+ de/)).toBeNull();
  });

  it('ticking a row: highlighted, the bar, the types without online learning, the button waits for a type', async () => {
    await draw('nuevo');
    fireEvent.click(screen.getByLabelText('Seleccionar sesión Sesión inventada sin tipo uno'));
    await settle();
    expect(screen.getByText('Sesión inventada sin tipo uno').closest('tr')!.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('1 sesión(es) seleccionada(s)')).toBeTruthy();
    const type = screen.getByLabelText('Tipo de hora para clasificación') as HTMLSelectElement;
    expect(Array.from(type.options).map((o) => o.text)).toEqual(['Seleccione tipo de hora', 'Asesoría técnica inventada', 'Taller inventado']);
    const classify = screen.getByText('Clasificar Seleccionadas').closest('button')!;
    expect(classify.disabled).toBe(true);
    fireEvent.change(type, { target: { value: 'taller' } });
    expect(classify.disabled).toBe(false);
    fireEvent.click(screen.getByText('Deseleccionar'));
    await settle();
    expect(screen.queryByText('1 sesión(es) seleccionada(s)')).toBeNull();
  });

  it('pagination above 50 rows, with today’s words', async () => {
    await draw('nuevo', bulkScenario({}, 120));
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();
    expect((screen.getByLabelText('Página anterior') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Página siguiente') as HTMLButtonElement).disabled).toBe(false);
  });

  it('the empty sentence', async () => {
    await draw('nuevo', emptyScenario());
    expect(screen.getByText('No hay sesiones sin clasificar con los filtros actuales')).toBeTruthy();
    expect((screen.getByLabelText('Seleccionar todas las sesiones') as HTMLInputElement).checked).toBe(false);
  });
});

describe('today’s look', () => {
  it('today’s words and no breadcrumb', async () => {
    await draw('clasico');
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([]);
    expect(document.querySelector('[data-testid="bulk-tag-nuevo"]')).toBeNull();
    expect(screen.getAllByText('Clasificar Sesiones').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Asignar tipo de hora a sesiones históricas sin clasificar').length).toBeGreaterThan(0);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('2 sesión(es) sin clasificar')).toBeTruthy();
    expect(screen.getByText('Fecha desde')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Seleccionar sesión Sesión inventada sin tipo uno'));
    await settle();
    expect(screen.getByText('1 sesión(es) seleccionada(s)')).toBeTruthy();
    expect(screen.getByText('Sesión inventada sin tipo uno').closest('tr')!.className).toContain('bg-yellow-50');
  });
});
