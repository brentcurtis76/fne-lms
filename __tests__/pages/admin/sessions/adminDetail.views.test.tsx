// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: the two views of the admin's «Detalle de Sesión». The new look: the frame's
 * breadcrumb, a `PageHeader`, the actions and details in today's order and words, the series band,
 * the consultants and their editor, the hours panel; the two questions as the kit's `ConfirmDialog`
 * and the two cancel pop-ups as the kit's `Dialog` (opening, Escape, X, «Cerrar», «Cancelar», the focus
 * held and returned, nothing sent). Today's look: today's words, the browser's own questions, today's
 * hand-made pop-ups. Every person and session here is invented.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeConfirm, fakeFetch, requests, resetFakes, settle } from '../../../helpers/sessionsFakes';
import { DETAIL, adminDetail, detailScenario } from '../../../helpers/adminSessionsFakes';
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

const CRUMBS = [{ label: 'Sesiones', href: '/admin/sessions' }, { label: 'Detalle de Sesión' }];

async function draw(look: 'clasico' | 'nuevo', scenario: AdminScenario = detailScenario()) {
  cleanup();
  resetFakes(JSON.parse(JSON.stringify(scenario)));
  fakes.look = look;
  render(<AdminSessionDetailPage />);
  await settle();
}
const withStatus = (over: Record<string, unknown>) => detailScenario(adminDetail(over));
/** The labels of the actions row, in order. */
function actions() {
  const row = screen.getByTestId('admin-session-detail-nuevo').querySelector('.border-b.pb-6') as HTMLElement;
  return Array.from(row.querySelectorAll('a, button')).map((el) => el.textContent!.trim());
}
const writes = () => requests().filter((e: any) => typeof e?.fetch === 'string' && e.method !== 'GET');

/**
 * The hours panel's place in a view, after children drawn before it have appeared late (redesign 6S,
 * release SC, sixth send-back). A session that is not in a series is drawn first; then the address
 * names a session of a series, so the series band is added late, as the first child of the session's
 * box (drawn already, not drawn again); then the consultants' editor is opened. Through all of it the
 * panel stays where it is: the last element child of the element that holds it (today's view: the
 * frame around the session's box; the new view: the card's body) is the view's own place for it, an
 * element with no class and `display: contents` whose only child is the kept element, which holds only
 * the panel; every other element there comes before the panel in document order.
 */
async function hoursPanelAfterLateChildren(look: 'clasico' | 'nuevo') {
  cleanup();
  const s = detailScenario(adminDetail({ recurrence_group_id: null, session_number: null }));
  s.fetch!['GET /api/sessions/ses-2'] = {
    body: { data: { session: adminDetail({ id: 'ses-2', session_number: 2, join_path: '/meet/session/ses-2' }) } },
  };
  resetFakes(JSON.parse(JSON.stringify(s)));
  fakes.look = look;
  const { rerender } = render(<AdminSessionDetailPage />);
  await settle();
  const panelOf = () => document.querySelector('[data-marker="HoursComparisonPanel"]') as HTMLElement;
  const boxOf = () => panelOf().parentElement!.parentElement!.parentElement!;
  const box = boxOf();
  // The piece of the details drawn now, a child of the element that holds the panel (today's view: the
  // session's box; the new view: the details' grid).
  let sessionBox = screen.getByText('Modalidad') as HTMLElement;
  while (sessionBox.parentElement !== box) sessionBox = sessionBox.parentElement!;
  expect(screen.queryByText(/^Serie de sesiones/)).toBeNull();

  fakes.router.query.id = 'ses-2';
  rerender(<AdminSessionDetailPage />);
  await settle();
  expect(fakes.props.HoursComparisonPanel.sessionId).toBe('ses-2');
  // The same boxes, drawn before: the band was added late, not drawn with them.
  expect(boxOf()).toBe(box);
  expect(sessionBox.isConnected).toBe(true);
  const band = screen.getByText(/^Serie de sesiones — Sesión 2/);
  expect(box.contains(band)).toBe(true);
  expect(sessionBox.parentElement).toBe(box);

  fireEvent.click(button('Editar consultores'));
  await settle();
  const editor = screen.getByText('Consultores actuales');
  expect(box.contains(editor)).toBe(true);

  const panel = panelOf();
  const kept = panel.parentElement!;
  const place = kept.parentElement!;
  expect(boxOf()).toBe(box);
  expect(box.lastElementChild).toBe(place);
  expect(place.tagName).toBe('DIV');
  expect(place.getAttribute('class')).toBeNull();
  expect(place.style.display).toBe('contents');
  expect(Array.from(place.childNodes)).toEqual([kept]);
  expect(kept.getAttribute('class')).toBeNull();
  expect(kept.style.display).toBe('contents');
  expect(Array.from(kept.childNodes)).toEqual([panel]);
  for (const el of Array.from(box.querySelectorAll('*'))) {
    if (place.contains(el)) continue;
    expect(el.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  return box;
}
const button = (name: string) => screen.getAllByText(name).map((n) => n.closest('button') as HTMLButtonElement).filter(Boolean)[0];

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

describe('the new look', () => {
  it('the frame, the header; «Cargando sesión...» inside the frame before the session', async () => {
    const pending = detailScenario(undefined, { fetch: { [DETAIL]: 'pending' } });
    await draw('nuevo', pending);
    expect(screen.getByText('Cargando sesión...')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual(CRUMBS);
    await draw('nuevo');
    expect(fakes.props.MainLayout.breadcrumbs).toEqual(CRUMBS);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Detalle de Sesión');
    expect(screen.getAllByText('Sesión Inventada de Gestión del Cambio').length).toBeGreaterThanOrEqual(2);
  });

  it('the actions in today’s order, per status', async () => {
    await draw('nuevo');
    expect(actions()).toEqual(['Agregar al Calendario', 'Exportar Serie', 'Iniciar Sesión', 'Cancelar']);
    expect(screen.getByText('Agregar al Calendario').closest('a')!.getAttribute('href')).toBe('/api/sessions/ses-1/ical');
    expect(screen.getByText('Exportar Serie').closest('a')!.getAttribute('href')).toBe('/api/sessions/series/serie-1/ical');
    await draw('nuevo', withStatus({ status: 'pendiente_aprobacion' }));
    expect(actions()).toEqual(['Exportar Serie', 'Aprobar', 'Cancelar']);
    await draw('nuevo', withStatus({ status: 'borrador', recurrence_group_id: null }));
    expect(actions()).toEqual(['Aprobar', 'Cancelar']);
    await draw('nuevo', withStatus({ status: 'completada', recurrence_group_id: null }));
    expect(actions()).toEqual([]);
    await draw('nuevo', withStatus({ status: 'en_progreso', is_zoom_managed: true, recurrence_group_id: null }));
    expect(actions()).toEqual(['Agregar al Calendario', 'Ir a Zoom', 'Cancelar']);
    expect(screen.getByTestId('session-zoom-entry-button').getAttribute('href')).toBe('/meet/session/ses-1');
    expect(screen.getByTestId('session-join-link').textContent).toBe('Unirse a la reunión Zoom');
  });

  it('the details in today’s order and words', async () => {
    await draw('nuevo');
    const labels = Array.from(screen.getByTestId('admin-session-detail-nuevo').querySelectorAll('h3')).map((h) => h.textContent);
    expect(labels.slice(0, 8)).toEqual(['Título', 'Modalidad', 'Fecha', 'Horario', 'Ubicación', 'Enlace de reunión', 'Descripción', 'Objetivos']);
    expect(screen.getByText('(hora Chile)').parentElement!.textContent).toBe('09:00 - 10:30(hora Chile) (90 min)');
    expect(screen.getByTestId('session-join-link').getAttribute('href')).toBe('/meet/session/ses-1');
    expect(screen.getByTestId('session-join-link').textContent).toBe('Abrir reunión');
    expect(screen.getByText('Sala inventada 3')).toBeTruthy();
    await draw('nuevo', withStatus({ status: 'cancelada', cancellation_reason: 'Razón inventada', has_meeting: false }));
    expect(screen.getByText('Razón de cancelación')).toBeTruthy();
    expect(screen.getByText('Razón inventada')).toBeTruthy();
    expect(screen.queryByText('Editar consultores')).toBeNull();
  });

  it('the Zoom states of a managed session', async () => {
    await draw('nuevo', detailScenario(adminDetail({ is_zoom_managed: true }), { tables: { session_meetings_public: [{ meeting_status: 'ended' }] } }));
    expect(screen.getByRole('alert').textContent).toBe('La reunión terminó o fue cancelada. Cancela o reprograma la sesión.');
    expect(screen.getByText('Zoom no disponible')).toBeTruthy();
  });

  it('the series band and panel', async () => {
    await draw('nuevo');
    const toggle = screen.getByRole('button', { name: 'Ver todas las sesiones de la serie' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(/^Serie de sesiones — Sesión 1/).textContent).toBe('Serie de sesiones — Sesión 1');
    fireEvent.click(toggle);
    await settle();
    expect(screen.getByRole('button', { name: 'Ocultar sesiones de la serie' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/^Serie de sesiones — Sesión 1/).textContent).toBe('Serie de sesiones — Sesión 1 de 3');
    const region = screen.getByRole('region', { name: 'Sesiones de la serie' });
    expect(within(region).getByText('2 Programadas')).toBeTruthy();
    expect(within(region).getByText('1 Borrador')).toBeTruthy();
    expect(within(region).getByText('Actual')).toBeTruthy();
    expect(within(region).getAllByText(/^Sesión \d$/).map((n) => n.textContent)).toEqual(['Sesión 1', 'Sesión 2', 'Sesión 3']);
    expect(within(region).getAllByText('Ver')).toHaveLength(3);
    expect(within(region).getByText('Cancelar sesiones futuras')).toBeTruthy();
  });

  it('the empty series sentence', async () => {
    const s = detailScenario();
    s.fetch!['GET /api/sessions/series/serie-1'] = { body: { data: { sessions: [], stats: {}, total_sessions: 0 } } };
    await draw('nuevo', s);
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas las sesiones de la serie' }));
    await settle();
    expect(screen.getByText('No se encontraron sesiones en esta serie.')).toBeTruthy();
  });

  it('«Aprobar»: the kit’s question, focus on «Cancelar»; «Cancelar» and Escape close it; nothing sent', async () => {
    await draw('nuevo', withStatus({ status: 'pendiente_aprobacion' }));
    fireEvent.click(button('Aprobar'));
    await settle();
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('¿Está seguro que desea aprobar esta sesión?')).toBeTruthy();
    expect(document.activeElement!.textContent).toBe('Cancelar');
    expect(within(dialog).getByText('Confirmar')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Cancelar'));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button('Aprobar'));
    await settle();
    dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes()).toEqual([]);
    expect(requests().some((e: any) => e && typeof e === 'object' && 'confirm' in e)).toBe(false);
  });

  it('«Iniciar Sesión»: the kit’s question; Escape closes it; nothing sent', async () => {
    await draw('nuevo');
    fireEvent.click(screen.getByTestId('session-start-button'));
    await settle();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('¿Está seguro que desea iniciar esta sesión?')).toBeTruthy();
    expect(document.activeElement!.textContent).toBe('Cancelar');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes()).toEqual([]);
  });

  for (const [opener, title, confirmText, sentence] of [
    ['Cancelar', 'Cancelar Sesión', 'Confirmar Cancelación', 'Por favor, ingrese la razón de la cancelación:'],
    [
      'Cancelar sesiones futuras',
      'Cancelar Sesiones Futuras de la Serie',
      'Confirmar Cancelación de Serie',
      'Esto cancelará todas las sesiones futuras de esta serie que aún no estén completadas o canceladas. Por favor, ingrese la razón de la cancelación:',
    ],
  ]) {
    it(`«${opener}»: the kit’s pop-up with today’s words; Escape, X and «Cerrar» close it; the focus goes back; nothing sent`, async () => {
      await draw('nuevo');
      if (opener !== 'Cancelar') {
        fireEvent.click(screen.getByRole('button', { name: 'Ver todas las sesiones de la serie' }));
        await settle();
      }
      const open = async () => {
        const b = button(opener);
        b.focus();
        fireEvent.click(b);
        await settle();
        return { dialog: screen.getByRole('dialog'), b };
      };
      let { dialog, b } = await open();
      expect(within(dialog).getByRole('heading').textContent).toBe(title);
      expect(within(dialog).getByText(sentence)).toBeTruthy();
      const box = within(dialog).getByPlaceholderText('Razón de cancelación...');
      expect(document.activeElement).toBe(box);
      const yes = within(dialog).getByText(confirmText).closest('button')!;
      expect(yes.disabled).toBe(true);
      fireEvent.change(box, { target: { value: '   ' } });
      expect(yes.disabled).toBe(true);
      fireEvent.change(box, { target: { value: 'Motivo inventado' } });
      expect(yes.disabled).toBe(false);
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await settle();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(b);
      ({ dialog, b } = await open());
      fireEvent.click(within(dialog).getByLabelText('Cerrar', { selector: 'button[aria-label]' }));
      await settle();
      expect(screen.queryByRole('dialog')).toBeNull();
      ({ dialog, b } = await open());
      fireEvent.click(within(dialog).getByText('Cerrar'));
      await settle();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(b);
      expect(writes()).toEqual([]);
    });
  }

  it('the consultants, the editor and «Cancelar»', async () => {
    await draw('nuevo');
    expect(screen.getByText('Ana Inventada')).toBeTruthy();
    expect(screen.getByText('con-3')).toBeTruthy();
    expect(screen.getByText('Consultor principal')).toBeTruthy();
    expect(screen.getByText('consultor externo')).toBeTruthy();
    expect(screen.getByText('equipo interno')).toBeTruthy();
    fireEvent.click(button('Editar consultores'));
    await settle();
    expect(screen.getByText('Consultores actuales')).toBeTruthy();
    expect(screen.getAllByLabelText('Consultor principal')).toHaveLength(2);
    expect(screen.getAllByText('Quitar')).toHaveLength(2);
    const select = screen.getByLabelText('Añadir consultor') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.text)).toEqual([
      'Seleccionar consultor...',
      'Berta Ficticia (berta@example.invalid)',
    ]);
    fireEvent.click(screen.getAllByText('Quitar')[0].closest('button')!);
    fireEvent.click(screen.getAllByText('Quitar')[0].closest('button')!);
    await settle();
    expect(screen.getByText('No hay consultores añadidos')).toBeTruthy();
    expect(button('Guardar').disabled).toBe(true);
    // The editor's own «Cancelar» (the action row's comes first).
    fireEvent.click(screen.getAllByText('Cancelar').map((n) => n.closest('button')!).at(-1)!);
    await settle();
    expect(screen.queryByText('Consultores actuales')).toBeNull();
    expect(screen.getByText('Ana Inventada')).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it('«Cargando consultores...» while the list loads; «Sin consultores asignados»', async () => {
    const s = detailScenario(adminDetail({ facilitators: [] }));
    s.fetch!['GET /api/admin/consultants?school_id=1'] = 'pending';
    await draw('nuevo', s);
    expect(screen.getByText('Sin consultores asignados')).toBeTruthy();
    fireEvent.click(button('Editar consultores'));
    await settle();
    expect(screen.getByText('Cargando consultores...')).toBeTruthy();
  });

  it('the hours panel is drawn for this session', async () => {
    await draw('nuevo');
    expect(fakes.props.HoursComparisonPanel.sessionId).toBe('ses-1');
    expect(fakes.mounts.HoursComparisonPanel).toBe(1);
  });

  it('the hours panel stays its card’s last piece after the series band and the consultants’ editor appear late', async () => {
    const box = await hoursPanelAfterLateChildren('nuevo');
    expect(box.closest('[data-testid="admin-session-detail-nuevo"]')).not.toBeNull();
  });
});

describe('today’s look', () => {
  it('today’s words, no breadcrumb, the browser’s own question', async () => {
    await draw('clasico', withStatus({ status: 'pendiente_aprobacion' }));
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([]);
    expect(document.querySelector('[data-testid="admin-session-detail-nuevo"]')).toBeNull();
    expect(screen.getAllByText('Detalle de Sesión').length).toBeGreaterThan(0);
    expect(screen.getByText('Enlace de reunión')).toBeTruthy();
    fakes.scenario!.confirm = false;
    fireEvent.click(button('Aprobar'));
    await settle();
    expect(requests().filter((e: any) => e && typeof e === 'object' && 'confirm' in e)).toEqual([{ confirm: ['¿Está seguro que desea aprobar esta sesión?'] }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('today’s hand-made pop-up; Escape closes it (today’s rule)', async () => {
    await draw('clasico');
    fireEvent.click(button('Cancelar'));
    await settle();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('cancel-modal-title');
    expect(within(dialog).getByText('Cancelar Sesión').id).toBe('cancel-modal-title');
    expect(within(dialog).queryByLabelText('Cerrar', { selector: 'button[aria-label]' })).toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the hours panel stays right after the session’s box, its frame’s last piece, after the series band and the consultants’ editor appear late', async () => {
    const frame = await hoursPanelAfterLateChildren('clasico');
    expect(frame.className).toBe('container mx-auto px-4 sm:px-6 lg:px-8 py-6');
    // The frame holds the session's box, then the panel's place: nothing else, in today's order.
    expect(frame.children.length).toBe(2);
    const sessionBox = frame.firstElementChild!;
    expect(sessionBox.className).toBe('bg-white rounded-lg shadow-lg p-6');
    // The band is the session's box's first child, as today; the panel is not inside that box.
    expect(sessionBox.firstElementChild!.textContent).toMatch(/^Serie de sesiones — Sesión 2/);
    expect(sessionBox.querySelector('[data-marker="HoursComparisonPanel"]')).toBeNull();
    // Today's pop-up, opened late, comes after the panel, as today.
    fireEvent.click(button('Cancelar'));
    await settle();
    const panel = document.querySelector('[data-marker="HoursComparisonPanel"]')!;
    expect(panel.compareDocumentPosition(screen.getByRole('dialog')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(frame.lastElementChild!.contains(panel)).toBe(true);
  });
});
