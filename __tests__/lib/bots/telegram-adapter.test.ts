// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramAdapter } from '../../../lib/bots/telegram-adapter';
import {
  makeTextUpdate,
  makePhotoUpdate,
  makeDocumentUpdate,
  makeCallbackUpdate,
  makeEditedMessageUpdate
} from '../../helpers/telegramFixtures';

describe('TelegramAdapter.parseUpdate', () => {
  const adapter = new TelegramAdapter('test-token');

  it('parses a private text message', () => {
    const parsed = adapter.parseUpdate(makeTextUpdate('hola', { updateId: 1 }));
    expect(parsed).toMatchObject({
      kind: 'text',
      platform: 'telegram',
      chatId: '555001',
      platformUserId: '555001',
      updateId: 1,
      text: 'hola',
      firstName: 'Brent'
    });
  });

  it('picks the largest photo size', () => {
    const parsed = adapter.parseUpdate(makePhotoUpdate({ caption: 'almuerzo' }));
    expect(parsed?.kind).toBe('file');
    if (parsed?.kind === 'file') {
      expect(parsed.file.fileRef).toBe('big');
      expect(parsed.file.mime).toBe('image/jpeg');
      expect(parsed.caption).toBe('almuerzo');
    }
  });

  it('parses a PDF document with its mime and name', () => {
    const parsed = adapter.parseUpdate(makeDocumentUpdate('application/pdf'));
    expect(parsed?.kind).toBe('file');
    if (parsed?.kind === 'file') {
      expect(parsed.file.mime).toBe('application/pdf');
      expect(parsed.file.fileName).toBe('factura.pdf');
    }
  });

  it('parses callback queries with data and messageRef', () => {
    const parsed = adapter.parseUpdate(makeCallbackUpdate('ok:abc', { messageId: 42 }));
    expect(parsed).toMatchObject({ kind: 'callback', data: 'ok:abc', messageRef: '42' });
  });

  it('ignores group chats', () => {
    expect(adapter.parseUpdate(makeTextUpdate('hola', { chatType: 'group' }))).toBeNull();
    expect(adapter.parseUpdate(makePhotoUpdate({ chatType: 'supergroup' }))).toBeNull();
  });

  it('ignores edited messages, bots, junk and unsupported content', () => {
    expect(adapter.parseUpdate(makeEditedMessageUpdate())).toBeNull();
    expect(adapter.parseUpdate(null)).toBeNull();
    expect(adapter.parseUpdate({})).toBeNull();
    expect(adapter.parseUpdate({ update_id: 9 })).toBeNull();
    const sticker = {
      update_id: 10,
      message: {
        message_id: 5,
        from: { id: 1, is_bot: false },
        chat: { id: 1, type: 'private' },
        sticker: { file_id: 'x' }
      }
    };
    expect(adapter.parseUpdate(sticker)).toBeNull();
    const fromBot = makeTextUpdate('hola');
    (fromBot.message.from as { is_bot: boolean }).is_bot = true;
    expect(adapter.parseUpdate(fromBot)).toBeNull();
  });
});

describe('TelegramAdapter outbound', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends inline keyboards and returns the message ref', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 99 } })
    });
    const adapter = new TelegramAdapter('tok');
    const result = await adapter.sendMessage('123', 'hola', [[{ label: 'Sí', data: 'ok:x' }]]);
    expect(result.messageRef).toBe('99');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottok/sendMessage');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: 'Sí', callback_data: 'ok:x' });
  });

  it('rejects callback_data longer than 64 bytes', async () => {
    const adapter = new TelegramAdapter('tok');
    await expect(
      adapter.sendMessage('123', 'hola', [[{ label: 'X', data: 'y'.repeat(65) }]])
    ).rejects.toThrow(/64 bytes/);
  });

  it('explicitly clears the inline keyboard on text-only edits', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: true }) });
    const adapter = new TelegramAdapter('tok');
    await adapter.editMessage('123', '77', 'final');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.reply_markup).toEqual({ inline_keyboard: [] });
  });

  it('falls back to sendMessage when editMessage fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, description: 'message to edit not found' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_id: 100 } }) });
    const adapter = new TelegramAdapter('tok');
    await adapter.editMessage('123', '77', 'nuevo texto');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('sendMessage');
  });
});
