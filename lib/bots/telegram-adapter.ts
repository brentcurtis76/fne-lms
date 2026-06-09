import { ChannelAdapter, InboundMessage, Keyboard } from './types';

interface TelegramPhotoSize {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string; is_bot?: boolean };
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: { file_id: string; mime_type?: string; file_name?: string; file_size?: number };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string };
    message?: { message_id: number; chat: { id: number; type: string } };
    data?: string;
  };
}

export class TelegramAdapter implements ChannelAdapter {
  private readonly token: string;

  constructor(token: string = process.env.TELEGRAM_BOT_TOKEN || '') {
    this.token = token;
  }

  parseUpdate(body: unknown): InboundMessage | null {
    if (!body || typeof body !== 'object') return null;
    const update = body as TelegramUpdate;
    if (typeof update.update_id !== 'number') return null;

    if (update.callback_query) {
      const cb = update.callback_query;
      const chat = cb.message?.chat;
      if (!chat || chat.type !== 'private' || !cb.data) return null;
      return {
        kind: 'callback',
        platform: 'telegram',
        chatId: String(chat.id),
        platformUserId: String(cb.from.id),
        updateId: update.update_id,
        firstName: cb.from.first_name,
        callbackId: cb.id,
        data: cb.data,
        messageRef: cb.message ? String(cb.message.message_id) : undefined
      };
    }

    // Edited messages, channel posts, member updates, etc. are ignored.
    const message = update.message;
    if (!message || message.chat.type !== 'private' || !message.from || message.from.is_bot) {
      return null;
    }

    const base = {
      platform: 'telegram' as const,
      chatId: String(message.chat.id),
      platformUserId: String(message.from.id),
      updateId: update.update_id,
      firstName: message.from.first_name
    };

    if (message.photo && message.photo.length > 0) {
      // Telegram sends multiple sizes; the last entry is the largest.
      const largest = message.photo.reduce((a, b) =>
        (b.width * b.height > a.width * a.height ? b : a)
      );
      return {
        kind: 'file',
        ...base,
        file: {
          fileRef: largest.file_id,
          mime: 'image/jpeg',
          sizeBytes: largest.file_size
        },
        caption: message.caption
      };
    }

    if (message.document) {
      return {
        kind: 'file',
        ...base,
        file: {
          fileRef: message.document.file_id,
          mime: message.document.mime_type || 'application/octet-stream',
          fileName: message.document.file_name,
          sizeBytes: message.document.file_size
        },
        caption: message.caption
      };
    }

    if (typeof message.text === 'string') {
      return { kind: 'text', ...base, text: message.text };
    }

    return null; // stickers, voice, location, ...
  }

  async sendMessage(chatId: string, text: string, keyboard?: Keyboard): Promise<{ messageRef: string }> {
    const result = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      ...(keyboard ? { reply_markup: { inline_keyboard: toInlineKeyboard(keyboard) } } : {})
    });
    return { messageRef: String(result.message_id) };
  }

  async editMessage(chatId: string, messageRef: string, text: string, keyboard?: Keyboard): Promise<void> {
    try {
      // Always send reply_markup: a text-only edit must explicitly clear the
      // old inline keyboard so stale buttons can't be tapped.
      await this.call('editMessageText', {
        chat_id: chatId,
        message_id: Number(messageRef),
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard ? toInlineKeyboard(keyboard) : [] }
      });
    } catch (error) {
      // "message is not modified" and similar edit failures are not fatal —
      // fall back to sending a fresh message so the user is never left hanging.
      console.error('[Bot] editMessage failed, sending new message instead:', error);
      await this.sendMessage(chatId, text, keyboard);
    }
  }

  async ackCallback(callbackId: string, text?: string): Promise<void> {
    try {
      await this.call('answerCallbackQuery', {
        callback_query_id: callbackId,
        ...(text ? { text } : {})
      });
    } catch (error) {
      // Expired callback ids (user tapped an old button) are routine.
      console.error('[Bot] answerCallbackQuery failed:', error);
    }
  }

  async sendTyping(chatId: string): Promise<void> {
    try {
      await this.call('sendChatAction', { chat_id: chatId, action: 'typing' });
    } catch {
      // Cosmetic only.
    }
  }

  async downloadFile(fileRef: string): Promise<{ buffer: Buffer; mime: string; fileName?: string }> {
    const file = await this.call<{ file_path?: string }>('getFile', { file_id: fileRef });
    if (!file.file_path) {
      throw new Error('Telegram getFile returned no file_path');
    }
    const url = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Telegram file download failed: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = file.file_path.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'pdf' ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';
    return { buffer, mime, fileName: file.file_path.split('/').pop() };
  }

  private async call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!body.ok) {
      throw new Error(`Telegram ${method} failed: ${body.description || response.status}`);
    }
    return body.result as T;
  }
}

function toInlineKeyboard(keyboard: Keyboard): Array<Array<{ text: string; callback_data: string }>> {
  return keyboard.map((row) =>
    row.map((button) => {
      if (Buffer.byteLength(button.data, 'utf8') > 64) {
        throw new Error(`callback_data exceeds 64 bytes: ${button.data}`);
      }
      return { text: button.label, callback_data: button.data };
    })
  );
}
