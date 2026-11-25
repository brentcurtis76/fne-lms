/**
 * The Correos kit's reads and writes of its own tables (`email_lists`, `email_list_members`, `email_contacts`,
 * `email_suppression`) for a server route that has already checked "is admin". Server only: it is handed the
 * service-role client and the admin's id by the host.
 *
 * Every write of people goes through `email_add_contacts` or `email_erase_contact` with the admin as actor.
 * Nothing here deletes a row, lifts a block or re-subscribes someone who left.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Reason } from './reason';
import { cleanCell, containsAny, normalizeAddress, trimHidden } from './address';
import { databaseCode, databaseErrorMessage, isUniqueViolation, LIST_MESSAGES } from './messages';

export const PAGE_SIZE = 25;
export const MAX_LIST_NAME = 200;
export const MAX_LIST_DESCRIPTION = 1000;

/**
 * The digest `email_add_contacts` stores and checks: SHA-256 hex, in UTF-8, of the address trimmed of the hidden
 * characters (`email_hidden_chars()`) and in lower case, i.e. `email_address_fingerprint` of the cleaned address.
 */
export function addressFingerprint(address: string): string {
  return createHash('sha256').update(normalizeAddress(address), 'utf8').digest('hex');
}

export type Failure = { ok: false; status: number; message: string };
const fail = (status: number, message: string): Failure => ({ ok: false, status, message });

// ---------------------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------------------

export interface ListSummary {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  archived_at: string | null;
  created_at: string;
  subscribed: number;
}

export function listNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export async function listLists(db: SupabaseClient): Promise<{ ok: true; lists: ListSummary[] } | Failure> {
  const { data, error } = await db
    .from('email_lists')
    .select('id, name, description, is_public, archived_at, created_at')
    .order('name', { ascending: true });
  if (error) return fail(500, 'No se pudieron leer las listas. Inténtalo de nuevo en un momento.');
  const rows = (data ?? []) as Omit<ListSummary, 'subscribed'>[];
  const counted = await Promise.all(
    rows.map(async (list) => {
      const { count, error: countError } = await db
        .from('email_list_members')
        .select('id', { count: 'exact', head: true })
        .eq('list_id', list.id)
        .eq('state', 'subscribed');
      if (countError) throw new Error('count failed');
      return { ...list, subscribed: count ?? 0 };
    })
  ).catch(() => null);
  if (!counted) return fail(500, 'No se pudieron contar las personas de cada lista. Inténtalo de nuevo en un momento.');
  return { ok: true, lists: counted };
}

export interface ListInput {
  name?: string;
  description?: string | null;
  is_public?: boolean;
  archive?: true;
}

/** Reads a list's fields from a request body. `creating`: the name and the public flag are required. */
export function parseListInput(body: unknown, creating: boolean): { ok: true; input: ListInput } | Failure {
  const source = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const input: ListInput = {};
  if (creating || source.name !== undefined) {
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (!name) return fail(400, LIST_MESSAGES.nameRequired);
    if (name.length > MAX_LIST_NAME) return fail(400, LIST_MESSAGES.nameTooLong);
    input.name = name;
  }
  if (source.description !== undefined) {
    if (source.description !== null && typeof source.description !== 'string') return fail(400, LIST_MESSAGES.descriptionTooLong);
    const description = typeof source.description === 'string' ? source.description.trim() : '';
    if (description.length > MAX_LIST_DESCRIPTION) return fail(400, LIST_MESSAGES.descriptionTooLong);
    input.description = description || null;
  }
  if (creating || source.is_public !== undefined) {
    if (typeof source.is_public !== 'boolean') return fail(400, LIST_MESSAGES.publicFlag);
    input.is_public = source.is_public;
  }
  if (!creating && source.archive === true) input.archive = true;
  if (!creating && Object.keys(input).length === 0) return fail(400, LIST_MESSAGES.nothingToChange);
  return { ok: true, input };
}

async function nameTaken(db: SupabaseClient, name: string, exceptId: string | null): Promise<boolean | null> {
  const { data, error } = await db.from('email_lists').select('id, name');
  if (error) return null;
  const key = listNameKey(name);
  return ((data ?? []) as { id: string; name: string }[]).some((list) => list.id !== exceptId && listNameKey(list.name) === key);
}

export async function createList(db: SupabaseClient, input: ListInput, actor: string): Promise<{ ok: true; id: string } | Failure> {
  const taken = await nameTaken(db, input.name as string, null);
  if (taken === null) return fail(500, 'No se pudo crear la lista. Inténtalo de nuevo en un momento.');
  if (taken) return fail(409, LIST_MESSAGES.nameTaken);
  const { data, error } = await db
    .from('email_lists')
    .insert({ name: input.name, description: input.description ?? null, is_public: input.is_public, created_by: actor })
    .select('id')
    .single();
  if (error) {
    if (isUniqueViolation(error)) return fail(409, LIST_MESSAGES.nameTaken);
    return fail(500, 'No se pudo crear la lista. Inténtalo de nuevo en un momento.');
  }
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateList(db: SupabaseClient, id: string, input: ListInput): Promise<{ ok: true } | Failure> {
  const { data: current, error: readError } = await db.from('email_lists').select('id, archived_at').eq('id', id).maybeSingle();
  if (readError) return fail(500, 'No se pudo guardar la lista. Inténtalo de nuevo en un momento.');
  if (!current) return fail(404, LIST_MESSAGES.notFound);
  if ((current as { archived_at: string | null }).archived_at) return fail(409, LIST_MESSAGES.archived);

  if (input.name !== undefined) {
    const taken = await nameTaken(db, input.name, id);
    if (taken === null) return fail(500, 'No se pudo guardar la lista. Inténtalo de nuevo en un momento.');
    if (taken) return fail(409, LIST_MESSAGES.nameTaken);
  }
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.is_public !== undefined) patch.is_public = input.is_public;
  if (input.archive) patch.archived_at = new Date().toISOString();

  const { error } = await db.from('email_lists').update(patch).eq('id', id);
  if (error) {
    if (isUniqueViolation(error)) return fail(409, LIST_MESSAGES.nameTaken);
    return fail(500, 'No se pudo guardar la lista. Inténtalo de nuevo en un momento.');
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------
// Bringing people in
// ---------------------------------------------------------------------------------------------------------

export type ContactSource = 'manual' | 'csv_import' | 'profiles' | 'pasantia_leads';

export interface ContactRowInput {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  organization?: string | null;
  /** A row's own permission time and notice version (pasantías leads: the tick's). */
  basis_recorded_at?: string;
  consent_notice_version?: string;
}

/** What `email_add_contacts` returns. */
export interface AddCounts {
  total: number;
  accepted: number;
  duplicate: number;
  blocked: number;
  left: number;
  invalid: number;
  contacts_created: number;
  memberships_created: number;
}

export interface AddContactsArgs {
  rows: ContactRowInput[];
  listIds: string[];
  source: ContactSource;
  reason: Reason;
  /** When the reason was recorded; rows may carry their own. */
  recordedAt: string;
  actor: string;
}

const COUNT_KEYS: (keyof AddCounts)[] = [
  'total', 'accepted', 'duplicate', 'blocked', 'left', 'invalid', 'contacts_created', 'memberships_created',
];

/**
 * A row cleaned the way the database cleans it (hidden characters off both ends of every cell; an empty name or
 * organisation is null), whatever way it was built (by hand, CSV, users, pasantías). The database does the same
 * again and stays the authority; this keeps what is sent equal to what is stored.
 */
export function cleanRow(row: ContactRowInput): ContactRowInput {
  const cleaned: ContactRowInput = { email: typeof row.email === 'string' ? trimHidden(row.email) : row.email };
  // Only the cells the row has: a cell left out stays left out.
  if (row.first_name !== undefined) cleaned.first_name = cleanCell(row.first_name);
  if (row.last_name !== undefined) cleaned.last_name = cleanCell(row.last_name);
  if (row.organization !== undefined) cleaned.organization = cleanCell(row.organization);
  if (row.basis_recorded_at !== undefined) cleaned.basis_recorded_at = row.basis_recorded_at;
  if (row.consent_notice_version !== undefined) cleaned.consent_notice_version = row.consent_notice_version;
  return cleaned;
}

/** One call of `email_add_contacts` for all the rows. */
export async function addContacts(db: SupabaseClient, args: AddContactsArgs): Promise<{ ok: true; counts: AddCounts } | Failure> {
  const { data, error } = await db.rpc('email_add_contacts', {
    p_rows: args.rows.map(cleanRow),
    p_list_ids: args.listIds,
    p_source: args.source,
    p_legal_basis: args.reason.legal_basis,
    p_basis_note: args.reason.basis_note,
    p_basis_recorded_at: args.recordedAt,
    p_consent_notice_version: args.reason.consent_notice_version,
    p_actor: args.actor,
  });
  if (error) {
    const code = databaseCode(error);
    return fail(code ? 400 : 500, databaseErrorMessage(error));
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  const counts = {} as AddCounts;
  for (const key of COUNT_KEYS) {
    const value = Number(raw[key]);
    if (!Number.isSafeInteger(value) || value < 0) return fail(500, databaseErrorMessage(null));
    counts[key] = value;
  }
  return { ok: true, counts };
}

// ---------------------------------------------------------------------------------------------------------
// Reading people
// ---------------------------------------------------------------------------------------------------------

export interface ContactListItem {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  created_at: string;
  blocked: boolean;
}

export const CONTACT_SEARCH_COLUMNS = ['email', 'first_name', 'last_name', 'organization'] as const;

/** Search by part of the address, name or organisation, 25 a page, newest first. Erased people are never found. */
export async function searchContacts(
  db: SupabaseClient,
  term: string,
  page: number
): Promise<{ ok: true; items: ContactListItem[]; total: number; page: number; pageSize: number } | Failure> {
  const from = (page - 1) * PAGE_SIZE;
  let query = db
    .from('email_contacts')
    .select('id, email, first_name, last_name, organization, created_at, suppressed_at', { count: 'exact' })
    .is('anonymized_at', null);
  if (term) query = query.or(containsAny(CONTACT_SEARCH_COLUMNS, term));
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) return fail(500, 'No se pudo buscar. Inténtalo de nuevo en un momento.');
  const items = ((data ?? []) as Array<ContactListItem & { suppressed_at: string | null }>).map(({ suppressed_at, ...rest }) => ({
    ...rest,
    blocked: Boolean(suppressed_at),
  }));
  return { ok: true, items, total: count ?? items.length, page, pageSize: PAGE_SIZE };
}

export type MemberState = 'subscribed' | 'pending' | 'unsubscribed';

export interface ContactMembership {
  list_id: string;
  list_name: string;
  state: MemberState;
  joined_via: string;
  legal_basis: string;
  basis_note: string | null;
  basis_recorded_at: string;
  consent_notice_version: string | null;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  unsubscribed_by: string | null;
}

export type BlockReason = 'bounce' | 'complaint' | 'manual' | 'failed' | 'suppressed' | 'erased';

export interface ContactDetail {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  source: string;
  legal_basis: string;
  basis_note: string | null;
  basis_recorded_at: string;
  consent_notice_version: string | null;
  created_at: string;
  unsubscribed_at: string | null;
  erased: boolean;
  /** Shown to admins only (every route of this kit is admin-only). */
  block: { blocked: boolean; reason: BlockReason | null; since: string | null };
  memberships: ContactMembership[];
}

export async function getContactDetail(db: SupabaseClient, id: string): Promise<{ ok: true; contact: ContactDetail } | Failure> {
  const { data: row, error } = await db
    .from('email_contacts')
    .select(
      'id, email, email_normalized, first_name, last_name, organization, source, legal_basis, basis_note, basis_recorded_at, consent_notice_version, created_at, unsubscribed_at, suppressed_at, suppression_reason, anonymized_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(500, 'No se pudo leer a esta persona. Inténtalo de nuevo en un momento.');
  if (!row) return fail(404, 'No encontramos a esa persona.');
  const contact = row as Record<string, any>;

  const { data: memberRows, error: memberError } = await db
    .from('email_list_members')
    .select(
      'list_id, state, joined_via, legal_basis, basis_note, basis_recorded_at, consent_notice_version, subscribed_at, unsubscribed_at, unsubscribed_by, email_lists(name)'
    )
    .eq('contact_id', id)
    .order('created_at', { ascending: true });
  if (memberError) return fail(500, 'No se pudieron leer las listas de esta persona. Inténtalo de nuevo en un momento.');

  let suppression: { reason: string; created_at: string; erased_at: string | null } | null = null;
  if (contact.email_normalized) {
    const { data: block, error: blockError } = await db
      .from('email_suppression')
      .select('reason, created_at, erased_at')
      .eq('email_hash', addressFingerprint(contact.email_normalized))
      .maybeSingle();
    if (blockError) return fail(500, 'No se pudo comprobar si esta persona está bloqueada. Inténtalo de nuevo en un momento.');
    suppression = (block as typeof suppression) ?? null;
  }

  const erased = Boolean(contact.anonymized_at);
  let blockReason: BlockReason | null = null;
  let since: string | null = null;
  if (erased || suppression?.erased_at) {
    blockReason = 'erased';
    since = contact.anonymized_at ?? suppression?.erased_at ?? null;
  } else if (suppression) {
    blockReason = suppression.reason as BlockReason;
    since = suppression.created_at;
  } else if (contact.suppressed_at) {
    blockReason = (contact.suppression_reason as BlockReason) ?? 'suppressed';
    since = contact.suppressed_at;
  }

  const memberships: ContactMembership[] = ((memberRows ?? []) as Array<Record<string, any>>).map((m) => {
    const list = Array.isArray(m.email_lists) ? m.email_lists[0] : m.email_lists;
    return {
      list_id: m.list_id,
      list_name: typeof list?.name === 'string' ? list.name : 'Lista sin nombre',
      state: m.state,
      joined_via: m.joined_via,
      legal_basis: m.legal_basis,
      basis_note: m.basis_note ?? null,
      basis_recorded_at: m.basis_recorded_at,
      consent_notice_version: m.consent_notice_version ?? null,
      subscribed_at: m.subscribed_at ?? null,
      unsubscribed_at: m.unsubscribed_at ?? null,
      unsubscribed_by: m.unsubscribed_by ?? null,
    };
  });

  return {
    ok: true,
    contact: {
      id: contact.id,
      email: contact.email ?? null,
      first_name: contact.first_name ?? null,
      last_name: contact.last_name ?? null,
      organization: contact.organization ?? null,
      source: contact.source,
      legal_basis: contact.legal_basis,
      basis_note: contact.basis_note ?? null,
      basis_recorded_at: contact.basis_recorded_at,
      consent_notice_version: contact.consent_notice_version ?? null,
      created_at: contact.created_at,
      unsubscribed_at: contact.unsubscribed_at ?? null,
      erased,
      block: { blocked: blockReason !== null, reason: blockReason, since },
      memberships,
    },
  };
}

/** The id of the contact with this address, or null. */
export async function contactIdFor(db: SupabaseClient, address: string): Promise<string | null> {
  const { data, error } = await db.from('email_contacts').select('id').eq('email_normalized', normalizeAddress(address)).maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export interface EraseResult {
  contact_id: string;
  erased: boolean;
  already_erased: boolean;
  sends_cleared: number;
  memberships_ended: number;
}

export async function eraseContact(db: SupabaseClient, id: string, actor: string): Promise<{ ok: true; result: EraseResult } | Failure> {
  const { data, error } = await db.rpc('email_erase_contact', { p_contact_id: id, p_actor: actor });
  if (error) {
    const code = databaseCode(error);
    if (code === 'contact_not_found') return fail(404, databaseErrorMessage(error));
    return fail(code ? 400 : 500, databaseErrorMessage(error));
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    result: {
      contact_id: String(raw.contact_id ?? id),
      erased: raw.erased === true,
      already_erased: raw.already_erased === true,
      sends_cleared: Number(raw.sends_cleared) || 0,
      memberships_ended: Number(raw.memberships_ended) || 0,
    },
  };
}
