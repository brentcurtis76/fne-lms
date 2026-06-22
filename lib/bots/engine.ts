// Deterministic conversation engine for the expense receipt bot.
// All flow logic lives here; Claude is only used inside `deps.extract` to
// read receipt images. Buttons drive every decision (always-confirm).

import {
  BotActor,
  BotPendingItemRow,
  BotSessionRow,
  ChannelAdapter,
  Currency,
  DraftReportSummary,
  InboundMessage,
  PendingExtractionPayload,
  ReceiptExtractor
} from './types';
import { BotStore, decodeId } from './store';
import { BotExpenseError, ExpenseService, newReportDefaults } from './expense-service';
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, SUPPORTED_IMAGE_TYPES } from './receipt-extraction';
import * as M from './messages';

export interface EngineDeps {
  adapter: ChannelAdapter;
  store: BotStore;
  expenses: ExpenseService;
  extract: ReceiptExtractor;
}

const CARD_STATES = new Set([
  'card_main',
  'card_cat',
  'card_lowcat',
  'card_rep',
  'card_edit',
  'card_edit_wait',
  'card_dup'
]);

export async function handleInbound(deps: EngineDeps, msg: InboundMessage): Promise<void> {
  const { adapter, store, expenses } = deps;
  const session = await store.getOrCreateSession(msg.platform, msg.chatId);
  const actor = await expenses.resolveActor(msg.platform, msg.platformUserId);

  if (!actor) {
    await handleUnlinked(deps, session, msg);
    return;
  }

  if (session.user_id !== actor.userId) {
    await store.updateSession(session.id, { user_id: actor.userId });
    session.user_id = actor.userId;
  }

  // Lazy expiry of the active card (72h TTL, no cron).
  if (session.active_item_id) {
    const active = await store.getPendingItem(session.active_item_id);
    if (active && active.status === 'active' && store.isExpired(active)) {
      await store.updatePendingItem(active.id, { status: 'expired' });
      if (active.card_message_ref) {
        await adapter.editMessage(msg.chatId, active.card_message_ref, M.EXPIRED);
      }
      await store.resetSession(session.id);
      session.state = 'idle';
      session.active_item_id = null;
      session.edit_field = null;
    }
  }

  // Fail closed on revoked access: a linked user without can_submit keeps
  // only the informational commands — no expense data, no callbacks, no files.
  if (!actor.canSubmit) {
    if (msg.kind === 'text') {
      const command = msg.text.trim().split(/[\s@]/)[0].toLowerCase();
      if (command === '/start' || command === '/ayuda' || command === '/vincular') {
        await handleText(deps, session, actor, msg);
        return;
      }
    }
    if (msg.kind === 'callback') {
      await adapter.ackCallback(msg.callbackId);
    }
    await adapter.sendMessage(msg.chatId, M.NO_PERMISSION);
    return;
  }

  switch (msg.kind) {
    case 'text':
      await handleText(deps, session, actor, msg);
      return;
    case 'file':
      await handleFile(deps, session, actor, msg);
      return;
    case 'callback':
      await handleCallback(deps, session, actor, msg);
      return;
  }
}

// ---------------------------------------------------------------------------
// Unlinked users: everything funnels into the link-code flow.
// ---------------------------------------------------------------------------

async function handleUnlinked(
  deps: EngineDeps,
  session: BotSessionRow,
  msg: InboundMessage
): Promise<void> {
  const { adapter, store, expenses } = deps;

  if (msg.kind === 'callback') {
    await adapter.ackCallback(msg.callbackId, M.STALE_TOAST);
    await adapter.sendMessage(msg.chatId, M.LINK_PROMPT);
    return;
  }
  if (msg.kind !== 'text') {
    await adapter.sendMessage(msg.chatId, M.LINK_PROMPT);
    return;
  }

  const text = msg.text.trim();
  let code: string | null = null;
  const startMatch = text.match(/^\/start\s+(\S+)$/i);
  const linkMatch = text.match(/^\/vincular\s+(\S+)$/i);
  if (startMatch) code = startMatch[1];
  else if (linkMatch) code = linkMatch[1];
  else if (/^[A-Za-z0-9]{8}$/.test(text)) code = text;

  if (!code) {
    await adapter.sendMessage(msg.chatId, M.LINK_PROMPT);
    return;
  }

  if (store.isLinkLocked(session)) {
    await adapter.sendMessage(msg.chatId, M.LINK_LOCKED);
    return;
  }

  const userId = await store.consumeLinkCode(code.toUpperCase());
  if (!userId) {
    const locked = await store.recordFailedLinkAttempt(session);
    await adapter.sendMessage(msg.chatId, locked ? M.LINK_LOCKED : M.LINK_BAD);
    return;
  }

  await store.linkIdentity(msg.platform, msg.platformUserId, msg.chatId, userId);
  await store.clearLinkThrottle(session.id);
  await store.updateSession(session.id, { user_id: userId });
  const actor = await expenses.resolveActor(msg.platform, msg.platformUserId);
  await adapter.sendMessage(msg.chatId, M.linkOk(actor?.firstName || msg.firstName || ''));
}

// ---------------------------------------------------------------------------
// Text: commands, typed edit values, nudges.
// ---------------------------------------------------------------------------

async function handleText(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  msg: Extract<InboundMessage, { kind: 'text' }>
): Promise<void> {
  const { adapter, store, expenses } = deps;
  const text = msg.text.trim();

  if (text.startsWith('/')) {
    const command = text.split(/[\s@]/)[0].toLowerCase();
    switch (command) {
      case '/start':
        await adapter.sendMessage(
          msg.chatId,
          /\s\S+/.test(text) ? M.ALREADY_LINKED : M.welcome(actor.firstName)
        );
        return;
      case '/vincular':
        await adapter.sendMessage(msg.chatId, M.ALREADY_LINKED);
        return;
      case '/ayuda':
        await adapter.sendMessage(msg.chatId, M.HELP);
        return;
      case '/reportes': {
        const groups = await expenses.listReportsByStatus(actor.userId);
        const empty = groups.drafts.length + groups.submitted.length + groups.decided.length === 0;
        await adapter.sendMessage(msg.chatId, empty ? M.STATUS_EMPTY : M.statusMessage(groups));
        return;
      }
      case '/enviar': {
        if (!actor.canSubmit) {
          await adapter.sendMessage(msg.chatId, M.NO_PERMISSION);
          return;
        }
        const drafts = await expenses.listDraftReports(actor.userId);
        if (drafts.length === 0) {
          await adapter.sendMessage(msg.chatId, M.SUBMIT_NONE);
          return;
        }
        await store.updateSession(session.id, { state: 'submit_pick', submit_report_id: null });
        await adapter.sendMessage(msg.chatId, M.submitPickMessage(), M.submitPickKeyboard(drafts));
        return;
      }
      case '/cancelar':
        await handleCancel(deps, session, actor, msg.chatId);
        return;
      default:
        await adapter.sendMessage(msg.chatId, M.NUDGE);
        return;
    }
  }

  if (session.state === 'card_edit_wait' && session.active_item_id && session.edit_field) {
    await applyTypedEdit(deps, session, actor, msg.chatId, text);
    return;
  }

  await adapter.sendMessage(msg.chatId, M.NUDGE);
}

async function handleCancel(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  chatId: string
): Promise<void> {
  const { adapter, store } = deps;

  if (session.state === 'submit_pick' || session.state === 'submit_confirm') {
    await store.updateSession(session.id, {
      state: session.active_item_id ? 'card_main' : 'idle',
      submit_report_id: null
    });
    await adapter.sendMessage(chatId, M.CANCELLED);
    return;
  }

  if (session.state === 'card_edit_wait' && session.active_item_id) {
    await store.updateSession(session.id, { state: 'card_main', edit_field: null });
    const item = await store.getPendingItem(session.active_item_id);
    if (item) await renderCard(deps, session, actor, item);
    await adapter.sendMessage(chatId, M.CANCELLED);
    return;
  }

  if (CARD_STATES.has(session.state) && session.active_item_id) {
    const activeItemId = session.active_item_id;
    const claimed = await store.claimPendingItem(activeItemId, 'active', 'discarded');
    const item = await store.getPendingItem(activeItemId);
    if (claimed && item?.card_message_ref) {
      await adapter.editMessage(chatId, item.card_message_ref, M.DISCARDED);
    }
    const queuedCount = await store.countQueued(session.id);
    // Conditioned release: only clear the slot if this item still owns it —
    // a concurrent continuation may have legitimately moved it on.
    const released = await store.claimSessionTransition(session.id, activeItemId, null, 'idle');
    if (released) {
      session.state = 'idle';
      session.active_item_id = null;
      session.edit_field = null;
    }
    if (queuedCount > 0) {
      await adapter.sendMessage(chatId, M.queuePrompt(queuedCount), M.queueKeyboard());
    }
    return;
  }

  await adapter.sendMessage(chatId, M.NOTHING_PENDING);
}

// ---------------------------------------------------------------------------
// Files: enqueue or process immediately.
// ---------------------------------------------------------------------------

async function handleFile(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  msg: Extract<InboundMessage, { kind: 'file' }>
): Promise<void> {
  const { adapter, store } = deps;

  if (!actor.canSubmit) {
    await adapter.sendMessage(msg.chatId, M.NO_PERMISSION);
    return;
  }

  const mime = msg.file.mime;
  // Only formats the extraction API accepts — no silent bmp/tiff relabeling.
  if (!(SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime) && mime !== 'application/pdf') {
    await adapter.sendMessage(msg.chatId, M.UNSUPPORTED);
    return;
  }
  // Pre-flight reject when Telegram declares the size; file_size is optional,
  // so the authoritative check is post-download in processReceipt.
  const maxBytes = mime === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (msg.file.sizeBytes && msg.file.sizeBytes > maxBytes) {
    await adapter.sendMessage(msg.chatId, M.FILE_TOO_BIG);
    return;
  }

  const hasActiveCard = CARD_STATES.has(session.state) && !!session.active_item_id;

  // Always create as queued, then atomically claim the session's card slot —
  // a concurrent handler (parallel photo, stale "Continuar") may be doing the
  // same, and only one activation can win.
  const item = await store.createPendingItem({
    sessionId: session.id,
    userId: actor.userId,
    fileRef: msg.file.fileRef,
    fileMime: mime,
    fileName: msg.file.fileName ?? null,
    caption: msg.caption?.trim() || null,
    status: 'queued'
  });

  if (hasActiveCard) {
    const queuedCount = await store.countQueued(session.id);
    await adapter.sendMessage(msg.chatId, M.queued(queuedCount));
    return;
  }

  const sessionClaimed = await store.claimSessionTransition(
    session.id,
    session.active_item_id,
    item.id,
    'card_main'
  );
  if (!sessionClaimed) {
    // Lost the slot to a concurrent handler — the photo stays queued.
    const queuedCount = await store.countQueued(session.id);
    await adapter.sendMessage(msg.chatId, M.queued(queuedCount));
    return;
  }
  const itemClaimed = await store.claimPendingItem(item.id, 'queued', 'active');
  if (!itemClaimed) {
    // Discarded concurrently (e.g. racing "Descartar todas") — free the slot.
    await store.resetSession(session.id);
    return;
  }
  item.status = 'active';
  session.state = 'card_main';
  session.active_item_id = item.id;
  await processReceiptSafely(deps, session, actor, item);
}

/** Prevent an unexpected adapter/API failure from stranding the card slot. */
async function processReceiptSafely(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  item: BotPendingItemRow
): Promise<void> {
  const { adapter, store } = deps;
  try {
    await processReceipt(deps, session, actor, item);
  } catch (error) {
    console.error('[Bot] receipt processing failed:', error);
    // Never leave the user in silence: edit the card if one was sent, else
    // send a fresh message. Notification failures are logged, never fatal.
    try {
      if (item.card_message_ref) {
        await adapter.editMessage(session.chat_id, item.card_message_ref, M.SAVE_ERROR);
      } else {
        await adapter.sendMessage(session.chat_id, M.SAVE_ERROR);
      }
    } catch (notifyError) {
      console.error('[Bot] receipt failure notification failed:', notifyError);
    }
    // Cleanup must not throw (a DB-side root cause would throw again here and
    // escape past the webhook's markUpdateCompleted) and must not clobber
    // state a concurrent handler owns — both transitions are conditioned.
    try {
      const discarded = await store.claimPendingItem(item.id, 'active', 'discarded');
      if (discarded) item.status = 'discarded';
      const released = await store.claimSessionTransition(session.id, item.id, null, 'idle');
      if (released) {
        session.state = 'idle';
        session.active_item_id = null;
      }
    } catch (cleanupError) {
      // Zombie card until /cancelar or expiry — nothing more we can do here.
      console.error('[Bot] receipt failure cleanup failed:', cleanupError);
    }
  }
}

/** Extracts the receipt and renders the confirm card (new or queued item). */
async function processReceipt(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  item: BotPendingItemRow
): Promise<void> {
  const { adapter, store, expenses, extract } = deps;
  const chatId = session.chat_id;

  await adapter.sendTyping(chatId);
  const { messageRef } = await adapter.sendMessage(chatId, M.PROCESSING);
  item.card_message_ref = messageRef;
  await store.updatePendingItem(item.id, { card_message_ref: messageRef });

  const categories = await expenses.getActiveCategories();
  if (categories.length === 0) {
    await adapter.editMessage(chatId, messageRef, M.NO_CATEGORIES);
    await store.claimPendingItem(item.id, 'active', 'discarded');
    const released = await store.claimSessionTransition(session.id, item.id, null, 'idle');
    if (released) {
      session.state = 'idle';
      session.active_item_id = null;
    }
    return;
  }

  let downloaded: { buffer: Buffer; mime: string };
  try {
    downloaded = await adapter.downloadFile(item.file_ref);
  } catch (error) {
    console.error('[Bot] file download failed:', error);
    await adapter.editMessage(chatId, messageRef, M.UNREADABLE);
    await store.updatePendingItem(item.id, { status: 'discarded' });
    await advanceQueueOrIdle(deps, session, actor);
    return;
  }

  // Authoritative size check on actual bytes — Telegram's declared file_size
  // is optional, so the pre-flight check in handleFile can be skipped.
  const maxBytes = item.file_mime === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (downloaded.buffer.length > maxBytes) {
    await adapter.editMessage(chatId, messageRef, M.FILE_TOO_BIG);
    await store.claimPendingItem(item.id, 'active', 'discarded');
    await advanceQueueOrIdle(deps, session, actor);
    return;
  }

  const result = await extract({
    buffer: downloaded.buffer,
    mime: item.file_mime || downloaded.mime,
    categories
  });

  if (result.ok === false) {
    await adapter.editMessage(
      chatId,
      messageRef,
      result.reason === 'api_error' ? M.SAVE_ERROR : M.UNREADABLE
    );
    await store.updatePendingItem(item.id, { status: 'discarded' });
    await advanceQueueOrIdle(deps, session, actor);
    return;
  }

  const receipt = result.receipt;
  if (item.caption) {
    receipt.description = M.safeTruncate(item.caption, 200);
  }

  if (!receipt.isReceipt) {
    const hasData = receipt.amount !== null && receipt.expenseDate !== null;
    if (!hasData) {
      await adapter.editMessage(chatId, messageRef, M.notReceipt(false));
      await store.updatePendingItem(item.id, { status: 'discarded' });
      await advanceQueueOrIdle(deps, session, actor);
      return;
    }
    const payload: PendingExtractionPayload = { receipt };
    await store.updatePendingItem(item.id, { extraction: payload });
    await adapter.editMessage(chatId, messageRef, M.notReceipt(true), M.notReceiptKeyboard(item.id));
    return;
  }

  const duplicate = await expenses.findDuplicate(
    actor.userId,
    receipt.vendor,
    receipt.expenseDate,
    receipt.amount
  );

  const topGuess = receipt.categoryGuesses[0] ?? null;
  const payload: PendingExtractionPayload = { receipt, duplicate };
  await store.updatePendingItem(item.id, {
    extraction: payload,
    category_id: topGuess?.categoryId ?? null
  });
  item.extraction = payload;
  item.category_id = topGuess?.categoryId ?? null;

  await renderCard(deps, session, actor, item);
}

/** After a save/discard: activate the next queued receipt or go idle. */
async function advanceQueueOrIdle(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor
): Promise<void> {
  const { store } = deps;
  // The card slot we are allowed to replace: the item this handler just
  // finished (saved/discarded), or none. Anything else means a concurrent
  // handler owns the slot.
  const previousItemId = session.active_item_id;
  // An item claim can lose to a concurrent handler (e.g. a racing "discard
  // all") — keep trying the next queued item rather than going idle silently.
  for (;;) {
    const next = await store.nextQueuedItem(session.id);
    if (!next) {
      // Conditioned idle: don't clobber a slot a concurrent handler claimed
      // between our last step and now.
      const released = await store.claimSessionTransition(session.id, previousItemId, null, 'idle');
      if (released) {
        session.state = 'idle';
        session.active_item_id = null;
      }
      return;
    }
    const claimed = await store.claimPendingItem(next.id, 'queued', 'active');
    if (!claimed) continue;
    // Atomic slot handoff: of two parallel continuations only one may
    // activate a card; the loser re-queues its item and backs off.
    const sessionClaimed = await store.claimSessionTransition(
      session.id,
      previousItemId,
      next.id,
      'card_main'
    );
    if (!sessionClaimed) {
      await store.claimPendingItem(next.id, 'active', 'queued');
      return;
    }
    next.status = 'active';
    session.state = 'card_main';
    session.active_item_id = next.id;
    await processReceiptSafely(deps, session, actor, next);
    return;
  }
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------

type CardVariant = 'main' | 'lowcat' | 'dup' | 'category_grid' | 'report_picker' | 'edit_menu';

async function renderCard(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  item: BotPendingItemRow,
  forceVariant?: CardVariant
): Promise<void> {
  const { adapter, store, expenses } = deps;
  const payload = item.extraction;
  if (!payload || !item.card_message_ref) return;

  const receipt = payload.receipt;
  const defaults = newReportDefaults(receipt.expenseDate);

  // Independent reads — fetch them together.
  const [drafts, category, categories, queuedCount] = await Promise.all([
    expenses.listDraftReports(actor.userId),
    item.category_id ? expenses.getCategory(item.category_id) : Promise.resolve(null),
    forceVariant === 'category_grid' ? expenses.getActiveCategories() : Promise.resolve(undefined),
    store.countQueued(session.id)
  ]);
  const categoryName = category?.name ?? null;

  const explicitTarget = item.target_report_id
    ? drafts.find((d) => d.id === item.target_report_id) ?? null
    : null;
  const target: DraftReportSummary | 'new' | null = payload.targetNew
    ? 'new'
    : explicitTarget ?? (drafts.length === 0 ? 'new' : drafts.length === 1 ? drafts[0] : null);

  const topGuess = receipt.categoryGuesses[0] ?? null;
  const lowConfidence =
    !item.category_id || (topGuess !== null && item.category_id === topGuess.categoryId && topGuess.confidence < M.LOW_CATEGORY_CONFIDENCE && !payload.forcedReceipt);

  const variant: CardVariant =
    forceVariant ?? (payload.duplicate ? 'dup' : lowConfidence ? 'lowcat' : 'main');

  const stateByVariant: Record<CardVariant, BotSessionRow['state']> = {
    main: 'card_main',
    lowcat: 'card_lowcat',
    dup: 'card_dup',
    category_grid: 'card_cat',
    report_picker: 'card_rep',
    edit_menu: 'card_edit'
  };
  if (session.state !== stateByVariant[variant]) {
    await store.updateSession(session.id, { state: stateByVariant[variant] });
    session.state = stateByVariant[variant];
  }

  const card = M.buildCard({
    item,
    receipt,
    categoryName,
    drafts,
    target,
    newReportName: defaults.name,
    queuePosition: queuedCount > 0 ? { index: 1, total: queuedCount + 1 } : undefined,
    variant,
    duplicate: payload.duplicate,
    categories
  });

  await adapter.editMessage(session.chat_id, item.card_message_ref, card.text, card.keyboard);
}

// ---------------------------------------------------------------------------
// Typed edit values
// ---------------------------------------------------------------------------

function parseEditValue(field: string, raw: string): { ok: boolean; apply?: (r: PendingExtractionPayload['receipt']) => void } {
  const text = raw.trim();
  switch (field) {
    case 'm': {
      const cleaned = text.replace(/[$\s.]/g, '').replace(',', '.');
      const value = Number(cleaned);
      if (!/^\d+(\.\d{1,2})?$/.test(cleaned) || !Number.isFinite(value) || value <= 0) {
        return { ok: false };
      }
      return { ok: true, apply: (r) => { r.amount = value; } };
    }
    case 'f': {
      const match = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
      if (!match) return { ok: false };
      const iso = `${match[3]}-${match[2]}-${match[1]}`;
      const parsed = new Date(`${iso}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) return { ok: false };
      // Reject impossible dates that Date silently rolls over (e.g. 31-02).
      if (parsed.toISOString().slice(0, 10) !== iso) return { ok: false };
      return { ok: true, apply: (r) => { r.expenseDate = iso; } };
    }
    case 'c': {
      if (text.length === 0 || text.length > 100) return { ok: false };
      return { ok: true, apply: (r) => { r.vendor = text; } };
    }
    case 'n': {
      if (text.length === 0 || text.length > 50) return { ok: false };
      return { ok: true, apply: (r) => { r.expenseNumber = text; } };
    }
    case 'd': {
      if (text.length === 0 || text.length > 200) return { ok: false };
      return { ok: true, apply: (r) => { r.description = text; } };
    }
    default:
      return { ok: false };
  }
}

async function applyTypedEdit(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  chatId: string,
  text: string
): Promise<void> {
  const { adapter, store } = deps;
  const field = session.edit_field as string;
  const item = session.active_item_id ? await store.getPendingItem(session.active_item_id) : null;

  if (!item || item.status !== 'active' || !item.extraction) {
    await store.resetSession(session.id);
    await adapter.sendMessage(chatId, M.NOTHING_PENDING);
    return;
  }

  const parsed = parseEditValue(field, text);
  if (!parsed.ok || !parsed.apply) {
    await adapter.sendMessage(chatId, M.editInvalid(field));
    return;
  }

  const payload = item.extraction;
  parsed.apply(payload.receipt);
  await store.updatePendingItem(item.id, { extraction: payload });
  await store.updateSession(session.id, { state: 'card_main', edit_field: null });
  session.state = 'card_main';
  session.edit_field = null;
  await renderCard(deps, session, actor, item, payload.duplicate ? 'dup' : 'main');
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

async function handleCallback(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  msg: Extract<InboundMessage, { kind: 'callback' }>
): Promise<void> {
  const { adapter, store, expenses } = deps;
  const parts = msg.data.split(':');
  const verb = parts[0];

  // --- verbs without an item id ---------------------------------------------
  // qn/qx are unscoped (no item id), so an old queue-prompt message can still
  // carry them: never let them disturb a live card or double-activate items.
  const hasActiveCard = !!session.active_item_id && CARD_STATES.has(session.state);
  if (verb === 'qn') {
    await adapter.ackCallback(msg.callbackId);
    if (hasActiveCard) {
      if (msg.messageRef) await adapter.editMessage(msg.chatId, msg.messageRef, M.QUEUE_BUSY);
      return;
    }
    if ((await store.countQueued(session.id)) === 0) {
      if (msg.messageRef) await adapter.editMessage(msg.chatId, msg.messageRef, M.NOTHING_PENDING);
      return;
    }
    if (msg.messageRef) await adapter.editMessage(msg.chatId, msg.messageRef, M.QUEUE_RESUME);
    await advanceQueueOrIdle(deps, session, actor);
    return;
  }
  if (verb === 'qx') {
    await adapter.ackCallback(msg.callbackId);
    await store.discardQueued(session.id);
    if (!hasActiveCard) {
      await store.resetSession(session.id);
    }
    if (msg.messageRef) await adapter.editMessage(msg.chatId, msg.messageRef, M.QUEUE_CLEARED);
    else await adapter.sendMessage(msg.chatId, M.QUEUE_CLEARED);
    return;
  }
  if (verb === 'sx') {
    await adapter.ackCallback(msg.callbackId);
    await store.updateSession(session.id, {
      state: session.active_item_id ? 'card_main' : 'idle',
      submit_report_id: null
    });
    if (msg.messageRef) {
      await adapter.editMessage(msg.chatId, msg.messageRef, M.CANCELLED);
    }
    return;
  }
  if (verb === 'sb' || verb === 'sb!') {
    await handleSubmitCallback(deps, session, actor, msg, verb, parts[1]);
    return;
  }

  // --- item verbs -------------------------------------------------------------
  const itemId = parts[1] ? decodeId(parts[1]) : null;
  const item = itemId ? await store.getPendingItem(itemId) : null;
  const valid =
    item &&
    item.session_id === session.id &&
    item.user_id === actor.userId &&
    item.status === 'active' &&
    !store.isExpired(item);

  if (!valid || !item) {
    await adapter.ackCallback(msg.callbackId, M.STALE_TOAST);
    // Don't overwrite a SAVED confirmation card on a double-tap.
    if (msg.messageRef && (!item || item.status === 'expired' || item.status === 'discarded')) {
      await adapter.editMessage(msg.chatId, msg.messageRef, M.EXPIRED);
    }
    return;
  }

  await adapter.ackCallback(msg.callbackId);

  switch (verb) {
    case 'ok':
    case 'dx': {
      let target: string | null | 'unresolved' = 'unresolved';
      if (parts[2] === 'n') target = null;
      // Malformed ids fall back to safe resolution — null would silently
      // mean "create a new report".
      else if (parts[2]) target = decodeId(parts[2]) ?? 'unresolved';

      if (verb === 'dx' && item.extraction?.duplicate) {
        const payload = item.extraction;
        payload.duplicate = null;
        await store.updatePendingItem(item.id, { extraction: payload });
        item.extraction = payload;
      }

      if (target === 'unresolved') {
        const resolved = await resolvePreselectedTarget(deps, actor, item);
        if (resolved === 'unresolved') {
          await renderCard(deps, session, actor, item, 'main');
          return;
        }
        target = resolved;
      }
      await confirmSave(deps, session, actor, item, target);
      return;
    }
    case 'ur': {
      const payload = item.extraction;
      if (payload) {
        payload.receipt.isReceipt = true;
        payload.forcedReceipt = true;
        payload.duplicate = payload.duplicate ?? (await expenses.findDuplicate(
          actor.userId,
          payload.receipt.vendor,
          payload.receipt.expenseDate,
          payload.receipt.amount
        ));
        if (!item.category_id && payload.receipt.categoryGuesses[0]) {
          item.category_id = payload.receipt.categoryGuesses[0].categoryId;
          await store.updatePendingItem(item.id, { category_id: item.category_id });
        }
        await store.updatePendingItem(item.id, { extraction: payload });
        item.extraction = payload;
      }
      await renderCard(deps, session, actor, item);
      return;
    }
    case 'cg':
      await renderCard(deps, session, actor, item, 'category_grid');
      return;
    case 'cs': {
      const categoryId = parts[2] ? decodeId(parts[2]) : null;
      if (categoryId) {
        await store.updatePendingItem(item.id, { category_id: categoryId });
        item.category_id = categoryId;
      }
      await renderCard(deps, session, actor, item, item.extraction?.duplicate ? 'dup' : 'main');
      return;
    }
    case 'rg':
      await renderCard(deps, session, actor, item, 'report_picker');
      return;
    case 'rs': {
      const reportId = parts[2] ? decodeId(parts[2]) : null;
      if (reportId) {
        const payload = item.extraction;
        if (payload?.targetNew) {
          payload.targetNew = false;
          await store.updatePendingItem(item.id, { extraction: payload });
        }
        await store.updatePendingItem(item.id, { target_report_id: reportId });
        item.target_report_id = reportId;
      }
      await renderCard(deps, session, actor, item, item.extraction?.duplicate ? 'dup' : 'main');
      return;
    }
    case 'rn': {
      const payload = item.extraction;
      if (payload) {
        payload.targetNew = true;
        await store.updatePendingItem(item.id, { extraction: payload, target_report_id: null });
        item.extraction = payload;
        item.target_report_id = null;
      }
      await renderCard(deps, session, actor, item, item.extraction?.duplicate ? 'dup' : 'main');
      return;
    }
    case 'em':
      await renderCard(deps, session, actor, item, 'edit_menu');
      return;
    case 'ef': {
      const field = parts[2];
      if (field === '$') {
        if (item.card_message_ref) {
          await adapter.editMessage(session.chat_id, item.card_message_ref, '💱 Elige la moneda:', M.currencyKeyboard(item.id));
        }
        await store.updateSession(session.id, { state: 'card_edit' });
        return;
      }
      if (!M.EDIT_PROMPTS[field]) {
        // Unknown field key (crafted/stale callback): restore the menu
        // instead of leaving a silently unresponsive card.
        await renderCard(deps, session, actor, item, 'edit_menu');
        return;
      }
      await store.updateSession(session.id, { state: 'card_edit_wait', edit_field: field });
      session.state = 'card_edit_wait';
      session.edit_field = field;
      if (item.card_message_ref) {
        await adapter.editMessage(session.chat_id, item.card_message_ref, M.EDIT_PROMPTS[field]);
      }
      return;
    }
    case 'cu': {
      const currency = parts[2];
      const payload = item.extraction;
      if (payload && (currency === 'CLP' || currency === 'USD' || currency === 'EUR' || currency === 'GBP')) {
        payload.receipt.currency = currency as Currency;
        await store.updatePendingItem(item.id, { extraction: payload });
        item.extraction = payload;
      }
      await renderCard(deps, session, actor, item, payload?.duplicate ? 'dup' : 'main');
      return;
    }
    case 'bk':
      await renderCard(deps, session, actor, item, item.extraction?.duplicate ? 'dup' : 'main');
      return;
    case 'x': {
      const claimed = await store.claimPendingItem(item.id, 'active', 'discarded');
      if (claimed && item.card_message_ref) {
        await adapter.editMessage(session.chat_id, item.card_message_ref, M.DISCARDED);
      }
      const queuedCount = await store.countQueued(session.id);
      // Conditioned release: only clear the slot if this item still owns it.
      const released = await store.claimSessionTransition(session.id, item.id, null, 'idle');
      if (released) {
        session.state = 'idle';
        session.active_item_id = null;
      }
      if (queuedCount > 0) {
        await adapter.sendMessage(session.chat_id, M.queuePrompt(queuedCount), M.queueKeyboard());
      }
      return;
    }
    default:
      return;
  }
}

/** Target for a bare `ok:<P>`: explicit choice, else the single draft. */
async function resolvePreselectedTarget(
  deps: EngineDeps,
  actor: BotActor,
  item: BotPendingItemRow
): Promise<string | null | 'unresolved'> {
  if (item.extraction?.targetNew) return null;
  if (item.target_report_id) return item.target_report_id;
  const drafts = await deps.expenses.listDraftReports(actor.userId);
  if (drafts.length === 0) return null;
  if (drafts.length === 1) return drafts[0].id;
  return 'unresolved';
}

/** The exactly-once save path: claim → download → upload+RPC → advance. */
async function confirmSave(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  item: BotPendingItemRow,
  targetReportId: string | null
): Promise<void> {
  const { adapter, store, expenses } = deps;
  const payload = item.extraction;
  const receipt = payload?.receipt;

  if (!receipt || !item.category_id) {
    await renderCard(deps, session, actor, item, 'main');
    return;
  }
  // Never invent data on save: an unread amount or date must be typed in
  // via ✏️ Editar before the expense can be confirmed.
  if (receipt.amount === null) {
    await adapter.sendMessage(session.chat_id, M.NEED_AMOUNT);
    await renderCard(deps, session, actor, item, 'main');
    return;
  }
  if (!receipt.expenseDate) {
    await adapter.sendMessage(session.chat_id, M.NEED_DATE);
    await renderCard(deps, session, actor, item, 'main');
    return;
  }
  if (!actor.canSubmit) {
    await adapter.sendMessage(session.chat_id, M.NO_PERMISSION);
    return;
  }

  const claimed = await store.claimPendingItem(item.id, 'active', 'saving');
  if (!claimed) return; // double-tap or redelivery — first claim wins

  // Re-read after winning the claim: the pre-claim checks ran on a snapshot
  // that a concurrent handler (typed edit, failure cleanup) may have changed.
  // The claim guarantees exclusivity from here on; the fresh row is the truth.
  // getCategory filters is_active, so a stale/crafted category id fails here.
  const fresh = await store.getPendingItem(item.id);
  const freshReceipt = fresh?.extraction?.receipt;
  const freshCategoryId = fresh?.category_id ?? null;
  const category = freshCategoryId ? await expenses.getCategory(freshCategoryId) : null;
  if (!fresh || !freshReceipt || freshReceipt.amount === null || !freshReceipt.expenseDate || !category) {
    await store.claimPendingItem(item.id, 'saving', 'active');
    if (freshCategoryId && !category) {
      await store.updatePendingItem(item.id, { category_id: null });
      item.category_id = null;
    }
    await renderCard(deps, session, actor, item, 'main');
    return;
  }

  const expenseDate = freshReceipt.expenseDate;

  try {
    const downloaded = await adapter.downloadFile(fresh.file_ref);
    const result = await expenses.saveExpenseItem({
      userId: actor.userId,
      platform: session.platform,
      reportId: targetReportId,
      categoryId: category.id,
      description: freshReceipt.description || freshReceipt.vendor || 'Gasto sin descripción',
      amount: freshReceipt.amount,
      currency: freshReceipt.currency,
      expenseDate,
      vendor: freshReceipt.vendor,
      expenseNumber: freshReceipt.expenseNumber,
      notes: M.sourceNotes(session.platform),
      file: {
        buffer: downloaded.buffer,
        mime: fresh.file_mime || downloaded.mime,
        fileName: fresh.file_name || undefined
      }
    });

    await store.updatePendingItem(item.id, { status: 'saved', target_report_id: result.reportId });
    if (item.card_message_ref) {
      await adapter.editMessage(
        session.chat_id,
        item.card_message_ref,
        M.saved({
          amount: freshReceipt.amount,
          currency: freshReceipt.currency,
          categoryName: category.name,
          vendor: freshReceipt.vendor,
          reportName: result.reportName,
          totalAmount: result.totalAmount,
          itemCount: result.itemCount
        })
      );
    }
    await advanceQueueOrIdle(deps, session, actor);
  } catch (error) {
    // Release the claim so the user can retry with the same button.
    await store.claimPendingItem(item.id, 'saving', 'active');
    if (error instanceof BotExpenseError && error.code === 'REPORT_NOT_EDITABLE') {
      await store.updatePendingItem(item.id, { target_report_id: null });
      item.target_report_id = null;
      await adapter.sendMessage(session.chat_id, M.REPORT_NOT_EDITABLE);
      await renderCard(deps, session, actor, item, 'main');
      return;
    }
    console.error('[Bot] confirmSave failed:', error);
    await adapter.sendMessage(session.chat_id, M.SAVE_ERROR);
  }
}

// ---------------------------------------------------------------------------
// Submit flow
// ---------------------------------------------------------------------------

async function handleSubmitCallback(
  deps: EngineDeps,
  session: BotSessionRow,
  actor: BotActor,
  msg: Extract<InboundMessage, { kind: 'callback' }>,
  verb: 'sb' | 'sb!',
  encodedReportId: string | undefined
): Promise<void> {
  const { adapter, store, expenses } = deps;
  const reportId = encodedReportId ? decodeId(encodedReportId) : null;

  if (!reportId || !actor.canSubmit) {
    await adapter.ackCallback(msg.callbackId, M.STALE_TOAST);
    return;
  }

  const report = await expenses.getReport(actor.userId, reportId);
  if (!report || report.status !== 'draft') {
    await adapter.ackCallback(msg.callbackId, M.STALE_TOAST);
    if (msg.messageRef) await adapter.editMessage(msg.chatId, msg.messageRef, M.SUBMIT_CONFLICT);
    await store.updateSession(session.id, {
      state: session.active_item_id ? 'card_main' : 'idle',
      submit_report_id: null
    });
    return;
  }

  if (verb === 'sb') {
    await adapter.ackCallback(msg.callbackId);
    if (report.item_count === 0) {
      await adapter.sendMessage(msg.chatId, M.SUBMIT_EMPTY);
      return;
    }
    await store.updateSession(session.id, { state: 'submit_confirm', submit_report_id: reportId });
    if (msg.messageRef) {
      await adapter.editMessage(
        msg.chatId,
        msg.messageRef,
        M.submitConfirmMessage(report, report.start_date, report.end_date),
        M.submitConfirmKeyboard(reportId)
      );
    }
    return;
  }

  // sb! — final confirmation
  await adapter.ackCallback(msg.callbackId);
  if (report.item_count === 0) {
    await adapter.sendMessage(msg.chatId, M.SUBMIT_EMPTY);
    return;
  }
  try {
    const result = await expenses.submitReport(actor, reportId);
    await store.updateSession(session.id, {
      state: session.active_item_id ? 'card_main' : 'idle',
      submit_report_id: null
    });
    if (msg.messageRef) {
      await adapter.editMessage(msg.chatId, msg.messageRef, M.submitOk(result.reportName));
    }
  } catch (error) {
    if (error instanceof BotExpenseError && error.code === 'SUBMIT_CONFLICT') {
      if (msg.messageRef) await adapter.editMessage(msg.chatId, msg.messageRef, M.SUBMIT_CONFLICT);
      return;
    }
    console.error('[Bot] submit failed:', error);
    await adapter.sendMessage(msg.chatId, M.SAVE_ERROR);
  }
}
