// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F15e (GES-2.18, E1-screen): the admin's ticket window lets the admin choose,
 * each time, between an internal note (inserted from the browser, as before,
 * not marked for the reporter) and a reply (sent to /api/feedback/reply, which
 * marks it for the reporter). The list labels every comment. Synthetic data.
 */

const { db, toastMock } = vi.hoisted(() => {
  const db: {
    activities: any[];
    inserts: any[];
    insertError: unknown;
    loads: number;
  } = { activities: [], inserts: [], insertError: null, loads: 0 };
  const toastMock = { success: vi.fn(), error: vi.fn() };
  return { db, toastMock };
});

vi.mock('@supabase/auth-helpers-react', () => {
  const client: any = {
    auth: { getUser: async () => ({ data: { user: { id: ADMIN_ID } } }) },
    from() {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => {
        db.loads += 1;
        return Promise.resolve({ data: db.activities, error: null });
      };
      chain.insert = (payload: any) => {
        db.inserts.push(payload);
        return Promise.resolve({ error: db.insertError });
      };
      return chain;
    },
  };
  return { useSupabaseClient: () => client };
});
vi.mock('react-hot-toast', () => ({ toast: toastMock }));

import FeedbackDetail from '../../../components/feedback/FeedbackDetail';

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REPORTER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FEEDBACK_ID = '12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function ticket() {
  return {
    id: FEEDBACK_ID,
    type: 'bug',
    status: 'seen',
    description: 'Ticket sintético',
    page_url: 'https://genera.example/dashboard',
    created_at: '2026-11-17T12:00:00Z',
    created_by: REPORTER_ID,
    browser_info: null,
    profiles: { first_name: 'Persona', last_name: 'Sintética', email: 'persona@test.local', avatar_url: null },
  };
}

function row(id: string, over: Record<string, unknown>) {
  return {
    id,
    feedback_id: FEEDBACK_ID,
    message: `Mensaje ${id}`,
    is_system_message: false,
    visible_to_reporter: false,
    created_at: '2026-11-17T13:00:00Z',
    created_by: ADMIN_ID,
    profiles: { first_name: 'Admin', last_name: 'Sintético', email: 'admin@test.local' },
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db.activities = [];
  db.inserts = [];
  db.insertError = null;
  db.loads = 0;
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function open() {
  return render(
    <FeedbackDetail feedback={ticket()} isOpen onClose={vi.fn()} onStatusUpdate={vi.fn()} onRefresh={vi.fn()} />
  );
}

const noteRadio = () => screen.getByRole('radio', { name: 'Nota interna' });
const replyRadio = () => screen.getByRole('radio', { name: 'Responder al usuario' });
const box = () => screen.getByPlaceholderText('Agregar comentario...') as HTMLInputElement;
const send = () => screen.getByTestId('send-comment-button');

function type(text: string) {
  fireEvent.change(box(), { target: { value: text } });
}

describe('FeedbackDetail — the choice between a note and a reply', () => {
  it('(1)(4)(6) offers «Nota interna» and «Responder al usuario», starts on the note, help line and button follow the choice', async () => {
    open();
    await waitFor(() => expect(db.loads).toBe(1));
    expect(noteRadio()).toBeChecked();
    expect(replyRadio()).not.toBeChecked();
    expect(screen.getByText('Solo la ven los administradores.')).toBeInTheDocument();
    expect(send()).toHaveTextContent('Guardar nota');
    expect(screen.getByRole('button', { name: 'Guardar nota' })).toBe(send());

    fireEvent.click(replyRadio());
    expect(replyRadio()).toBeChecked();
    expect(noteRadio()).not.toBeChecked();
    expect(screen.getByText('La persona que reportó la verá en «Mis reportes».')).toBeInTheDocument();
    expect(screen.queryByText('Solo la ven los administradores.')).toBeNull();
    expect(send()).toHaveTextContent('Enviar respuesta');
    expect(screen.getByRole('button', { name: 'Enviar respuesta' })).toBe(send());
  });

  it('(2) a note is inserted from the browser as today, not marked, and the toast says «Nota interna guardada»', async () => {
    open();
    await waitFor(() => expect(db.loads).toBe(1));
    type('  Revisar con el equipo  ');
    fireEvent.click(send());
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Nota interna guardada'));
    expect(db.inserts).toEqual([
      { feedback_id: FEEDBACK_ID, message: 'Revisar con el equipo', created_by: ADMIN_ID, is_system_message: false },
    ]);
    expect(db.inserts[0]).not.toHaveProperty('visible_to_reporter');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(box().value).toBe('');
    expect(noteRadio()).toBeChecked();
  });

  it('(3) a reply is one POST to /api/feedback/reply, nothing inserted from the browser; on 200 the toast, the box empties, the list reloads, the choice returns to the note', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, activity: row('r1', { visible_to_reporter: true }) }),
    });
    open();
    await waitFor(() => expect(db.loads).toBe(1));
    fireEvent.click(replyRadio());
    type('  Ya está resuelto, gracias.  ');
    fireEvent.click(send());
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Respuesta enviada al usuario'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/feedback/reply');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ feedback_id: FEEDBACK_ID, message: 'Ya está resuelto, gracias.' });
    expect(db.inserts).toHaveLength(0);
    expect(box().value).toBe('');
    await waitFor(() => expect(db.loads).toBe(2));
    expect(noteRadio()).toBeChecked();
    expect(send()).toHaveTextContent('Guardar nota');
  });

  it('(3) on an error answer the toast shows the route\'s sentence, the text stays and the choice stays on the reply', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'No se pudo guardar la respuesta' }),
    });
    open();
    await waitFor(() => expect(db.loads).toBe(1));
    fireEvent.click(replyRadio());
    type('Respuesta que falla');
    fireEvent.click(send());
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo guardar la respuesta'));
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(box().value).toBe('Respuesta que falla');
    expect(replyRadio()).toBeChecked();
    expect(db.inserts).toHaveLength(0);
    expect(db.loads).toBe(1);
  });
});

describe('FeedbackDetail — the label of every comment', () => {
  it('(5) reply, internal note and the reporter\'s own comment each carry their label; a system line carries none', async () => {
    db.activities = [
      row('a1', { message: 'Respuesta para la persona', visible_to_reporter: true }),
      row('a2', { message: 'Nota entre administradores', visible_to_reporter: false }),
      row('a3', {
        message: 'Comentario de quien reportó',
        created_by: REPORTER_ID,
        visible_to_reporter: false,
        profiles: { first_name: 'Persona', last_name: 'Sintética', email: 'persona@test.local' },
      }),
      row('a4', { message: 'Comentario de quien reportó, marcado', created_by: REPORTER_ID, visible_to_reporter: true }),
      row('a5', { message: 'Estado cambiado de new a seen', is_system_message: true, created_by: REPORTER_ID }),
    ];
    open();
    const card = async (text: string) => {
      const p = await screen.findByText(text);
      // The comment's card (a system line is its centred line).
      return p.closest('div.shadow-sm, div.text-center') as HTMLElement;
    };

    const reply = await card('Respuesta para la persona');
    expect(within(reply).getByText('Respuesta al usuario')).toBeInTheDocument();
    expect(within(reply).queryByText('Nota interna')).toBeNull();
    expect(within(reply).queryByText('Comentario del usuario')).toBeNull();

    const note = await card('Nota entre administradores');
    expect(within(note).getByText('Nota interna')).toBeInTheDocument();
    expect(within(note).queryByText('Respuesta al usuario')).toBeNull();

    for (const text of ['Comentario de quien reportó', 'Comentario de quien reportó, marcado']) {
      const own = await card(text);
      expect(within(own).getByText('Comentario del usuario')).toBeInTheDocument();
      expect(within(own).queryByText('Nota interna')).toBeNull();
      expect(within(own).queryByText('Respuesta al usuario')).toBeNull();
    }

    const system = await card('Estado cambiado de new a seen');
    for (const label of ['Nota interna', 'Respuesta al usuario', 'Comentario del usuario']) {
      expect(within(system).queryByText(label)).toBeNull();
    }
  });
});
