// @vitest-environment jsdom
/**
 * Redesign 6S, release SB: the consultor's session page asks the same things, takes the same decisions
 * and sends the browser to the same places in both looks. Each case draws the page in today's look and
 * in the new look on the same invented data, does the same thing in each (through each view's own
 * controls), and compares what reached the server or moved the browser (`requests()`: every `auth.*`
 * call, the role helper, every `fetch` with its address, method, headers and body, every router move,
 * every toast). The decided differences are named where they apply: the new look asks the material
 * question in its own pop-up (no `confirm()`), and shows the finalize card at «En Progreso» too.
 */
import React from 'react';
import { fireEvent, render, screen, within, cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakes, resetFakes, settle, fakeFetch, fakeConfirm, payload, okSession, authFor, ME, OTHER, DETAIL_GET, REPORT_MINE, REQUESTS,
  ACTIVITY, requests,
} from '../../../helpers/sessionsFakes';
import type { Scenario } from '../../../helpers/sessionsFakes';

const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'America/Santiago';
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
vi.mock('@/components/sessions/AttendanceSuggestionsPanel', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('AttendanceSuggestionsPanel'),
}));
vi.mock('@/components/sessions/AudioReportUploader', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('AudioReportUploader'),
}));
vi.mock('@/components/sessions/AudioPlayer', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('AudioPlayer') }));
vi.mock('@/components/sessions/EditRequestModal', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('EditRequestModal'),
}));

import SessionDetailPage from '@/pages/consultor/sessions/[id]';

type Look = 'clasico' | 'nuevo';
const NOW = new Date('2026-11-19T12:00:00Z');

function as(role: string | 'pending', session: unknown, more: Scenario['fetch'] = {}, who: unknown = authFor(ME)): Scenario {
  return { query: { id: 'ses-1' }, session: who, role, fetch: { [DETAIL_GET]: okSession(session), ...more } };
}

/** A fresh copy of a scenario (its answer lists are consumed). */
const copy = (s: Scenario): Scenario => JSON.parse(JSON.stringify(s));

async function draw(scenario: Scenario, look: Look) {
  cleanup();
  resetFakes(copy(scenario));
  fakes.look = look;
  render(<SessionDetailPage />);
  await settle();
}

async function press(element: Element | null | undefined) {
  if (!element) throw new Error('nothing to press');
  fireEvent.click(element);
  await settle();
}
const buttonByText = (text: string) =>
  screen.queryByRole('button', { name: text }) ?? (screen.getAllByText(text)[0].closest('button') as HTMLElement);
async function openTab(label: string) {
  await press(screen.queryByRole('tab', { name: label }) ?? screen.getByText(label).closest('button'));
}

/** Runs the same steps in both looks and returns what each sent. */
async function both(scenario: Scenario, steps: (look: Look) => Promise<void> = async () => {}) {
  const out: Record<Look, unknown[]> = { clasico: [], nuevo: [] };
  for (const look of ['clasico', 'nuevo'] as Look[]) {
    await draw(scenario, look);
    await steps(look);
    out[look] = requests();
  }
  return out;
}
const withoutConfirm = (entries: unknown[]) => entries.filter((e: any) => !(e && typeof e === 'object' && 'confirm' in e));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('confirm', vi.fn(fakeConfirm));
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

describe('arriving: the same calls and redirects in both looks', () => {
  const cases: [string, Scenario][] = [
    ['a facilitator', as('consultor', payload({ reports: [{ ...REPORT_MINE, audio_url: 'audio/inventado.webm' }] }), {
      'GET /api/sessions/ses-1/reports/rep-1': { body: { data: { signedAudioUrl: 'https://audio.example.invalid/1', report: { transcript: 'Texto inventado' } } } },
    })],
    ['the admin', as('admin', payload({ facilitators: [] }))],
    ['the community leader', as('lider_comunidad', payload({ facilitators: [] }))],
    ['a docente (→ /dashboard)', as('docente', payload())],
    ['no session (→ /login)', as('consultor', payload(), {}, null)],
    ['403', { query: { id: 'ses-1' }, session: authFor(ME), role: 'consultor', fetch: { [DETAIL_GET]: { status: 403, body: {} } } }],
    ['404', { query: { id: 'ses-1' }, session: authFor(ME), role: 'consultor', fetch: { [DETAIL_GET]: { status: 404, body: {} } } }],
    ['401 (→ /login)', { query: { id: 'ses-1' }, session: authFor(ME), role: 'consultor', fetch: { [DETAIL_GET]: { status: 401, body: {} } } }],
    ['a server error (→ /login)', { query: { id: 'ses-1' }, session: authFor(ME), role: 'consultor', fetch: { [DETAIL_GET]: { status: 500, body: {} } } }],
  ];
  for (const [name, scenario] of cases) {
    it(name, async () => {
      const out = await both(scenario);
      expect(out.nuevo).toEqual(out.clasico);
      expect(out.clasico.length).toBeGreaterThan(0);
    });
  }

  it('the refusal pages say the same words in both looks', async () => {
    for (const [status, title, line] of [
      [403, 'Acceso denegado', 'No tiene permisos para ver esta sesión.'],
      [404, 'Sesión no encontrada', 'La sesión solicitada no existe o fue eliminada.'],
    ] as const) {
      for (const look of ['clasico', 'nuevo'] as Look[]) {
        await draw({ query: { id: 'ses-1' }, session: authFor(ME), role: 'consultor', fetch: { [DETAIL_GET]: { status, body: {} } } }, look);
        expect(screen.getByText(title)).toBeTruthy();
        expect(screen.getByText(line)).toBeTruthy();
      }
    }
  });
});

describe('doing things: the same requests in both looks', () => {
  it('«Marcar todos presentes» then «Guardar asistencia»', async () => {
    const out = await both(as('consultor', payload({ status: 'en_progreso' }), { 'PUT /api/sessions/ses-1/attendees': { body: {} } }), async () => {
      await press(buttonByText('Marcar todos presentes'));
      await press(buttonByText('Guardar asistencia'));
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.some((e: any) => e.fetch === '/api/sessions/ses-1/attendees' && e.method === 'PUT')).toBe(true);
  });

  it('ticking one person, choosing an arrival, writing a note, saving (409: the same toast)', async () => {
    const out = await both(
      as('consultor', payload({ status: 'en_progreso' }), { 'PUT /api/sessions/ses-1/attendees': { status: 409, body: {} } }),
      async () => {
        fireEvent.click(document.querySelectorAll('input[type="checkbox"]')[0]);
        fireEvent.change(document.querySelectorAll('select')[0], { target: { value: 'late' } });
        fireEvent.change(document.querySelectorAll('input[placeholder="Notas opcionales"]')[0], { target: { value: 'Nota inventada' } });
        await settle();
        await press(buttonByText('Guardar asistencia'));
      }
    );
    expect(out.nuevo).toEqual(out.clasico);
  });

  it('deleting a material: today’s browser question, the new pop-up; then the same DELETE', async () => {
    const scenario = as('consultor', payload({ status: 'en_progreso' }), { 'DELETE /api/sessions/ses-1/materials/mat-1': { body: {} } });
    const out = await both(scenario, async (look) => {
      await openTab('Materiales');
      if (look === 'clasico') {
        await press(document.querySelector('tbody button.text-red-600'));
      } else {
        await press(screen.getByRole('button', { name: 'Eliminar pauta-inventada.pdf' }));
        await press(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
      }
    });
    // The decided difference: today asks with confirm(); the new look asks in its pop-up.
    expect(out.clasico.filter((e: any) => e && typeof e === 'object' && 'confirm' in e)).toEqual([
      { confirm: ['¿Está seguro que desea eliminar "pauta-inventada.pdf"?'] },
    ]);
    expect(out.nuevo.some((e: any) => e && typeof e === 'object' && 'confirm' in e)).toBe(false);
    expect(out.nuevo).toEqual(withoutConfirm(out.clasico));
    expect(out.nuevo.some((e: any) => e.fetch === '/api/sessions/ses-1/materials/mat-1' && e.method === 'DELETE')).toBe(true);
  });

  it('uploading a material', async () => {
    const out = await both(as('consultor', payload(), { 'POST /api/sessions/ses-1/materials': { body: {} } }), async () => {
      await openTab('Materiales');
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['contenido inventado'], 'inventado.txt', { type: 'text/plain' })] } });
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.some((e: any) => e.fetch === '/api/sessions/ses-1/materials' && e.method === 'POST')).toBe(true);
  });

  it('writing and creating a report', async () => {
    const out = await both(
      as('consultor', payload({ status: 'pendiente_informe' }), { 'POST /api/sessions/ses-1/reports': { body: {} } }),
      async () => {
        await openTab('Informe');
        await press(buttonByText('Crear Informe'));
        fireEvent.change(document.querySelector('textarea') as HTMLTextAreaElement, { target: { value: 'Informe inventado' } });
        fireEvent.change(document.querySelectorAll('select')[document.querySelectorAll('select').length - 1], {
          target: { value: 'all_participants' },
        });
        await settle();
        await press(buttonByText('Crear'));
      }
    );
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.some((e: any) => e.fetch === '/api/sessions/ses-1/reports' && e.method === 'POST')).toBe(true);
  });

  it('editing a report then «Cancelar»; then «Actualizar»', async () => {
    const out = await both(
      as('consultor', payload({ status: 'pendiente_informe', reports: [{ ...REPORT_MINE, audio_url: null }] }), {
        'PUT /api/sessions/ses-1/reports/rep-1': { body: {} },
      }),
      async () => {
        await openTab('Informe');
        await press(buttonByText('Editar Informe'));
        await press(buttonByText('Cancelar'));
        await press(buttonByText('Editar Informe'));
        fireEvent.change(document.querySelector('textarea') as HTMLTextAreaElement, { target: { value: 'Informe inventado, corregido' } });
        await settle();
        await press(buttonByText('Actualizar'));
      }
    );
    expect(out.nuevo).toEqual(out.clasico);
  });

  it('finalizing, every condition met', async () => {
    const out = await both(
      as('consultor', payload({ status: 'pendiente_informe', attendees: [], reports: [REPORT_MINE] }), {
        'POST /api/sessions/ses-1/finalize': { body: {} },
      }),
      async (look) => {
        await press(buttonByText('Finalizar Sesión'));
        if (look === 'clasico') await press(screen.getByText('Finalizar').closest('button'));
        else await press(within(screen.getByRole('dialog')).getByRole('button', { name: /Finalizar/ }));
      }
    );
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.some((e: any) => e.fetch === '/api/sessions/ses-1/finalize')).toBe(true);
  });

  it('a change request sent from today’s window (kept in the page in both looks)', async () => {
    const out = await both(as('admin', payload({ facilitators: [] }), { 'POST /api/sessions/ses-1/edit-requests': { body: {} } }), async () => {
      await press(buttonByText('Solicitar Cambios'));
      await fakes.props.EditRequestModal.onSubmit({ start_time: { old: '09:00', new: '10:00' } }, 'Motivo inventado');
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico.some((e: any) => e.fetch === '/api/sessions/ses-1/edit-requests')).toBe(true);
  });

  it('signing out from the frame', async () => {
    const out = await both(as('consultor', payload()), async () => {
      await fakes.props.MainLayout.onLogout();
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContain('auth.signOut');
  });

  it('the conflict banner’s «Recargar» asks the session again', async () => {
    const out = await both(
      as('consultor', payload({ status: 'en_progreso' }), { 'PUT /api/sessions/ses-1/attendees': { status: 409, body: {} } }),
      async () => {
        await press(buttonByText('Guardar asistencia'));
        await press(buttonByText('Recargar'));
      }
    );
    expect(out.nuevo).toEqual(out.clasico);
  });
});

describe('who may do what: the same conditions in both looks', () => {
  const STATUSES = ['borrador', 'pendiente_aprobacion', 'programada', 'en_progreso', 'pendiente_informe', 'completada', 'cancelada'];
  const VIEWERS: [string, string, unknown[]][] = [
    ['facilitator', 'consultor', undefined as unknown as unknown[]],
    ['consultor not facilitating', 'consultor', [{ id: 'fac-9', user_id: OTHER, is_lead: true, facilitator_role: 'consultor_externo' }]],
    ['admin', 'admin', []],
    ['leader', 'lider_comunidad', []],
  ];

  /** What a person can see and reach, read from the page in either look. */
  function reachable() {
    const has = (text: string) => screen.queryAllByText(text).length > 0;
    const editButton = screen.queryAllByText('Solicitar Cambios')[0]?.closest('button') as HTMLButtonElement | undefined;
    return {
      calendar: has('Agregar al Calendario'),
      editRequest: Boolean(editButton),
      editRequestDisabled: editButton?.disabled ?? null,
      finalize: has('Finalizar Sesión'),
      readOnlyBand: has('Está viendo esta sesión en modo lectura. No está asignado como facilitador.'),
      markAll: has('Marcar todos presentes'),
      save: has('Guardar asistencia'),
      join: Boolean(document.querySelector('[data-testid="session-join-link"]')),
      planning: has('Planificación'),
      panel: fakes.mounts.AttendanceSuggestionsPanel ?? 0,
    };
  }

  for (const [who, role, facilitators] of VIEWERS) {
    it(`${who}: every status`, async () => {
      for (const status of STATUSES) {
        const session = payload({ status, edit_requests: REQUESTS, activity_log: ACTIVITY, ...(facilitators ? { facilitators } : {}) });
        const seen: Record<Look, ReturnType<typeof reachable>> = {} as any;
        for (const look of ['clasico', 'nuevo'] as Look[]) {
          await draw(as(role, session), look);
          seen[look] = reachable();
        }
        // The decided difference: the finalize card also at «En Progreso» for who may edit.
        const expected = { ...seen.clasico };
        if (status === 'en_progreso' && (who === 'facilitator' || who === 'admin')) expected.finalize = true;
        expect(seen.nuevo, `${who} at ${status}`).toEqual(expected);
        // The comparison is not empty: the facts it reads do change with the viewer and the status.
        if (who === 'facilitator' && status === 'programada') {
          expect(seen.clasico).toMatchObject({ calendar: true, editRequest: true, editRequestDisabled: true, planning: true, readOnlyBand: false, panel: 1 });
        }
        if (who === 'facilitator' && status === 'en_progreso') expect(seen.clasico).toMatchObject({ markAll: true, save: true, finalize: false });
        if (who === 'leader' && status === 'completada') {
          expect(seen.clasico).toMatchObject({ calendar: false, editRequest: false, readOnlyBand: true, planning: false, save: false });
        }
      }
    });
  }
});
