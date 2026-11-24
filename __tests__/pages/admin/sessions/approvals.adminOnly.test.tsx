// @vitest-environment jsdom
/**
 * Redesign 6S, release SC (first send-back, the reviewer's item 4): «Aprobaciones de Sesiones» draws its
 * new body only for the admin, on the same condition as its data read (a user, and the admin role).
 * Anyone else on the new look, while the page's move away is still pending, is drawn exactly what
 * today's look draws for them: the same markup, the same frame props, the same calls and moves. The
 * admin on the new look still gets the new body. Every person and request here is invented.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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

async function draw(look: Look, scenario: AdminScenario) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = look;
  const view = render(<SessionApprovalsPage />);
  await settle();
  const { children: _children, ...frame } = fakes.props.MainLayout ?? {};
  return {
    markup: view.container.innerHTML,
    frame: JSON.parse(JSON.stringify(frame)),
    log: requests(),
    nuevoBody: screen.queryByTestId('approvals-nuevo') !== null,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the new body only for the admin', () => {
  const others: [string, AdminScenario][] = [
    ['a consultor (the move to /dashboard pending)', approvalsScenario({ role: 'consultor' })],
    ['an account with no role', approvalsScenario({ role: undefined })],
    ['nobody signed in (the move to /login pending)', approvalsScenario({ session: null })],
  ];
  for (const [name, scenario] of others) {
    it(`${name}: on the new look, exactly today’s screen`, async () => {
      const clasico = await draw('clasico', scenario);
      const nuevo = await draw('nuevo', scenario);
      expect(nuevo.nuevoBody).toBe(false);
      expect(nuevo.markup).toBe(clasico.markup);
      expect(nuevo.frame).toEqual(clasico.frame);
      expect(nuevo.log).toEqual(clasico.log);
      expect(nuevo.log.some((e: any) => typeof e?.fetch === 'string')).toBe(false);
    });
  }

  it('the admin on the new look: the new body', async () => {
    const nuevo = await draw('nuevo', approvalsScenario());
    expect(nuevo.nuevoBody).toBe(true);
    expect(nuevo.frame.breadcrumbs).toEqual([{ label: 'Consultorías' }, { label: 'Aprobaciones' }]);
  });
});
