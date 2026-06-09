// Builders for raw Telegram update payloads used across bot tests.

let updateCounter = 1000;

export function nextUpdateId(): number {
  return ++updateCounter;
}

interface CommonOpts {
  updateId?: number;
  chatId?: number;
  userId?: number;
  chatType?: string;
  firstName?: string;
}

const defaults = {
  chatId: 555001,
  userId: 555001,
  chatType: 'private',
  firstName: 'Brent'
};

export function makeTextUpdate(text: string, opts: CommonOpts = {}) {
  const o = { ...defaults, ...opts };
  return {
    update_id: o.updateId ?? nextUpdateId(),
    message: {
      message_id: 1,
      from: { id: o.userId, first_name: o.firstName, is_bot: false },
      chat: { id: o.chatId, type: o.chatType },
      text
    }
  };
}

export function makePhotoUpdate(opts: CommonOpts & { caption?: string; fileId?: string } = {}) {
  const o = { ...defaults, ...opts };
  return {
    update_id: o.updateId ?? nextUpdateId(),
    message: {
      message_id: 2,
      from: { id: o.userId, first_name: o.firstName, is_bot: false },
      chat: { id: o.chatId, type: o.chatType },
      photo: [
        { file_id: 'small', width: 90, height: 120, file_size: 1200 },
        { file_id: o.fileId ?? 'big', width: 900, height: 1200, file_size: 80000 },
        { file_id: 'medium', width: 320, height: 420, file_size: 12000 }
      ],
      ...(o.caption ? { caption: o.caption } : {})
    }
  };
}

export function makeDocumentUpdate(
  mime: string,
  opts: CommonOpts & { fileName?: string; fileSize?: number } = {}
) {
  const o = { ...defaults, ...opts };
  return {
    update_id: o.updateId ?? nextUpdateId(),
    message: {
      message_id: 3,
      from: { id: o.userId, first_name: o.firstName, is_bot: false },
      chat: { id: o.chatId, type: o.chatType },
      document: {
        file_id: 'doc-1',
        mime_type: mime,
        file_name: opts.fileName ?? 'factura.pdf',
        file_size: opts.fileSize ?? 50000
      }
    }
  };
}

export function makeCallbackUpdate(data: string, opts: CommonOpts & { messageId?: number } = {}) {
  const o = { ...defaults, ...opts };
  return {
    update_id: o.updateId ?? nextUpdateId(),
    callback_query: {
      id: `cb-${o.updateId ?? updateCounter}`,
      from: { id: o.userId, first_name: o.firstName },
      message: {
        message_id: opts.messageId ?? 77,
        chat: { id: o.chatId, type: o.chatType }
      },
      data
    }
  };
}

export function makeEditedMessageUpdate() {
  return {
    update_id: nextUpdateId(),
    edited_message: {
      message_id: 4,
      from: { id: defaults.userId, first_name: defaults.firstName, is_bot: false },
      chat: { id: defaults.chatId, type: 'private' },
      text: 'editado'
    }
  };
}
