/**
 * GENERA's rule for "which pasantías leads may be brought into Correos". Server only.
 *
 * Only rows of `pasantias_leads` with `marketing_opt_in = true` (the optional newsletter tick), and only with
 * the tick's time and notice version present. The tick's time becomes the row's `basis_recorded_at`, its notice
 * version the row's `consent_notice_version`. The add route reads every id again and refuses the whole request
 * when one has not ticked. The registro-tractor form's table is never read.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ilikeAny, isValidAddress } from '../correos/address';
import { PAGE_SIZE, type ContactRowInput } from '../correos/contacts';

export interface TickedLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  institution: string | null;
  cohort: string | null;
  marketing_opt_in_at: string;
  marketing_notice_version: string;
}

const LEAD_SELECT = 'id, first_name, last_name, email, institution, cohort, marketing_opt_in, marketing_opt_in_at, marketing_notice_version';
const SEARCH_COLUMNS = ['email', 'first_name', 'last_name', 'institution'] as const;

interface LeadRow extends Omit<TickedLead, 'marketing_opt_in_at' | 'marketing_notice_version'> {
  marketing_opt_in: boolean | null;
  marketing_opt_in_at: string | null;
  marketing_notice_version: string | null;
}

function ticked(row: LeadRow): row is LeadRow & TickedLead {
  return (
    row.marketing_opt_in === true &&
    typeof row.marketing_opt_in_at === 'string' &&
    !Number.isNaN(new Date(row.marketing_opt_in_at).getTime()) &&
    typeof row.marketing_notice_version === 'string' &&
    row.marketing_notice_version.trim() !== '' &&
    isValidAddress(row.email)
  );
}

function toLead(row: LeadRow & TickedLead): TickedLead {
  const { marketing_opt_in: _tick, ...rest } = row;
  return rest;
}

export async function listTickedLeads(
  db: SupabaseClient,
  term: string,
  page: number
): Promise<{ ok: true; items: TickedLead[]; total: number; page: number; pageSize: number } | { ok: false }> {
  const from = (page - 1) * PAGE_SIZE;
  let query = db.from('pasantias_leads').select(LEAD_SELECT, { count: 'exact' }).eq('marketing_opt_in', true);
  if (term) query = query.or(ilikeAny(SEARCH_COLUMNS, term));
  const { data, error, count } = await query
    .order('marketing_opt_in_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) return { ok: false };
  const items = ((data ?? []) as LeadRow[]).filter(ticked).map(toLead);
  return { ok: true, items, total: count ?? items.length, page, pageSize: PAGE_SIZE };
}

/** Reads every id again. All ticked: their rows for `email_add_contacts`. One not: `{ ok: false }`. */
export async function checkLeadIds(
  db: SupabaseClient,
  ids: string[]
): Promise<{ ok: true; rows: ContactRowInput[] } | { ok: false; reason: 'not_allowed' | 'lookup_failed' }> {
  const { data, error } = await db.from('pasantias_leads').select(LEAD_SELECT).in('id', ids);
  if (error) return { ok: false, reason: 'lookup_failed' };
  const byId = new Map(((data ?? []) as LeadRow[]).map((row) => [row.id, row]));
  const rows: ContactRowInput[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || !ticked(row)) return { ok: false, reason: 'not_allowed' };
    rows.push({
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      organization: row.institution,
      basis_recorded_at: new Date(row.marketing_opt_in_at).toISOString(),
      consent_notice_version: row.marketing_notice_version.trim(),
    });
  }
  return { ok: true, rows };
}
