// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The message box of an Espacio conversation (GENERA fixes F11).
 * EC-S5: a mention of a member whose name has accents, hyphens or dots is
 * recognised when the message is sent. Synthetic people only.
 */

import MessageComposer from '../../../components/messaging/MessageComposer';

const MARIA = { id: 'user-a2', display_name: 'María-José Núñez', avatar_url: null };
const JOTA = { id: 'user-a3', display_name: 'J. Pérez', avatar_url: null };

function setup(extra: Partial<React.ComponentProps<typeof MessageComposer>> = {}) {
  const onSendMessage = vi.fn(async () => undefined);
  const onRequestMentions = vi.fn();
  const utils = render(
    <MessageComposer
      threadId="thread-1"
      workspaceId="ws-1"
      onSendMessage={onSendMessage}
      onRequestMentions={onRequestMentions}
      mentionSuggestions={[MARIA, JOTA]}
      {...extra}
    />
  );
  const textarea = utils.container.querySelector('textarea') as HTMLTextAreaElement;
  const type = (value: string) => {
    fireEvent.change(textarea, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
  };
  return { ...utils, textarea, type, onSendMessage, onRequestMentions };
}

// jsdom has no scrollIntoView; the mention picker scrolls its selected row into view.
Element.prototype.scrollIntoView = function scrollIntoView() {};

afterEach(() => vi.restoreAllMocks());

describe('EC-S5 mentions of names with accents, hyphens and dots', () => {
  it('sends the ids of «María-José Núñez» and «J. Pérez» when they are mentioned', async () => {
    const { textarea, type, onSendMessage, container } = setup();

    type('Hola @Mar');
    fireEvent.click(screen.getByText('María-José Núñez'));
    expect(textarea.value).toBe('Hola @María-José_Núñez ');

    type('Hola @María-José_Núñez. Y @J');
    fireEvent.click(screen.getByText('J. Pérez'));
    type(`${textarea.value}, ¿vienen?`);

    const send = container.querySelector('button.absolute.bottom-3') as HTMLButtonElement;
    fireEvent.click(send);
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(onSendMessage.mock.calls[0][0]).toMatchObject({
      content: 'Hola @María-José_Núñez. Y @J._Pérez , ¿vienen?',
      mentions: ['user-a2', 'user-a3'],
    });
  });

  it('asks for mention suggestions while a name with accents is being typed', () => {
    const { type, onRequestMentions } = setup();
    type('Hola @Marí');
    expect(onRequestMentions).toHaveBeenLastCalledWith('Marí');
  });
});

describe('EC-M2 Enter in the message box', () => {
  it('Enter sends the message', async () => {
    const { textarea, type, onSendMessage } = setup({ mentionSuggestions: [] });
    type('Hola a todos');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect(onSendMessage.mock.calls[0][0]).toMatchObject({ content: 'Hola a todos', thread_id: 'thread-1' });
    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('Shift+Enter does not send (it makes a new line)', () => {
    const { textarea, type, onSendMessage } = setup({ mentionSuggestions: [] });
    type('Hola');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('Enter on an empty box sends nothing', () => {
    const { textarea, type, onSendMessage } = setup({ mentionSuggestions: [] });
    type('   ');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('Enter with only an attachment sends it', async () => {
    const { textarea, container, onSendMessage } = setup({ mentionSuggestions: [] });
    const file = new File(['%PDF-1.4'], 'acta.pdf', { type: 'application/pdf' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    expect((onSendMessage.mock.calls[0][0] as any).attachments).toEqual([file]);
  });

  it('a second Enter while the message is being sent does not send it twice', async () => {
    let release: () => void = () => undefined;
    const onSendMessage = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const { textarea, type } = setup({ mentionSuggestions: [], onSendMessage });
    type('Hola');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(textarea, { key: 'Enter' });
    release();
    await waitFor(() => expect(textarea.value).toBe(''));
    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it('Enter while the mention list is open chooses the mention and does not send', () => {
    const { textarea, type, onSendMessage } = setup();
    type('Hola @Mar');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(textarea.value).toBe('Hola @María-José_Núñez ');
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

describe('send-back 1 (8) a mention needs a boundary before the @', () => {
  const EQUIPO = { id: 'user-eq', display_name: 'equipo.cl', avatar_url: null };
  const MJ = { id: 'user-mj', display_name: 'María-José.Núñez', avatar_url: null };
  const ANA = { id: 'user-ana', display_name: 'ana', avatar_url: null };

  async function sendNow(container: HTMLElement, onSendMessage: ReturnType<typeof vi.fn>) {
    fireEvent.click(container.querySelector('button.absolute.bottom-3') as HTMLButtonElement);
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    return onSendMessage.mock.calls[0][0] as { content: string; mentions: string[] };
  }

  it('«contacto@equipo.cl» mentions nobody, even after the member was chosen and the mention replaced', async () => {
    const { textarea, type, onSendMessage, container } = setup({ mentionSuggestions: [EQUIPO] });
    type('Escribe a @equ');
    fireEvent.click(screen.getByText('equipo.cl'));
    expect(textarea.value).toBe('Escribe a @equipo.cl ');
    type('Escribe a contacto@equipo.cl');
    const sent = await sendNow(container, onSendMessage);
    expect(sent.content).toBe('Escribe a contacto@equipo.cl');
    expect(sent.mentions).toEqual([]);
  });

  it('«hola @María-José.Núñez, …» mentions her', async () => {
    const { textarea, type, onSendMessage, container } = setup({ mentionSuggestions: [MJ] });
    type('hola @Mar');
    fireEvent.click(screen.getByText('María-José.Núñez'));
    expect(textarea.value).toBe('hola @María-José.Núñez ');
    type('hola @María-José.Núñez, ¿vienes?');
    expect((await sendNow(container, onSendMessage)).mentions).toEqual(['user-mj']);
  });

  it('«(@ana)» mentions ana', async () => {
    const { textarea, type, onSendMessage, container } = setup({ mentionSuggestions: [ANA] });
    type('(@an');
    fireEvent.click(screen.getByText('ana'));
    expect(textarea.value).toBe('(@ana ');
    type('(@ana)');
    expect((await sendNow(container, onSendMessage)).mentions).toEqual(['user-ana']);
  });

  it('typing an address does not open the mention list', () => {
    const { type, onRequestMentions } = setup({ mentionSuggestions: [EQUIPO] });
    type('contacto@equ');
    expect(onRequestMentions).not.toHaveBeenCalled();
    type('contacto @equ');
    expect(onRequestMentions).toHaveBeenLastCalledWith('equ');
  });
});

// ---------------------------------------------------------------------------
// F18f EC-M8: a send or an edit that fails keeps everything typed and chosen;
// the page has already told the person, so the box shows no alert of its own
// ---------------------------------------------------------------------------

describe('F18f EC-M8 a failed send or edit keeps what was typed', () => {
  const PARENT = { id: 'msg-parent', author_name: 'Ana Uno', content: 'Mensaje al que se responde, con texto suficiente' } as any;

  it('a send that fails keeps the text, the chosen file and the reply target, with no second alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSendMessage = vi.fn(async () => { throw new Error('insert failed'); });
    const onCancelReply = vi.fn();
    const { textarea, type, container } = setup({
      mentionSuggestions: [], onSendMessage, replyToMessage: PARENT, onCancelReply,
    });
    const file = new File(['%PDF-1.4'], 'acta.pdf', { type: 'application/pdf' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    type('Mi respuesta larga');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.querySelector('button.absolute.bottom-3 svg.animate-spin')).toBeNull());

    expect(textarea.value).toBe('Mi respuesta larga');
    expect(screen.getByText('acta.pdf')).toBeTruthy();
    expect(screen.getByText('Ana Uno')).toBeTruthy();
    expect(onCancelReply).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('an edit that fails stays in edit mode with the edited text', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSaveEdit = vi.fn(async () => { throw new Error('update failed'); });
    const onCancelEdit = vi.fn();
    const editing = { id: 'msg-own', author_name: 'Admin', content: 'Texto original' } as any;
    const { textarea, type } = setup({ mentionSuggestions: [], editingMessage: editing, onSaveEdit, onCancelEdit });
    expect(textarea.value).toBe('Texto original');
    type('Texto corregido');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(onSaveEdit).toHaveBeenCalledTimes(1));
    expect(onSaveEdit).toHaveBeenCalledWith('msg-own', 'Texto corregido');
    await waitFor(() => expect(textarea.disabled).toBe(false));

    expect(textarea.value).toBe('Texto corregido');
    expect(screen.getByText('Editando mensaje')).toBeTruthy();
    expect(onCancelEdit).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// F18f EC-M9: when the send handler resolves with files (attachments that were
// not attached), the text is cleared and exactly those files stay in the box
// ---------------------------------------------------------------------------

describe('F18f EC-M9 failed attachments stay in the box', () => {
  it('clears the text and the reply target, keeps exactly the files handed back', async () => {
    const ok = new File(['%PDF-1.4'], 'primero.pdf', { type: 'application/pdf' });
    const failed = new File(['%PDF-1.4'], 'segundo.pdf', { type: 'application/pdf' });
    const onSendMessage = vi.fn(async () => [failed]);
    const onCancelReply = vi.fn();
    const { textarea, type, container } = setup({
      mentionSuggestions: [], onSendMessage: onSendMessage as any, onCancelReply,
      replyToMessage: { id: 'msg-parent', author_name: 'Ana Uno', content: 'Mensaje al que se responde' } as any,
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [ok, failed] } });
    type('Con dos adjuntos');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(textarea.value).toBe(''));

    expect(onCancelReply).toHaveBeenCalled();
    expect(screen.queryByText('primero.pdf')).toBeNull();
    expect(screen.getByText('segundo.pdf')).toBeTruthy();
  });
});
