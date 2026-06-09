import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BotIdentityRow,
  BotPendingItemRow,
  BotSessionRow,
  PendingExtractionPayload,
  PendingItemStatus,
  Platform,
  SessionState
} from './types';

// ---------------------------------------------------------------------------
// Compact ids for callback_data: full UUID <-> 22-char base64url.
// ---------------------------------------------------------------------------

export function encodeId(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`Not a UUID: ${uuid}`);
  }
  return Buffer.from(hex, 'hex').toString('base64url');
}

export function decodeId(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(encoded)) return null;
  const hex = Buffer.from(encoded, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const LINK_CODE_LENGTH = 8;
const MAX_LINK_ATTEMPTS = 5;
const LINK_LOCKOUT_MINUTES = 15;
const PROCESSED_UPDATES_RETENTION_HOURS = 48;

export function generateLinkCode(): string {
  const bytes = randomBytes(LINK_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    code += LINK_CODE_ALPHABET[bytes[i] % LINK_CODE_ALPHABET.length];
  }
  return code;
}

// ---------------------------------------------------------------------------
// Data access. All queries run with the service-role client — the bot tables
// have RLS enabled with zero policies, so nothing else can reach them.
// ---------------------------------------------------------------------------

export class BotStore {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Atomic inbound-update claim. Returns false when this update_id was
   * already claimed (platform redelivery) and the webhook must no-op.
   *
   * A claim whose handler died mid-processing (e.g. function timeout after
   * claiming, before completion) is taken over once it is >90s old and still
   * uncompleted, so the platform's retry reprocesses instead of dropping
   * the update forever.
   */
  async claimUpdate(platform: Platform, updateId: number): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('bot_processed_updates')
      .upsert(
        { platform, update_id: updateId },
        { onConflict: 'platform,update_id', ignoreDuplicates: true }
      )
      .select('update_id');
    if (error) throw error;
    let claimed = Array.isArray(data) && data.length > 0;

    if (!claimed) {
      const staleCutoff = new Date(Date.now() - 90_000).toISOString();
      const { data: takeover, error: takeoverError } = await this.supabase
        .from('bot_processed_updates')
        .update({ processed_at: new Date().toISOString() })
        .eq('platform', platform)
        .eq('update_id', updateId)
        .is('completed_at', null)
        .lt('processed_at', staleCutoff)
        .select('update_id');
      if (takeoverError) throw takeoverError;
      claimed = Array.isArray(takeover) && takeover.length > 0;
    }

    // Opportunistic retention sweep (~4% of claims) — no cron needed.
    if (claimed && updateId % 25 === 0) {
      const cutoff = new Date(Date.now() - PROCESSED_UPDATES_RETENTION_HOURS * 3600_000).toISOString();
      void this.supabase
        .from('bot_processed_updates')
        .delete()
        .lt('processed_at', cutoff)
        .then(({ error: sweepError }) => {
          if (sweepError) console.error('[Bot] processed_updates sweep failed:', sweepError);
        });
    }
    return claimed;
  }

  /** Marks an update fully processed; only uncompleted claims can be taken over. */
  async markUpdateCompleted(platform: Platform, updateId: number): Promise<void> {
    const { error } = await this.supabase
      .from('bot_processed_updates')
      .update({ completed_at: new Date().toISOString() })
      .eq('platform', platform)
      .eq('update_id', updateId);
    if (error) console.error('[Bot] markUpdateCompleted failed:', error);
  }

  async getOrCreateSession(platform: Platform, chatId: string): Promise<BotSessionRow> {
    const existing = await this.getSession(platform, chatId);
    if (existing) return existing;

    const { data, error } = await this.supabase
      .from('bot_sessions')
      .upsert(
        { platform, chat_id: chatId },
        { onConflict: 'platform,chat_id', ignoreDuplicates: true }
      )
      .select()
      .maybeSingle();
    if (error) throw error;
    if (data) return data as BotSessionRow;

    // Lost the upsert race — the row exists now.
    const raced = await this.getSession(platform, chatId);
    if (!raced) throw new Error('bot_sessions upsert race could not be resolved');
    return raced;
  }

  private async getSession(platform: Platform, chatId: string): Promise<BotSessionRow | null> {
    const { data, error } = await this.supabase
      .from('bot_sessions')
      .select()
      .eq('platform', platform)
      .eq('chat_id', chatId)
      .maybeSingle();
    if (error) throw error;
    return (data as BotSessionRow) ?? null;
  }

  async updateSession(
    sessionId: string,
    patch: Partial<Pick<BotSessionRow, 'user_id' | 'state' | 'active_item_id' | 'edit_field' | 'submit_report_id' | 'failed_link_attempts' | 'link_locked_until'>>
  ): Promise<void> {
    const { error } = await this.supabase
      .from('bot_sessions')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) throw error;
  }

  async resetSession(sessionId: string, state: SessionState = 'idle'): Promise<void> {
    await this.updateSession(sessionId, {
      state,
      active_item_id: null,
      edit_field: null,
      submit_report_id: null
    });
  }

  // --- identity & linking ---------------------------------------------------

  async getIdentity(platform: Platform, platformUserId: string): Promise<BotIdentityRow | null> {
    const { data, error } = await this.supabase
      .from('bot_identities')
      .select()
      .eq('platform', platform)
      .eq('platform_user_id', platformUserId)
      .maybeSingle();
    if (error) throw error;
    return (data as BotIdentityRow) ?? null;
  }

  async linkIdentity(platform: Platform, platformUserId: string, chatId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('bot_identities')
      .upsert(
        { platform, platform_user_id: platformUserId, chat_id: chatId, user_id: userId, link_method: 'code' },
        { onConflict: 'platform,platform_user_id' }
      );
    if (error) throw error;
  }

  /**
   * Atomically consume a link code. Returns the linked user_id, or null when
   * the code is unknown, expired, or already used.
   */
  async consumeLinkCode(code: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('bot_link_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('code', code)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('user_id');
    if (error) throw error;
    return data && data.length > 0 ? (data[0] as { user_id: string }).user_id : null;
  }

  /**
   * Issues a link code for the user. Reuses a recently issued, still-valid
   * code (generation throttle — hammering the endpoint cannot mint unlimited
   * fresh codes); otherwise invalidates prior unused codes and creates one.
   */
  async createLinkCode(userId: string): Promise<string> {
    const recentCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: recent, error: recentError } = await this.supabase
      .from('bot_link_codes')
      .select('code')
      .eq('user_id', userId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .gt('created_at', recentCutoff)
      .order('created_at', { ascending: false })
      .limit(1);
    if (recentError) throw recentError;
    if (recent && recent.length > 0) {
      return (recent[0] as { code: string }).code;
    }

    const { error: invalidateError } = await this.supabase
      .from('bot_link_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('used_at', null);
    if (invalidateError) throw invalidateError;

    const code = generateLinkCode();
    const { error } = await this.supabase.from('bot_link_codes').insert({ code, user_id: userId });
    if (error) throw error;
    return code;
  }

  /** Returns true when the session is currently locked out from link attempts. */
  isLinkLocked(session: BotSessionRow): boolean {
    return !!session.link_locked_until && new Date(session.link_locked_until) > new Date();
  }

  /** Records a failed link attempt; returns true if this attempt triggered a lockout. */
  async recordFailedLinkAttempt(session: BotSessionRow): Promise<boolean> {
    const attempts = session.failed_link_attempts + 1;
    if (attempts >= MAX_LINK_ATTEMPTS) {
      await this.updateSession(session.id, {
        failed_link_attempts: 0,
        link_locked_until: new Date(Date.now() + LINK_LOCKOUT_MINUTES * 60_000).toISOString()
      });
      return true;
    }
    await this.updateSession(session.id, { failed_link_attempts: attempts });
    return false;
  }

  async clearLinkThrottle(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, { failed_link_attempts: 0, link_locked_until: null });
  }

  // --- pending receipt items -------------------------------------------------

  async createPendingItem(input: {
    sessionId: string;
    userId: string;
    fileRef: string;
    fileMime: string | null;
    fileName: string | null;
    caption: string | null;
    status: Extract<PendingItemStatus, 'queued' | 'active'>;
  }): Promise<BotPendingItemRow> {
    const { data, error } = await this.supabase
      .from('bot_pending_items')
      .insert({
        session_id: input.sessionId,
        user_id: input.userId,
        file_ref: input.fileRef,
        file_mime: input.fileMime,
        file_name: input.fileName,
        caption: input.caption,
        status: input.status
      })
      .select()
      .single();
    if (error) throw error;
    return data as BotPendingItemRow;
  }

  async getPendingItem(itemId: string): Promise<BotPendingItemRow | null> {
    const { data, error } = await this.supabase
      .from('bot_pending_items')
      .select()
      .eq('id', itemId)
      .maybeSingle();
    if (error) throw error;
    return (data as BotPendingItemRow) ?? null;
  }

  async updatePendingItem(
    itemId: string,
    patch: Partial<{
      extraction: PendingExtractionPayload;
      category_id: string | null;
      target_report_id: string | null;
      status: PendingItemStatus;
      card_message_ref: string;
    }>
  ): Promise<void> {
    const { error } = await this.supabase.from('bot_pending_items').update(patch).eq('id', itemId);
    if (error) throw error;
  }

  /**
   * Atomic status transition. Returns false when the item was not in
   * `fromStatus` (double-tap, redelivery, expiry) — the caller must no-op.
   */
  async claimPendingItem(itemId: string, fromStatus: PendingItemStatus, toStatus: PendingItemStatus): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('bot_pending_items')
      .update({ status: toStatus })
      .eq('id', itemId)
      .eq('status', fromStatus)
      .select('id');
    if (error) throw error;
    return !!data && data.length > 0;
  }

  async nextQueuedItem(sessionId: string): Promise<BotPendingItemRow | null> {
    const { data, error } = await this.supabase
      .from('bot_pending_items')
      .select()
      .eq('session_id', sessionId)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? (data[0] as BotPendingItemRow) : null;
  }

  async countQueued(sessionId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('bot_pending_items')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'queued');
    if (error) throw error;
    return count ?? 0;
  }

  async discardQueued(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('bot_pending_items')
      .update({ status: 'discarded' })
      .eq('session_id', sessionId)
      .eq('status', 'queued');
    if (error) throw error;
  }

  isExpired(item: BotPendingItemRow): boolean {
    return new Date(item.expires_at) <= new Date();
  }
}
