// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: the admin's «Detalle de Sesión» asks the same things and moves the browser
 * the same way in both looks. Each case draws the page in today's look and in the new look on the same
 * invented data, does the same thing through each view's own controls, and compares what reached the
 * server or moved the browser (`auth.*`, the role helper, the Zoom status read, every `fetch` with its
 * method, headers and body, every router move, every toast). The browser's question of today's look
 * is the kit's question in the new look: today's log has the `confirm()` call, the new one has none,
 * and everything else is the same. Every person and session here is invented.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeConfirm, fakeFetch, requests, resetFakes, settle } from '../../../helpers/sessionsFakes';
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

type Look = 'clasico' | 'nuevo';

async function draw(scenario: AdminScenario, look: Look) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = look;
  render(<AdminSessionDetailPage />);
  await settle();
}
async function both(scenario: AdminScenario, steps: (look: Look) => Promise<void> = async () => {}) {
  const out: Record<Look, unknown[]> = { clasico: [], nuevo: [] };
  for (const look of ['clasico', 'nuevo'] as Look[]) {
    await draw(scenario, look);
    await steps(look);
    out[look] = requests();
  }
  return out;
}
const isConfirm = (e: unknown) => e !== null && typeof e === 'object' && 'confirm' in (e as object);
const noConfirm = (entries: unknown[]) => entries.filter((e) => !isConfirm(e));
const button = (name: string) => screen.getAllByText(name).map((n) => n.closest('button') as HTMLButtonElement).filter(Boolean)[0];

/** Answers today's browser question or the new look's window with «yes» (or «no»). */
async function answer(look: Look, yes: boolean) {
  if (look === 'nuevo') {
    const dialog = screen.getByRole('dialog');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === (yes ? 'Confirmar' : 'Cancelar'))!);
  }
  await settle();
}

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

describe('arriving: the same calls and redirects', () => {
  const cases: [string, AdminScenario][] = [
    ['a scheduled session of a series', detailScenario()],
    ['a Zoom-managed session (the status read)', detailScenario(adminDetail({ is_zoom_managed: true, status: 'en_progreso' }))],
    ['a consultor (→ /dashboard)', detailScenario(undefined, { role: 'consultor' })],
    ['nobody signed in (→ /login)', detailScenario(undefined, { session: null })],
    ['a session that does not load (the toast)', detailScenario(undefined, { fetch: {} })],
  ];
  for (const [name, scenario] of cases) {
    it(name, async () => {
      const out = await both(scenario);
      expect(out.nuevo).toEqual(out.clasico);
      expect(out.clasico.length).toBeGreaterThan(0);
    });
  }
});

describe('the two questions: the same calls after «yes», none after «no»', () => {
  for (const yes of [true, false]) {
    it(`«Aprobar» answered ${yes ? 'yes' : 'no'}`, async () => {
      const out = await both(detailScenario(adminDetail({ status: 'pendiente_aprobacion' }), { confirm: yes }), async (look) => {
        fireEvent.click(button('Aprobar'));
        await answer(look, yes);
      });
      expect(out.nuevo).toEqual(noConfirm(out.clasico));
      expect(out.clasico.filter(isConfirm)).toEqual([{ confirm: ['¿Está seguro que desea aprobar esta sesión?'] }]);
      expect(out.clasico.some((e: any) => e?.fetch === '/api/sessions/ses-1/approve')).toBe(yes);
    });

    it(`«Iniciar Sesión» answered ${yes ? 'yes' : 'no'}`, async () => {
      const out = await both(detailScenario(undefined, { confirm: yes }), async (look) => {
        fireEvent.click(screen.getByTestId('session-start-button'));
        await answer(look, yes);
      });
      expect(out.nuevo).toEqual(noConfirm(out.clasico));
      expect(out.clasico.filter(isConfirm)).toEqual([{ confirm: ['¿Está seguro que desea iniciar esta sesión?'] }]);
      expect(out.clasico).toEqual(
        yes
          ? expect.arrayContaining([
              expect.objectContaining({ fetch: '/api/sessions/ses-1', method: 'PUT', body: JSON.stringify({ status: 'en_progreso' }) }),
              { 'toast.success': ['Sesión iniciada exitosamente'] },
            ])
          : expect.not.arrayContaining([expect.objectContaining({ method: 'PUT' })])
      );
    });
  }
});

describe('doing things: the same requests', () => {
  it('«Cancelar», a reason, «Confirmar Cancelación»', async () => {
    const out = await both(detailScenario(), async () => {
      fireEvent.click(button('Cancelar'));
      await settle();
      fireEvent.change(screen.getByPlaceholderText('Razón de cancelación...'), { target: { value: '  Motivo inventado  ' } });
      fireEvent.click(button('Confirmar Cancelación'));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual(expect.objectContaining({ fetch: '/api/sessions/ses-1/cancel', body: JSON.stringify({ cancellation_reason: 'Motivo inventado' }) }));
  });

  it('the series: open it, «Ver» on another session, «Cancelar sesiones futuras»', async () => {
    const out = await both(detailScenario(), async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ver todas las sesiones de la serie' }));
      await settle();
      fireEvent.click(screen.getAllByText('Ver').map((n) => n.closest('button')!)[1]);
      await settle();
      fireEvent.click(button('Cancelar sesiones futuras'));
      await settle();
      fireEvent.change(screen.getByPlaceholderText('Razón de cancelación...'), { target: { value: 'Serie inventada' } });
      fireEvent.click(button('Confirmar Cancelación de Serie'));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual({ 'router.push': ['/admin/sessions/ses-2'] });
    expect(out.clasico).toContainEqual(
      expect.objectContaining({ fetch: '/api/sessions/series/serie-1/cancel', body: JSON.stringify({ cancellation_reason: 'Serie inventada', scope: 'all_future' }) })
    );
    expect(out.clasico).toContainEqual({ 'toast.success': ['2 sesiones canceladas exitosamente'] });
  });

  it('«Editar consultores»: add one, tick the lead, remove one, «Guardar»', async () => {
    const out = await both(detailScenario(), async () => {
      fireEvent.click(button('Editar consultores'));
      await settle();
      const select = Array.from(document.querySelectorAll('select')).find((s) => s.textContent!.includes('Seleccionar consultor...'))!;
      fireEvent.change(select, { target: { value: 'con-2' } });
      await settle();
      const leads = screen.getAllByLabelText('Consultor principal');
      fireEvent.click(leads[2]);
      fireEvent.click(screen.getAllByText('Quitar').map((n) => n.closest('button')!)[1]);
      await settle();
      fireEvent.click(button('Guardar'));
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
    expect(out.clasico).toContainEqual(expect.objectContaining({ fetch: '/api/admin/consultants?school_id=1', method: 'GET' }));
    expect(out.clasico).toContainEqual(
      expect.objectContaining({
        fetch: '/api/sessions/ses-1/facilitators',
        method: 'PUT',
        body: JSON.stringify({
          facilitators: [
            { user_id: 'con-1', facilitator_role: 'consultor_externo', is_lead: true },
            { user_id: 'con-2', facilitator_role: 'consultor_externo', is_lead: true },
          ],
        }),
      })
    );
  });

  it('signing out from the frame', async () => {
    const out = await both(detailScenario(), async () => {
      await fakes.props.MainLayout.onLogout();
      await settle();
    });
    expect(out.nuevo).toEqual(out.clasico);
  });
});
