/**
 * POST /api/meet/session/[id]/join — the authorized join opening (plan §5).
 *
 * This is the ONE per-request opening through which anything Zoom-credential-
 * shaped leaves the server. Everything else about a managed meeting reaches the
 * UI through `public.session_meetings_public`, which has zero secret fields by
 * construction.
 *
 * **This route makes exactly ONE write, and it is conditional** (Z3-2, corrected here
 * in Z3-r9 — the header said "Nothing here writes" for four rounds after the write
 * landed): the §9 `zoom_internal.zoom_zak_issuances` audit row, inserted in
 * `issueHostCredential` and ONLY on the branch where a host credential is about to
 * leave the server. Every other path — every refusal, `pending`, link mode, and the
 * whole participant embed — is read-only. Nothing else may be added: this header is
 * the operator contract for what this opening does, and a write it does not describe
 * is a trust-boundary defect whether or not it is tested.
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
 * ## The SDK outcome (Z3-1, extended by Z3-2)
 *
 * With `FEATURE_ZOOM_EMBED` on, a caller the §5 matrix authorized receives an SDK
 * payload instead of a link, so a school user joins inside GENERA without a Zoom
 * account. Four properties hold it in place:
 *
 *  - **`join_url` is absent from that payload** — not null, not empty: absent
 *    (§5, "`join_url` — never sent in SDK mode").
 *  - **The numeric role never reaches the wire.** `role` stays the descriptive
 *    `'host' | 'participant'` the UI already reads; `role: 0`/`role: 1` lives
 *    inside the signed JWT and nowhere else, because a numeric role on the wire
 *    is a value a client could try to echo back and §5 ignores client-supplied
 *    roles.
 *  - **A host is signed `role: 1` only WITH a ZAK.** §9 provisions with
 *    `join_before_host: false`, so `role: 1` without a ZAK is a join that cannot
 *    start the meeting — worse than the link that works. The two therefore travel
 *    together or not at all, and a host the §9 rule refuses falls back to link
 *    mode exactly as every other SDK failure does.
 *  - **Every SDK failure degrades to link mode**, never to an error: an embed
 *    misconfiguration must not deny a join that link mode could have served.
 *
 * ## The client's fallback intent (Z3-3)
 *
 * The browser half can fail where the server cannot see it — an unreachable CDN, a
 * bundle that never assigns its global, an `init` or `join` that rejects, a device that
 * cannot run Component View at all. §5 forbids `join_url` in an SDK payload, so the
 * client cannot hold a fallback in reserve; it re-POSTs with `{ fallback: 'link' }` and
 * this route skips the SDK branch and nothing else. See `wantsLinkFallback`.
 *
 * ## Host credentials (Z3-2)
 *
 * `decision.role === 'host'` covers admins AND assigned facilitators, and §9 gives
 * them different answers depending on the identity the meeting is hosted on. That
 * rule — who may receive a ZAK, for whose identity — lives in
 * `lib/utils/meeting-zak-policy.ts`; this route supplies its facts, fetches the
 * credential when it says yes, and writes the `zak_issued` audit row §9 requires.
 *
 * Three orderings in `issueHostCredential` are load-bearing:
 *
 *  1. **The rule runs before Zoom is called at all.** A refusal must not even ASK
 *     for a credential — "the ZAK client method was not called" is the assertion,
 *     not "the payload lacks one".
 *  2. **The audit write is the last thing before the token is handed over**, so a
 *     row exists exactly when a credential left the server. An audit that logged
 *     the intent would record issuances that never happened.
 *  3. **A failed audit write withholds the ZAK.** The log is a precondition of the
 *     rule, not a side effect of it; without it the caller gets link mode.
 *
 * The ZAK itself is never persisted, logged or echoed anywhere but the host's own
 * SDK payload (§5: "fetched at start-click, never persisted").
 *
 * ## The ZAK call is on a request budget (Z3-r9, Sol M4)
 *
 * `getUserZak` is the one outbound Zoom call this route makes, and `lib/zoom/client.ts`
 * was written for the cron worker: three attempts, exponential backoff, and up to two
 * 60 s `Retry-After` sleeps honoured inline, over a `fetch` that has no default timeout
 * at all. On a request that is a promise this route cannot keep — the fourth property
 * above says every SDK failure degrades to link mode, and a call that never settles
 * never reaches the link response, so the platform's own timeout answers instead with
 * an error.
 *
 * So the call carries `ZAK_REQUEST_BUDGET_MS` as an `AbortSignal`, which bounds the
 * whole call rather than one attempt (see that file's header §4). **Exhaustion is a
 * refusal like any other §9 refusal: `null`, link mode, and NO audit row** — a
 * credential that never arrived was never issued, and a row claiming otherwise would
 * be the §9 log describing an issuance that did not happen.
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
import { signZoomSdkJwt, type ZoomSdkRole } from '../../../../../lib/zoom/signer';
import {
  resolveZakIssuance,
  type ZakHostIdentity,
  type ZakPersonaBranch,
} from '../../../../../lib/utils/meeting-zak-policy';
import { getZoomApi } from '../../../../../lib/zoom/api';
import { getUserRoles, getHighestRole } from '../../../../../utils/roleUtils';
import { resolveSchoolProviderDisposition } from '../../../../../lib/simulation/tenant-policy';

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
 * The total lifetime the §9 ZAK call may spend, retries and `Retry-After` sleeps
 * included (Sol M4; `lib/zoom/client.ts` header §4).
 *
 * 8 s, chosen against what is on the other end rather than against a platform limit:
 * a person has clicked "Unirse a la reunión" and is watching a spinner, and the answer
 * this budget protects — link mode — is the one they received before the embed existed.
 * Waiting longer to maybe get an embed is a worse trade than opening Zoom in a tab now.
 *
 * It bounds ONE call — a single `GET /users/{id}/token` — so it is not a division of a
 * platform timeout among stages, and nothing else on this route is budgeted by it. If a
 * healthy tenant is ever measured near this number, the number is wrong; it is not a
 * substitute for the field measurement, which has not been taken on this endpoint.
 */
export const ZAK_REQUEST_BUDGET_MS = 8_000;

/**
 * Ruling ② (Z3-3): the client's explicit request to be given LESS than it could
 * receive — the link payload instead of the SDK one — sent after the embed failed in
 * the browser. §5 forbids `join_url` in an SDK payload, so a fallback cannot be
 * pre-loaded; it has to be asked for.
 *
 * Deliberately the narrowest widening of the wire contract that can work:
 *
 *  - It is read at ONE place, immediately above the SDK branch, and the only thing it
 *    can influence is whether that branch is considered. Every gate above outcome 8 —
 *    405, 401, 503, 404, 403, both 410s, pending — runs identically, so this cannot
 *    escalate anything. What it asks for is what this same caller received before Z3
 *    existed.
 *  - An unrecognised value is IGNORED, never an error: a body that means nothing to
 *    this route must not turn a joinable meeting into a failure.
 */
function wantsLinkFallback(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  return (body as Record<string, unknown>).fallback === 'link';
}

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

/**
 * The `zoom_internal` surface the ZAK path uses: a single-filter read of
 * `zoom_hosts`, and the ONE write this route makes — the §9 audit row.
 *
 * A second interface rather than a widened `JoinInternalClient`, per the idiom
 * `service-client.ts` sets: each consumer declares its own minimal shape, because
 * one type covering every PostgREST surface would be a bigger lie than two small
 * honest ones. It also keeps the fact visible that this route is read-only except
 * for exactly this insert.
 */
interface ZakInternalClient {
  from(table: string): {
    select(columns: string): {
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
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

/** The SDK half of the join payload — everything except `zak`, `role` and `dial_in`. */
interface SdkJoinPayload {
  signature: string;
  sdk_key: string;
  meeting_number: string;
  passcode: string;
  user_name: string;
  customer_key: string;
}

/** A ZAK the §9 rule authorized, with the clause that authorized it. */
interface HostCredential {
  /** Bearer credential. Goes into the response and nowhere else — never a log, never a row. */
  zak: string;
  persona: ZakPersonaBranch;
}

/**
 * Normalises a `zoom_hosts` row into the shape §9 is expressed over, or `null`
 * when the row cannot be read with confidence.
 *
 * Fail-closed on `profile_id` specifically, and that is the whole reason this is a
 * function rather than a cast: `profile_id === null` MEANS "organization pool
 * host", which is the value that lets an admin through. Coercing an absent or
 * unexpectedly-typed column to `null` would turn a malformed row into a pool host.
 * A value that is neither a string nor literally `null` is an unreadable row, and
 * an unreadable row issues nothing.
 */
function toHostIdentity(row: Record<string, unknown> | null): ZakHostIdentity | null {
  if (!row) return null;

  const zoomUserId = row.zoom_user_id;
  if (typeof zoomUserId !== 'string' || zoomUserId === '') return null;

  const profileId = typeof row.profile_id === 'string' ? row.profile_id : null;
  // Anything that is not a string and not literally `null` did not come back as a
  // mapping OR as a pool host — it is a row we cannot read, so nothing is issued.
  if (profileId === null && row.profile_id !== null) return null;

  return {
    zoom_user_id: zoomUserId,
    profile_id: profileId,
    // Only a literal `true` is org-owned; the column is NOT NULL DEFAULT false.
    org_owned: row.org_owned === true,
  };
}

/**
 * Mints the SDK credentials for an authorized caller, or returns `null` so the
 * caller answers with the link payload instead.
 *
 * `null` is the whole error vocabulary on purpose: absent SDK env, a meeting
 * number the signer refuses, a missing passcode, a signer that throws for any
 * other reason. An embed misconfiguration must never deny a join link mode could
 * have served, so this is the fail-safe direction and it is deliberate. Failures
 * are logged by name only — a Zoom config failure must never echo a value.
 *
 * `role` is the NUMERIC SDK role and it is the caller's decision (§5: decided
 * server-side, client-supplied roles ignored). It never appears in the returned
 * payload — only inside the signature.
 */
async function buildSdkJoinPayload(input: {
  service: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  meetingNumber: string | null;
  /** Straight off the row: validated here rather than coerced at the call site. */
  passcode: unknown;
  role: ZoomSdkRole;
}): Promise<SdkJoinPayload | null> {
  const sdkKey = process.env.ZOOM_SDK_CLIENT_ID;
  const sdkSecret = process.env.ZOOM_SDK_CLIENT_SECRET;

  // Server-side ids only. The `NEXT_PUBLIC_` half is the browser's copy of the
  // key and carries no secret — reading it here would sign with the wrong pair.
  if (!sdkKey || !sdkSecret || !input.meetingNumber) {
    console.error('[meet-session-join] SDK mode unavailable: missing config or meeting number');
    return null;
  }

  // A missing or blank passcode is a REFUSAL, not a default. The web SDK requires
  // the plaintext passcode; joining with an empty one fails at Zoom with an opaque
  // error and no fallback, where link mode would have worked — the opposite of the
  // direction every other branch here takes. `provisioned` rows always carry one
  // (`readCreatedCheckpoint` refuses a checkpoint without it), so this is a
  // defensive default that used to point the wrong way, not a live bug.
  //
  // Trim is the emptiness TEST only: the value shipped is the stored one, because
  // a credential is not this route's to normalise.
  const passcode = typeof input.passcode === 'string' ? input.passcode : '';
  if (passcode.trim() === '') {
    console.error('[meet-session-join] SDK mode unavailable: meeting has no passcode');
    return null;
  }

  let signature: string;
  try {
    signature = signZoomSdkJwt({
      sdkKey,
      sdkSecret,
      meetingNumber: input.meetingNumber,
      role: input.role,
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
    passcode,
    user_name: userName,
    customer_key: toCustomerKey(input.userId),
  };
}

/**
 * The §9 issuance path: resolve the rule, and only then fetch and log a ZAK.
 *
 * Every `null` here is "no host credential", which the caller turns into link
 * mode. Nothing about a refusal is an error — §9's answer to a host who may not
 * receive one is host-reassignment, not an escalation from this route.
 *
 * The ordering is the security property (see the file header): the rule decides
 * BEFORE Zoom is asked for anything, and the audit row is written last so a row
 * exists exactly when a credential is about to leave the server. A failed audit
 * write withholds the credential — §9 makes the log part of the rule, not a
 * report about it.
 */
async function issueHostCredential(input: {
  service: ReturnType<typeof createServiceRoleClient>;
  zoomServiceClient: ReturnType<typeof createZoomServiceClient>;
  userId: string;
  sessionId: string;
  meetingId: unknown;
  meetingHostZoomUserId: unknown;
}): Promise<HostCredential | null> {
  const hostZoomUserId =
    typeof input.meetingHostZoomUserId === 'string' && input.meetingHostZoomUserId !== ''
      ? input.meetingHostZoomUserId
      : null;
  const meetingId = typeof input.meetingId === 'string' && input.meetingId !== '' ? input.meetingId : null;

  // No assigned host identity, or no row to reference from the audit log: there is
  // nothing to issue FOR, and an issuance §9 cannot be audited against is one that
  // does not happen.
  if (!hostZoomUserId || !meetingId) {
    return null;
  }

  const internal = zoomInternalSchema<ZakInternalClient>(input.zoomServiceClient);

  const { data: hostRow, error: hostError } = await internal
    .from('zoom_hosts')
    .select('zoom_user_id, profile_id, org_owned')
    .eq('zoom_user_id', hostZoomUserId)
    .maybeSingle();

  if (hostError) {
    console.error('[meet-session-join] host identity read failed:', hostError.message);
    return null;
  }

  // The two persona facts §9 keys on, read here rather than inferred from
  // `decision.role` — which resolves admins and assigned facilitators to the same
  // value and would collapse the two personas the rule separates.
  const [facilitator, userRoles] = await Promise.all([
    input.service
      .from('session_facilitators')
      .select('id')
      .eq('session_id', input.sessionId)
      .eq('user_id', input.userId)
      .maybeSingle(),
    getUserRoles(input.service, input.userId),
  ]);

  const persona = resolveZakIssuance({
    profileId: input.userId,
    isAssignedFacilitator: Boolean(facilitator.data),
    isAdmin: getHighestRole(userRoles) === 'admin',
    meetingHostZoomUserId: hostZoomUserId,
    host: toHostIdentity(hostRow),
  });

  // Refused. Zoom is never asked — a rule that declined to authorize must not have
  // requested the credential it declined.
  if (!persona) {
    return null;
  }

  // The request budget (see the header). Cleared on every exit, so a fast answer does
  // not leave a timer holding the function warm for the rest of the budget.
  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(), ZAK_REQUEST_BUDGET_MS);

  let zak: string;
  try {
    zak = await getZoomApi().getUserZak(hostZoomUserId, { signal: budget.signal });
  } catch (error: unknown) {
    // Names only. The failure body of this endpoint is Zoom's error JSON, but its
    // SUCCESS body is a credential, and no log here distinguishes the two for free.
    // An exhausted budget arrives here as an ordinary refusal, which is the point:
    // there is one degradation path and it is the one every other failure takes.
    console.error(
      '[meet-session-join] ZAK request refused:',
      error instanceof Error ? error.name : 'unknown'
    );
    return null;
  } finally {
    clearTimeout(budgetTimer);
  }

  const { error: auditError } = await internal.from('zoom_zak_issuances').insert({
    profile_id: input.userId,
    meeting_id: meetingId,
    zoom_user_id: hostZoomUserId,
    persona,
    // No ZAK column exists and none may be added — §5: never persisted.
  });

  if (auditError) {
    console.error('[meet-session-join] zak_issued audit write failed:', auditError.message);
    return null;
  }

  return { zak, persona };
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

    // An authorized QA caller may use the application, but no Zoom link,
    // signature or host credential may leave this route for a synthetic tenant.
    const tenantDecision = await resolveSchoolProviderDisposition(
      service,
      decision.source.schoolId
    );
    if (tenantDecision.kind === 'suppressed_qa') {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error: 'Videollamada deshabilitada para el entorno interno de simulación QA',
        code: 'QA_PROVIDER_SUPPRESSED',
      });
    }
    if (tenantDecision.kind === 'refuse') {
      return sendAuthError(res, READ_FAILED_MESSAGE, HttpStatus.INTERNAL_SERVER_ERROR);
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

    // Built once and cast twice: the ZAK path declares its own narrow shape over
    // the same connection rather than opening a second one.
    const zoomServiceClient = createZoomServiceClient();
    const internal = zoomInternalSchema<JoinInternalClient>(zoomServiceClient);

    const { data: meeting, error: meetingError } = await internal
      .from('zoom_meetings')
      // `id` and `host_zoom_user_id` are the §9 path's: which row the audit
      // references, and whose identity the meeting runs on.
      .select('id, status, join_url, passcode, zoom_meeting_number, dial_in_numbers, host_zoom_user_id')
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

    // Outcome 8, embed variant. Reachable ONLY from here — past every gate. Anything
    // missing or malformed falls through to the link payload below rather than
    // failing the join.
    //
    // The body is read HERE and nowhere else, so the one thing a caller can say on the
    // wire is "skip this branch" — see `wantsLinkFallback`.
    if (!wantsLinkFallback(req.body) && isFeatureEnabled(FeatureFlags.ZOOM_EMBED)) {
      const isHost = decision.role === 'host';

      // Signed BEFORE any credential is requested, so a payload that cannot be built
      // costs neither a Zoom call nor an audit row that describes an issuance the
      // caller never received.
      const sdkPayload = await buildSdkJoinPayload({
        service,
        userId: user.id,
        meetingNumber: normalizeMeetingNumber(meeting.zoom_meeting_number),
        passcode: meeting.passcode,
        // §5: decided server-side. 1 = host, 0 = participant; only §9 makes a
        // `role: 1` signature usable, and `credential` below is that gate.
        role: isHost ? 1 : 0,
      });

      if (sdkPayload) {
        const credential = isHost
          ? await issueHostCredential({
              service,
              zoomServiceClient,
              userId: user.id,
              sessionId: decision.sessionId,
              meetingId: meeting.id,
              meetingHostZoomUserId: meeting.host_zoom_user_id,
            })
          : null;

        // A host the §9 rule refused takes the link, which works. `role: 1` without
        // a ZAK is an embed that cannot start a `join_before_host: false` meeting —
        // strictly worse than the path Z2 already ships for them.
        if (!isHost || credential) {
          return sendApiResponse(res, {
            mode: 'sdk',
            ...sdkPayload,
            // Absent — not empty — for a participant. The one place a ZAK appears.
            ...(credential ? { zak: credential.zak } : {}),
            // Descriptive metadata, exactly as in link mode. The numeric role is
            // inside the signature and stays there.
            role: decision.role,
            ...(dialIn ? { dial_in: dialIn } : {}),
          });
        }
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
