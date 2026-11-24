/**
 * GENERA's rule for "which platform users may be brought into Correos". Server only.
 *
 * A user is offered, and accepted, only when ALL of these hold:
 *   - they have at least one ACTIVE `user_roles` row (any role: that is what "staff" means here; pupils are not
 *     users of the platform, so they never appear);
 *   - their profile has a valid address;
 *   - the outbound policy (`authorizeUserEmail`) allows mail to them, so nobody tied to a QA school
 *     (`schools.tenant_kind = 'qa'`) and nobody whose lookup fails.
 *
 * The listing and the add route use this same rule: the add route checks every id again and refuses the whole
 * request when one fails. Name and address are copied as they are now (a later change to the account does not
 * reach the contact).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeUserEmail } from '../email/outbound-policy';
import { ilikeAny, isValidAddress } from '../correos/address';
import { PAGE_SIZE } from '../correos/contacts';

export interface StaffCandidate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

const STAFF_SELECT = 'id, first_name, last_name, name, email, user_roles!user_roles_user_id_fkey!inner(id)';
const SEARCH_COLUMNS = ['email', 'first_name', 'last_name', 'name'] as const;

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
}

function toCandidate(row: ProfileRow): StaffCandidate {
  const first = row.first_name?.trim() || null;
  const last = row.last_name?.trim() || null;
  // Only the full name is known: it goes in as the first name, unchanged.
  const fallback = !first && !last ? row.name?.trim() || null : null;
  return { id: row.id, first_name: first ?? fallback, last_name: last, email: (row.email ?? '').trim() };
}

async function mayBeMailed(db: SupabaseClient, row: ProfileRow): Promise<boolean> {
  if (!isValidAddress(row.email)) return false;
  try {
    const decision = await authorizeUserEmail(db, row.id);
    return decision.kind === 'allow';
  } catch {
    return false;
  }
}

/**
 * One page (25) of staff users matching the search. Users the rule leaves out are dropped from the page and
 * counted in `hidden`, so the screen can say so; they are never offered.
 */
export async function listStaff(
  db: SupabaseClient,
  term: string,
  page: number
): Promise<{ ok: true; items: StaffCandidate[]; hidden: number; total: number; page: number; pageSize: number } | { ok: false }> {
  const from = (page - 1) * PAGE_SIZE;
  let query = db
    .from('profiles')
    .select(STAFF_SELECT, { count: 'exact' })
    .eq('user_roles.is_active', true)
    .not('email', 'is', null);
  if (term) query = query.or(ilikeAny(SEARCH_COLUMNS, term));
  const { data, error, count } = await query
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) return { ok: false };

  const rows = (data ?? []) as unknown as ProfileRow[];
  const verdicts = await Promise.all(rows.map((row) => mayBeMailed(db, row)));
  const items = rows.filter((_, index) => verdicts[index]).map(toCandidate);
  return { ok: true, items, hidden: rows.length - items.length, total: count ?? rows.length, page, pageSize: PAGE_SIZE };
}

/**
 * Checks every id again by the same rule. All pass: the users as they are now. One fails (unknown, no active
 * role, no valid address, refused by the outbound policy): `{ ok: false }` and nothing for any of them.
 */
export async function checkStaffIds(
  db: SupabaseClient,
  ids: string[]
): Promise<{ ok: true; users: StaffCandidate[] } | { ok: false; reason: 'not_allowed' | 'lookup_failed' }> {
  const { data, error } = await db.from('profiles').select(STAFF_SELECT).in('id', ids).eq('user_roles.is_active', true);
  if (error) return { ok: false, reason: 'lookup_failed' };
  const rows = (data ?? []) as unknown as Array<ProfileRow & { user_roles?: unknown[] }>;
  const byId = new Map(rows.filter((row) => Array.isArray(row.user_roles) && row.user_roles.length > 0).map((row) => [row.id, row]));
  const found = ids.map((id) => byId.get(id));
  if (found.some((row) => !row)) return { ok: false, reason: 'not_allowed' };
  const verdicts = await Promise.all((found as ProfileRow[]).map((row) => mayBeMailed(db, row)));
  if (verdicts.some((allowed) => !allowed)) return { ok: false, reason: 'not_allowed' };
  return { ok: true, users: (found as ProfileRow[]).map(toCandidate) };
}
