// Structured, privacy-safe failure logging for the expense bot.
//
// Records carry ONLY error metadata (code/message/details/hint), the currency,
// the failing stage, and a non-PII correlation id (the pending-item id) — never
// student data, receipt contents, or user identity (Ley 21.719 hygiene). The
// user-facing Telegram message stays generic; this is for server logs only.

export type BotFailureStage = 'download' | 'upload' | 'rpc' | 'report_read';

/** Shape of a Supabase/PostgREST error (fields are all optional/untyped at runtime). */
interface SupabaseLikeError {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

export interface BotFailureContext {
  currency?: string | null;
  /** Correlation id — the pending-item id (a UUID, non-PII). */
  itemId?: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Builds a privacy-safe structured failure record. Only whitelisted fields are
 * emitted — arbitrary error properties are never spread in, so a stray PII-laden
 * field on the error object can't leak into the logs.
 */
export function buildFailureLog(
  stage: BotFailureStage,
  error: unknown,
  context: BotFailureContext = {}
): Record<string, unknown> {
  const e = (error ?? {}) as SupabaseLikeError;
  const message =
    str(e.message) ?? (error instanceof Error ? error.message : null) ?? String(error ?? '');
  return {
    event: 'bot_save_failure',
    stage,
    code: e.code != null ? String(e.code) : null,
    message,
    details: str(e.details),
    hint: str(e.hint),
    currency: context.currency ?? null,
    itemId: context.itemId ?? null
  };
}

/** Emits the structured record via console.error. Keep user-facing messaging generic. */
export function logStageFailure(
  stage: BotFailureStage,
  error: unknown,
  context: BotFailureContext = {}
): void {
  console.error('[Bot] save failure', JSON.stringify(buildFailureLog(stage, error, context)));
}
