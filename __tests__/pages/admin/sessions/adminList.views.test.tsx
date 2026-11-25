// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: the two views of «Sesiones de Consultoría». The new look: the frame's
 * breadcrumb, a `PageHeader`, the three numbers, the views, the filters, the kit's table with today's
 * heads and words, the ledger marks, the row menu by status (Escape and a click outside close it),
 * «Mes» and «Semana» with today's words, and the cancel pop-up as the kit's `Dialog` (Escape, X and
 * «Cerrar» close it and empty the box; the focus goes back to the row's «⋮»; nothing sent). Today's
 * look: today's words, no breadcrumb, and today's pop-up as it is. Every person, school and session
 * here is invented.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeFetch, requests, resetFakes, settle } from '../../../helpers/sessionsFakes';
import { LIST_NOW, listAddress, listScenarioAdmin, rowsAnswer } from '../../../helpers/adminSessionsFakes';
import type { AdminScenario } from '../../../helpers/adminSessionsFakes';

const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'UTC';
  return before;
});

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

import AdminSessionsPage from '@/pages/admin/sessions/index';

async function draw(look: 'clasico' | 'nuevo', scenario: AdminScenario = listScenarioAdmin()) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = look;
  render(<AdminSessionsPage />);
  await settle();
}
const rowOf = (title: string) => screen.getByText(title).closest('tr') as HTMLElement;
const menuOf = (title: string) => rowOf(title).querySelector('td:last-child button') as HTMLElement;
const menuWords = (title: string) =>
  Array.from(rowOf(title).querySelectorAll('td:last-child div button')).map((b) => b.textContent!.trim());
const writes = () => requests().filter((e: any) => typeof e?.fetch === 'string' && e.method !== 'GET');
const viewButton = (name: string) => screen.getAllByText(name).map((n) => n.closest('button')!).find(Boolean)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(LIST_NOW);
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('the new look', () => {
  it('the frame, the header, the three numbers in today’s order', async () => {
    await draw('nuevo');
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Consultorías' }, { label: 'Sesiones' }]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sesiones de Consultoría');
    expect(screen.getByText('Gestión de sesiones con consultores externos e internos')).toBeTruthy();
    const numbers = ['Total Sesiones', 'Programadas', 'Pendientes'].map((label) => screen.getByText(label).nextElementSibling!.textContent);
    expect(numbers).toEqual(['21', '7', '1']);
  });

  it('the views (pressed), «Nueva Sesión», the filters; the dates only in «Lista»', async () => {
    await draw('nuevo');
    expect(['Lista', 'Mes', 'Semana'].map((v) => viewButton(v).getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(viewButton('Nueva Sesión')).toBeTruthy();
    const selects = Array.from(document.querySelectorAll('select'));
    expect(selects.map((s) => s.options[0].text)).toEqual(['Todos los colegios', 'Todas las comunidades', 'Todos los consultores', 'Todos los estados']);
    expect(Array.from(selects[3].options).map((o) => o.text)).toEqual([
      'Todos los estados', 'Borrador', 'Pendiente Aprobación', 'Programada', 'En Progreso', 'Pendiente Informe', 'Completada', 'Cancelada',
    ]);
    expect(Array.from(selects[2].options).map((o) => o.text)).toEqual(['Todos los consultores', 'Ana Inventada', 'Berta Ficticia']);
    expect((screen.getByLabelText('Desde') as HTMLInputElement).type).toBe('date');
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).type).toBe('date');
    fireEvent.click(viewButton('Mes'));
    await settle();
    expect(screen.queryByLabelText('Desde')).toBeNull();
    expect(viewButton('Mes').getAttribute('aria-pressed')).toBe('true');
  });

  it('«Lista»: today’s heads, the rows’ words, the ledger marks, the series', async () => {
    await draw('nuevo');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Fecha', 'Hora', 'Título', 'Colegio', 'Comunidad', 'Consultor(es)', 'Estado', 'Serie', 'Acciones',
    ]);
    const serie = rowOf('Serie inventada');
    expect(within(serie).getByText('20 nov')).toBeTruthy();
    expect(within(serie).getByText('(Chile)').parentElement!.textContent).toContain('09:00 - 10:30(Chile)');
    expect(within(serie).getByText('Ana Inventada, Berta Ficticia')).toBeTruthy();
    expect(within(serie).getByText('1/2')).toBeTruthy();
    expect(within(serie).getByText('Programada')).toBeTruthy();
    expect(within(rowOf('Borrador inventado')).getAllByText('-').length).toBeGreaterThanOrEqual(1);
    expect(within(rowOf('Pendiente inventada')).getAllByText('-')).toHaveLength(2);
    const penalizada = rowOf('Penalizada inventada');
    expect(within(penalizada).getByText('Cancelada')).toBeTruthy();
    expect(within(penalizada).getByText('Penalizada')).toBeTruthy();
    expect(within(penalizada).getByText('Admin')).toBeTruthy();
    expect(within(rowOf('Devuelta inventada')).getByText('Devuelta')).toBeTruthy();
    expect(within(rowOf('Devuelta inventada')).queryByText('Admin')).toBeNull();
    expect(screen.getByText('Exportar Calendario').closest('a')!.getAttribute('href')).toBe('/api/sessions/ical?');
  });

  it('the row menu by status; Escape and a click outside close it', async () => {
    await draw('nuevo');
    fireEvent.click(menuOf('Borrador inventado'));
    await settle();
    expect(menuWords('Borrador inventado')).toEqual(['Ver detalle', 'Aprobar', 'Cancelar']);
    expect(menuOf('Borrador inventado').getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(menuWords('Borrador inventado')).toEqual([]);
    fireEvent.click(menuOf('Serie inventada'));
    await settle();
    expect(menuWords('Serie inventada')).toEqual(['Ver detalle', 'Cancelar']);
    await act(async () => {
      document.body.click();
    });
    expect(menuWords('Serie inventada')).toEqual([]);
    fireEvent.click(menuOf('Completada inventada'));
    await settle();
    expect(menuWords('Completada inventada')).toEqual(['Ver detalle']);
    fireEvent.click(menuOf('Completada inventada'));
    await settle();
    fireEvent.click(menuOf('Devuelta inventada'));
    await settle();
    expect(menuWords('Devuelta inventada')).toEqual(['Ver detalle']);
    expect(writes()).toEqual([]);
  });

  it('the cancel pop-up: today’s words; Escape, X and «Cerrar» close it and empty the box; the focus goes back to «⋮»; nothing sent', async () => {
    await draw('nuevo');
    const open = async () => {
      fireEvent.click(menuOf('Serie inventada'));
      await settle();
      fireEvent.click(within(rowOf('Serie inventada')).getByText('Cancelar'));
      await settle();
      return screen.getByRole('dialog');
    };
    let dialog = await open();
    expect(within(dialog).getByRole('heading').textContent).toBe('Cancelar Sesión');
    expect(within(dialog).getByText('Por favor, ingrese la razón de la cancelación:')).toBeTruthy();
    const box = within(dialog).getByPlaceholderText('Razón de cancelación...');
    expect(document.activeElement).toBe(box);
    const yes = within(dialog).getByText('Confirmar Cancelación').closest('button')!;
    expect(yes.disabled).toBe(true);
    fireEvent.change(box, { target: { value: '  ' } });
    expect(yes.disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'Motivo inventado' } });
    expect(yes.disabled).toBe(false);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(menuOf('Serie inventada'));
    dialog = await open();
    expect((within(dialog).getByPlaceholderText('Razón de cancelación...') as HTMLTextAreaElement).value).toBe('');
    fireEvent.change(within(dialog).getByPlaceholderText('Razón de cancelación...'), { target: { value: 'Otro motivo' } });
    fireEvent.click(within(dialog).getByLabelText('Cerrar', { selector: 'button[aria-label]' }));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(menuOf('Serie inventada'));
    dialog = await open();
    expect((within(dialog).getByPlaceholderText('Razón de cancelación...') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(within(dialog).getByText('Cerrar'));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(menuOf('Serie inventada'));
    expect(writes()).toEqual([]);
  });

  it('nothing found: «No se encontraron sesiones», no export', async () => {
    const s = listScenarioAdmin();
    s.fetch![listAddress()] = rowsAnswer([]);
    await draw('nuevo', s);
    expect(screen.getByText('No se encontraron sesiones')).toBeTruthy();
    expect(screen.queryByText('Exportar Calendario')).toBeNull();
  });

  it('«Mes»: the month, the days, at most two a day and «+n más»; the phone’s agenda; empty month', async () => {
    await draw('nuevo');
    fireEvent.click(viewButton('Mes'));
    await settle();
    expect(screen.getByText('noviembre 2026')).toBeTruthy();
    for (const day of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) expect(screen.getByText(day)).toBeTruthy();
    expect(screen.getAllByText('+1 más')).toHaveLength(1);
    expect(screen.getByLabelText('Mes anterior')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Mes siguiente'));
    await settle();
    expect(screen.getByText('diciembre 2026')).toBeTruthy();
    expect(screen.getByText('No hay sesiones este mes')).toBeTruthy();
  });

  it('«Semana»: the week’s heading, one heading a day, both empty sentences', async () => {
    await draw('nuevo');
    fireEvent.click(viewButton('Semana'));
    await settle();
    expect(screen.getByText('16 nov - 22 nov 2026')).toBeTruthy();
    expect(screen.getAllByText('lunes, 16 noviembre')).toHaveLength(2);
    expect(screen.getAllByText('No hay sesiones programadas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No hay sesiones').length).toBeGreaterThan(0);
  });
});

describe('today’s look', () => {
  it('today’s words and no breadcrumb', async () => {
    await draw('clasico');
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([]);
    expect(document.querySelector('[data-testid="admin-sessions-nuevo"]')).toBeNull();
    expect(screen.getAllByText('Sesiones de Consultoría').length).toBeGreaterThan(0);
    expect(screen.getByText('Total Sesiones')).toBeTruthy();
    expect(within(rowOf('Penalizada inventada')).getByText('Penalizada')).toBeTruthy();
  });

  it('today’s cancel pop-up as it is; «Cerrar» closes it', async () => {
    await draw('clasico');
    fireEvent.click(menuOf('Serie inventada'));
    await settle();
    fireEvent.click(within(rowOf('Serie inventada')).getByText('Cancelar'));
    await settle();
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Cerrar'));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
