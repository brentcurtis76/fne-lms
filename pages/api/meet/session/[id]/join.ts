/**
 * POST /api/meet/session/[id]/join — the authorized join opening (plan §5).
 *
 * This is the ONE per-request opening through which anything Zoom-credential-
 * shaped leaves the server. Everything else about a managed meeting reaches the
 * UI through `public.session_meetings_public`, which has zero secret fields by
 * construction. Nothing here writes.
 *
 * ## The order of the gates IS the security property
 *
 * Authorization is fully resolved BEFORE a single fact about the meeting is
 * read. If the meeting lookup came first, the endpoint would answer "does this
 * session have a meeting, and has it been cancelled?" for callers who are not
 * allowed to know the session exists — an existence oracle for meetings,
 * rebuilt from the other side of the one `resolveMeetSessionAccess()` closed.
 * So:
 *
 *   1. not POST                     → 405
 *   2. no session                   → 401
 *   3. FEATURE_ZOOM_MEETINGS off    → 503, before any lookup (the kill switch
 *                                     must not reveal anything either)
 *   4. `authorizeMeetingJoin()`     → 404 / 403 per the §5 matrix
 *   -- authorization resolved; only past this line may meeting state be read --
 *   5. source of truth says the     → 410, for EVERY persona including admin,
 *      session is over or is no        BEFORE any meeting row is touched
 *      longer online
 *   6. projection cancelled/ended   → 410, for EVERY persona including admin
 *   7. no joinable meeting row yet  → 200 { mode: 'pending' }
 *   8. otherwise                    → 200 { mode: 'link', join_url, role, dial_in? }
 *
 * Gate 5 shares gate 6's outcome — the seven outcomes are unchanged, and 410 is
 * still the one answer for a meeting that is gone. What is new is WHERE it can
 * be reached from: `consultor_sessions` is written synchronously by cancel and
 * by a modality flip, while both gate 6's projection and gate 7's
 * `zoom_internal` row converge afterwards. Gating on those alone left a window
 * in which an AUTHORIZED caller — a real facilitator, not an intruder — was
 * handed a live `join_url`, passcode and dial-in set for a session the platform
 * already considered cancelled. §15's exit criterion is "cancel kills join",
 * and gate 5 is what makes that true now rather than eventually.
 *
 * `dial_in` (Z2-4e) is the ONLY widening this route has taken, and it is a widening
 * of outcome 8 alone: every refusal above is byte-identical to what it was before.
 * See `lib/utils/meeting-dial-in.ts` for why the meeting number and passcode may
 * leave through THIS opening and nowhere else. It is absent — not empty, not an
 * error — whenever the tenant has no audio plan, which is the common case.
 *
 * Step 7 is a 200 on purpose. Approve enqueues provisioning and the projection
 * row lands seconds later (§8); the UI shows "Enlace en preparación" in that
 * window. "Not yet" is a legitimate answer to "how do I join", in the same
 * `mode` vocabulary §5 already uses — a 4xx would make the normal path look
 * like a failure.
 *
 * ## What this route does NOT do
 *
 * No ZAK, no SDK signature, no `role:1` issuance — those are the embed path
 * (Z3), and `FEATURE_ZOOM_EMBED` is deliberately not read here: link mode is
 * the Z2 default (§15). `role` in the payload is descriptive metadata for the
 * UI, not a credential.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { HttpStatus } from '../../../../../lib/types/api-auth.types';
import { sendSessionNotFound } from '../../../../../lib/utils/session-denials';
import {
  authorizeMeetingJoin,
  joinIsClosedBySource,
  MEETING_CLOSED_MESSAGE,
} from '../../../../../lib/utils/meeting-join-policy';
import { isFeatureEnabled, FeatureFlags } from '../../../../../lib/featureFlags';
import { createZoomServiceClient, zoomInternalSchema } from '../../../../../lib/zoom/service-client';
import { buildJoinDialIn } from '../../../../../lib/utils/meeting-dial-in';

/** §14: the master kill switch answers 503 on the join route. */
export const FEATURE_DISABLED_MESSAGE = 'Las videollamadas están temporalmente deshabilitadas';

/**
 * §5: a cancelled or ended meeting is gone for everyone, admins included. Owned
 * by the join policy — the interstitial says the same sentence — and re-exported
 * here because this route's existing importers name it at this path.
 */
export { MEETING_CLOSED_MESSAGE };

const READ_FAILED_MESSAGE = 'Error al preparar el acceso a la reunión';

/** Projection statuses that mean the meeting is over, whatever `zoom_internal` says. */
const CLOSED_PROJECTION_STATUSES = ['cancelled', 'ended'];

/**
 * `zoom_meetings.status` values a participant can actually join. `pending` has
 * no `join_url` yet; `ended`/`cancelled`/`deleted`/`error` are not joinable and
 * must never yield a link even if the projection has not caught up.
 */
const JOINABLE_MEETING_STATUSES = ['provisioned', 'started'];

/** The narrow slice of `zoom_internal` this route addresses. Read-only. */
interface JoinInternalClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        eq(
          column: string,
          value: string
        ): {
          maybeSingle(): PromiseLike<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meet-session-join');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', HttpStatus.UNAUTHORIZED);
  }

  // Before any client is built, let alone any row read — see the header.
  if (!isFeatureEnabled(FeatureFlags.ZOOM_MEETINGS)) {
    return sendAuthError(res, FEATURE_DISABLED_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
  }

  try {
    const service = createServiceRoleClient();

    const decision = await authorizeMeetingJoin({
      sessionId: req.query.id,
      userId: user.id,
      service,
    });

    if (decision.kind === 'unauthenticated') {
      return sendAuthError(res, 'Autenticación requerida', HttpStatus.UNAUTHORIZED);
    }

    // Denied joins for callers who may not know the session exists share the
    // ONE session denial — same status, same body as a nonexistent id.
    if (decision.kind === 'not-found') {
      return sendSessionNotFound(res);
    }

    if (decision.kind === 'forbidden') {
      return sendAuthError(res, decision.message, HttpStatus.FORBIDDEN);
    }

    // ---- authorization resolved. Meeting state may now be read. ----

    // The source of truth answers FIRST. `decision.source` is the `status` and
    // `modality` of the `consultor_sessions` row the policy already read, so
    // this costs no round trip — and it runs before the projection read and, the
    // part that matters, before `zoom_internal` is addressed at all. Credentials
    // for a session that is over must not be FETCHED, never mind returned.
    if (joinIsClosedBySource(decision.source)) {
      return sendAuthError(res, MEETING_CLOSED_MESSAGE, 410);
    }

    const { data: projection, error: projectionError } = await service
      .from('session_meetings_public')
      .select('meeting_status')
      .eq('surface_type', 'consultor_session')
      .eq('surface_id', decision.sessionId)
      .maybeSingle();

    if (projectionError) {
      console.error('[meet-session-join] projection read failed:', projectionError.message);
      return sendAuthError(res, READ_FAILED_MESSAGE, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (projection && CLOSED_PROJECTION_STATUSES.includes(projection.meeting_status)) {
      return sendAuthError(res, MEETING_CLOSED_MESSAGE, 410);
    }

    const internal = zoomInternalSchema<JoinInternalClient>(createZoomServiceClient());

    const { data: meeting, error: meetingError } = await internal
      .from('zoom_meetings')
      .select('status, join_url, passcode, zoom_meeting_number, dial_in_numbers')
      .eq('surface_type', 'consultor_session')
      .eq('surface_id', decision.sessionId)
      .maybeSingle();

    if (meetingError) {
      console.error('[meet-session-join] meeting read failed:', meetingError.message);
      return sendAuthError(res, READ_FAILED_MESSAGE, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const joinUrl = typeof meeting?.join_url === 'string' ? meeting.join_url : null;

    // Provisioning has not landed (or the row is in a state nobody can join).
    // Carries no meeting facts at all — see the header on why this is a 200.
    if (!meeting || !JOINABLE_MEETING_STATUSES.includes(String(meeting.status)) || !joinUrl) {
      return sendApiResponse(res, { mode: 'pending' });
    }

    // Built ONLY here, past every gate, and only for the successful outcome. `null`
    // (no audio plan, unusable entries, no meeting number) omits the key entirely
    // rather than sending an empty one — see the header.
    const dialIn = buildJoinDialIn(meeting);

    return sendApiResponse(res, {
      mode: 'link',
      join_url: joinUrl,
      role: decision.role,
      ...(dialIn ? { dial_in: dialIn } : {}),
    });
  } catch (error: unknown) {
    // Names only — a Zoom config failure must never echo a value.
    console.error(
      '[meet-session-join] unexpected failure:',
      error instanceof Error ? error.message : 'unknown'
    );
    return sendAuthError(res, READ_FAILED_MESSAGE, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
