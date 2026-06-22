// Channel-agnostic types for the expense receipt bot.
// The engine only sees these shapes; Telegram (and later WhatsApp) adapters
// translate to/from their platform APIs.

export type Platform = 'telegram' | 'whatsapp';

export type Currency = 'CLP' | 'USD' | 'EUR' | 'GBP';

export interface InboundFile {
  /** Platform file reference (Telegram file_id). Bytes are fetched on demand. */
  fileRef: string;
  mime: string;
  fileName?: string;
  sizeBytes?: number;
}

interface InboundBase {
  platform: Platform;
  /** DM chat id (Telegram private chat id, as string). */
  chatId: string;
  /** Platform user id of the sender, as string. */
  platformUserId: string;
  updateId: number;
  firstName?: string;
}

export type InboundMessage =
  | (InboundBase & { kind: 'text'; text: string })
  | (InboundBase & { kind: 'file'; file: InboundFile; caption?: string })
  | (InboundBase & {
      kind: 'callback';
      callbackId: string;
      data: string;
      /** Message the tapped keyboard was attached to (for in-place edits). */
      messageRef?: string;
    });

/** Rows of inline buttons. `data` must stay ≤64 bytes (Telegram limit). */
export type Keyboard = Array<Array<{ label: string; data: string }>>;

export interface ChannelAdapter {
  /** Returns null for updates the bot ignores (groups, edits, stickers...). */
  parseUpdate(body: unknown): InboundMessage | null;
  sendMessage(chatId: string, text: string, keyboard?: Keyboard): Promise<{ messageRef: string }>;
  editMessage(chatId: string, messageRef: string, text: string, keyboard?: Keyboard): Promise<void>;
  /** answerCallbackQuery — must be called exactly once per callback. */
  ackCallback(callbackId: string, text?: string): Promise<void>;
  sendTyping(chatId: string): Promise<void>;
  downloadFile(fileRef: string): Promise<{ buffer: Buffer; mime: string; fileName?: string }>;
}

// ---------------------------------------------------------------------------
// Expense schema interfaces — verified against the live database on
// 2026-06-09 via information_schema (types/supabase.ts does not include
// these tables, so the bot defines its own).
// ---------------------------------------------------------------------------

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  description: string | null;
}

export interface DraftReportSummary {
  id: string;
  report_name: string;
  total_amount: number;
  status: string;
  updated_at: string | null;
  item_count: number;
}

// ---------------------------------------------------------------------------
// Receipt extraction
// ---------------------------------------------------------------------------

export interface CategoryGuess {
  categoryId: string;
  name: string;
  confidence: number;
}

export interface NormalizedExtraction {
  isReceipt: boolean;
  vendor: string | null;
  /** ISO YYYY-MM-DD */
  expenseDate: string | null;
  amount: number | null;
  currency: Currency;
  expenseNumber: string | null;
  docType: 'boleta' | 'factura' | 'other' | null;
  description: string | null;
  /** Top guesses mapped to live category ids; may be empty. */
  categoryGuesses: CategoryGuess[];
  fieldConfidence: {
    vendor: number;
    expense_date: number;
    amount: number;
    currency: number;
    expense_number: number;
  };
}

export type ExtractionResult =
  | { ok: true; receipt: NormalizedExtraction }
  | { ok: false; reason: 'unreadable' | 'api_error' };

export type ReceiptExtractor = (input: {
  buffer: Buffer;
  mime: string;
  categories: ExpenseCategoryRow[];
}) => Promise<ExtractionResult>;

// ---------------------------------------------------------------------------
// Bot persistence rows
// ---------------------------------------------------------------------------

export type SessionState =
  | 'idle'
  | 'card_main'
  | 'card_cat'
  | 'card_lowcat'
  | 'card_rep'
  | 'card_edit'
  | 'card_edit_wait'
  | 'card_dup'
  | 'submit_pick'
  | 'submit_confirm';

export interface BotSessionRow {
  id: string;
  platform: Platform;
  chat_id: string;
  user_id: string | null;
  state: SessionState;
  active_item_id: string | null;
  edit_field: string | null;
  submit_report_id: string | null;
  failed_link_attempts: number;
  link_locked_until: string | null;
}

export type PendingItemStatus = 'queued' | 'active' | 'saving' | 'saved' | 'discarded' | 'expired';

/** JSON payload stored in bot_pending_items.extraction. */
export interface PendingExtractionPayload {
  receipt: NormalizedExtraction;
  /** Set when a possible duplicate was detected at extraction time. */
  duplicate?: { reportName: string } | null;
  /** User overrode the not-a-receipt verdict. */
  forcedReceipt?: boolean;
  /** User explicitly chose "new report" as the save target. */
  targetNew?: boolean;
}

export interface BotPendingItemRow {
  id: string;
  session_id: string;
  user_id: string;
  file_ref: string;
  file_mime: string | null;
  file_name: string | null;
  caption: string | null;
  extraction: PendingExtractionPayload | null;
  category_id: string | null;
  target_report_id: string | null;
  status: PendingItemStatus;
  card_message_ref: string | null;
  created_at: string;
  expires_at: string;
}

export interface BotIdentityRow {
  id: string;
  platform: Platform;
  platform_user_id: string;
  chat_id: string;
  user_id: string;
}

/** Resolved acting user for any expense operation. */
export interface BotActor {
  userId: string;
  firstName: string;
  email: string | null;
  fullName: string;
  canSubmit: boolean;
}
