// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Reportes de Sesiones» with the switch OFF (today's look, also while the look
 * is unknown) is today's screen: the frame with no props, today's plain heading with the help button
 * beside it, today's words and today's chart colours (the lines the colour pins read). Invented data only.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch } from '../../../helpers/sessionsFakes';
import { seriesOf } from '../../../helpers/scTwoFakes';
import { NOW, reportsScenario } from './reports.fixtures';

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
  return { getUserPrimaryRole: (id: string) => f.roleOf(id) };
});
vi.mock('react-hot-toast', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { toast: f.toast };
});
vi.mock('next/dynamic', async () => ({ default: (await import('../../../helpers/scTwoFakes')).fakeDynamic }));
vi.mock('@/components/layout/MainLayout', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('MainLayout', true) }));
vi.mock('@/components/tutorials/HelpButton', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('HelpButton') }));
vi.mock('@/components/reports/ExportDropdown', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('ExportDropdown') }));

// The real look context, with no provider: the look is unknown, so it is today's.
import SessionReportsPage from '@/pages/consultor/sessions/reports';

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

describe('«Reportes de Sesiones», today’s look', () => {
  it('the frame with no props, today’s heading, no new view', async () => {
    resetFakes(JSON.parse(JSON.stringify(reportsScenario({ role: 'admin' }))));
    render(<SessionReportsPage />);
    await settle();
    const { children, ...rest } = fakes.props.MainLayout;
    void children;
    expect(rest).toEqual({});
    expect(screen.queryByTestId('reports-nuevo')).toBe(null);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Reportes de Sesiones');
    expect(h1.className).toBe('text-2xl font-bold text-gray-900');
    expect(h1.nextElementSibling?.getAttribute('data-marker')).toBe('HelpButton');
    expect(Array.from(document.querySelectorAll('h3')).map((h) => h.textContent)).toEqual([
      'Filtros', 'Sesiones por Mes', 'Distribución por Estado', 'Distribución por Modalidad', 'Tendencia de Asistencia',
      'Sesiones por Escuela', 'Top Consultores', 'Sesiones Recientes',
    ]);
  });

  it('today’s chart colours', async () => {
    resetFakes(JSON.parse(JSON.stringify(reportsScenario({ role: 'admin' }))));
    render(<SessionReportsPage />);
    await settle();
    expect(seriesOf('Sesiones por Mes')).toEqual([
      ['Completadas', 'rgb(var(--color-legacy-10b981))'],
      ['Canceladas', 'rgb(var(--color-red-500))'],
      ['Otras', 'rgb(var(--color-gray-400))'],
    ]);
    expect(seriesOf('Top Consultores')).toEqual([['Sesiones dirigidas', '#fbbf24']]);
  });
});
