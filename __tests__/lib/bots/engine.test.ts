// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { handleInbound, EngineDeps } from '../../../lib/bots/engine';
import { encodeId } from '../../../lib/bots/store';
import type {
  BotActor,
  BotPendingItemRow,
  BotSessionRow,
  ExtractionResult,
  InboundMessage,
  NormalizedExtraction
} from '../../../lib/bots/types';

const USER_ID = randomUUID();
const CATEGORY = { id: randomUUID(), name: 'Alimentación', description: 'Comidas' };
const OTROS = { id: randomUUID(), name: 'Otros', description: 'Varios' };
const DRAFT = {
  id: randomUUID(),
  report_name: 'Gastos junio 2026',
  total_amount: 45200,
  status: 'draft',
  updated_at: '2026-06-08T10:00:00Z',
  item_count: 3
};

// --- fakes -------------------------------------------------------------------

class FakeAdapter {
  sent: Array<{ chatId: string; text: string; keyboard?: unknown }> = [];
  edits: Array<{ chatId: string; messageRef: string; text: string; keyboard?: unknown }> = [];
  acks: Array<{ callbackId: string; text?: string }> = [];
  private counter = 0;

  parseUpdate() { return null; }
  async sendMessage(chatId: string, text: string, keyboard?: unknown) {
    this.sent.push({ chatId, text, keyboard });
    return { messageRef: `m${++this.counter}` };
  }
  async editMessage(chatId: string, messageRef: string, text: string, keyboard?: unknown) {
    this.edits.push({ chatId, messageRef, text, keyboard });
  }
  async ackCallback(callbackId: string, text?: string) {
    this.acks.push({ callbackId, text });
  }
  async sendTyping() {}
  async downloadFile() {
    return { buffer: Buffer.from('img-bytes'), mime: 'image/jpeg' };
  }
  lastSent() { return this.sent[this.sent.length - 1]; }
  lastEdit() { return this.edits[this.edits.length - 1]; }
}

class FakeStore {
  sessions = new Map<string, BotSessionRow>();
  items = new Map<string, BotPendingItemRow>();
  consumedCodes = new Map<string, string>();
  linkedIdentities: Array<{ platform: string; platformUserId: string; userId: string }> = [];
  failedAttempts = 0;

  async getOrCreateSession(platform: string, chatId: string): Promise<BotSessionRow> {
    const key = `${platform}:${chatId}`;
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        id: randomUUID(),
        platform: platform as 'telegram',
        chat_id: chatId,
        user_id: null,
        state: 'idle',
        active_item_id: null,
        edit_field: null,
        submit_report_id: null,
        failed_link_attempts: 0,
        link_locked_until: null
      });
    }
    return this.sessions.get(key)!;
  }
  async updateSession(sessionId: string, patch: Partial<BotSessionRow>) {
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) Object.assign(session, patch);
    }
  }
  async resetSession(sessionId: string, state = 'idle') {
    await this.updateSession(sessionId, {
      state: state as BotSessionRow['state'],
      active_item_id: null,
      edit_field: null,
      submit_report_id: null
    });
  }
  async claimSessionTransition(
    sessionId: string,
    fromItemId: string | null,
    toItemId: string | null,
    state: BotSessionRow['state']
  ) {
    for (const session of this.sessions.values()) {
      if (
        session.id === sessionId &&
        (session.active_item_id === null || session.active_item_id === fromItemId)
      ) {
        session.active_item_id = toItemId;
        session.state = state;
        session.edit_field = null;
        return true;
      }
    }
    return false;
  }
  isLinkLocked(session: BotSessionRow) {
    return !!session.link_locked_until && new Date(session.link_locked_until) > new Date();
  }
  async consumeLinkCode(code: string) {
    return this.consumedCodes.get(code) ?? null;
  }
  async recordFailedLinkAttempt(session: BotSessionRow) {
    this.failedAttempts += 1;
    if (session.failed_link_attempts + 1 >= 5) {
      session.link_locked_until = new Date(Date.now() + 900_000).toISOString();
      session.failed_link_attempts = 0;
      return true;
    }
    session.failed_link_attempts += 1;
    return false;
  }
  async clearLinkThrottle(sessionId: string) {
    await this.updateSession(sessionId, { failed_link_attempts: 0, link_locked_until: null });
  }
  async linkIdentity(platform: string, platformUserId: string, _chatId: string, userId: string) {
    this.linkedIdentities.push({ platform, platformUserId, userId });
  }
  async createPendingItem(input: {
    sessionId: string; userId: string; fileRef: string; fileMime: string | null;
    fileName: string | null; caption: string | null; status: 'queued' | 'active';
  }): Promise<BotPendingItemRow> {
    const item: BotPendingItemRow = {
      id: randomUUID(),
      session_id: input.sessionId,
      user_id: input.userId,
      file_ref: input.fileRef,
      file_mime: input.fileMime,
      file_name: input.fileName,
      caption: input.caption,
      extraction: null,
      category_id: null,
      target_report_id: null,
      status: input.status,
      card_message_ref: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 72 * 3600_000).toISOString()
    };
    this.items.set(item.id, item);
    return item;
  }
  async getPendingItem(itemId: string) {
    return this.items.get(itemId) ?? null;
  }
  async updatePendingItem(itemId: string, patch: Partial<BotPendingItemRow>) {
    const item = this.items.get(itemId);
    if (item) Object.assign(item, patch);
  }
  async claimPendingItem(itemId: string, fromStatus: string, toStatus: string) {
    const item = this.items.get(itemId);
    if (!item || item.status !== fromStatus) return false;
    item.status = toStatus as BotPendingItemRow['status'];
    return true;
  }
  async nextQueuedItem(sessionId: string) {
    for (const item of this.items.values()) {
      if (item.session_id === sessionId && item.status === 'queued') return item;
    }
    return null;
  }
  async countQueued(sessionId: string) {
    let count = 0;
    for (const item of this.items.values()) {
      if (item.session_id === sessionId && item.status === 'queued') count++;
    }
    return count;
  }
  async discardQueued(sessionId: string) {
    for (const item of this.items.values()) {
      if (item.session_id === sessionId && item.status === 'queued') item.status = 'discarded';
    }
  }
  isExpired(item: BotPendingItemRow) {
    return new Date(item.expires_at) <= new Date();
  }
}

function makeReceipt(overrides: Partial<NormalizedExtraction> = {}): NormalizedExtraction {
  return {
    isReceipt: true,
    vendor: 'Líder Express',
    expenseDate: '2026-06-05',
    amount: 12990,
    currency: 'CLP',
    expenseNumber: '158291',
    docType: 'boleta',
    description: 'Almuerzo equipo',
    categoryGuesses: [{ categoryId: CATEGORY.id, name: CATEGORY.name, confidence: 0.92 }],
    fieldConfidence: { vendor: 0.9, expense_date: 0.95, amount: 0.97, currency: 0.99, expense_number: 0.8 },
    ...overrides
  };
}

function makeActor(overrides: Partial<BotActor> = {}): BotActor {
  return {
    userId: USER_ID,
    firstName: 'Bren',
    fullName: 'Bren Curtis',
    email: 'b@test.cl',
    canSubmit: true,
    ...overrides
  };
}

function makeDeps(opts: {
  actor?: BotActor | null;
  drafts?: typeof DRAFT[];
  extraction?: ExtractionResult;
} = {}) {
  const adapter = new FakeAdapter();
  const store = new FakeStore();
  const extract = vi.fn().mockResolvedValue(
    opts.extraction ?? ({ ok: true, receipt: makeReceipt() } as ExtractionResult)
  );
  const expenses = {
    resolveActor: vi.fn().mockResolvedValue(opts.actor === undefined ? makeActor() : opts.actor),
    getActiveCategories: vi.fn().mockResolvedValue([CATEGORY, OTROS]),
    getCategory: vi.fn().mockImplementation(async (id: string) =>
      [CATEGORY, OTROS].find((c) => c.id === id) ?? null
    ),
    listDraftReports: vi.fn().mockResolvedValue(opts.drafts ?? [DRAFT]),
    listReportsByStatus: vi.fn().mockResolvedValue({ drafts: [], submitted: [], decided: [] }),
    findDuplicate: vi.fn().mockResolvedValue(null),
    saveExpenseItem: vi.fn().mockResolvedValue({
      reportId: DRAFT.id,
      reportName: DRAFT.report_name,
      totalAmount: 58190,
      itemCount: 4
    }),
    submitReport: vi.fn(),
    getReport: vi.fn().mockResolvedValue({ ...DRAFT, start_date: '2026-06-01', end_date: '2026-06-30' })
  };
  const deps = { adapter, store, expenses, extract } as unknown as EngineDeps;
  return { deps, adapter, store, expenses, extract };
}

function text(t: string, overrides: Partial<Extract<InboundMessage, { kind: 'text' }>> = {}): InboundMessage {
  return {
    kind: 'text', platform: 'telegram', chatId: '555', platformUserId: '555',
    updateId: 1, firstName: 'Bren', text: t, ...overrides
  };
}

function photo(overrides: Partial<Extract<InboundMessage, { kind: 'file' }>> = {}): InboundMessage {
  return {
    kind: 'file', platform: 'telegram', chatId: '555', platformUserId: '555',
    updateId: 2, firstName: 'Bren',
    file: { fileRef: 'file-1', mime: 'image/jpeg', sizeBytes: 50_000 },
    ...overrides
  };
}

function callback(data: string, overrides: Partial<Extract<InboundMessage, { kind: 'callback' }>> = {}): InboundMessage {
  return {
    kind: 'callback', platform: 'telegram', chatId: '555', platformUserId: '555',
    updateId: 3, firstName: 'Bren', callbackId: 'cb-1', data, messageRef: '77', ...overrides
  };
}

/** Sends a photo and returns the now-active pending item. */
async function startCard(env: ReturnType<typeof makeDeps>) {
  await handleInbound(env.deps, photo());
  const item = [...env.store.items.values()][0];
  expect(item).toBeTruthy();
  return item;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('unlinked users', () => {
  it('prompts for linking on any message', async () => {
    const env = makeDeps({ actor: null });
    await handleInbound(env.deps, text('hola'));
    expect(env.adapter.lastSent().text).toContain('vincular tu cuenta');
  });

  it('links with a valid code (deep-link and bare)', async () => {
    const env = makeDeps({ actor: null });
    env.store.consumedCodes.set('GOODCODE', USER_ID);
    await handleInbound(env.deps, text('/start GOODCODE'));
    expect(env.store.linkedIdentities).toHaveLength(1);
    expect(env.store.linkedIdentities[0].userId).toBe(USER_ID);

    const env2 = makeDeps({ actor: null });
    env2.store.consumedCodes.set('GOODCODE', USER_ID);
    await handleInbound(env2.deps, text('goodcode'));
    expect(env2.store.linkedIdentities).toHaveLength(1);
  });

  it('locks out after 5 failed code attempts', async () => {
    const env = makeDeps({ actor: null });
    for (let i = 0; i < 5; i++) {
      await handleInbound(env.deps, text('BADCODE1'));
    }
    expect(env.adapter.lastSent().text).toContain('Demasiados intentos');
    // While locked, codes are not even checked.
    env.store.consumedCodes.set('GOODCODE', USER_ID);
    await handleInbound(env.deps, text('GOODCODE'));
    expect(env.store.linkedIdentities).toHaveLength(0);
  });
});

describe('receipt capture', () => {
  it('processes a photo into a confirm card with a one-tap confirm', async () => {
    const env = makeDeps();
    const item = await startCard(env);

    expect(env.adapter.sent[0].text).toContain('Leyendo tu boleta');
    expect(item.status).toBe('active');
    const card = env.adapter.lastEdit();
    expect(card.text).toContain('Líder Express');
    expect(card.text).toContain('Gastos junio 2026');
    const buttons = (card.keyboard as Array<Array<{ data: string }>>).flat().map((b) => b.data);
    expect(buttons).toContain(`ok:${encodeId(item.id)}`);
  });

  it('rejects non-receipt images without data and advances to idle', async () => {
    const env = makeDeps({
      extraction: { ok: true, receipt: makeReceipt({ isReceipt: false, amount: null, expenseDate: null }) }
    });
    const item = await startCard(env);
    expect(item.status).toBe('discarded');
    expect(env.adapter.lastEdit().text).toContain('no parece una boleta');
  });

  it('offers "Usar igual" when a non-receipt still has amount and date', async () => {
    const env = makeDeps({
      extraction: { ok: true, receipt: makeReceipt({ isReceipt: false }) }
    });
    const item = await startCard(env);
    expect(item.status).toBe('active');
    const buttons = (env.adapter.lastEdit().keyboard as Array<Array<{ data: string }>>).flat();
    expect(buttons.map((b) => b.data)).toContain(`ur:${encodeId(item.id)}`);
  });

  it('blocks users without expense access', async () => {
    const env = makeDeps({ actor: makeActor({ canSubmit: false }) });
    await handleInbound(env.deps, photo());
    expect(env.adapter.lastSent().text).toContain('no tiene habilitada');
    expect(env.store.items.size).toBe(0);
  });

  it('fails closed for revoked users on status, callbacks, and stray text', async () => {
    const env = makeDeps({ actor: makeActor({ canSubmit: false }) });

    await handleInbound(env.deps, text('/reportes'));
    expect(env.adapter.lastSent().text).toContain('no tiene habilitada');
    expect(env.expenses.listReportsByStatus).not.toHaveBeenCalled();

    await handleInbound(env.deps, callback(`rg:${encodeId(randomUUID())}`));
    expect(env.adapter.lastSent().text).toContain('no tiene habilitada');
    expect(env.expenses.listDraftReports).not.toHaveBeenCalled();

    // Informational commands still work.
    await handleInbound(env.deps, text('/ayuda'));
    expect(env.adapter.lastSent().text).toContain('Cómo funciona');
  });

  it('rejects unsupported file types', async () => {
    const env = makeDeps();
    await handleInbound(env.deps, photo({ file: { fileRef: 'x', mime: 'audio/ogg' } }));
    expect(env.adapter.lastSent().text).toContain('Solo puedo procesar');
  });

  it('releases the session when the processing card cannot be sent', async () => {
    const env = makeDeps();
    vi.spyOn(env.adapter, 'sendMessage').mockRejectedValueOnce(new Error('Telegram timeout'));

    await expect(handleInbound(env.deps, photo())).resolves.toBeUndefined();

    const item = [...env.store.items.values()][0];
    const session = [...env.store.sessions.values()][0];
    expect(item.status).toBe('discarded');
    expect(session.state).toBe('idle');
    expect(session.active_item_id).toBeNull();
  });

  it('shows SAVE_ERROR on the card when the render fails after PROCESSING was sent', async () => {
    const env = makeDeps();
    const realEdit = env.adapter.editMessage.bind(env.adapter);
    vi.spyOn(env.adapter, 'editMessage')
      .mockImplementationOnce(async () => {
        throw new Error('render edit failed'); // the renderCard-phase edit
      })
      .mockImplementation(realEdit); // the SAVE_ERROR notification goes through

    await expect(handleInbound(env.deps, photo())).resolves.toBeUndefined();

    const item = [...env.store.items.values()][0];
    const session = [...env.store.sessions.values()][0];
    expect(item.status).toBe('discarded');
    expect(session.state).toBe('idle');
    expect(session.active_item_id).toBeNull();
    expect(env.adapter.lastEdit().text).toContain('Algo falló'); // user was told
  });

  it('still releases the slot when both the render and the failure notice fail', async () => {
    const env = makeDeps();
    vi.spyOn(env.adapter, 'editMessage').mockRejectedValue(new Error('telegram down'));

    await expect(handleInbound(env.deps, photo())).resolves.toBeUndefined();

    const item = [...env.store.items.values()][0];
    const session = [...env.store.sessions.values()][0];
    expect(item.status).toBe('discarded');
    expect(session.state).toBe('idle');
  });

  it('falls back to a fresh message and never throws when cleanup itself fails', async () => {
    const env = makeDeps();
    // PROCESSING send fails (no card ref), then the fallback SAVE_ERROR send works.
    vi.spyOn(env.adapter, 'sendMessage').mockRejectedValueOnce(new Error('tg fail'));
    // Activation claim works; the cleanup claim hits a dead DB.
    const realClaim = env.store.claimPendingItem.bind(env.store);
    let claimCalls = 0;
    vi.spyOn(env.store, 'claimPendingItem').mockImplementation(async (...args) => {
      claimCalls += 1;
      if (claimCalls >= 2) throw new Error('db down');
      return realClaim(...(args as Parameters<typeof realClaim>));
    });

    await expect(handleInbound(env.deps, photo())).resolves.toBeUndefined(); // no escape

    expect(env.adapter.lastSent().text).toContain('Algo falló'); // fallback notification
  });

  it('queues photos that arrive while a card is active', async () => {
    const env = makeDeps();
    await startCard(env);
    await handleInbound(env.deps, photo({ file: { fileRef: 'file-2', mime: 'image/jpeg' } }));
    expect(env.adapter.lastSent().text).toContain('en cola');
    expect(await env.store.countQueued([...env.store.sessions.values()][0].id)).toBe(1);
    expect(env.extract).toHaveBeenCalledTimes(1);
  });
});

describe('confirm flow', () => {
  it('saves exactly once across double-taps', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    const data = `ok:${encodeId(item.id)}`;

    await handleInbound(env.deps, callback(data));
    expect(env.expenses.saveExpenseItem).toHaveBeenCalledTimes(1);
    expect(item.status).toBe('saved');
    expect(env.adapter.lastEdit().text).toContain('Gasto guardado');

    await handleInbound(env.deps, callback(data, { callbackId: 'cb-2' }));
    expect(env.expenses.saveExpenseItem).toHaveBeenCalledTimes(1);
    expect(env.adapter.acks[env.adapter.acks.length - 1].text).toContain('ya fue procesada');
    // The SAVED card must not be overwritten by the stale handler.
    expect(env.adapter.lastEdit().text).toContain('Gasto guardado');
  });

  it('saves into the single draft when confirming without an explicit target', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    await handleInbound(env.deps, callback(`ok:${encodeId(item.id)}`));
    const call = (env.expenses.saveExpenseItem as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.reportId).toBe(DRAFT.id);
    expect(call.notes).toBe('Ingresado vía Telegram');
  });

  it('creates a new report on ok:<P>:n', async () => {
    const env = makeDeps({ drafts: [] });
    const item = await startCard(env);
    await handleInbound(env.deps, callback(`ok:${encodeId(item.id)}:n`));
    const call = (env.expenses.saveExpenseItem as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.reportId).toBeNull();
  });

  it('blocks confirm when the extracted date is missing instead of defaulting to today', async () => {
    const env = makeDeps({
      extraction: { ok: true, receipt: makeReceipt({ expenseDate: null }) }
    });
    const item = await startCard(env);
    await handleInbound(env.deps, callback(`ok:${encodeId(item.id)}`));
    expect(env.expenses.saveExpenseItem).not.toHaveBeenCalled();
    expect(item.status).toBe('active');
    expect(env.adapter.sent.some((m) => m.text.includes('No pude leer la fecha'))).toBe(true);
  });

  it('refuses to save when the chosen category is no longer active', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    (env.expenses.getCategory as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await handleInbound(env.deps, callback(`ok:${encodeId(item.id)}`));
    expect(env.expenses.saveExpenseItem).not.toHaveBeenCalled();
    expect(item.status).toBe('active');
    expect(item.category_id).toBeNull();
  });

  it('releases the claim and re-renders when the report is no longer editable', async () => {
    const env = makeDeps();
    (env.expenses.saveExpenseItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('REPORT_NOT_EDITABLE'), { code: 'REPORT_NOT_EDITABLE' })
    );
    const { BotExpenseError } = await import('../../../lib/bots/expense-service');
    (env.expenses.saveExpenseItem as ReturnType<typeof vi.fn>).mockReset()
      .mockRejectedValueOnce(new BotExpenseError('REPORT_NOT_EDITABLE'));

    const item = await startCard(env);
    await handleInbound(env.deps, callback(`ok:${encodeId(item.id)}`));
    expect(item.status).toBe('active'); // claim released — user can retry
    expect(env.adapter.sent.some((m) => m.text.includes('ya no está en borrador'))).toBe(true);
  });

  it('processes the next queued receipt after a save', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    await handleInbound(env.deps, photo({ file: { fileRef: 'file-2', mime: 'image/jpeg' } }));
    await handleInbound(env.deps, callback(`ok:${encodeId(item.id)}`));
    expect(env.extract).toHaveBeenCalledTimes(2);
    const second = [...env.store.items.values()][1];
    expect(second.status).toBe('active');
  });

  it('releases the session when a queued receipt cannot render', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    await handleInbound(env.deps, photo({ file: { fileRef: 'file-2', mime: 'image/jpeg' } }));
    vi.spyOn(env.adapter, 'sendMessage').mockRejectedValueOnce(new Error('Telegram timeout'));

    await handleInbound(env.deps, callback(`ok:${encodeId(item.id)}`));

    const second = [...env.store.items.values()][1];
    const session = [...env.store.sessions.values()][0];
    expect(second.status).toBe('discarded');
    expect(session.state).toBe('idle');
    expect(session.active_item_id).toBeNull();
  });

  it('discards via the trash button and prompts about the queue', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    await handleInbound(env.deps, photo({ file: { fileRef: 'file-2', mime: 'image/jpeg' } }));
    await handleInbound(env.deps, callback(`x:${encodeId(item.id)}`));
    expect(item.status).toBe('discarded');
    expect(env.adapter.lastSent().text).toContain('en cola');
  });
});

describe('card adjustments', () => {
  it('changes category through the grid', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    await handleInbound(env.deps, callback(`cg:${encodeId(item.id)}`));
    const grid = (env.adapter.lastEdit().keyboard as Array<Array<{ data: string }>>).flat();
    const otrosButton = grid.find((b) => b.data === `cs:${encodeId(item.id)}:${encodeId(OTROS.id)}`);
    expect(otrosButton).toBeTruthy();

    await handleInbound(env.deps, callback(otrosButton!.data));
    expect(item.category_id).toBe(OTROS.id);
    expect(env.adapter.lastEdit().text).toContain('Otros');
  });

  it('applies a typed amount edit', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    await handleInbound(env.deps, callback(`ef:${encodeId(item.id)}:m`));
    expect(env.adapter.lastEdit().text).toContain('monto correcto');

    await handleInbound(env.deps, text('15990'));
    expect(item.extraction?.receipt.amount).toBe(15990);
    expect(env.adapter.lastEdit().text).toContain('15.990');
  });

  it('rejects an invalid typed date and keeps waiting', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    await handleInbound(env.deps, callback(`ef:${encodeId(item.id)}:f`));
    await handleInbound(env.deps, text('31-02-2026'));
    expect(env.adapter.lastSent().text).toContain('No entendí');
    expect(item.extraction?.receipt.expenseDate).toBe('2026-06-05');
  });
});

describe('submit flow', () => {
  it('guards /enviar when there are no drafts', async () => {
    const env = makeDeps({ drafts: [] });
    (env.expenses.listDraftReports as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await handleInbound(env.deps, text('/enviar'));
    expect(env.adapter.lastSent().text).toContain('No tienes borradores');
  });

  it('walks pick → confirm → submitted', async () => {
    const env = makeDeps();
    (env.expenses.submitReport as ReturnType<typeof vi.fn>).mockResolvedValue({
      reportId: DRAFT.id, reportName: DRAFT.report_name, totalAmount: 45200, itemCount: 3
    });
    await handleInbound(env.deps, text('/enviar'));
    const pick = env.adapter.lastSent();
    expect(pick.text).toContain('¿Qué reporte');

    await handleInbound(env.deps, callback(`sb:${encodeId(DRAFT.id)}`));
    expect(env.adapter.lastEdit().text).toContain('Enviar a aprobación');

    await handleInbound(env.deps, callback(`sb!:${encodeId(DRAFT.id)}`));
    expect(env.expenses.submitReport).toHaveBeenCalledTimes(1);
    expect(env.adapter.lastEdit().text).toContain('Reporte enviado');
  });

  it('blocks submitting an empty report', async () => {
    const env = makeDeps();
    (env.expenses.getReport as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DRAFT, item_count: 0, start_date: '2026-06-01', end_date: '2026-06-30'
    });
    await handleInbound(env.deps, text('/enviar'));
    await handleInbound(env.deps, callback(`sb:${encodeId(DRAFT.id)}`));
    expect(env.adapter.lastSent().text).toContain('aún no tiene gastos');
    expect(env.expenses.submitReport).not.toHaveBeenCalled();
  });
});

describe('expiry and stale buttons', () => {
  it('expires a stale active card lazily and resets the session', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    item.expires_at = new Date(Date.now() - 1000).toISOString();

    await handleInbound(env.deps, text('/ayuda'));
    expect(item.status).toBe('expired');
    expect(env.adapter.edits.some((e) => e.text.includes('más de 3 días'))).toBe(true);
  });

  it('ignores a stale "Continuar" tap while another card is live', async () => {
    const env = makeDeps();
    await startCard(env);
    await handleInbound(env.deps, photo({ file: { fileRef: 'file-2', mime: 'image/jpeg' } }));

    await handleInbound(env.deps, callback('qn'));
    const active = [...env.store.items.values()].filter((i) => i.status === 'active');
    expect(active).toHaveLength(1); // no second activation
    expect(env.extract).toHaveBeenCalledTimes(1);
    expect(env.adapter.lastEdit().text).toContain('en proceso');
  });

  it('clears only the queue on a stale "Descartar todas" tap, keeping the live card', async () => {
    const env = makeDeps();
    const item = await startCard(env);
    await handleInbound(env.deps, photo({ file: { fileRef: 'file-2', mime: 'image/jpeg' } }));

    await handleInbound(env.deps, callback('qx'));
    expect(item.status).toBe('active'); // live card untouched
    const session = [...env.store.sessions.values()][0];
    expect(session.active_item_id).toBe(item.id);
    expect(await env.store.countQueued(session.id)).toBe(0);
  });

  it('re-queues the item and backs off when the session slot is taken (qn race)', async () => {
    const env = makeDeps();
    const first = await startCard(env);
    await handleInbound(env.deps, photo({ file: { fileRef: 'file-2', mime: 'image/jpeg' } }));
    await handleInbound(env.deps, callback(`x:${encodeId(first.id)}`)); // discard → queue prompt

    // Simulate a concurrent handler grabbing the slot between the qn check
    // and the activation: the atomic session claim loses.
    env.store.claimSessionTransition = vi.fn().mockResolvedValue(false);
    await handleInbound(env.deps, callback('qn'));

    const second = [...env.store.items.values()][1];
    expect(second.status).toBe('queued'); // re-queued, not double-activated
    expect(env.extract).toHaveBeenCalledTimes(1); // never processed
  });

  it('queues the photo when the session slot is lost at arrival time', async () => {
    const env = makeDeps();
    env.store.claimSessionTransition = vi.fn().mockResolvedValue(false);
    await handleInbound(env.deps, photo());
    const item = [...env.store.items.values()][0];
    expect(item.status).toBe('queued');
    expect(env.adapter.lastSent().text).toContain('en cola');
    expect(env.extract).not.toHaveBeenCalled();
  });

  it('acks stale callbacks for unknown items without crashing', async () => {
    const env = makeDeps();
    await env.store.getOrCreateSession('telegram', '555');
    await handleInbound(env.deps, callback(`ok:${encodeId(randomUUID())}`));
    expect(env.adapter.acks[0].text).toContain('ya fue procesada');
    expect(env.expenses.saveExpenseItem).not.toHaveBeenCalled();
  });
});
