/**
 * Session Payload Disclosure Helpers
 *
 * `session-policy.ts` answers "may this user open the session at all?".
 * This module answers the narrower question that comes next: once a caller
 * has passed `canViewSession()`, WHAT is allowed inside the payload they get
 * back — restricted reports and personal e-mail addresses.
 *
 * Every session GET that embeds `profiles(... email)` or `session_reports`
 * routes through these helpers, so the rule cannot drift between the detail
 * endpoint and its siblings (reports/materials/attendees/list).
 */

import { SessionAccessContext, getConsultorAccess } from './session-policy';

/**
 * Callers allowed to read `facilitators_only` reports: admins and the
 * session's own facilitators.
 *
 * Note this is deliberately NARROWER than `canEditSession()`: a GC leader can
 * edit a session's content but is not a facilitator, so they still only see
 * `all_participants` reports.
 */
export function canViewRestrictedReports(ctx: SessionAccessContext): boolean {
  return ctx.highestRole === 'admin' || ctx.isFacilitator;
}

/**
 * Apply report visibility to a fetched `session_reports` array.
 * Non-privileged callers receive only `visibility === 'all_participants'`.
 */
export function filterReportsByVisibility<T extends { visibility?: string | null }>(
  reports: T[] | null | undefined,
  ctx: SessionAccessContext
): T[] {
  const rows = reports ?? [];
  if (canViewRestrictedReports(ctx)) {
    return rows;
  }
  return rows.filter((r) => r.visibility === 'all_participants');
}

/**
 * Whether a caller may receive personal e-mail addresses embedded in a session
 * payload (facilitators, attendees, material uploaders, report authors).
 *
 * Allowed: admins, consultors scoped to the session's school (or global
 * consultors), and the session's own facilitators. Growth-community members —
 * including GC leaders — get names without e-mails.
 */
export function canViewParticipantEmails(ctx: SessionAccessContext): boolean {
  if (ctx.highestRole === 'admin') {
    return true;
  }

  if (ctx.isFacilitator) {
    return true;
  }

  if (ctx.highestRole === 'consultor') {
    const access = getConsultorAccess(ctx.userRoles);
    if (access.isGlobal) {
      return true;
    }
    if (access.schoolIds.includes(String(ctx.session.school_id))) {
      return true;
    }
  }

  return false;
}

/**
 * Keys under which Supabase returns an embedded `profiles` relation. Every
 * session query aliases its profile join to `profiles` (`profiles:user_id`,
 * `profiles:uploaded_by`, `profiles:author_id`, …), so one key covers them all.
 */
const PROFILE_EMBED_KEY = 'profiles';

function withoutEmail(profile: unknown): unknown {
  if (Array.isArray(profile)) {
    return profile.map(withoutEmail);
  }
  if (!profile || typeof profile !== 'object') {
    return profile;
  }
  const { email: _email, ...rest } = profile as Record<string, unknown>;
  return rest;
}

/**
 * Return a copy of a Supabase row (or array of rows) with `email` removed from
 * every embedded `profiles` relation, at any nesting depth.
 *
 * Depth matters: the list GET embeds
 * `session_facilitators(*, profiles(first_name, last_name, email))`, so the
 * e-mail sits two levels down from the session row.
 */
export function redactProfileEmails<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactProfileEmails(item)) as unknown as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = key === PROFILE_EMBED_KEY ? withoutEmail(child) : redactProfileEmails(child);
  }
  return out as unknown as T;
}
