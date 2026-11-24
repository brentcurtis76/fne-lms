// @vitest-environment jsdom
/**
 * Redesign 6S, release SB: «Mis Sesiones» asks the same things and moves the browser the same way in
 * both looks. Each case draws the page in today's look and in the new look on the same invented data,
 * does the same thing through each view's own controls, and compares what reached the server or moved
 * the browser (`requests()`: `auth.*`, the role helper, every `fetch`, the ledger read, every router
 * move, every toast). It also checks that each tab of the new look holds the same sessions as the
 * matching column of today's look.
 */
import React from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch, requests, authFor } from '../../../helpers/sessionsFakes';
import type { Scenario } from '../../../helpers/sessionsFakes';
import { NOW, ROWS, listScenario, sessionsAddress } from '../../../helpers/sessionsListFixtures';

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
  const f = await import('../../../helpers/sessionsFakes');
  return { useSupabaseClient: () => f.client };
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
vi.mock('@/components/tutorials/HelpButton', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('HelpButton') }));

import ConsultorSessionsPage from '@/pages/consultor/sessions/index';

type Look = 'clasico' | 'nuevo';
const copy = (s: Scenario): Scenario => JSON.parse(JSON.stringify(s));

async function draw(scenario: Scenario, look: Look) {
  cleanup();
  resetFakes(copy(scenario));
  fakes.look = look;
  render(<ConsultorSessionsPage />);
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
const titles = (root: ParentNode) =>
  Array.from(root.querySelectorAll('[aria-label^="Ver detalles de "]')).map((a) => a.getAttribute('aria-label')!.slice('Ver detalles de '.length)).sort();

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

function withAnswers(extra: Record<string, unknown>) {
  const s = listScenario();
  for (const [key, sessions] of Object.entries(extra)) {
    s.fetch![key] = { body: { data: { sessions, total: (sessions as unknown[]).length } } };
  }
  return s;
}

describe('arriving: the same calls and redirects', () => {
  const cases: [string, Scenario][] = [
    ['a consultor', listScenario()],
    ['the admin', listScenario({ role: 'admin' })],
    ['a docente (→ /dashboard)', listScenario({ role: 'docente' })],
    ['a community leader (→ /dashboard)', listScenario({ role: 'lider_comunidad' })],
    ['nobody signed in (→ /login)', listScenario({ session: null })],
    ['the sessions read failing (the toast)', { ...listScenario(), fetch: { [sessionsAddress()]: { status: 500, body: {} } } }],
    ['opened with filters in the address', (() => {
      const s = listScenario({ query: { status: 'programada', school_id: '1' } });
      s.fetch![sessionsAddress({ school_id: '1', status: 'programada' })] = { body: { data: { sessions: ROWS, total: 8 } } };
      return s;
    })()],
  ];
  for (const [name, scenario] of cases) {
    it(name, async () => {
      const out = await both(scenario);
      expect(out.nuevo).toEqual(out.clasico);
      expect(out.clasico.length).toBeGreaterThan(0);
    });
  }
});

describe('doing things: the same requests', () => {
  it('each filter, then «Limpiar filtros»', async () => {
    const scenario = withAnswers({
      [sessionsAddress({ school_id: '1' })]: ROWS.slice(0, 2),
      [sessionsAddress({ school_id: '1', status: 'programada' })]: ROWS.slice(0, 1),
      [sessionsAddress({ school_id: '1', status: 'programada', date_from: '2026-11-01' })]: [],
      [sessionsAddress({ school_id: '1', status: 'programada', date_from: '2026-11-01', date_to: '2026-11-30' })]: [],
    });
    const out = await both(scenario, async () => {
      const selects = document.querySelectorAll('select');
      const dates = document.querySelectorAll('input[type="date"]');
      fireEvent.change(selects[0], { target: { value: '1' } });
      await settle();
      fireEvent.change(document.querySelectorAll('select')[1], { target: { value: 'programada' } });
      await settle();
      fireEvent.change(dates[0], { target: { value: '2026-11-01' } });
      await settle();
      fireEvent.change(document.querySelectorAll('input[type="date"]')[1], { target: { value: '2026-11-30' } });
      await settle();
      fireEvent.click(screen.getByText('Limpiar filtros'));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.filter((e: any) => e && typeof e === 'object' && 'router.replace' in e).length).toBeGreaterThan(3);
  });

  it('«Cargar más»', async () => {
    const scenario = listScenario({}, ROWS, 10);
    scenario.fetch![sessionsAddress({}, 2)] = { body: { data: { sessions: [{ ...ROWS[0], id: 's-mas', title: 'Una más' }], total: 10 } } };
    const out = await both(scenario, async () => {
      fireEvent.click(screen.getByText('Cargar más'));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.some((e: any) => e.fetch === '/api/sessions?page=2&limit=20')).toBe(true);
  });

  it('opening a session from its row', async () => {
    const out = await both(listScenario(), async () => {
      fireEvent.click(document.querySelector('[aria-label="Ver detalles de Pasada antigua"]') as Element);
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual({ 'router.push': ['/consultor/sessions/s-pasada-2'] });
  });

  it('signing out from the frame', async () => {
    const out = await both(listScenario(), async () => {
      await fakes.props.MainLayout.onLogout();
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
  });

  it('the export address is the same for the same filters', async () => {
    const scenario = listScenario({ query: { status: 'programada', date_from: '2026-11-01' } });
    scenario.fetch![sessionsAddress({ status: 'programada', date_from: '2026-11-01' })] = { body: { data: { sessions: ROWS, total: 8 } } };
    const hrefs: string[] = [];
    for (const look of ['clasico', 'nuevo'] as Look[]) {
      await draw(scenario, look);
      hrefs.push(screen.getByText('Exportar Calendario').closest('a')!.getAttribute('href')!);
    }
    expect(hrefs[1]).toBe(hrefs[0]);
  });
});

describe('the same sessions per tab as per column', () => {
  for (const role of ['consultor', 'admin']) {
    it(role, async () => {
      await draw(listScenario({ role }), 'clasico');
      const columns = Array.from(document.querySelectorAll('h2')).map((h) => h.parentElement as HTMLElement);
      const mine = titles(columns.find((c) => c.querySelector('h2')!.textContent === 'Mis Sesiones')!);
      const others = titles(columns.find((c) => c.querySelector('h2')!.textContent === 'Otras Sesiones en Mis Colegios')!);

      await draw(listScenario({ role }), 'nuevo');
      expect(titles(screen.getByRole('tabpanel'))).toEqual(mine);
      fireEvent.click(screen.getAllByRole('tab')[1]);
      await settle();
      expect(titles(screen.getByRole('tabpanel'))).toEqual(others);
      expect(mine.length + others.length).toBe(ROWS.length);
    });
  }

  it('an admin who facilitates nothing: «Mis Sesiones» empty, «Otras…» every session (opened first, B6)', async () => {
    await draw(listScenario({ role: 'admin', session: authFor('admin-inventado') }), 'nuevo');
    expect(titles(screen.getByRole('tabpanel'))).toHaveLength(ROWS.length);
    fireEvent.click(screen.getAllByRole('tab')[0]);
    await settle();
    expect(screen.getByText('No está asignado como facilitador en ninguna sesión')).toBeTruthy();
  });
});
