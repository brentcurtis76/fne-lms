// @vitest-environment jsdom
/**
 * Redesign 6, release SB: the form «Programar Sesión» asks for the same things in both looks.
 *
 * Each case fills the same form the same way in today's view (`SessionCreateClasico`) and in the new
 * one (`SessionCreateNuevo`), presses the same button, and compares the ordered log of everything the
 * page asked for from its first render (every `fetch` with address, method, headers and body, every
 * Supabase read and its filters, every `rpc`, `auth.*`, the role helper, every router push, every
 * toast). The only entry left out is the browser's question, which the new look replaces by its own
 * pop-up (approved change 1): the classic case answers it «yes», the new case presses the pop-up's
 * «Programar …». The named differences: a refused press toasts its first failure in today's look and
 * toasts nothing in the new one (approved change 2), and neither sends a request.
 * Invented data only.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/router', async () => (await import('./sessionCreateFakes')).routerModule());
vi.mock('next/link', async () => (await import('./sessionCreateFakes')).linkModule());
vi.mock('@supabase/auth-helpers-react', async () => (await import('./sessionCreateFakes')).authHelpersModule());
vi.mock('@/utils/roleUtils', async (importOriginal) =>
  (await import('./sessionCreateFakes')).roleUtilsModule(await importOriginal())
);
vi.mock('react-hot-toast', async () => (await import('./sessionCreateFakes')).toastModule());
vi.mock('@/contexts/LookContext', async () => (await import('./sessionCreateFakes')).lookModule());
vi.mock('@/components/layout/MainLayout', async () => (await import('./sessionCreateFakes')).layoutModule());
vi.mock('@/components/layout/FunctionalPageHeader', async () => (await import('./sessionCreateFakes')).headerModule());

import SessionCreatePage from '@/pages/admin/sessions/create';
import { ADMIN, admin, fakes, installGlobals, requestsOf, settle, takeLog, type Scenario } from './sessionCreateFakes';

type Look = 'clasico' | 'nuevo';
const NOON = new Date('2026-11-19T15:00:00Z');

const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const field = (name: string) => $(`[name="${name}"]`);
async function change(element: Element | null | undefined, value: string) {
  if (!element) throw new Error('nothing to change');
  fireEvent.change(element, { target: { value } });
  await settle();
}
async function click(element: Element | null | undefined) {
  if (!element) throw new Error('nothing to click');
  fireEvent.click(element);
  await settle();
}
const pageButtons = () =>
  Array.from(document.querySelectorAll('button')).filter((b) => !b.closest('[data-testid="session-create-nuevo-confirm"]'));
const buttonStarting = (text: string) => pageButtons().find((b) => (b.textContent ?? '').trim().startsWith(text)) ?? null;
const consultantSelect = () => screen.queryByText('Agregar consultor...')?.closest('select');
const radioOf = (text: string) => screen.getByText(text).closest('label')?.querySelector('input');
const removeButton = (name: string) => $(`button[aria-label="Quitar consultor ${name}"]`);

/** The same gesture in each look. */
function actions(look: Look) {
  return {
    async lead(name: string) {
      const input =
        look === 'clasico'
          ? removeButton(name)?.parentElement?.parentElement?.querySelector('input[type="checkbox"]')
          : removeButton(name)?.closest('li')?.querySelector('input[type="radio"]');
      await click(input);
    },
    async toggleRole(name: string) {
      if (look === 'clasico') await click(removeButton(name)?.parentElement?.parentElement?.querySelector('button'));
      else {
        const group = screen.getByRole('group', { name: `Tipo de consultor de ${name}` });
        const other = within(group).getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'false');
        await click(other);
      }
    },
    async schedule() {
      await click(buttonStarting('Programar'));
      if (look === 'nuevo') {
        const dialog = $('[data-testid="session-create-nuevo-confirm"]');
        if (!dialog) throw new Error('the pop-up did not open');
        await click($('[data-testid="session-create-nuevo-confirm-confirm"]'));
      }
    },
    async draft() {
      await click(buttonStarting('Guardar'));
    },
  };
}

type Act = ReturnType<typeof actions>;

async function run(look: Look, scenario: () => Scenario, steps: (a: Act) => Promise<void>) {
  installGlobals();
  fakes.scenario = scenario();
  fakes.look = look;
  const view = render(<SessionCreatePage />);
  await settle();
  await steps(actions(look));
  const entries = requestsOf(takeLog());
  view.unmount();
  return entries;
}

async function basics() {
  await change(field('school_id'), '7');
  await change(field('growth_community_id'), 'com-7a');
  await change(field('title'), '  Taller Inventado de Prueba  ');
  await change(field('session_date'), '2026-12-01');
  await change(consultantSelect(), 'u-c1');
  await change(field('location'), 'Sala Inventada 1');
}

const CASES: Array<{ name: string; scenario: () => Scenario; steps: (a: Act) => Promise<void> }> = [
  {
    name: 'schedule a single presencial session',
    scenario: () => admin(),
    steps: async (a) => {
      await basics();
      await a.schedule();
    },
  },
  {
    name: 'schedule with everything filled: híbrida, link, provider, hours, two consultants, lead and role changed',
    scenario: () => admin(),
    steps: async (a) => {
      await basics();
      await change(field('description'), 'Una descripción inventada');
      await change(field('objectives'), 'Objetivos inventados');
      await change(field('start_time'), '14:30');
      await change(field('end_time'), '16:00');
      await click($('input[name="modality"][value="hibrida"]'));
      await change(field('meeting_link'), 'https://meet.google.com/abc-defg-hij');
      await change($('#hour-type-select'), 'taller');
      await change($('#contrato-select'), 'ctr-7');
      await change(consultantSelect(), 'u-c2');
      await a.toggleRole('Bruno Ficticio');
      await a.lead('Bruno Ficticio');
      await a.schedule();
    },
  },
  {
    name: 'schedule an online session with «Generar reunión Zoom»',
    scenario: () => admin(),
    steps: async (a) => {
      await basics();
      await click($('input[name="modality"][value="online"]'));
      await click($('[data-testid="session-zoom-managed"]'));
      await a.schedule();
    },
  },
  {
    name: 'schedule a weekly series of 4 with a recurrence group: bulk approval, the list',
    scenario: () =>
      admin({ fetch: { 'POST /api/sessions': { body: { data: { recurrence_group_id: 'grp-1', sessions: [{ id: 's1' }] } } } } }),
    steps: async (a) => {
      await basics();
      await click(radioOf('Serie recurrente'));
      await a.schedule();
    },
  },
  {
    name: 'schedule a monthly series of 3 without a recurrence group: the first session approved',
    scenario: () => admin({ fetch: { 'POST /api/sessions': { body: { data: { sessions: [{ id: 's-a' }, { id: 's-b' }] } } } } }),
    steps: async (a) => {
      await basics();
      await click(radioOf('Serie recurrente'));
      await change(screen.getByText('Semanal').closest('select'), 'monthly');
      await change($('input[type="number"]'), '3');
      await a.schedule();
    },
  },
  {
    name: 'schedule: the approval answered 500',
    scenario: () => admin({ fetch: { 'POST /api/sessions/ses-inventada-1/approve': { status: 500, body: { error: 'Fallo inventado' } } } }),
    steps: async (a) => {
      await basics();
      await a.schedule();
    },
  },
  {
    name: 'schedule: the bulk approval answered 500 without a text',
    scenario: () =>
      admin({
        fetch: {
          'POST /api/sessions': { body: { data: { recurrence_group_id: 'grp-1' } } },
          'POST /api/sessions/bulk-approve': { status: 500, body: {} },
        },
      }),
    steps: async (a) => {
      await basics();
      await click(radioOf('Serie recurrente'));
      await a.schedule();
    },
  },
  {
    name: 'schedule: the creation refused',
    scenario: () => admin({ fetch: { 'POST /api/sessions': { status: 400, body: { error: 'Rechazo inventado' } } } }),
    steps: async (a) => {
      await basics();
      await a.schedule();
    },
  },
  {
    name: 'schedule without a token',
    // getSession answers: the arrival, the hour types, the consultants; then the schedule, without a token.
    scenario: () => admin({ sessions: [ADMIN, ADMIN, ADMIN, { user: ADMIN.user }] }),
    steps: async (a) => {
      await basics();
      await a.schedule();
    },
  },
  {
    name: 'save a single draft',
    scenario: () => admin(),
    steps: async (a) => {
      await basics();
      await a.draft();
    },
  },
  {
    name: 'save a custom series as draft',
    scenario: () => admin({ fetch: { 'POST /api/sessions': { body: { data: { sessions: [{ id: 'x' }, { id: 'y' }] } } } } }),
    steps: async (a) => {
      await basics();
      await click(radioOf('Serie recurrente'));
      await change(screen.getByText('Semanal').closest('select'), 'custom');
      await click(buttonStarting('Agregar fecha'));
      const dates = Array.from(document.querySelectorAll('input[type="date"]:not([name])'));
      await change(dates[0], '2026-12-10');
      await change(dates[1], '2026-12-03');
      await a.draft();
    },
  },
  {
    name: 'save a series draft with the series count cleared: same outcome as today’s check',
    scenario: () => admin(),
    steps: async (a) => {
      await basics();
      await click(radioOf('Serie recurrente'));
      await change($('input[type="number"]'), '');
      await a.draft();
    },
  },
  {
    name: 'the school changed after a community and a consultant, then «Reintentar» after a failing consultants read',
    scenario: () => admin({ fetch: { 'GET /api/admin/consultants?school_id=9': [{ status: 500, body: {} }, { body: { data: { consultants: [] } } }] } }),
    steps: async () => {
      await basics();
      await change(field('school_id'), '9');
      await click(buttonStarting('Reintentar'));
    },
  },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS = 'true';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS;
});

describe('the same requests in both looks', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const clasico = await run('clasico', c.scenario, c.steps);
      const nuevo = await run('nuevo', c.scenario, c.steps);
      // The case reached the server (no case is vacuous), and both looks asked the same, in order.
      expect(clasico.some((e: any) => e && typeof e === 'object' && ('fetch' in e || 'supabase' in e))).toBe(true);
      expect(nuevo).toEqual(clasico);
    });
  }

  it('the classic case is answered through the browser\'s question, the new one never asks it', async () => {
    installGlobals();
    fakes.scenario = admin();
    fakes.look = 'nuevo';
    const view = render(<SessionCreatePage />);
    await settle();
    await basics();
    await actions('nuevo').schedule();
    expect(takeLog().some((e: any) => e && typeof e === 'object' && 'confirm' in e)).toBe(false);
    view.unmount();
  });
});

describe('the named difference: a refused press', () => {
  for (const button of ['Programar', 'Guardar'] as const) {
    it(`«${button}…» with the title missing: today a toast of the first failure, the new look none; no request in either`, async () => {
      const steps = async () => {
        await basics();
        await change(field('title'), '   ');
        await change(field('location'), '');
        await click(buttonStarting(button));
      };
      const clasico = await run('clasico', () => admin(), steps);
      const nuevo = await run('nuevo', () => admin(), steps);
      const errors = (log: unknown[]) => log.filter((e: any) => e && typeof e === 'object' && 'toast.error' in e);
      expect(errors(clasico)).toEqual([{ 'toast.error': 'Debe ingresar un título' }]);
      expect(errors(nuevo)).toEqual([]);
      const without = (log: unknown[]) => log.filter((e: any) => !(e && typeof e === 'object' && 'toast.error' in e));
      expect(without(nuevo)).toEqual(without(clasico));
      expect(clasico.some((e: any) => e && e.method === 'POST')).toBe(false);
    });
  }
});
