/**
 * Join authorization for platform-managed meetings (plan §5).
 *
 * ## Why this is not `canViewSession()`
 *
 * `canViewSession()` answers "may this user OPEN the session?" — the read model
 * behind the detail page, the interstitial and every session GET. Joining is a
 * different question: live audio is raw session content, and the attendee list
 * is what feeds attendance and billable hours. §5 states it as *viewing ≠
 * sitting in*, and makes the join list strictly narrower:
 *
 *     join list = session_attendees(expected) ∪ session_facilitators ∪ admins
 *
 * The load-bearing consequence is that an ACTIVE growth-community member who
 * passes `canViewSession()` is denied here with 403 — so this module cannot be
 * built by wrapping the view policy, and deliberately is not. It reuses the
 * role and facilitator LOOKUPS (they are the same rows) but owns the decision.
 *
 * ## The denial vocabulary
 *
 * Two denials, and the difference between them is the whole point:
 *
 *  - `not-found` — the caller may not learn that this session exists. Every
 *    such path returns the one shared `NOT_FOUND` value so an other-school
 *    caller is byte-identical to a nonexistent UUID (the same no-existence-
 *    oracle rule `resolveMeetSessionAccess()` enforces at the interstitial).
 *  - `forbidden` — the caller already knows the session exists, because they
 *    are inside its community or its school. Only the join is refused, and the
 *    two reasons carry different copy: the GC member is told about the
 *    attendee list (their remedy is a facilitator adding them, one click), the
 *    non-assigned consultor is not (there is nothing for them to do — *el
 *    asesor nunca lee contenido crudo de sesiones ajenas*).
 *
 * ## What this module deliberately does NOT do
 *
 * No meeting state is read here, and no credential of any kind is minted or
 * returned. `role` is descriptive metadata for the caller's UI, NOT a
 * credential: ZAK, SDK signatures and `role:1` issuance are the embed path
 * (§9/§5, phase Z3). Authorization must be fully resolved before the caller
 * learns anything about the meeting, or the join endpoint becomes an existence
 * oracle for meetings — so the ordering lives in the route, and this module is
 * the half that answers first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserRoles, getHighestRole } from '../../utils/roleUtils';
import { getConsultorAccess } from './session-policy';
import { Validators } from '../types/api-auth.types';

/** How the caller joins. Descriptive only — never a credential. See header. */
export type MeetingJoinRole = 'host' | 'participant';

/**
 * Why a caller who CAN see the session still may not join it. The two values
 * exist so the caller can tell the remedies apart (§5), not merely the status.
 */
export type MeetingJoinDenialReason = 'not-in-attendees' | 'consultor-not-facilitator';

/** §5, verbatim intent: names the attendee list, and points at the remedy. */
export const NOT_IN_ATTENDEES_MESSAGE =
  'No estás en la lista de asistentes de esta sesión. Pídele a un facilitador que te agregue.';

/**
 * The non-assigned consultor. Deliberately says nothing about the attendee
 * list: there is no remedy for them, and naming the roster would describe the
 * contents of a session they are not part of.
 */
export const CONSULTOR_NOT_FACILITATOR_MESSAGE =
  'No tienes acceso para unirte a esta reunión.';

export type MeetingJoinAuthorization =
  | { kind: 'unauthenticated' }
  | { kind: 'not-found' }
  | { kind: 'forbidden'; reason: MeetingJoinDenialReason; message: string }
  | { kind: 'authorized'; sessionId: string; role: MeetingJoinRole };

/** Single shared value so every not-found path is byte-identical. */
const NOT_FOUND: MeetingJoinAuthorization = { kind: 'not-found' };

/**
 * Resolve join authorization for a consultor session, per the §5 matrix.
 *
 * Consultor sessions only — community meetings have their own join list (§5,
 * second matrix) and land in a later phase.
 */
export async function authorizeMeetingJoin(params: {
  sessionId: unknown;
  userId: string | null | undefined;
  service: SupabaseClient;
}): Promise<MeetingJoinAuthorization> {
  const { sessionId, userId, service } = params;

  if (!userId) {
    return { kind: 'unauthenticated' };
  }

  // A malformed id is answered exactly like an id that does not exist — the
  // shape of the id must not be a second oracle dimension.
  if (typeof sessionId !== 'string' || !Validators.isUUID(sessionId)) {
    return NOT_FOUND;
  }

  const { data: session, error } = await service
    .from('consultor_sessions')
    .select('id, school_id, growth_community_id, is_active')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !session) {
    return NOT_FOUND;
  }

  const userRoles = await getUserRoles(service, userId);
  const highestRole = getHighestRole(userRoles);

  if (!highestRole) {
    return NOT_FOUND;
  }

  if (highestRole === 'admin') {
    return { kind: 'authorized', sessionId, role: 'host' };
  }

  // Same is_active rule as the interstitial and GET /api/sessions/[id]: only
  // admins reach archived sessions. Without it the join opening would be more
  // permissive than the surfaces that lead to it.
  if (session.is_active === false) {
    return NOT_FOUND;
  }

  const { data: facilitatorRow } = await service
    .from('session_facilitators')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  // Facilitator is checked before attendee: someone who is both runs the call.
  if (facilitatorRow) {
    return { kind: 'authorized', sessionId, role: 'host' };
  }

  const { data: attendeeRow } = await service
    .from('session_attendees')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .eq('expected', true)
    .maybeSingle();

  if (attendeeRow) {
    return { kind: 'authorized', sessionId, role: 'participant' };
  }

  // Active member of this session's growth community, but not on the roster.
  const isCommunityMember = userRoles.some(
    (role) => role.community_id === session.growth_community_id && role.is_active
  );

  if (isCommunityMember) {
    return {
      kind: 'forbidden',
      reason: 'not-in-attendees',
      message: NOT_IN_ATTENDEES_MESSAGE,
    };
  }

  // A consultor whose scope covers this school, but who is not assigned to
  // this session. They can already see the session, so 404 would be a lie they
  // could detect; the join is what is refused.
  if (highestRole === 'consultor') {
    const access = getConsultorAccess(userRoles);
    if (access.isGlobal || access.schoolIds.includes(String(session.school_id))) {
      return {
        kind: 'forbidden',
        reason: 'consultor-not-facilitator',
        message: CONSULTOR_NOT_FACILITATOR_MESSAGE,
      };
    }
  }

  // Everyone else — including every other-school user — learns nothing.
  return NOT_FOUND;
}
