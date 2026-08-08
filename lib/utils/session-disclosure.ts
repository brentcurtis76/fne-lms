/**
 * Session Payload Disclosure Helpers
 *
 * `session-policy.ts` answers "may this user open the session at all?".
 * This module answers the narrower question that comes next: once a caller
 * has passed `canViewSession()`, WHAT is allowed inside the payload they get
 * back — restricted reports, personal e-mail addresses, and the raw meeting
 * link / transcript.
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
 * Whether a caller may receive the raw `meeting_link` inside a session
 * payload.
 *
 * Same persona set as `canViewParticipantEmails` — admins, the session's
 * facilitators, and school-scoped or global consultors — because the raw link
 * is a credential-shaped value: anyone holding it can walk into the meeting
 * without passing through the platform. Privileged callers keep the field
 * because admin/edit forms bind it; every other caller (growth-community
 * members, GC leaders included) gets `has_meeting` + `join_path` instead and
 * reaches the meeting through `/meet/session/{id}`.
 *
 * Kept as its own exported name — rather than calling `canViewParticipantEmails`
 * at the call sites — so the two rules can diverge later without hunting down
 * every consumer.
 */
export function canViewRawMeetingLink(ctx: SessionAccessContext): boolean {
  return canViewParticipantEmails(ctx);
}

/**
 * Whether a caller may receive `meeting_transcript`.
 *
 * A transcript is raw session content, so this follows the narrower
 * `facilitators_only` report rule: admins and the session's own facilitators.
 * A same-school consultor who is not facilitating this session does not read
 * it (PROJECT_STATE: *el asesor nunca lee contenido crudo de sesiones ajenas*).
 */
export function canViewMeetingTranscript(ctx: SessionAccessContext): boolean {
  return canViewRestrictedReports(ctx);
}

/**
 * The platform surface that reveals a session's meeting link. Single source of
 * truth for the path — the SSR page lives at `pages/meet/session/[id].tsx`.
 */
export function buildSessionJoinPath(sessionId: string): string {
  return `/meet/session/${sessionId}`;
}

/**
 * Does this session have a meeting to reach at all — whatever provider it uses?
 *
 * The one derivation behind every "offer the platform link" decision:
 * notifications, reminders, all three .ics endpoints and the workspace list.
 * It exists because those five sites each tested `meeting_link` alone, and a
 * Zoom-managed session keeps `meeting_link` NULL BY DESIGN (plan §8 — the real
 * join URL lives in `zoom_internal` and never touches `consultor_sessions`). So
 * for exactly the sessions this phase exists to serve, every one of those
 * surfaces announced a session and offered no way to reach it.
 *
 * What gets offered is always the platform surface — `/meet/session/{id}`,
 * which re-authorizes per click and resolves the current state. This predicate
 * decides WHETHER to offer it, never WHAT to offer, so nothing here widens what
 * a caller may hold.
 *
 * `has_meeting` is accepted alongside `meeting_link` because a client-side row
 * has been through `applySessionMeetingDisclosure` and may legitimately have had
 * the raw link stripped; the boolean is what survives that.
 */
export function sessionOffersPlatformJoin(row: {
  meeting_link?: string | null;
  has_meeting?: boolean | null;
  is_zoom_managed?: boolean | null;
}): boolean {
  if (row.is_zoom_managed === true) {
    return true;
  }
  if (row.has_meeting === true) {
    return true;
  }
  return Boolean(row.meeting_link);
}

/**
 * Meeting fields every caller receives, privileged or not.
 *
 * `has_meeting` lets a UI decide whether to render a join affordance without
 * ever holding the link; `join_path` is where that affordance points.
 */
export interface SessionMeetingDisclosure {
  has_meeting: boolean;
  join_path: string | null;
}

type MeetingRow = {
  id?: unknown;
  meeting_link?: unknown;
  meeting_transcript?: unknown;
  /**
   * Read, never emitted differently: it is the other half of `sessionOffersPlatformJoin`'s
   * input. A `select()` that never asked for it leaves it `undefined`, which the predicate
   * reads as "not managed" — the pre-r27 answer, unchanged.
   */
  is_zoom_managed?: unknown;
};

function hasMeetingLink(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Return a copy of a session row with the meeting disclosure policy applied:
 * `meeting_link` / `meeting_transcript` stripped unless the caller is entitled
 * to them, and `has_meeting` / `join_path` always added.
 *
 * Fields absent from the input row are not invented — a `select()` that never
 * asked for `meeting_transcript` does not gain a null one.
 */
export function applySessionMeetingDisclosure<T extends MeetingRow>(
  row: T,
  ctx: SessionAccessContext
): T & SessionMeetingDisclosure {
  const {
    meeting_link: rawLink,
    meeting_transcript: rawTranscript,
    ...rest
  } = row as MeetingRow & Record<string, unknown>;

  const out: Record<string, unknown> = { ...rest };

  if ('meeting_link' in row && canViewRawMeetingLink(ctx)) {
    out.meeting_link = rawLink ?? null;
  }

  if ('meeting_transcript' in row && canViewMeetingTranscript(ctx)) {
    out.meeting_transcript = rawTranscript ?? null;
  }

  // The SAME predicate the notifications, the reminders, the three .ics endpoints and the
  // workspace list use (r26 fixed those five; this was the sixth surface with the same root
  // cause). Deciding from the raw link alone reported `has_meeting: false` and a null
  // `join_path` for a Zoom-managed session, whose `meeting_link` is NULL BY DESIGN — i.e.
  // for exactly the sessions this phase exists to serve.
  //
  // The disclosure invariant is untouched: what widens is WHETHER a join is offered, never
  // WHAT is handed over. `join_path` is still the platform surface, and the raw link is
  // still governed by `canViewRawMeetingLink` above. `has_meeting` is deliberately NOT
  // forwarded from the input row — a payload must not be able to assert its own answer.
  const present = sessionOffersPlatformJoin({
    meeting_link: hasMeetingLink(rawLink) ? String(rawLink) : null,
    is_zoom_managed: row.is_zoom_managed === true,
  });
  out.has_meeting = present;
  out.join_path = present && row.id ? buildSessionJoinPath(String(row.id)) : null;

  return out as unknown as T & SessionMeetingDisclosure;
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
