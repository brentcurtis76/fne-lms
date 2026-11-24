// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Clasificar Sesiones» asks the same things and moves the browser the same
 * way in both looks. Each case draws the page in today's look and in the new look on the same invented
 * data, does the same thing through each view's own controls, and compares what reached the server or
 * moved the browser (`auth.*`, the role helper, the schools read, every `fetch` with its method,
 * headers and body, every router move, every toast). Every person and session here is invented.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeFetch, requests, resetFakes, settle } from '../../helpers/sessionsFakes';
import { bulkScenario } from '../../helpers/adminSessionsFakes';
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

type Look = 'clasico' | 'nuevo';

async function draw(scenario: AdminScenario, look: Look) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = look;
  render(<BulkTagSessionsPage />);
  await settle();
}
async function both(scenario: AdminScenario, steps: () => Promise<void> = async () => {}) {
  const out: Record<Look, unknown[]> = { clasico: [], nuevo: [] };
  for (const look of ['clasico', 'nuevo'] as Look[]) {
    await draw(scenario, look);
    await steps();
    out[look] = requests();
  }
  return out;
}
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const tick = (label: string) => fireEvent.click(screen.getByLabelText(label));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('arriving: the same calls and redirects', () => {
  const cases: [string, AdminScenario][] = [
    ['the admin', bulkScenario()],
    ['a consultor (→ /dashboard)', bulkScenario({ role: 'consultor' })],
    ['nobody signed in (→ /login)', bulkScenario({ session: null })],
    ['the list read failing (the toast)', (() => {
      const s = bulkScenario();
      s.fetch![Object.keys(s.fetch!)[0]] = { status: 500, body: { error: 'Error inventado al cargar' } };
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
  it('each filter in turn (the page goes back to 1)', async () => {
    const out = await both(bulkScenario(), async () => {
      fireEvent.change(byId('filter-date-from'), { target: { value: '2026-10-01' } });
      await settle();
      fireEvent.change(byId('filter-date-to'), { target: { value: '2026-10-31' } });
      await settle();
      fireEvent.change(byId('filter-school'), { target: { value: '1' } });
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual(expect.objectContaining({ fetch: '/api/admin/bulk-tag-sessions?page=1&page_size=50&date_from=2026-10-01&date_to=2026-10-31&school_id=1', headers: null }));
  });

  it('ticking, the tick-all box, a type, then «Clasificar Seleccionadas»', async () => {
    const out = await both(bulkScenario(), async () => {
      tick('Seleccionar sesión Sesión inventada sin tipo uno');
      await settle();
      tick('Seleccionar todas las sesiones');
      await settle();
      fireEvent.change(screen.getByLabelText('Tipo de hora para clasificación'), { target: { value: 'taller' } });
      fireEvent.click(screen.getByText('Clasificar Seleccionadas'));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual({
      fetch: '/api/admin/bulk-tag-sessions',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_ids: ['bt-1', 'bt-2'], hour_type_key: 'taller' }),
    });
    expect(out.clasico).toContainEqual({ 'toast.success': ['Mensaje inventado del servidor'] });
  });

  it('the tick-all box twice, then «Deseleccionar»: nothing sent', async () => {
    const out = await both(bulkScenario(), async () => {
      tick('Seleccionar todas las sesiones');
      await settle();
      tick('Seleccionar todas las sesiones');
      await settle();
      tick('Seleccionar sesión Sesión inventada sin tipo dos');
      await settle();
      fireEvent.click(screen.getByText('Deseleccionar'));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.some((e: any) => e?.method === 'PATCH')).toBe(false);
  });

  it('the next page (above 50 rows) clears the selection', async () => {
    const out = await both(bulkScenario({}, 120), async () => {
      tick('Seleccionar sesión Sesión inventada sin tipo uno');
      await settle();
      fireEvent.click(screen.getByLabelText('Página siguiente'));
      await settle();
      expect(screen.queryByText('Deseleccionar')).toBeNull();
      expect(screen.getByText('Página 2 de 3')).toBeTruthy();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual(expect.objectContaining({ fetch: '/api/admin/bulk-tag-sessions?page=2&page_size=50' }));
  });

  it('signing out from the frame', async () => {
    const out = await both(bulkScenario(), async () => {
      await fakes.props.MainLayout.onLogout();
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
  });
});
