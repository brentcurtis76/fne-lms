// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Reportes de Sesiones» asks the same things and moves the browser the same
 * way in both looks. Each case draws the page in today's look and in the new look on the same invented
 * data, does the same thing through each view's own controls, and compares what reached the server or
 * moved the browser (`auth.*`, the role helper, every `fetch` with its headers, every router move, every
 * toast). Also: the export gets the same data and headers, and a look that arrives late sends nothing.
 */
import React from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch, requests } from '../../../helpers/sessionsFakes';
import type { Scenario } from '../../../helpers/sessionsFakes';
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
    // 'throw': the role helper fails (the page's «Acceso Denegado»).
    getUserPrimaryRole: (id: string) => {
      if (f.fakes.scenario?.role === 'throw') {
        f.log({ getUserPrimaryRole: id });
        return Promise.reject(new Error('inventado'));
      }
      return f.roleOf(id);
    },
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

type Look = 'clasico' | 'nuevo';
const copy = (s: Scenario): Scenario => JSON.parse(JSON.stringify(s));

async function draw(scenario: Scenario, look: Look) {
  cleanup();
  resetFakes(copy(scenario));
  fakes.look = look;
  render(<SessionReportsPage />);
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
const byId = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
const rowOf = (title: string) => screen.getByText(title).closest('tr') as HTMLElement;

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

describe('arriving: the same calls and redirects', () => {
  const cases: [string, Scenario][] = [
    ['a consultor', reportsScenario()],
    ['the admin', reportsScenario({ role: 'admin' })],
    ['a docente (→ /dashboard)', reportsScenario({ role: 'docente' })],
    ['no role (→ /dashboard)', reportsScenario({ role: undefined })],
    ['nobody signed in (→ /login)', reportsScenario({ session: null })],
    ['the analytics refused with a message (its toast)', reportsScenario({ fetch: { [analyticsAddress()]: { status: 403, body: { error: 'Mensaje inventado' } } } })],
    ['the analytics refused without a message («Error cargando datos»)', reportsScenario({ fetch: { [analyticsAddress()]: { status: 500, body: {} } } })],
    ['an empty period', reportsScenario({}, { kpis: { total_sessions: 0 }, status_distribution: [], modality_distribution: [], sessions_by_month: [], sessions_by_school: [], attendance_trends: [], recent_sessions: [] })],
  ];
  for (const [name, scenario] of cases) {
    it(name, async () => {
      const out = await both(scenario);
      expect(out.nuevo).toEqual(out.clasico);
      expect(out.clasico.length).toBeGreaterThan(0);
    });
  }

  it('the role helper failing: «Acceso Denegado», «Volver al Dashboard» goes to /dashboard', async () => {
    const out = await both(reportsScenario({ role: 'throw' }), async () => {
      expect(screen.getByText('Acceso Denegado')).toBeTruthy();
      expect(screen.getByText('Error al cargar los datos del usuario')).toBeTruthy();
      fireEvent.click(screen.getByText('Volver al Dashboard'));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual({ 'router.push': ['/dashboard'] });
    expect(out.clasico.some((e: any) => e && e.fetch)).toBe(false);
  });

  it('the router not ready: nothing asked in either look', async () => {
    const seen: Record<Look, unknown[]> = { clasico: [], nuevo: [] };
    for (const look of ['clasico', 'nuevo'] as Look[]) {
      cleanup();
      resetFakes(copy(reportsScenario()));
      fakes.router.isReady = false;
      fakes.look = look;
      render(<SessionReportsPage />);
      await settle();
      seen[look] = requests();
    }
    expect(seen.nuevo).toEqual([]);
    expect(seen.clasico).toEqual([]);
  });
});

describe('doing things: the same requests', () => {
  it('each filter (consultor): dates and school', async () => {
    const out = await both(reportsScenario(), async () => {
      fireEvent.change(byId('school-filter'), { target: { value: '7' } });
      await settle();
      fireEvent.change(byId('school-filter'), { target: { value: '' } });
      await settle();
      fireEvent.change(byId('date-from'), { target: { value: '2020-01-01' } });
      await settle();
      fireEvent.change(byId('date-to'), { target: { value: '2020-01-31' } });
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.filter((e: any) => e && e.fetch).length).toBe(5);
    expect(screen.getByText('No hay sesiones en el período seleccionado')).toBeTruthy();
  });

  it('the admin’s consultant filter (sent only for the admin)', async () => {
    const out = await both(reportsScenario({ role: 'admin' }), async () => {
      fireEvent.change(byId('school-filter'), { target: { value: '7' } });
      await settle();
      fireEvent.change(byId('consultant-filter'), { target: { value: 'con-a' } });
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.some((e: any) => e && typeof e.fetch === 'string' && e.fetch.includes('consultant_id=con-a'))).toBe(true);
  });

  it('a recent session opens by click, Enter and Space', async () => {
    const out = await both(reportsScenario(), async () => {
      fireEvent.click(rowOf('Taller inventado de convivencia'));
      fireEvent.keyDown(rowOf('Observación ficticia de aula'), { key: 'Enter' });
      fireEvent.keyDown(rowOf('Observación ficticia de aula'), { key: ' ' });
      fireEvent.keyDown(rowOf('Observación ficticia de aula'), { key: 'a' });
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.filter((e: any) => e && e['router.push'])).toEqual([
      { 'router.push': ['/consultor/sessions/ses-a'] },
      { 'router.push': ['/consultor/sessions/ses-b'] },
      { 'router.push': ['/consultor/sessions/ses-b'] },
    ]);
  });

  it('the export gets the same data and headers', async () => {
    const seen: unknown[] = [];
    for (const look of ['clasico', 'nuevo'] as Look[]) {
      await draw(reportsScenario(), look);
      seen.push(fakes.props.ExportDropdown);
    }
    expect(seen[1]).toEqual(seen[0]);
    expect((seen[0] as any).headers).toEqual(['Fecha', 'Título', 'Escuela', 'Comunidad', 'Estado', 'Asistencia']);
  });

  it('the help button gets the same section', async () => {
    const seen: unknown[] = [];
    for (const look of ['clasico', 'nuevo'] as Look[]) {
      await draw(reportsScenario(), look);
      seen.push(fakes.props.HelpButton);
    }
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[0]).toEqual({ sectionId: 'mis-reportes' });
  });

  it('a look that arrives after the data swaps the view and sends nothing more', async () => {
    cleanup();
    resetFakes(copy(reportsScenario()));
    fakes.look = 'clasico';
    const { rerender } = render(<SessionReportsPage />);
    await settle();
    const before = requests().length;
    expect(screen.queryByTestId('reports-nuevo')).toBe(null);
    fakes.look = 'nuevo';
    rerender(<SessionReportsPage />);
    await settle();
    expect(screen.getByTestId('reports-nuevo')).toBeTruthy();
    expect(requests().length).toBe(before);
  });
});
