// @vitest-environment jsdom
/**
 * Redesign 6S, release SC, first send-back (the reviewer's item 1): in the new look, the two questions
 * of the admin's «Detalle de Sesión» («aprobar», «iniciar») belong to the session they were opened for.
 * When the address names another session, an open question closes and its «Confirmar» can no longer be
 * pressed; it does not come back when the address returns; nothing is sent for either session. A
 * question opened while the address already names another session (the page still showing the
 * previous one) does not open. Without a change of address the «yes» still sends today's one request.
 * Every person and session here is invented.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeConfirm, fakeFetch, requests, resetFakes, settle } from '../../../helpers/sessionsFakes';
import type { Answer } from '../../../helpers/sessionsFakes';
import { adminDetail, detailScenario } from '../../../helpers/adminSessionsFakes';
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
vi.mock('@/components/sessions/HoursComparisonPanel', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('HoursComparisonPanel'),
}));

import AdminSessionDetailPage from '@/pages/admin/sessions/[id]';

const APPROVE = '¿Está seguro que desea aprobar esta sesión?';
const START = '¿Está seguro que desea iniciar esta sesión?';
const SESSION_B = 'GET /api/sessions/ses-2';

/** Session A (`ses-1`) with this status; session B (`ses-2`) answers as given (or never). */
function scenario(status: string, b: Answer): AdminScenario {
  const s = detailScenario(adminDetail({ status, recurrence_group_id: null }));
  s.fetch![SESSION_B] = b;
  return s;
}
const sessionB = (status: string) => ({
  body: { data: { session: adminDetail({ id: 'ses-2', title: 'Segunda Sesión Inventada', status, recurrence_group_id: null }) } },
});

let view: ReturnType<typeof render>;
async function draw(s: AdminScenario) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(s)));
  fakes.look = 'nuevo';
  view = render(<AdminSessionDetailPage />);
  await settle();
}
async function goTo(id: string) {
  fakes.router.query = { id };
  view.rerender(<AdminSessionDetailPage />);
  await settle();
}
const writes = () => requests().filter((e: any) => typeof e?.fetch === 'string' && e.method !== 'GET');
const asked = (address: string) => requests().filter((e: any) => e?.fetch === address).length;
const question = (title: string) => screen.queryAllByRole('dialog').find((d) => within(d).queryByText(title)) ?? null;
const shownTitle = () => screen.getByTestId('admin-session-detail-nuevo').querySelector('p.text-lg')!.textContent;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('confirm', vi.fn(fakeConfirm));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a question belongs to the session it was opened for', () => {
  it('«Aprobar» on A, the address moves to B while A is still shown: the question closes, nothing is sent', async () => {
    await draw(scenario('borrador', 'pending'));
    fireEvent.click(screen.getByText('Aprobar').closest('button')!);
    await settle();
    const open = question(APPROVE)!;
    expect(open).toBeTruthy();
    const yes = within(open).getByText('Confirmar').closest('button')!;

    await goTo('ses-2');
    expect(shownTitle()).toBe('Sesión Inventada de Gestión del Cambio');
    expect(question(APPROVE)).toBeNull();
    // The old «Confirmar» is gone from the page; pressing what is left of it sends nothing.
    expect(yes.isConnected).toBe(false);
    fireEvent.click(yes);
    await settle();
    expect(writes()).toEqual([]);

    // A press of «Aprobar» while the address already names B and A is still shown opens nothing.
    fireEvent.click(screen.getByText('Aprobar').closest('button')!);
    await settle();
    expect(question(APPROVE)).toBeNull();
    expect(writes()).toEqual([]);
  });

  it('«Aprobar» on A, then B loads: no question for B, nothing sent for A or B; back to A, it does not come back', async () => {
    await draw(scenario('borrador', sessionB('borrador')));
    fireEvent.click(screen.getByText('Aprobar').closest('button')!);
    await settle();
    expect(question(APPROVE)).toBeTruthy();

    await goTo('ses-2');
    expect(shownTitle()).toBe('Segunda Sesión Inventada');
    expect(question(APPROVE)).toBeNull();
    expect(asked('/api/sessions/ses-2/approve')).toBe(0);

    await goTo('ses-1');
    expect(shownTitle()).toBe('Sesión Inventada de Gestión del Cambio');
    expect(question(APPROVE)).toBeNull();
    expect(writes()).toEqual([]);
  });

  it('«Iniciar Sesión» on A, the address moves to B: the question closes, no start is sent', async () => {
    await draw(scenario('programada', sessionB('programada')));
    fireEvent.click(screen.getByTestId('session-start-button'));
    await settle();
    const open = question(START)!;
    expect(open).toBeTruthy();
    const yes = within(open).getByText('Confirmar').closest('button')!;

    await goTo('ses-2');
    expect(question(START)).toBeNull();
    fireEvent.click(yes);
    await settle();
    expect(writes()).toEqual([]);
  });

  it('without a change of address, «Confirmar» sends today’s one request for the session shown', async () => {
    await draw(scenario('borrador', 'pending'));
    fireEvent.click(screen.getByText('Aprobar').closest('button')!);
    await settle();
    fireEvent.click(within(question(APPROVE)!).getByText('Confirmar'));
    await settle();
    expect(writes()).toEqual([expect.objectContaining({ fetch: '/api/sessions/ses-1/approve', method: 'POST' })]);
  });
});
