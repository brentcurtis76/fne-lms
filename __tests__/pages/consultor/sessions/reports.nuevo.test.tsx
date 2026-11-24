// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Reportes de Sesiones» in the new look (scenarios sc.md, part G): the
 * breadcrumb by role, the kit's header with the help button, today's filters (the consultant filter for
 * the admin only), the seven numbers, the charts in today's order with the new look's series, the
 * admin-only charts, the recent sessions (rows reached by Tab, opened by click, Enter, Space), the empty
 * period, the loading placeholders and «Acceso Denegado». Invented data only.
 */
import React from 'react';
import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch, requests } from '../../../helpers/sessionsFakes';
import type { Scenario } from '../../../helpers/sessionsFakes';
import { seriesOf } from '../../../helpers/scTwoFakes';
import { NOW, analyticsAddress, reportsScenario } from './reports.fixtures';

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
  const f = await import('../../../helpers/scTwoFakes');
  return { useSupabaseClient: () => f.chainClient };
});
vi.mock('@/utils/roleUtils', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return {
    getUserPrimaryRole: (id: string) => (f.fakes.scenario?.role === 'throw' ? Promise.reject(new Error('inventado')) : f.roleOf(id)),
  };
});
vi.mock('react-hot-toast', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { toast: f.toast };
});
vi.mock('@/contexts/LookContext', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { useLook: () => ({ look: f.fakes.look, setLook: () => {} }) };
});
vi.mock('next/dynamic', async () => ({ default: (await import('../../../helpers/scTwoFakes')).fakeDynamic }));
vi.mock('@/components/layout/MainLayout', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('MainLayout', true) }));
vi.mock('@/components/tutorials/HelpButton', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('HelpButton') }));
vi.mock('@/components/reports/ExportDropdown', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('ExportDropdown') }));

import SessionReportsPage from '@/pages/consultor/sessions/reports';

async function draw(scenario: Scenario = reportsScenario()) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = 'nuevo';
  render(<SessionReportsPage />);
  await settle();
}
const headings = () => Array.from(document.querySelectorAll('h1, h2')).map((h) => h.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
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

describe('«Reportes de Sesiones», new look', () => {
  it('a consultor: the frame’s breadcrumb, the header, the help button, no consultant filter', async () => {
    await draw();
    expect(screen.getByTestId('reports-nuevo')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Mi Trabajo' }, { label: 'Mis Reportes' }]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reportes de Sesiones');
    expect(screen.getByText('Estadísticas y métricas de tus sesiones de consultoría')).toBeTruthy();
    expect(fakes.props.HelpButton).toEqual({ sectionId: 'mis-reportes' });
    expect(screen.getByLabelText('Desde')).toHaveProperty('value', '2026-08-22');
    expect(screen.getByLabelText('Hasta')).toHaveProperty('value', '2026-11-20');
    expect(Array.from((screen.getByLabelText('Escuela') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      'Todas', 'Colegio Inventado Norte', 'Escuela Ficticia Sur',
    ]);
    expect(screen.queryByLabelText('Consultor')).toBe(null);
  });

  it('the admin: breadcrumb, description, consultant filter, and the two admin charts', async () => {
    await draw(reportsScenario({ role: 'admin' }));
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Consultorías' }, { label: 'Reportes' }]);
    expect(screen.getByText('Estadísticas y métricas de todas las sesiones de consultoría')).toBeTruthy();
    expect(Array.from((screen.getByLabelText('Consultor') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      'Todos', 'Rosa Inventada', 'Pablo Supuesto',
    ]);
    expect(headings()).toEqual([
      'Reportes de Sesiones', 'Filtros', 'Sesiones por Mes', 'Distribución por Estado', 'Distribución por Modalidad',
      'Tendencia de Asistencia', 'Sesiones por Escuela', 'Top Consultores', 'Sesiones Recientes',
    ]);
  });

  it('a consultor sees the charts in today’s order without the two admin ones', async () => {
    await draw();
    expect(headings()).toEqual([
      'Reportes de Sesiones', 'Filtros', 'Sesiones por Mes', 'Distribución por Estado', 'Distribución por Modalidad',
      'Tendencia de Asistencia', 'Sesiones Recientes',
    ]);
  });

  it('the seven numbers, in today’s two rows', async () => {
    await draw();
    const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(value('Total Sesiones')).toBe('21');
    expect(value('Tasa de Completación')).toBe('33%');
    expect(value('Horas Programadas')).toBe('42h');
    expect(value('Asistencia Promedio')).toBe('81%');
    expect(value('Pendientes de Informe')).toBe('1');
    expect(value('Próximas Sesiones')).toBe('7');
    expect(value('Sesiones Canceladas')).toBe('3');
  });

  it('the charts take the new look’s series (black, intense yellow, mid grey) and keep today’s words', async () => {
    await draw(reportsScenario({ role: 'admin' }));
    expect(seriesOf('Sesiones por Mes')).toEqual([
      ['Completadas', '#0a0a0a'],
      ['Canceladas', '#f59e0b'],
      ['Otras', '#6b7280'],
    ]);
    expect(seriesOf('Distribución por Modalidad').map(([, fill]) => fill)).toEqual(['#0a0a0a', '#f59e0b', '#6b7280']);
    expect(seriesOf('Tendencia de Asistencia')[0][0]).toBe('Asistencia (%)');
    expect(seriesOf('Sesiones por Escuela')).toEqual([
      ['Total', '#0a0a0a'],
      ['Completadas', '#f59e0b'],
    ]);
    expect(seriesOf('Top Consultores')).toEqual([['Sesiones dirigidas', '#0a0a0a']]);
    // The state pie keeps the shared state colours.
    expect(seriesOf('Distribución por Estado')).toHaveLength(3);
  });

  it('«Sesiones Recientes»: export, heads, rows that are links by click, Enter, Space, and in the Tab order', async () => {
    await draw();
    expect(fakes.props.ExportDropdown.tabName).toBe('Sesiones Recientes');
    expect(fakes.props.ExportDropdown.data).toEqual([
      { Fecha: '2026-11-10', Título: 'Taller inventado de convivencia', Escuela: 'Colegio Inventado Norte', Comunidad: 'Comunidad Inventada A', Estado: 'Completada', Asistencia: '90%' },
      { Fecha: '2026-11-18', Título: 'Observación ficticia de aula', Escuela: 'Escuela Ficticia Sur', Comunidad: 'Comunidad Ficticia B', Estado: 'Programada', Asistencia: 'N/A' },
    ]);
    expect(Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Fecha', 'Título', 'Escuela', 'Comunidad', 'Estado', 'Asistencia']);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const row of links) expect(row.getAttribute('tabindex')).toBe('0');
    expect(within(links[0]).getByText('10 nov 2026')).toBeTruthy();
    expect(within(links[1]).getByText('-')).toBeTruthy();
    fireEvent.click(links[0]);
    fireEvent.keyDown(links[1], { key: 'Enter' });
    fireEvent.keyDown(links[1], { key: ' ' });
    expect(requests().filter((e: any) => e && e['router.push'])).toEqual([
      { 'router.push': ['/consultor/sessions/ses-a'] },
      { 'router.push': ['/consultor/sessions/ses-b'] },
      { 'router.push': ['/consultor/sessions/ses-b'] },
    ]);
  });

  it('an empty period: the two sentences, header and filters kept', async () => {
    await draw();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2020-01-01' } });
    await settle();
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2020-01-31' } });
    await settle();
    expect(screen.getByText('No hay sesiones en el período seleccionado')).toBeTruthy();
    expect(
      screen.getByText('No hay sesiones que coincidan con los filtros seleccionados. Intenta ajustar los filtros para ver más resultados.')
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reportes de Sesiones');
    expect(screen.getByLabelText('Desde')).toHaveProperty('value', '2020-01-01');
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Mi Trabajo' }, { label: 'Mis Reportes' }]);
  });

  it('while the data loads: header and filters, and today’s grey placeholders', async () => {
    await draw(reportsScenario({ fetch: { [analyticsAddress()]: 'pending' } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reportes de Sesiones');
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Total Sesiones')).toBe(null);
  });

  it('the role helper failing: «Acceso Denegado», its message and «Volver al Dashboard»', async () => {
    await draw(reportsScenario({ role: 'throw' }));
    expect(screen.getByTestId('reports-nuevo-error')).toBeTruthy();
    expect(screen.getByText('Acceso Denegado')).toBeTruthy();
    expect(screen.getByText('Error al cargar los datos del usuario')).toBeTruthy();
    fireEvent.click(screen.getByText('Volver al Dashboard'));
    expect(requests()).toContainEqual({ 'router.push': ['/dashboard'] });
  });

  it('the analytics failing: the same toasts as today', async () => {
    await draw(reportsScenario({ fetch: { [analyticsAddress()]: { status: 500, body: {} } } }));
    expect(requests()).toContainEqual({ 'toast.error': ['Error cargando datos'] });
    cleanup();
    resetFakes(JSON.parse(JSON.stringify(reportsScenario())));
    fakes.look = 'nuevo';
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('red inventada'))));
    render(<SessionReportsPage />);
    await settle();
    expect(requests()).toContainEqual({ 'toast.error': ['Error al cargar datos de reportes'] });
  });
});
