/**
 * SSR access resolution for the meeting interstitial (`/meet/session/[id]`).
 *
 * The interstitial is the single platform surface that reveals a session's
 * legacy manual meeting link. Extracted from the page so the authorization
 * decisions are unit-testable without rendering React.
 *
 * ## Two decisions, not one (plan §5, amended 2026-08-06 by owner decision)
 *
 * PAGE VISIBILITY is `canViewSession()` — the same rule every other session
 * surface uses. Everything that is not an authorized view collapses to one
 * indistinguishable `not-found` result: a caller must not be able to tell "this
 * session exists but is not yours" from "no such session" (no existence oracle).
 *
 * The JOIN CAPABILITY on that page is `authorizeMeetingJoin()` — the §5 join
 * list, which is strictly narrower (*viewing ≠ sitting in*). It governs BOTH
 * ways into the meeting this page can offer: the managed Zoom affordance and the
 * raw pasted `meeting_link` a `google_meet`/`teams`/`otro` session carries.
 * Whoever holds that URL can enter the meeting, so it is a capability, not
 * information — gating it by page visibility while the Zoom path is gated by the
 * join list meant two ways in under two different rules, chosen by whichever
 * provider the scheduler happened to pick. A persona who may view but may not
 * join now gets the same answer for both providers.
 *
 * The SESSION-STATE rule is the same shape and was the half left unfinished: a
 * cancelled session, or one flipped to `presencial`, answers 410 on the join
 * route — while this page went on rendering the pasted link for it to an
 * authorized persona. `joinIsClosedBySource()` (the join route's own gate 5) now
 * decides that here too, so both providers close at the same moment for the same
 * reason, and one closed set governs the route and the page alike.
 *
 * The link is therefore withheld from the PROPS, not merely from the markup:
 * page props are serialised into `__NEXT_DATA__`, so a conditional render would
 * ship the URL to the very persona it is withheld from.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserRoles, getHighestRole } from '../../utils/roleUtils';
import { canViewSession, SessionAccessContext } from './session-policy';
import {
  authorizeMeetingJoin,
  joinIsClosedBySource,
  MEETING_CLOSED_MESSAGE,
} from './meeting-join-policy';
import { isFeatureEnabled, FeatureFlags } from '../featureFlags';
import { Validators } from '../types/api-auth.types';

/**
 * Whether this viewer may use the page's join capability.
 *
 *  - `allowed`  — `authorizeMeetingJoin()` authorized them.
 *  - `denied`   — they may open the page and may not join, either provider.
 *  - `closed`   — the SOURCE OF TRUTH says this session is over or is no longer
 *    online (cancelled, finished, flipped to `presencial`). About the session,
 *    not about the viewer: the join route already answers 410 here for every
 *    persona, and until now the page still handed the same persona a pasted
 *    link for the same session. Reached only past authorization, so it discloses
 *    nothing to anyone the join list refused.
 *  - `disabled` — §14's master kill switch is off, so there is no Zoom join to
 *    offer. Strictly narrower than `denied`: it is only ever reached by a
 *    viewer who WOULD be allowed, so the flag's state is never disclosed to a
 *    persona the join list already refused.
 */
export type MeetJoinAccess = 'allowed' | 'denied' | 'closed' | 'disabled';

/**
 * Shown to a viewer the join list refuses for a reason that carries no remedy.
 * Deliberately the same copy as §5's non-assigned-consultor 403: it says
 * nothing about the attendee roster, which would describe the contents of a
 * session the viewer is not part of.
 */
export const JOIN_NOT_AUTHORIZED_MESSAGE = 'No tienes acceso para unirte a esta reunión.';

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
  /**
   * The raw pasted link of a legacy/manual session — present ONLY when
   * `join_access` is `allowed`. See the header: withholding it from the markup
   * alone would still serialise it into `__NEXT_DATA__`.
   */
  meeting_link: string | null;
  /**
   * Durable managed intent (plan §8). A managed session never carries a raw
   * link on the source row — the join goes through the authorized POST opening
   * instead — so the page needs this to pick which control to render.
   */
  is_zoom_managed: boolean;
  /** §5 join list, resolved for this viewer against THIS session. */
  join_access: MeetJoinAccess;
  /** es-CL copy for the refusal; set iff `join_access` is `denied` or `closed`. */
  join_denial_message: string | null;
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

  // Page visibility is settled. The join capability is a SECOND, narrower
  // decision, and it is the join policy's to make — this module reuses it
  // rather than reimplementing it, so the page and the join API can never
  // disagree about who may enter a meeting. It costs a second pass over rows
  // this function has already read; the alternative is a private copy of the
  // §5 matrix, which is the failure mode the policy module exists to prevent.
  const joinDecision = await authorizeMeetingJoin({ sessionId, userId, service });
  const isZoomManaged = session.is_zoom_managed === true;

  // §14: the master kill switch is enforced here as well as on the join route,
  // so the page stops offering a join it knows would answer 503. It is checked
  // AFTER authorization — see `MeetJoinAccess` — and only for the managed path:
  // the flag governs Zoom, and a school's pasted Meet or Teams link is not a
  // Zoom capability to switch off.
  //
  // The source-of-truth close sits between the two: it is the join route's own
  // gate 5, applied to the page from the SAME predicate rather than a second
  // copy of the closed set. Ordered after `denied` because a viewer the join
  // list refuses learns nothing further about the session, and before
  // `disabled` because a cancelled session is closed whatever the flag says.
  const joinAccess: MeetJoinAccess =
    joinDecision.kind !== 'authorized'
      ? 'denied'
      : joinIsClosedBySource(joinDecision.source)
        ? 'closed'
        : isZoomManaged && !isFeatureEnabled(FeatureFlags.ZOOM_MEETINGS)
          ? 'disabled'
          : 'allowed';

  return {
    kind: 'ok',
    session: {
      id: session.id,
      title: session.title,
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      meeting_link: joinAccess === 'allowed' ? (session.meeting_link ?? null) : null,
      is_zoom_managed: isZoomManaged,
      join_access: joinAccess,
      join_denial_message:
        joinAccess === 'closed'
          ? MEETING_CLOSED_MESSAGE
          : joinAccess !== 'denied'
            ? null
            : // §5 gives the GC member who is not on the roster their remedy (a
              // facilitator adds them); everyone else gets the copy with no
              // remedy in it.
              joinDecision.kind === 'forbidden'
              ? joinDecision.message
              : JOIN_NOT_AUTHORIZED_MESSAGE,
    },
  };
}
