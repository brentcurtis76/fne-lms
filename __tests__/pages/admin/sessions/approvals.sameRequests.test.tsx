// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Aprobaciones de Sesiones» asks the same things and moves the browser the
 * same way in both looks. Each case draws the page in today's look and in the new look on the same
 * invented data, does the same thing through each view's own controls, and compares what reached the
 * server or moved the browser (`auth.*`, the role helper, every `fetch` with its method, headers and
 * body, every router move, every toast). Every person and session here is invented.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeFetch, requests, resetFakes, settle } from '../../../helpers/sessionsFakes';
import { approvalsScenario } from '../../../helpers/adminSessionsFakes';
import type { AdminScenario } from '../../../helpers/adminSessionsFakes';

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

import SessionApprovalsPage from '@/pages/admin/sessions/approvals';

type Look = 'clasico' | 'nuevo';

const copy = (s: AdminScenario): AdminScenario => JSON.parse(JSON.stringify(s));

async function draw(scenario: AdminScenario, look: Look) {
  cleanup();
  resetFakes(copy(scenario));
  fakes.look = look;
  render(<SessionApprovalsPage />);
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
const button = (name: string, at = 0) => screen.getAllByText(name).map((n) => n.closest('button') as HTMLElement)[at];
const notes = () => Array.from(document.querySelectorAll('textarea'));

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
    ['the admin', approvalsScenario()],
    ['a consultor (→ /dashboard)', approvalsScenario({ role: 'consultor' })],
    ['nobody signed in (→ /login)', approvalsScenario({ session: null })],
    ['the requests read failing (the toast)', approvalsScenario({ fetch: { 'GET /api/sessions/edit-requests?status=pending': { status: 500, body: {} } } })],
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
  it('each tab in turn', async () => {
    const out = await both(approvalsScenario(), async () => {
      for (const name of ['Aprobadas', 'Rechazadas', 'Todas', 'Pendientes']) {
        fireEvent.click(button(name));
        await settle();
      }
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.filter((e: any) => typeof e?.fetch === 'string').length).toBe(5);
  });

  it('approving with a note, then rejecting without one (the toast), then with one (an error answer)', async () => {
    const out = await both(approvalsScenario(), async () => {
      fireEvent.change(notes()[0], { target: { value: 'Nota inventada' } });
      fireEvent.click(button('Aprobar', 0));
      await settle();
      fireEvent.click(button('Rechazar', 1));
      await settle();
      fireEvent.change(notes()[1], { target: { value: 'Razón inventada' } });
      fireEvent.click(button('Rechazar', 1));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual(expect.objectContaining({ fetch: '/api/sessions/edit-requests/req-1', method: 'PUT', body: JSON.stringify({ action: 'approve', review_notes: 'Nota inventada' }) }));
    expect(out.clasico).toContainEqual({ 'toast.error': ['Por favor ingrese una razón para el rechazo'] });
    expect(out.clasico).toContainEqual(expect.objectContaining({ fetch: '/api/sessions/edit-requests/req-2', body: JSON.stringify({ action: 'reject', review_notes: 'Razón inventada' }) }));
  });

  it('signing out from the frame', async () => {
    const out = await both(approvalsScenario(), async () => {
      await fakes.props.MainLayout.onLogout();
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContain('auth.signOut');
  });
});
