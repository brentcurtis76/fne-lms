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
 *      …or, for a participant with `FEATURE_ZOOM_EMBED` on (Z3-1),
 *                                  → 200 { mode: 'sdk', signature, sdk_key,
 *                                          meeting_number, passcode, user_name,
 *                                          customer_key, role, dial_in? }
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
 * `dial_in` (Z2-4e) and `mode: 'sdk'` (Z3-1) are the ONLY widenings this route has
 * taken, and both widen outcome 8 alone: every refusal above is byte-identical to
 * what it was before, in either flag state. See `lib/utils/meeting-dial-in.ts` for
 * why the meeting number and passcode may leave through THIS opening and nowhere
 * else. `dial_in` is absent — not empty, not an error — whenever the tenant has no
 * audio plan, which is the common case, and it rides on both payload shapes: its
 * rationale is a school internet outage, which is unchanged by how the video is
 * rendered.
 *
 * Step 7 is a 200 on purpose. Approve enqueues provisioning and the projection
 * row lands seconds later (§8); the UI shows "Enlace en preparación" in that
 * window. "Not yet" is a legitimate answer to "how do I join", in the same
 * `mode` vocabulary §5 already uses — a 4xx would make the normal path look
 * like a failure.
 *
 * ## The SDK outcome (Z3-1)
 *
 * With `FEATURE_ZOOM_EMBED` on, a caller the §5 matrix resolved to
 * `participant` receives an SDK payload instead of a link, so a school user
 * joins inside GENERA without a Zoom account. Four properties hold it in place:
 *
 *  - **`join_url` is absent from that payload** — not null, not empty: absent
 *    (§5, "`join_url` — never sent in SDK mode").
 *  - **The numeric role never reaches the wire.** `role` stays the descriptive
 *    `'host' | 'participant'` the UI already reads; `role: 0` lives inside the
 *    signed JWT and nowhere else, because a numeric role on the wire is a value
 *    a client could try to echo back and §5 ignores client-supplied roles.
 *  - **`host` keeps getting a link.** §9 provisions with `join_before_host:
 *    false`, so a host joining `role:1` without a ZAK cannot start the meeting —
 *    issuing one here would hand the person the meeting depends on a join that
 *    fails. ZAK, `role:1` and the §9.4 per-identity rule are Z3-2.
 *  - **Every SDK failure degrades to link mode**, never to an error: an embed
 *    misconfiguration must not deny a join that link mode could have served.
 *
 * ## What this route does NOT do
 *
 * No ZAK and no `role:1` issuance — that is chunk Z3-2. `role` in the payload is
 * descriptive metadata for the UI, not a credential.
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
import { signZoomSdkJwt } from '../../../../../lib/zoom/signer';

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

/**
 * §4: the SDK needs a `userName` and rejects an empty one, so a caller whose
 * profile carries neither name part still joins — under a label that identifies
 * nobody. es-CL, because every other participant sees it.
 */
const SDK_FALLBACK_USER_NAME = 'Participante';

/**
 * `zoom_meetings.zoom_meeting_number` is a bigint: the driver may hand it back as
 * a JS number or as a string, and neither shape is what the signer takes. Convert
 * deliberately; the 9–11 digit rule stays the signer's to enforce.
 */
function normalizeMeetingNumber(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * §4: `customerKey` is the user's UUID with hyphens stripped. Z0B verified it is
 * the ONLY identity field Zoom populates for a license-free guest, and that it
 * survives byte-identical through both the roster and the report API — Z7 matches
 * attendance on it, so a wrong value here breaks a phase nobody would trace back.
 */
function toCustomerKey(userId: string): string {
  return userId.replace(/-/g, '');
}

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

/** The SDK half of the join payload — everything except `role` and `dial_in`. */
interface SdkJoinPayload {
  signature: string;
  sdk_key: string;
  meeting_number: string;
  passcode: string;
  user_name: string;
  customer_key: string;
}

/**
 * Mints the SDK credentials for a participant, or returns `null` so the caller
 * answers with the link payload instead.
 *
 * `null` is the whole error vocabulary on purpose: absent SDK env, a meeting
 * number the signer refuses, a signer that throws for any other reason. An embed
 * misconfiguration must never deny a join link mode could have served, so this is
 * the fail-safe direction and it is deliberate. Failures are logged by name only
 * — a Zoom config failure must never echo a value.
 */
async function buildSdkJoinPayload(input: {
  service: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  meetingNumber: string | null;
  passcode: string;
}): Promise<SdkJoinPayload | null> {
  const sdkKey = process.env.ZOOM_SDK_CLIENT_ID;
  const sdkSecret = process.env.ZOOM_SDK_CLIENT_SECRET;

  // Server-side ids only. The `NEXT_PUBLIC_` half is the browser's copy of the
  // key and carries no secret — reading it here would sign with the wrong pair.
  if (!sdkKey || !sdkSecret || !input.meetingNumber) {
    console.error('[meet-session-join] SDK mode unavailable: missing config or meeting number');
    return null;
  }

  let signature: string;
  try {
    signature = signZoomSdkJwt({
      sdkKey,
      sdkSecret,
      meetingNumber: input.meetingNumber,
      // §5: decided server-side. Z3-1 issues participants only.
      role: 0,
    });
  } catch (error: unknown) {
    console.error(
      '[meet-session-join] SDK signature refused:',
      error instanceof Error ? error.name : 'unknown'
    );
    return null;
  }

  // `profiles` has no `full_name` column; every session surface composes the
  // display name from these two. `email` is deliberately NOT selected — the SDK
  // shows this string to every other participant, and embedded `profiles`
  // relations are how attendee e-mails leaked before (`lib/utils/session-disclosure.ts`).
  const { data: profile, error: profileError } = await input.service
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', input.userId)
    .maybeSingle();

  if (profileError) {
    console.error('[meet-session-join] profile read failed:', profileError.message);
  }

  const userName =
    [profile?.first_name, profile?.last_name]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join(' ') || SDK_FALLBACK_USER_NAME;

  return {
    signature,
    sdk_key: sdkKey,
    meeting_number: input.meetingNumber,
    passcode: input.passcode,
    user_name: userName,
    customer_key: toCustomerKey(input.userId),
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

    // Outcome 8, embed variant. Reachable ONLY from here — past every gate — and
    // only for a participant, per the header. Anything missing or malformed falls
    // through to the link payload below rather than failing the join.
    if (isFeatureEnabled(FeatureFlags.ZOOM_EMBED) && decision.role === 'participant') {
      const sdkPayload = await buildSdkJoinPayload({
        service,
        userId: user.id,
        meetingNumber: normalizeMeetingNumber(meeting.zoom_meeting_number),
        passcode: typeof meeting.passcode === 'string' ? meeting.passcode : '',
      });

      if (sdkPayload) {
        return sendApiResponse(res, {
          mode: 'sdk',
          ...sdkPayload,
          // Descriptive metadata, exactly as in link mode. The numeric role is
          // inside the signature and stays there.
          role: decision.role,
          ...(dialIn ? { dial_in: dialIn } : {}),
        });
      }
    }

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
