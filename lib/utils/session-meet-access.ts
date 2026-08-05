/**
 * SSR access resolution for the meeting interstitial (`/meet/session/[id]`).
 *
 * The interstitial is the single platform surface that reveals a session's
 * legacy manual meeting link. Extracted from the page so the authorization
 * decisions are unit-testable without rendering React.
 *
 * Authorization is `canViewSession()` — the people who can open the session can
 * reach its meeting through the interstitial. Everything that is not an
 * authorized view collapses to one indistinguishable `not-found` result: a
 * caller must not be able to tell "this session exists but is not yours" from
 * "no such session" (no existence oracle).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserRoles, getHighestRole } from '../../utils/roleUtils';
import { canViewSession, SessionAccessContext } from './session-policy';
import { Validators } from '../types/api-auth.types';

/**
 * The only session fields the interstitial needs. Deliberately narrow: this
 * page renders a link, not a session detail view.
 */
export interface MeetSessionView {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  meeting_link: string | null;
  /**
   * Durable managed intent (plan §8). A managed session never carries a raw
   * link on the source row — the join goes through the authorized POST opening
   * instead — so the page needs this to pick which control to render.
   */
  is_zoom_managed: boolean;
}

export type MeetSessionAccess =
  | { kind: 'unauthenticated' }
  | { kind: 'not-found' }
  | { kind: 'ok'; session: MeetSessionView };

/** Single shared value so every denial path is byte-identical. */
const NOT_FOUND: MeetSessionAccess = { kind: 'not-found' };

export async function resolveMeetSessionAccess(params: {
  sessionId: unknown;
  userId: string | null | undefined;
  service: SupabaseClient;
}): Promise<MeetSessionAccess> {
  const { sessionId, userId, service } = params;

  if (!userId) {
    return { kind: 'unauthenticated' };
  }

  if (typeof sessionId !== 'string' || !Validators.isUUID(sessionId)) {
    return NOT_FOUND;
  }

  const { data: session, error } = await service
    .from('consultor_sessions')
    .select(
      'id, title, session_date, start_time, end_time, meeting_link, is_zoom_managed, school_id, growth_community_id, status, is_active'
    )
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

  // Same is_active rule as GET /api/sessions/[id]: only admins reach archived
  // sessions.
  if (session.is_active === false && highestRole !== 'admin') {
    return NOT_FOUND;
  }

  const { data: facilitatorRow } = await service
    .from('session_facilitators')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  const accessContext: SessionAccessContext = {
    highestRole,
    userRoles,
    session: {
      id: session.id,
      school_id: session.school_id,
      growth_community_id: session.growth_community_id,
      status: session.status,
    },
    userId,
    isFacilitator: !!facilitatorRow,
  };

  if (!canViewSession(accessContext)) {
    return NOT_FOUND;
  }

  return {
    kind: 'ok',
    session: {
      id: session.id,
      title: session.title,
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      meeting_link: session.meeting_link ?? null,
      is_zoom_managed: session.is_zoom_managed === true,
    },
  };
}
