// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Sesiones de Consultoría» (`/admin/sessions`) asks the same things and
 * moves the browser the same way in both looks. Each case draws the page in today's look and in the
 * new look on the same invented data, does the same thing through each view's own controls, and
 * compares what reached the server or moved the browser (`auth.*`, the role helper, the schools and
 * communities reads, every `fetch` with its method, headers and body, every router move including the
 * address-bar filters, every toast). The ledger read of the cancelled rows is compared as a set of
 * requests, the same way in both looks. Every person, school and session here is invented.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeFetch, requests, resetFakes, settle } from '../../../helpers/sessionsFakes';
import { LIST_NOW, LIST_ROWS, ledgerReads, listAddress, listScenarioAdmin, rowsAnswer, withoutLedger } from '../../../helpers/adminSessionsFakes';
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

type Look = 'clasico' | 'nuevo';

async function draw(scenario: AdminScenario, look: Look) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = look;
  render(<AdminSessionsPage />);
  await settle();
}
async function both(scenario: AdminScenario, steps: () => Promise<void> = async () => {}) {
  const out: Record<Look, { log: unknown[]; ledger: string[] }> = { clasico: { log: [], ledger: [] }, nuevo: { log: [], ledger: [] } };
  for (const look of ['clasico', 'nuevo'] as Look[]) {
    await draw(scenario, look);
    await steps();
    out[look] = { log: withoutLedger(requests()), ledger: ledgerReads(requests()) };
  }
  return out;
}
const same = (out: Awaited<ReturnType<typeof both>>) => {
  expect(out.nuevo.log).toEqual(out.clasico.log);
  expect(out.nuevo.ledger).toEqual(out.clasico.ledger);
};
const viewButton = (name: string) => screen.getAllByText(name).map((n) => n.closest('button')!).find(Boolean)!;
const rowOf = (title: string) => screen.getByText(title).closest('tr') as HTMLElement;
const menuOf = (title: string) => rowOf(title).querySelector('td:last-child button') as HTMLElement;
/** The month's or week's arrows: the two buttons beside its heading. */
const arrows = (heading: string) => Array.from(screen.getByText(heading).parentElement!.querySelectorAll('button'));

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

describe('arriving: the same calls and redirects', () => {
  const cases: [string, AdminScenario][] = [
    ['the admin', listScenarioAdmin()],
    ['a consultor (→ /dashboard)', listScenarioAdmin({ role: 'consultor' })],
    ['nobody signed in (→ /login)', listScenarioAdmin({ session: null })],
    ['the sessions read failing (the toast)', (() => {
      const s = listScenarioAdmin();
      s.fetch![listAddress()] = { status: 500, body: {} };
      return s;
    })()],
    ['opened with filters in the address', (() => {
      const s = listScenarioAdmin({ query: { status: 'programada', school_id: '1' } });
      s.fetch![listAddress({ school_id: '1', status: 'programada' })] = rowsAnswer(LIST_ROWS.slice(2, 4));
      return s;
    })()],
  ];
  for (const [name, scenario] of cases) {
    it(name, async () => {
      const out = await both(scenario);
      same(out);
      expect(out.clasico.log.length).toBeGreaterThan(0);
    });
  }

  it('the ledger read asks for the cancelled rows only', async () => {
    const out = await both(listScenarioAdmin());
    expect(out.clasico.ledger).toEqual([JSON.stringify(['s-devuelta', 's-penalizada'])]);
  });
});

describe('doing things: the same requests and the same address bar', () => {
  it('each filter in turn, then the dates', async () => {
    const s = listScenarioAdmin();
    s.fetch![listAddress({ school_id: '1' })] = rowsAnswer(LIST_ROWS);
    s.fetch![listAddress({ school_id: '1', growth_community_id: 'gc-1' })] = rowsAnswer(LIST_ROWS);
    s.fetch![listAddress({ school_id: '1', growth_community_id: 'gc-1', consultant_id: 'con-1' })] = rowsAnswer(LIST_ROWS);
    s.fetch![listAddress({ school_id: '1', growth_community_id: 'gc-1', consultant_id: 'con-1', status: 'cancelada' })] = rowsAnswer(LIST_ROWS.slice(5));
    s.fetch![listAddress({ school_id: '1', growth_community_id: 'gc-1', consultant_id: 'con-1', status: 'cancelada', date_from: '2026-11-01' })] = rowsAnswer([]);
    s.fetch![listAddress({ school_id: '1', growth_community_id: 'gc-1', consultant_id: 'con-1', status: 'cancelada', date_from: '2026-11-01', date_to: '2026-11-30' })] = rowsAnswer([]);
    const out = await both(s, async () => {
      const values = ['1', 'gc-1', 'con-1', 'cancelada'];
      for (let i = 0; i < values.length; i += 1) {
        fireEvent.change(document.querySelectorAll('select')[i], { target: { value: values[i] } });
        await settle();
      }
      fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: '2026-11-01' } });
      await settle();
      fireEvent.change(document.querySelectorAll('input[type="date"]')[1], { target: { value: '2026-11-30' } });
      await settle();
    });
    same(out);
    expect(out.clasico.log.filter((e: any) => e && typeof e === 'object' && 'router.replace' in e)).toHaveLength(6);
    expect(out.clasico.log).toContainEqual({
      'router.replace': [
        { pathname: '/admin/sessions', query: { school_id: '1', growth_community_id: 'gc-1', consultant_id: 'con-1', status: 'cancelada', date_from: '2026-11-01', date_to: '2026-11-30' } },
        undefined,
        { shallow: true },
      ],
    });
  });

  it('«Mes», its arrows, «Semana», its arrows, back to «Lista»', async () => {
    const out = await both(listScenarioAdmin(), async () => {
      fireEvent.click(viewButton('Mes'));
      await settle();
      fireEvent.click(arrows('noviembre 2026')[1]);
      await settle();
      fireEvent.click(arrows('diciembre 2026')[0]);
      await settle();
      fireEvent.click(viewButton('Semana'));
      await settle();
      fireEvent.click(arrows('16 nov - 22 nov 2026')[1]);
      await settle();
      fireEvent.click(viewButton('Lista'));
      await settle();
    });
    same(out);
    expect(out.clasico.log).toContainEqual(expect.objectContaining({ fetch: '/api/sessions?page=1&limit=50&date_from=2026-12-01&date_to=2026-12-31' }));
    expect(out.clasico.log).toContainEqual(expect.objectContaining({ fetch: '/api/sessions?page=1&limit=50&date_from=2026-11-23&date_to=2026-11-29' }));
  });

  it('«+n más» in «Mes»: both dates in the address, then «Lista»', async () => {
    const s = listScenarioAdmin();
    s.fetch![listAddress({ date_from: '2026-11-06' })] = rowsAnswer([]);
    s.fetch![listAddress({ date_from: '2026-11-06', date_to: '2026-11-06' })] = rowsAnswer(LIST_ROWS.slice(5));
    s.fetch![listAddress({ date_from: '2026-11-01', date_to: '2026-11-30' })] = rowsAnswer([
      ...LIST_ROWS,
      { ...LIST_ROWS[4], id: 's-otra', title: 'Otra inventada', session_date: '2026-11-06' },
    ]);
    const out = await both(s, async () => {
      fireEvent.click(viewButton('Mes'));
      await settle();
      // The 6th comes before the 20th (which also has three).
      fireEvent.click(screen.getAllByText('+1 más')[0]);
      await settle();
    });
    same(out);
    expect(out.clasico.log).toContainEqual({ 'router.replace': [{ pathname: '/admin/sessions', query: { date_from: '2026-11-06', date_to: '2026-11-06' } }, undefined, { shallow: true }] });
  });

  it('a row, the menu’s «Ver detalle», «Nueva Sesión»', async () => {
    const out = await both(listScenarioAdmin(), async () => {
      fireEvent.click(screen.getByText('Serie inventada'));
      await settle();
      fireEvent.click(menuOf('Completada inventada'));
      await settle();
      fireEvent.click(within(rowOf('Completada inventada')).getByText('Ver detalle'));
      await settle();
      fireEvent.click(viewButton('Nueva Sesión'));
      await settle();
    });
    same(out);
    expect(out.clasico.log).toContainEqual({ 'router.push': ['/admin/sessions/s-serie-1'] });
    expect(out.clasico.log).toContainEqual({ 'router.push': ['/admin/sessions/s-completada'] });
    expect(out.clasico.log).toContainEqual({ 'router.push': ['/admin/sessions/create'] });
  });

  it('the menu’s «Aprobar» (no question, as today)', async () => {
    const out = await both(listScenarioAdmin(), async () => {
      fireEvent.click(menuOf('Borrador inventado'));
      await settle();
      fireEvent.click(within(rowOf('Borrador inventado')).getByText('Aprobar'));
      await settle();
    });
    same(out);
    expect(out.clasico.log).toContainEqual(expect.objectContaining({ fetch: '/api/sessions/s-borrador/approve', method: 'POST' }));
    expect(out.clasico.log).toContainEqual({ 'toast.success': ['Sesión aprobada exitosamente'] });
  });

  it('the menu’s «Cancelar», a reason, «Confirmar Cancelación»', async () => {
    const out = await both(listScenarioAdmin(), async () => {
      fireEvent.click(menuOf('Serie inventada'));
      await settle();
      fireEvent.click(within(rowOf('Serie inventada')).getByText('Cancelar'));
      await settle();
      fireEvent.change(screen.getByPlaceholderText('Razón de cancelación...'), { target: { value: ' Motivo inventado ' } });
      fireEvent.click(screen.getByText('Confirmar Cancelación'));
      await settle();
    });
    same(out);
    expect(out.clasico.log).toContainEqual(expect.objectContaining({ fetch: '/api/sessions/s-serie-1/cancel', body: JSON.stringify({ cancellation_reason: 'Motivo inventado' }) }));
    expect(out.clasico.log).toContainEqual({ 'toast.success': ['Sesión cancelada exitosamente'] });
  });

  it('the export address is the same for the same filters', async () => {
    const s = listScenarioAdmin({ query: { status: 'programada', date_from: '2026-11-01' } });
    s.fetch![listAddress({ status: 'programada', date_from: '2026-11-01' })] = rowsAnswer(LIST_ROWS);
    const hrefs: string[] = [];
    for (const look of ['clasico', 'nuevo'] as Look[]) {
      await draw(s, look);
      hrefs.push(screen.getByText('Exportar Calendario').closest('a')!.getAttribute('href')!);
    }
    expect(hrefs[1]).toBe(hrefs[0]);
    expect(hrefs[0]).toBe('/api/sessions/ical?status=programada&date_from=2026-11-01');
  });

  it('signing out from the frame', async () => {
    const out = await both(listScenarioAdmin(), async () => {
      await fakes.props.MainLayout.onLogout();
      await settle();
    });
    same(out);
  });
});
