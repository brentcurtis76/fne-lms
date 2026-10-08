/**
 * The owner's notification email settings, as `/api/user/notification-preferences`
 * reads and writes them (NOTIF plan D2/D7, ledger N4-01).
 *
 * GET shows the stored category choices and, per catalog event, the mode the
 * shared resolver decides with the same legacy rule the senders use: the exact
 * `(user_id, event_type)` row, and for `meeting_finalized` any row with
 * `email_enabled=false`. PUT validates the whole body before one upsert of
 * category rows. `pref_version` and the timestamps are set by the database.
 * There is no digest-hour storage yet (N5-01).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CATEGORY_LABELS, NOTIFICATION_CATALOG, type EmailDefault, type NotificationCategory } from './catalog';
import { resolveEmailPreference, type CategoryEmailMode, type EmailDecisionReason } from './resolve-preference';

export const EMAIL_MODES: readonly CategoryEmailMode[] = ['default', 'immediate', 'digest', 'off'];
export const CATEGORIES = Object.keys(CATEGORY_LABELS) as NotificationCategory[];

/** The meeting summary's legacy rule: any false row suppresses it (getCommunityRecipients). */
const ANY_LEGACY_ROW_EVENT = 'meeting_finalized';

export type AddressSuppression = 'suppressed' | 'clear' | 'unavailable';

export interface EventPreferenceView {
  event_type: string;
  mandatory: boolean;
  catalog_default: EmailDefault;
  /** The resolver's mode. */
  mode: EmailDefault;
  /** What is actually sent today: a `digest` mode is sent immediately while the digest is unavailable. */
  delivery: EmailDefault;
  reason: EmailDecisionReason;
  /** A legacy row suppresses this event whenever the category is on Predeterminado. */
  legacy_suppressed: boolean;
}

export interface CategoryPreferenceView {
  category: NotificationCategory;
  label: string;
  /** The stored choice; `default` when there is no row. */
  email_mode: CategoryEmailMode;
  stored: boolean;
  events: EventPreferenceView[];
}

export interface PreferencesView {
  categories: CategoryPreferenceView[];
  digest: { available: boolean };
  address_suppression: AddressSuppression;
}

export interface CategoryRow {
  category: string;
  email_mode: string;
}

export interface LegacyRow {
  notification_type: string | null;
  email_enabled: boolean | null;
}

export interface CategoryChoice {
  category: NotificationCategory;
  email_mode: CategoryEmailMode;
}

export type ValidationCode =
  | 'invalid_body'
  | 'unknown_field'
  | 'unknown_category'
  | 'invalid_mode'
  | 'duplicate_category'
  | 'digest_unavailable';

export type ParseResult = { choices: CategoryChoice[] } | { code: ValidationCode };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOtherKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).some((key) => !keys.includes(key));

/** `{ "categories": [{ "category": <category>, "email_mode": <mode> }, …] }`, 1 to 8 distinct categories, nothing else. */
export function parsePreferencesUpdate(body: unknown): ParseResult {
  if (!isPlainObject(body)) return { code: 'invalid_body' };
  if (hasOtherKeys(body, ['categories'])) return { code: 'unknown_field' };
  const entries = body.categories;
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > CATEGORIES.length) {
    return { code: 'invalid_body' };
  }
  const choices: CategoryChoice[] = [];
  for (const entry of entries) {
    if (!isPlainObject(entry)) return { code: 'invalid_body' };
    if (hasOtherKeys(entry, ['category', 'email_mode'])) return { code: 'unknown_field' };
    const { category, email_mode } = entry;
    if (typeof category !== 'string' || typeof email_mode !== 'string') return { code: 'invalid_body' };
    if (!CATEGORIES.includes(category as NotificationCategory)) return { code: 'unknown_category' };
    if (!EMAIL_MODES.includes(email_mode as CategoryEmailMode)) return { code: 'invalid_mode' };
    if (choices.some((choice) => choice.category === category)) return { code: 'duplicate_category' };
    choices.push({ category: category as NotificationCategory, email_mode: email_mode as CategoryEmailMode });
  }
  return { choices };
}

/** A new `digest` choice while the digest is unavailable; an already stored digest may be sent again unchanged. */
export function selectsUnavailableDigest(choices: CategoryChoice[], stored: CategoryRow[], digestAvailable: boolean): boolean {
  if (digestAvailable) return false;
  return choices.some(
    (choice) =>
      choice.email_mode === 'digest' &&
      !stored.some((row) => row.category === choice.category && row.email_mode === 'digest')
  );
}

export function buildPreferencesView(input: {
  categoryRows: CategoryRow[];
  legacyRows: LegacyRow[];
  digestAvailable: boolean;
  addressSuppression: AddressSuppression;
}): PreferencesView {
  const stored = new Map(input.categoryRows.map((row) => [row.category, row.email_mode]));
  const legacyOff = input.legacyRows.filter((row) => row.email_enabled === false);
  const anyLegacyOff = legacyOff.length > 0;
  const exactLegacyOff = new Set(legacyOff.map((row) => row.notification_type));

  const categories = CATEGORIES.map((category): CategoryPreferenceView => {
    const storedMode = stored.get(category);
    const events = Object.entries(NOTIFICATION_CATALOG)
      .filter(([, entry]) => entry.category === category)
      .map(([eventType, entry]): EventPreferenceView => {
        const legacySuppressed = eventType === ANY_LEGACY_ROW_EVENT ? anyLegacyOff : exactLegacyOff.has(eventType);
        const decision = resolveEmailPreference({ eventType, categoryMode: storedMode ?? null, legacySuppressed });
        return {
          event_type: eventType,
          mandatory: entry.mandatory,
          catalog_default: entry.emailDefault,
          mode: decision.mode,
          delivery: decision.mode === 'digest' && !input.digestAvailable ? 'immediate' : decision.mode,
          reason: decision.reason,
          legacy_suppressed: legacySuppressed,
        };
      });
    return {
      category,
      label: CATEGORY_LABELS[category],
      email_mode: storedMode === undefined ? 'default' : (storedMode as CategoryEmailMode),
      stored: storedMode !== undefined,
      events,
    };
  });

  return { categories, digest: { available: input.digestAvailable }, address_suppression: input.addressSuppression };
}

export type ReadResult = { categoryRows: CategoryRow[]; legacyRows: LegacyRow[] } | { error: unknown };

/** The owner's category and legacy rows. Read only. */
export async function readOwnPreferences(client: SupabaseClient, userId: string): Promise<ReadResult> {
  const [category, legacy] = await Promise.all([
    client.from('user_notification_category_prefs').select('category, email_mode').eq('user_id', userId),
    client.from('user_notification_preferences').select('notification_type, email_enabled').eq('user_id', userId),
  ]);
  if (category.error || legacy.error) return { error: category.error ?? legacy.error };
  return { categoryRows: (category.data ?? []) as CategoryRow[], legacyRows: (legacy.data ?? []) as LegacyRow[] };
}

export type WriteResult = { rows: CategoryRow[] } | { error: unknown };

/** One upsert of the owner's category choices; the database sets the version and timestamps. */
export async function writeOwnChoices(client: SupabaseClient, userId: string, choices: CategoryChoice[]): Promise<WriteResult> {
  const { data, error } = await client
    .from('user_notification_category_prefs')
    .upsert(
      choices.map((choice) => ({ user_id: userId, category: choice.category, email_mode: choice.email_mode })),
      { onConflict: 'user_id,category' }
    )
    .select('category, email_mode');
  if (error) return { error };
  return { rows: (data ?? []) as CategoryRow[] };
}

/** The stored rows with the written ones replacing their categories. */
export function mergeRows(stored: CategoryRow[], written: CategoryRow[]): CategoryRow[] {
  const merged = new Map(stored.map((row) => [row.category, row]));
  for (const row of written) merged.set(row.category, row);
  return [...merged.values()];
}
