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
