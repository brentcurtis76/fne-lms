/**
 * Email preference precedence (NOTIF plan D2, ledger N1-03).
 *
 * For an event the catalog maps, the first rule that applies decides:
 *   1. a mandatory event always sends;
 *   2. a non-default category mode (immediate / digest / off) wins;
 *   3. a legacy `user_notification_preferences` row with `email_enabled=false`
 *      suppresses (which rows count is the caller's rule: SM-15's exact
 *      `(user_id, event_type||category)` row, or any row for the meeting summary);
 *   4. the catalog default.
 * A `default` category row, a missing row and an unrecognised mode all fall
 * through to rule 3, so choosing Predeterminado re-applies the legacy rule.
 *
 * An event the catalog does not map keeps the pre-existing rule: the legacy row
 * suppresses, otherwise the email is sent. No catalog default is invented.
 *
 * If a preference could not be read, a non-mandatory email is suppressed rather
 * than guessed.
 */
import { getCatalogEntry, type EmailDefault } from './catalog';

export type CategoryEmailMode = 'default' | EmailDefault;

export type EmailDecisionReason =
  | 'mandatory'
  | 'category_mode'
  | 'legacy_suppressed'
  | 'catalog_default'
  | 'unmapped_event'
  | 'preference_unavailable';

export interface EmailDecision {
  mode: EmailDefault;
  reason: EmailDecisionReason;
}

export interface EmailPreferenceInput {
  eventType: string | null | undefined;
  /** The stored `email_mode` of the event's category row; null when there is no row. */
  categoryMode: unknown;
  /** True when a legacy row the caller's rule counts has `email_enabled=false`. */
  legacySuppressed: boolean;
  /** True when either preference read failed. */
  lookupFailed?: boolean;
}

const OVERRIDING_MODES: readonly unknown[] = ['immediate', 'digest', 'off'];

export function resolveEmailPreference(input: EmailPreferenceInput): EmailDecision {
  const entry = input.eventType ? getCatalogEntry(input.eventType) : undefined;

  if (entry?.mandatory) return { mode: 'immediate', reason: 'mandatory' };
  if (input.lookupFailed) return { mode: 'off', reason: 'preference_unavailable' };
  if (entry && OVERRIDING_MODES.includes(input.categoryMode)) {
    return { mode: input.categoryMode as EmailDefault, reason: 'category_mode' };
  }
  if (input.legacySuppressed) return { mode: 'off', reason: 'legacy_suppressed' };
  if (!entry) return { mode: 'immediate', reason: 'unmapped_event' };
  return { mode: entry.emailDefault, reason: 'catalog_default' };
}
