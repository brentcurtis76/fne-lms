/**
 * `meeting_provision` — creates the Zoom meeting for an LMS surface under a host the
 * database itself reserved (plan §8 provisioning lifecycle, §9 host resolution + the
 * EXCLUDE reservation, §10 timezone rules, §12 staged idempotent pipelines).
 *
 * ## Eligibility comes before everything (Sol F3)
 *
 * The handler used to validate the schedule FIELDS and nothing about the session
 * itself, so a cancelled, draft, soft-deleted, `presencial` or Google-Meet session was
 * provisioned exactly like a live one — a real Zoom meeting, on a real licensed host,
 * for something that will never happen. `checkSessionEligibility` runs first, before a
 * host is resolved and before any row is written, and refuses non-retryably: no backoff
 * turns a cancelled session into a scheduled one.
 *
 * The one write that CAN happen on that path is a release. A previous attempt may
 * already hold a bare reservation for this surface, and a session cancelled after the
 * fact must not keep blocking a host for a window nobody will use — so an unfulfilled
 * reservation is dropped to `cancelled`, a status outside the EXCLUDE predicate. A row
 * that already carries a `zoom_meeting_number` is left alone: a meeting genuinely
 * exists at Zoom for that interval, and freeing it would let a second meeting be booked
 * onto an occupied host.
 *
 * ## The INSERT is the reservation
 *
 * §9's concurrency rule is not enforced by a query that looks for a free host and then
 * uses it — that is a TOCTOU race two overlapping ticks would lose. It is enforced by
 * `zoom_meetings_host_no_overlap`, an EXCLUDE constraint over
 * `(host_zoom_user_id, meeting_reservation_window(starts_at, duration_minutes))`
 * restricted to the ACTIVE statuses. So the row INSERT *is* the reservation: it either
 * succeeds (the host is ours for that window) or raises 23P01 (host busy), at which
 * point we try the next candidate. Nothing is "released" on a conflict, because
 * nothing was held — the failed INSERT wrote no row.
 *
 * The same is true of the resume path: flipping a row from `error` back to `pending`
 * re-enters the constraint's WHERE clause, so the UPDATE re-checks it and can itself
 * raise 23P01. That is deliberate — a resumed job must re-prove the host is free.
 *
 * And a resumed `pending` reservation must re-prove it is protecting the RIGHT window.
 * The session may have been rescheduled between the reservation and the retry, in which
 * case the interval the constraint is defending is not the interval about to be sent to
 * Zoom — the host is then double-bookable for the time the meeting will actually
 * occupy. `reservationMatchesSource` compares the row against the current source; on
 * drift the row is re-reserved by UPDATE with the new interval, which re-enters the
 * predicate and can 23P01 like any other reservation, at which point the candidate walk
 * takes over. The checkpoint-adopt path is exempt ONLY from moving the reservation
 * window: Zoom already holds that meeting at the old time, so moving our reservation
 * would protect an interval Zoom knows nothing about. It is not exempt from the lease
 * or state guards described below. Reconciling a rescheduled meeting with Zoom is Z2's
 * reschedule sync.
 *
 * Host *load* is only a preference. `countHostLoads` orders candidates least-loaded
 * first, and it is allowed to be approximate: the constraint, not the count, is what
 * makes double-booking impossible. This is why the overlap band below can be computed
 * in TypeScript without risking correctness.
 *
 * ## Two clocks, and neither is `new Date(date + 'T' + time)`
 *
 * §10: session times are Chile wall-clock. Two different values are derived, from the
 * one helper (`lib/utils/session-timezone.ts`) that knows the zone:
 *
 *  - `starts_at` — a real UTC instant, for the reservation row and the projection.
 *  - the wall-clock string + `timezone: 'America/Santiago'` — for Zoom's create, which
 *    wants local time plus a zone and would mis-schedule a UTC-converted value across
 *    a DST boundary.
 *
 * Constructing `new Date(`${date}T${time}`)` would silently mean *server* local time,
 * which is UTC on Vercel and Chile nowhere. It never appears in this module.
 *
 * ## The uuid stays NULL
 *
 * `zoom_meeting_uuid` is NOT written here even though the create response carries one.
 * Zoom mints a new uuid per occurrence (routed Z0B finding; `api.ts` names the field
 * `uuidAtRead` for exactly this reason), so the provision-time value is not the key
 * recordings and reports hang off. `meeting.started` captures it — see
 * `lib/zoom/webhook-lifecycle.ts`. The column is nullable to make room for that.
 *
 * ## Idempotent and resumable (§12, at-least-once)
 *
 * Zoom's create API takes NO idempotency key, so "create exactly once" cannot be bought
 * from the provider — it is reconstructed from two anchors, checked in this order:
 *
 *  1. `zoom_meetings.zoom_meeting_number`. Once it is set the meeting exists at Zoom and
 *     no re-run may create a second one; the re-run only finishes the remaining steps.
 *  2. failing that, a `stage: 'created'` checkpoint in the job's own `stage_state`,
 *     written by the heartbeat IMMEDIATELY after `createMeeting` returns. A re-run that
 *     finds one ADOPTS it through a guarded database transition and does not create.
 *
 * Only when NEITHER anchor exists does the handler reserve a host and create.
 *
 * Note the `complete_zoom_job` contract (Z1b-3 finding ③): completion REPLACES
 * `stage_state` with the handler's return value. That is exactly why anchor 1 is the ROW
 * and not the checkpoint — the checkpoint only has to survive a FAILED attempt, and
 * `fail_zoom_job` leaves `stage_state` untouched. It is in-run progress that outlives
 * the run that wrote it, nothing more.
 *
 * ### RESIDUAL — the window that stays open
 *
 * The checkpoint NARROWS the create→persist window; it does not close it. If the process
 * dies between `createMeeting` returning and the checkpoint landing — or the lease is
 * lost, so the heartbeat returns false and nothing is written at all — the retry sees
 * neither anchor and creates a SECOND meeting at Zoom. The first is then orphaned:
 * scheduled, never joined, pointed at by no row. The same holds if the `zoom_meetings`
 * row is missing when a checkpoint is read, because there is nothing to adopt it onto.
 * This is irreducible without a Zoom-side idempotency key.
 *
 * What the checkpoint buys when it DOES land is that the orphan is NAMED:
 * `zoom_jobs.stage_state.meeting.number` on the failed job is the meeting number a human
 * can cancel. Dead-job triage is the cleanup path — plan §16 puts its procedure in
 * `docs/runbooks/zoom.md`, which is NOT written yet (later phase); until it is, the
 * path is a human reading `zoom_jobs.last_error` and `stage_state` directly.
 *
 * ### The third case: create failed, and we do not know whether it landed (Sol F4)
 *
 * The two anchors answer "did a PREVIOUS attempt create?". Neither answers "did the
 * attempt that just threw create?" — and `createMeeting` can fail in ways that do not
 * rule it out: a transport throw, a 5xx, a 2xx whose body is unreadable or empty. The
 * client labels every error `outcome: 'not_executed' | 'ambiguous'` so this handler
 * never has to reconstruct that from status codes.
 *
 *  - DEFINITE (`not_executed`): Zoom answered and refused. `markError` → status `error`
 *    → the interval is released → rethrow, and the retry re-reserves and creates. This
 *    is the pre-existing behaviour and it is correct for this class.
 *  - AMBIGUOUS: the row is NOT moved to `error`, because that would release the interval
 *    and the retry would create a second meeting against a host we had just declared
 *    free. `last_error` is written WITHOUT a status change, so the reservation keeps
 *    blocking, and the job fails NON-retryably under reason `ambiguous_create_outcome`.
 *
 * Be honest about the limit: an ambiguous failure CANNOT NAME the possible first
 * meeting. There is no id — either the response never arrived or it was unreadable — so
 * `x-zm-request-id` (when Zoom sent one) is all the record carries, and only
 * reconciliation against Zoom can identify a meeting if one exists. The BLOCKED HOST
 * INTERVAL is the safety here, not knowledge.
 *
 * ### Resolving a parked row — the manual contract (Sol R2 ②)
 *
 * The park is ENFORCED, not merely recorded. A parked row (`pending`, no
 * `zoom_meeting_number`, `last_error.reason = 'ambiguous_create_outcome'`) is
 * shape-identical to an ordinary crashed-pre-create reservation, so without a gate the
 * obvious recovery lever — requeue the terminal job — would sail into the create path
 * and make the second meeting this whole mechanism exists to prevent. The handler
 * therefore refuses such a row up front, non-retryably, under reason
 * `ambiguous_unresolved`, WITHOUT touching the reservation, the row or Zoom. Requeue it
 * as often as you like; it fails the same way every time and creates nothing.
 *
 * An operator resolves it in exactly one of two ways. Both operator actions are ordinary
 * writes to `zoom_internal.zoom_meetings` (until §16's `docs/runbooks/zoom.md` exists,
 * there is no runbook); the requeued handler then uses the guarded recovery RPC:
 *
 *  1. **A meeting WAS created.** Reconcile against Zoom — list the host's meetings
 *     around that window and match topic + start time; `x-zm-request-id` in the marker
 *     is what a Zoom support ticket needs, though it cannot be looked up as a meeting
 *     id. Write the discovered number into `zoom_meeting_number` and leave the rest of
 *     the row alone. That is anchor 1, and the requeued job takes the RECOVERY branch
 *     below rather than the replay one.
 *  2. **No meeting exists.** Clear `last_error` (to NULL). The row has no anchors at
 *     all then — no number, no marker — so it reverts to an ordinary held reservation
 *     and the requeued job creates normally. Nothing about this path changes.
 *
 * Clearing the marker while a meeting DOES exist at Zoom is the one move that
 * reintroduces the double-create, which is why the gate refuses to guess between the
 * two. The blocked host interval holds either way until a human decides.
 *
 * ### Recovery is a re-read, not a replay (Sol R3 ①)
 *
 * Resolution 1 leaves a row that has a number and NOTHING ELSE: `pending`, no passcode,
 * no join_url, NULL `effective_settings`, the marker still on it. Treating that as the
 * ordinary "already created" replay published a `scheduled` projection for a meeting
 * nobody could join, on a row that still said `pending` — and §9.4 read the absent
 * settings as a clean `'none'`. The two states are told apart by STATUS, because a
 * successful provision writes the number and everything else in one transition:
 *
 *  - `provisioned` (or any later lifecycle status) + a number ⇒ REPLAY. The row already
 *    holds what a previous attempt persisted; finish the remaining steps and publish.
 *  - `pending` + a number ⇒ RECOVERY. `ZoomApi.getMeeting` re-reads the discovered
 *    meeting, the result must clear the same fail-closed bar a create response clears
 *    (`findUnusableProvisionedMeetingFields`: a real number, a non-empty passcode and
 *    join_url, settings with an EXPLICIT `auto_recording`), and only then does the
 *    `recover_provisioned_meeting` RPC write the lot — including clearing the park
 *    marker — and publish the projection in the same database transaction.
 *
 * A read-back that fails or comes back unusable leaves the row EXACTLY as the operator
 * left it — no writes at all — and fails the job terminally under `recovery_unusable`.
 * `createMeeting` is unreachable from either recovery outcome: the number is anchor 1,
 * and anchor 1 is absolute.
 *
 * ### The recovery write is GUARDED, because the row is not frozen (Sol R4)
 *
 * That recovery write is the only one in this handler decided from a row read BEFORE a
 * network round trip, and the world does not hold still for the `getMeeting`. Two things
 * can change underneath it, and an id-only write noticed neither:
 *
 *  - **The lease.** Nothing heartbeats between the row read and the write, so an expired
 *    or stolen lease let a non-owner persist its verdict onto another worker's row.
 *  - **The row.** `LIFECYCLE_STARTED_APPLIES_FROM` includes `'pending'`
 *    (`webhook-store.ts`), so a `meeting.started` may LEGITIMATELY advance this very row
 *    while the GET is in flight — and `meeting.ended` after it. A late id-only write then
 *    RESET a started/ended meeting to `provisioned` and republished a `scheduled`
 *    projection: the exact order-safety class Sol F1 fixed for the webhook path,
 *    reintroduced through the recovery path.
 *
 * So: `ctx.heartbeat()` the moment the read-back validates and before any write (false ⇒
 * `ZoomJobLeaseLostError`, zero writes, no projection), and then ONE compare-and-set RPC —
 * `recoverProvisionedMeeting`, guarded on `status = 'pending'` and on the recorded number.
 * The RPC publishes the projection in the SAME transaction. A miss writes neither table:
 * a row another worker, a webhook or an operator has advanced is never overwritten or
 * republished.
 *
 * A miss is not a failure. It is the world having legitimately moved on, so the job
 * COMPLETES with `{ recovered: false, superseded: true }` rather than going to triage —
 * there is nothing for a human to do about a webhook that won a race.
 *
 * RESIDUAL, and it is deliberate: a row that advanced past `pending` before its recovery
 * landed keeps NULL `passcode` and NULL `join_url` forever. The CAS can never fire again
 * — the status guard is one-way — and that is the honest record of what happened: a
 * meeting that ran without a platform join path, because the create response that carried
 * those values was lost and the read-back arrived after the meeting had already started.
 * Backfilling them post-hoc would describe a joinable meeting that nobody could join.
 *
 * ### Checkpoint adoption has the same lease/state/transaction discipline (Sol R5 ②)
 *
 * The former adoption exemption was wrong. It considered one adopter versus lifecycle,
 * where a NULL meeting number keeps the webhook from finding the row, but missed the
 * dual-adopter interleaving from Round 5: a stale adopter can lose its lease, a fresh
 * adopter can write the number, lifecycle can advance the row, and then the stale
 * adopter's unguarded write can reset it. Adoption therefore uses an argumentless
 * `ctx.heartbeat()` immediately before its write (safe because the heartbeat RPC's
 * `COALESCE` preserves `stage_state`), then `adoptCheckpointMeeting` compare-and-sets
 * `id + pending + zoom_meeting_number IS NULL` and publishes the projection atomically.
 * A miss completes as superseded; it never creates and never writes either table.
 *
 * ### And so do the last two paths (Sol R6)
 *
 * R5 closed recovery and adoption. Fresh-create and already-provisioned replay were left
 * on the old two-call shape, on the reading that a fresh create publishes into a
 * projection that cannot pre-exist. That reading was wrong, and Sol ruled it a finding
 * rather than a Z2 baseline: the R5 race never required a pre-existing projection — a
 * pre-existing projection was what the race PRODUCED.
 *
 *  - **Fresh create** persisted with an id-only `markProvisioned` and then a separate
 *    `scheduled` upsert. Between the post-create checkpoint heartbeat and that write a
 *    worker can stall, lose its lease, and wake to a row a second adopter has finished
 *    and lifecycle has advanced — whereupon the id-only write resets it and the upsert
 *    puts `scheduled` over a `live` badge. It now goes through `adoptCheckpointMeeting`,
 *    the SAME RPC adoption uses, because the row at that instant IS `pending` +
 *    `zoom_meeting_number IS NULL`: the reservation put it there and nothing since has
 *    touched it. A CAS miss completes as `MeetingProvisionCreateSupersededResult`,
 *    carrying the number Zoom minted — the only place it survives, since completion
 *    replaces `stage_state` and the checkpoint with it.
 *  - **Replay** re-upserted a hard-coded `scheduled` through the unguarded projection
 *    call, so a redelivered job landing after `meeting.started` clobbered the badge
 *    backwards. It now calls `sync_projection_from_meeting`, which DERIVES the public
 *    status from the internal row under `FOR UPDATE` and applies it behind a
 *    never-backward guard mirroring `webhook-store.ts`'s applies-from sets. Because the
 *    value is read rather than asserted, that same call also RECREATES a projection that
 *    is missing entirely — at `ended` for a meeting that has ended, not at `scheduled`.
 *
 * `upsertProjection` and `markProvisioned` are GONE from the store seam, and
 * `ProvisionPublicClient` no longer carries an `upsert` at all. Every persistence path in
 * this handler is now one guarded transaction; there is no unguarded write left to reach
 * for.
 */
import { randomInt } from 'crypto';
import { getSessionDateTime, SESSION_TIMEZONE } from '../../utils/session-timezone';
import {
  findUnusableProvisionedMeetingFields,
  getZoomApi,
  type ZoomApi,
  type ZoomMeeting,
  type ZoomMeetingSettings,
} from '../api';
import { isZoomError, ZoomNonRetryableError } from '../errors';
import { createZoomServiceClient, zoomInternalSchema } from '../service-client';
import { ZoomJobLeaseLostError, type ZoomJobHandler } from './types';
import {
  ZOOM_MEETING_ACTIVE_STATUSES,
  type SessionMeetingPublicStatus,
  type ZoomMeetingStatus,
  type ZoomSurfaceType,
} from '../db-types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The §8 provisioning settings. Sent on every create, and re-read off the RESPONSE
 * because Zoom reflects effective values on a capability mismatch rather than failing.
 */
export const PROVISION_MEETING_SETTINGS: ZoomMeetingSettings = {
  join_before_host: false,
  waiting_room: false,
  auto_recording: 'none',
};

/**
 * The reservation window's buffers, mirroring
 * `zoom_internal.meeting_reservation_window`: early joins (−15 min) and overruns
 * (+45 min). Duplicated here ONLY to bound the load-count query; the constraint in
 * `20260729120100_zoom_internal_tables.sql` remains the single authority on overlap.
 */
export const RESERVATION_LEAD_MINUTES = 15;
export const RESERVATION_TRAIL_MINUTES = 45;

/** Postgres exclusion-violation. The §9 "host busy" signal. */
export const EXCLUSION_VIOLATION = '23P01';

const MINUTE_MS = 60_000;

// ---------------------------------------------------------------------------
// Source-state eligibility (Sol F3)
// ---------------------------------------------------------------------------

/**
 * The only `consultor_sessions.status` a meeting may be provisioned for: approved and
 * scheduled, and not yet under way.
 *
 * Deliberately a single value rather than "anything not cancelled". `borrador` and
 * `pendiente_aprobacion` are pre-approval — plan §8 is explicit that creating a session
 * as `borrador` makes NO Zoom call — and `en_progreso` / `pendiente_informe` /
 * `completada` are at-or-past execution, where creating a scheduled meeting produces a
 * link nobody will ever use while holding a host slot that is already spent.
 */
export const PROVISION_ELIGIBLE_SESSION_STATUSES = ['programada'] as const;

/**
 * Modalities with a remote leg. `hibrida` is IN: a hybrid session has attendees joining
 * remotely and is exactly as entitled to a meeting as an `online` one. `presencial` is
 * the exclusion — there is nothing to join.
 */
export const PROVISION_ELIGIBLE_MODALITIES = ['online', 'hibrida'] as const;

/**
 * §8/ledger item 21: managed intent is spelled `meeting_provider = 'zoom'` — NOT a new
 * enum value, which would violate the live CHECK constraint (baseline:7740).
 */
export const PROVISION_ELIGIBLE_PROVIDER = 'zoom';

/** Which gate refused the session. Stored structurally as the failure's `detail`. */
export type SessionEligibilityCheck =
  | 'status'
  | 'is_active'
  | 'modality'
  | 'meeting_provider';

/**
 * The §8 eligibility gate: the first failed check, or `null` when the session may be
 * provisioned for. Order is deliberate — `is_active` first, because a soft-deleted
 * session is the least interesting reason to look further.
 *
 * SEAM (Z2): `is_zoom_managed` — the durable managed-intent flag from plan §8/ledger
 * item 22 — joins this list as one more check as soon as Z2's additive migration adds
 * the column. It is NOT added here: inventing the column now would be a rival mechanism
 * to the one the plan already specifies, and `meeting_provider = 'zoom'` is the intent
 * signal that exists today. When the flag lands, `is_zoom_managed !== true` becomes a
 * `'is_zoom_managed'` member of `SessionEligibilityCheck` and a branch below.
 */
export function checkSessionEligibility(
  session: ProvisionSessionRow
): SessionEligibilityCheck | null {
  if (session.is_active !== true) return 'is_active';
  if (!(PROVISION_ELIGIBLE_SESSION_STATUSES as readonly string[]).includes(session.status)) {
    return 'status';
  }
  if (!(PROVISION_ELIGIBLE_MODALITIES as readonly string[]).includes(session.modality)) {
    return 'modality';
  }
  if (session.meeting_provider !== PROVISION_ELIGIBLE_PROVIDER) return 'meeting_provider';
  return null;
}

/**
 * Does the reservation this row is holding still describe the CURRENT session?
 *
 * Compared as instants, not strings: `starts_at` comes back from Postgres as
 * `+00:00`-suffixed and goes in as `Z`-suffixed, so a string compare would report drift
 * on every single resume.
 */
export function reservationMatchesSource(
  row: ProvisionMeetingRow,
  startsAtIso: string,
  durationMinutes: number
): boolean {
  return (
    Date.parse(row.starts_at) === Date.parse(startsAtIso) &&
    row.duration_minutes === durationMinutes
  );
}

// ---------------------------------------------------------------------------
// Failure taxonomy
// ---------------------------------------------------------------------------

/**
 * Every candidate host was busy for this window (§9). Terminal: no backoff creates a
 * host, so the job goes to triage and the health panel rather than spinning. The
 * `reason` field is what makes it structurally greppable in `zoom_jobs.last_error` —
 * triage keys on it, never on the message.
 */
export class ZoomNoHostAvailableError extends ZoomNonRetryableError {
  readonly reason = 'no_host_available';

  constructor(message: string, candidatesTried: number) {
    super(message, { operation: 'meeting_provision' });
    this.candidatesTried = candidatesTried;
  }

  readonly candidatesTried: number;
}

/** The `reason` an ambiguous create parks under. Triage and §18 alerting key on it. */
export const AMBIGUOUS_CREATE_REASON = 'ambiguous_create_outcome';

/**
 * `createMeeting` failed in a way that CANNOT rule out a meeting having been created
 * (Sol F4). Terminal on purpose: the job must never retry, because a retry is exactly
 * the second create this class exists to prevent.
 *
 * What it can and cannot tell you is worth being blunt about. It carries the provider's
 * `x-zm-request-id` when Zoom sent one, which is what a support ticket needs — but it
 * CANNOT name the meeting. There is no id to record: either the response never arrived
 * or it was unreadable. Only reconciliation against Zoom (list the host's meetings
 * around that window and match the topic and start time) can identify a first meeting
 * if one exists. The blocked host interval is the safety here, not knowledge: the
 * reservation stays `pending`, so nothing else is booked onto that host for that window
 * while a human resolves it via dead-job triage (see the module header: the runbook
 * that will carry the procedure is a later phase).
 */
export class ZoomAmbiguousCreateError extends ZoomNonRetryableError {
  readonly reason = AMBIGUOUS_CREATE_REASON;

  constructor(message: string, requestId: string | undefined) {
    super(message, { operation: 'meeting_provision', requestId });
  }
}

/** The `reason` a REQUEUE against an unresolved parked row is refused under. */
export const AMBIGUOUS_UNRESOLVED_REASON = 'ambiguous_unresolved';

/**
 * The job was requeued against a row still parked by an unresolved ambiguous create
 * (Sol R2 ②). Terminal, and it writes NOTHING — not the row, not the reservation, and
 * above all not Zoom.
 *
 * A distinct reason from `ambiguous_create_outcome` on purpose. The two are different
 * events with different side effects: the first is Zoom answering ambiguously (and it
 * WRITES the marker), the second is an operator requeueing without having resolved it
 * (and it writes nothing). Collapsing them would hide, on the §18 panel, the one case
 * that means "a human tried the recovery lever and it is still not resolved".
 */
export class ZoomAmbiguousUnresolvedError extends ZoomNonRetryableError {
  readonly reason = AMBIGUOUS_UNRESOLVED_REASON;

  constructor(message: string, requestId: string | undefined) {
    super(message, { operation: 'meeting_provision', requestId });
  }
}

/** The `reason` an unusable operator-recovery read-back fails under. */
export const RECOVERY_UNUSABLE_REASON = 'recovery_unusable';

/**
 * An operator resolved a parked row by recording a `zoom_meeting_number`, and the
 * read-back of that meeting either failed or came back unusable (Sol R3 ①). Terminal,
 * and it writes NOTHING: the row is left byte-for-byte as the operator left it, so the
 * reservation goes on blocking the host and the recovery can be re-attempted with a
 * corrected number — or abandoned by clearing the marker, if reconciliation actually
 * proves no meeting exists.
 *
 * A distinct reason from `ambiguous_unresolved` on purpose. That one means "no human has
 * resolved this yet"; this one means "a human resolved it with a number that does not
 * answer". On the §18 panel the two must not collapse, because the operator's next move
 * is different: re-check the number, not the queue.
 */
export class ZoomRecoveryUnusableError extends ZoomNonRetryableError {
  readonly reason = RECOVERY_UNUSABLE_REASON;
  /** The recorded number, so triage does not have to open the row to see it. */
  readonly detail: string;

  constructor(message: string, meetingNumber: number, requestId: string | undefined) {
    super(message, { operation: 'meeting_provision', requestId });
    this.detail = String(meetingNumber);
  }
}

/** The parsed shape of the marker `recordLastError` leaves on a parked row. */
export interface AmbiguousCreateMarker {
  reason: string;
  /** Zoom's `x-zm-request-id`, when it sent one. The only identifier that exists. */
  request_id: string | null;
  message: string;
}

/**
 * The marker `recordLastError` leaves on a row whose create outcome is unresolved.
 * Structural — parsed and read by field, never matched as a substring.
 */
export function ambiguousCreateMarker(
  requestId: string | undefined,
  message: string
): string {
  return JSON.stringify({
    reason: AMBIGUOUS_CREATE_REASON,
    request_id: requestId ?? null,
    message: message.slice(0, 300),
  });
}

/**
 * The marker's contents, or `null` when `last_error` is absent, unparseable, or carries
 * some other reason. Total and defensive for the same rationale as
 * `readCreatedCheckpoint`: `last_error` is free text written by a previous deploy.
 */
export function parseAmbiguousCreateMarker(
  lastError: string | null
): AmbiguousCreateMarker | null {
  if (lastError === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastError);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (record.reason !== AMBIGUOUS_CREATE_REASON) return null;
  return {
    reason: AMBIGUOUS_CREATE_REASON,
    request_id: typeof record.request_id === 'string' ? record.request_id : null,
    message: typeof record.message === 'string' ? record.message : '',
  };
}

/** Is this row's `last_error` an unresolved ambiguous create? */
export function isAmbiguousCreateMarker(lastError: string | null): boolean {
  return parseAmbiguousCreateMarker(lastError) !== null;
}

/**
 * The source session is not one this job may provision for (§8; Sol F3). Terminal for
 * the same reason as `no_host_available`: no backoff turns a cancelled session into a
 * scheduled one. `reason` + `detail` are what triage keys on — never the message.
 */
export class ZoomSessionIneligibleError extends ZoomNonRetryableError {
  readonly reason = 'session_ineligible';
  /** WHICH check failed, so triage does not have to re-derive it. */
  readonly detail: SessionEligibilityCheck;

  constructor(message: string, check: SessionEligibilityCheck) {
    super(message, { operation: 'meeting_provision' });
    this.detail = check;
  }
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface ProvisionSessionRow {
  id: string;
  school_id: number;
  growth_community_id: string | null;
  title: string;
  /** DATE `YYYY-MM-DD`, Chile local. */
  session_date: string;
  /** TIME `HH:MM[:SS]`, Chile local. */
  start_time: string;
  end_time: string;
  /**
   * Generated column, VERIFIED present on the live table as
   * `((EXTRACT(epoch FROM (end_time - start_time)) / 60))::integer`. Nullable, so the
   * §10 fallback below still has to exist.
   */
  scheduled_duration_minutes: number | null;
  /**
   * The eligibility columns. All four VERIFIED against the live table in
   * `supabase/migrations/00000000000000_baseline.sql:7703-7742`:
   *   status          NOT NULL, CHECK IN (borrador, pendiente_aprobacion, programada,
   *                   en_progreso, pendiente_informe, completada, cancelada)
   *   is_active       NOT NULL DEFAULT true
   *   modality        NOT NULL, CHECK IN (presencial, online, hibrida)
   *   meeting_provider NULLABLE, CHECK IN (zoom, google_meet, teams, otro)
   */
  status: string;
  is_active: boolean;
  modality: string;
  meeting_provider: string | null;
}

export interface SessionFacilitatorRow {
  user_id: string;
  is_lead: boolean;
}

export interface ProvisionHostRow {
  zoom_user_id: string;
  /** NULL = org pool host (§9). */
  profile_id: string | null;
}

/** The `zoom_meetings` columns this handler reads back. */
export interface ProvisionMeetingRow {
  id: string;
  status: ZoomMeetingStatus;
  host_zoom_user_id: string | null;
  zoom_meeting_number: number | null;
  /**
   * The EFFECTIVE settings the create response carried, as persisted. Read back so a
   * resume DERIVES the §9.4 drift signal from what Zoom actually said instead of
   * assuming it — see `readAutoRecording`.
   */
  effective_settings: Record<string, unknown> | null;
  starts_at: string;
  duration_minutes: number;
  /**
   * Read back so the eligibility release can tell an ordinary bare reservation from one
   * parked by an UNRESOLVED ambiguous create — the second must not be released, because
   * a meeting may exist at Zoom for that interval (Sol F4).
   */
  last_error: string | null;
}

export interface ReservationInsert {
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  host_zoom_user_id: string;
  starts_at: string;
  duration_minutes: number;
}

export interface ProvisionedMeetingPatch {
  zoom_meeting_number: number;
  passcode: string;
  join_url: string;
  effective_settings: Record<string, unknown>;
  status: ZoomMeetingStatus;
}

/**
 * The projection row's shape. No longer written from TypeScript — every publication
 * goes through a guarded RPC (Sol R6) — but this is still the record of what a
 * projection row IS, and the harness models its map with it.
 */
export interface ProjectionUpsert {
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  growth_community_id: string | null;
  meeting_status: SessionMeetingPublicStatus;
  starts_at: string;
  ends_at: string;
}

/**
 * What `sync_projection_from_meeting` did (Sol R6 ②). Typed rather than boolean
 * because the three non-publishing outcomes mean different things:
 *
 *  - `published` — the projection was created or advanced.
 *  - `blocked` — the never-backward guard refused: the public row is already AT or
 *    PAST the status this meeting derives to. The ordinary monotonic refusal, and
 *    the entire point of the function; not an error.
 *  - `not_publishable` — the internal row is `pending` or `error`. There is nothing
 *    to announce for a reservation that never reached Zoom.
 *  - `missing` — no such internal row. It was deleted under us mid-run.
 */
export type ProjectionSyncOutcome = 'published' | 'blocked' | 'not_publishable' | 'missing';

/** Fields the atomic recovery/adoption RPCs need in addition to the Zoom result. */
export interface AtomicProvisionPatch extends ProvisionedMeetingPatch {
  growth_community_id: string | null;
}

/** `true` = reserved; `false` = 23P01, the host is busy for this window. */
export type ReservationOutcome = { reserved: true; row: ProvisionMeetingRow } | { reserved: false };

// ---------------------------------------------------------------------------
// Store seam
// ---------------------------------------------------------------------------

export interface MeetingProvisionStore {
  readSession(surfaceId: string): Promise<ProvisionSessionRow | null>;
  listFacilitators(sessionId: string): Promise<SessionFacilitatorRow[]>;
  /** Active hosts only — `host_sync` flips `is_active` rather than deleting. */
  listActiveHosts(): Promise<ProvisionHostRow[]>;
  /**
   * `host_zoom_user_id → count` of ACTIVE meetings whose reservation window overlaps
   * `[boundLowerIso, boundUpperIso)`. Advisory ordering only — see the module header.
   */
  countHostLoads(boundLowerIso: string, boundUpperIso: string): Promise<Record<string, number>>;
  findMeetingBySurface(
    surfaceType: ZoomSurfaceType,
    surfaceId: string
  ): Promise<ProvisionMeetingRow | null>;
  /** The reservation. 23P01 must surface as `{ reserved: false }`, never as a throw. */
  insertReservation(row: ReservationInsert): Promise<ReservationOutcome>;
  /**
   * Re-enters a non-active row into `pending` under `hostZoomUserId`, re-checking the
   * EXCLUDE constraint. `false` = 23P01.
   */
  reserveExistingMeeting(
    meetingId: string,
    hostZoomUserId: string,
    startsAt: string,
    durationMinutes: number
  ): Promise<boolean>;
  /**
   * Guarded recovery transition + projection publication in one database transaction.
   * `false` means the CAS missed and neither table changed.
   */
  recoverProvisionedMeeting(meetingId: string, patch: AtomicProvisionPatch): Promise<boolean>;
  /**
   * Guarded `pending` + NULL-number → `provisioned` transition + projection publication
   * in one database transaction. `false` means the row was no longer `pending` with a
   * NULL meeting number; neither table changed.
   *
   * Used by BOTH paths that turn a bare reservation into a provisioned meeting: the
   * checkpoint adoption it was written for (Sol R5 ②) and the fresh create (Sol R6 ①),
   * whose row is in exactly the same state when `createMeeting` returns.
   */
  adoptCheckpointMeeting(meetingId: string, patch: AtomicProvisionPatch): Promise<boolean>;
  /**
   * Republishes the projection DERIVED from the internal row, under the never-backward
   * guard, in one transaction (Sol R6 ②). The replay path's only projection write —
   * and the one that RECREATES a projection missing for a meeting that has already
   * started or ended.
   */
  syncProjectionFromMeeting(
    meetingId: string,
    growthCommunityId: string | null
  ): Promise<ProjectionSyncOutcome>;
  markError(meetingId: string, lastError: string): Promise<void>;
  /**
   * Writes `last_error` and NOTHING else — the status is deliberately untouched.
   * `markError` would move the row to `error`, which is outside the EXCLUDE predicate
   * and therefore RELEASES the host; that is right for a definite failure and wrong for
   * an ambiguous one, where a meeting may already exist on that host at that time
   * (Sol F4).
   */
  recordLastError(meetingId: string, lastError: string): Promise<void>;
  /**
   * Drops a reservation into `cancelled` — a status the §9 EXCLUDE `WHERE` ignores, so
   * the host slot is freed. Used only for a reservation held on behalf of a session
   * that turned out to be ineligible: leaving it `pending` would block that host for
   * the window of a meeting nobody is ever going to hold.
   */
  releaseReservation(meetingId: string, lastError: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

interface PostgrestError {
  message: string;
  /** Postgres SQLSTATE. `23P01` is the §9 host-busy signal. */
  code?: string;
}

type PostgrestResult<T> = PromiseLike<{ data: T | null; error: PostgrestError | null }>;

/**
 * The ONLY untyped boundaries in this module. See `service-client.ts`.
 *
 * READ-ONLY by construction since Sol R6: the `upsert` member this seam used to carry
 * was the module's one way to write `public.session_meetings_public` without a guard,
 * and it is gone along with its caller. Every projection write now goes through a
 * `zoom_internal` RPC on the internal client.
 */
export interface ProvisionPublicClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string | number): {
        maybeSingle(): PostgrestResult<Record<string, unknown>>;
      } & PostgrestResult<Record<string, unknown>[]>;
    };
  };
}

export interface ProvisionInternalClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string | number): {
        eq(column: string, value: string | number): {
          maybeSingle(): PostgrestResult<Record<string, unknown>>;
        };
      } & PostgrestResult<Record<string, unknown>[]>;
      in(column: string, values: readonly string[]): {
        lt(column: string, value: string): {
          gt(column: string, value: string): PostgrestResult<Record<string, unknown>[]>;
        };
      };
    };
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): PostgrestResult<Record<string, unknown>>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string | number): PromiseLike<{ error: PostgrestError | null }>;
    };
  };
}

function isExclusionViolation(error: PostgrestError | null): boolean {
  return error?.code === EXCLUSION_VIOLATION;
}

export function createSupabaseMeetingProvisionStore(
  publicClient: ProvisionPublicClient,
  internalClient: ProvisionInternalClient
): MeetingProvisionStore {
  return {
    async readSession(surfaceId) {
      const { data, error } = await publicClient
        .from('consultor_sessions')
        .select(
          'id, school_id, growth_community_id, title, session_date, start_time, end_time, scheduled_duration_minutes, status, is_active, modality, meeting_provider'
        )
        .eq('id', surfaceId)
        .maybeSingle();
      if (error) throw new Error(`consultor_sessions read failed: ${error.message}`);
      return (data as unknown as ProvisionSessionRow) ?? null;
    },

    async listFacilitators(sessionId) {
      const { data, error } = await publicClient
        .from('session_facilitators')
        .select('user_id, is_lead')
        .eq('session_id', sessionId);
      if (error) throw new Error(`session_facilitators read failed: ${error.message}`);
      return (data as unknown as SessionFacilitatorRow[]) ?? [];
    },

    async listActiveHosts() {
      const { data, error } = await internalClient
        .from('zoom_hosts')
        .select('zoom_user_id, profile_id')
        .eq('is_active', true as unknown as string);
      if (error) throw new Error(`zoom_hosts read failed: ${error.message}`);
      return (data as unknown as ProvisionHostRow[]) ?? [];
    },

    async countHostLoads(boundLowerIso, boundUpperIso) {
      // Overlap of reservation windows, expressed on the stored columns so PostgREST
      // can run it: window(other) ∩ window(mine) ≠ ∅
      //   ⇔ other.starts_at < mine.ends_at + 60min AND other.ends_at > mine.starts_at − 60min
      // (the 60 = the 15-min lead plus the 45-min trail). `ends_at` is a STORED
      // generated column, so both sides are real columns.
      const { data, error } = await internalClient
        .from('zoom_meetings')
        .select('host_zoom_user_id')
        .in('status', ZOOM_MEETING_ACTIVE_STATUSES)
        .lt('starts_at', boundUpperIso)
        .gt('ends_at', boundLowerIso);
      if (error) throw new Error(`zoom_meetings load read failed: ${error.message}`);

      const loads: Record<string, number> = {};
      for (const row of (data as unknown as { host_zoom_user_id: string | null }[]) ?? []) {
        if (row.host_zoom_user_id === null) continue;
        loads[row.host_zoom_user_id] = (loads[row.host_zoom_user_id] ?? 0) + 1;
      }
      return loads;
    },

    async findMeetingBySurface(surfaceType, surfaceId) {
      const { data, error } = await internalClient
        .from('zoom_meetings')
        .select(
          'id, status, host_zoom_user_id, zoom_meeting_number, effective_settings, starts_at, duration_minutes, last_error'
        )
        .eq('surface_type', surfaceType)
        .eq('surface_id', surfaceId)
        .maybeSingle();
      if (error) throw new Error(`zoom_meetings lookup failed: ${error.message}`);
      return (data as unknown as ProvisionMeetingRow) ?? null;
    },

    async insertReservation(row) {
      const { data, error } = await internalClient
        .from('zoom_meetings')
        .insert({ ...row, status: 'pending' })
        .select(
          'id, status, host_zoom_user_id, zoom_meeting_number, effective_settings, starts_at, duration_minutes, last_error'
        )
        .single();
      // 23P01 is not an error condition here — it is the answer "that host is busy".
      if (isExclusionViolation(error)) return { reserved: false };
      if (error) throw new Error(`zoom_meetings reservation failed: ${error.message}`);
      return { reserved: true, row: data as unknown as ProvisionMeetingRow };
    },

    async reserveExistingMeeting(meetingId, hostZoomUserId, startsAt, durationMinutes) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({
          host_zoom_user_id: hostZoomUserId,
          starts_at: startsAt,
          duration_minutes: durationMinutes,
          // Re-entering an ACTIVE status is what re-arms the EXCLUDE constraint.
          status: 'pending',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meetingId);
      if (isExclusionViolation(error)) return false;
      if (error) throw new Error(`zoom_meetings re-reservation failed: ${error.message}`);
      return true;
    },

    async recoverProvisionedMeeting(meetingId, patch) {
      const { data, error } = await internalClient.rpc('recover_provisioned_meeting', {
        p_meeting_id: meetingId,
        p_zoom_meeting_number: patch.zoom_meeting_number,
        p_passcode: patch.passcode,
        p_join_url: patch.join_url,
        p_effective_settings: patch.effective_settings,
        p_growth_community_id: patch.growth_community_id,
      });
      if (error) throw new Error(`recover_provisioned_meeting failed: ${error.message}`);
      return data === true;
    },

    async adoptCheckpointMeeting(meetingId, patch) {
      const { data, error } = await internalClient.rpc('adopt_checkpoint_meeting', {
        p_meeting_id: meetingId,
        p_zoom_meeting_number: patch.zoom_meeting_number,
        p_passcode: patch.passcode,
        p_join_url: patch.join_url,
        p_effective_settings: patch.effective_settings,
        p_growth_community_id: patch.growth_community_id,
      });
      if (error) throw new Error(`adopt_checkpoint_meeting failed: ${error.message}`);
      return data === true;
    },

    async syncProjectionFromMeeting(meetingId, growthCommunityId) {
      const { data, error } = await internalClient.rpc('sync_projection_from_meeting', {
        p_meeting_id: meetingId,
        p_growth_community_id: growthCommunityId,
      });
      if (error) throw new Error(`sync_projection_from_meeting failed: ${error.message}`);
      // The function's four documented values, and nothing else may be invented from
      // an unexpected body: an unreadable outcome is a failure, not a quiet success.
      if (
        data === 'published' ||
        data === 'blocked' ||
        data === 'not_publishable' ||
        data === 'missing'
      ) {
        return data;
      }
      throw new Error(`sync_projection_from_meeting returned an unknown outcome: ${String(data)}`);
    },

    async markError(meetingId, lastError) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({ status: 'error', last_error: lastError, updated_at: new Date().toISOString() })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings error write failed: ${error.message}`);
    },

    async recordLastError(meetingId, lastError) {
      const { error } = await internalClient
        .from('zoom_meetings')
        // No `status` key: the row keeps whatever status it has, and keeps its
        // reservation with it.
        .update({ last_error: lastError, updated_at: new Date().toISOString() })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings last_error write failed: ${error.message}`);
    },

    async releaseReservation(meetingId, lastError) {
      const { error } = await internalClient
        .from('zoom_meetings')
        .update({
          status: 'cancelled',
          last_error: lastError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meetingId);
      if (error) throw new Error(`zoom_meetings release failed: ${error.message}`);
    },
  };
}

export function defaultMeetingProvisionStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): MeetingProvisionStore {
  const client = clientFactory(env);
  return createSupabaseMeetingProvisionStore(
    client as unknown as ProvisionPublicClient,
    zoomInternalSchema<ProvisionInternalClient>(client)
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** `HH:MM` / `HH:MM:SS` → `HH:MM:SS`. Zoom wants a full wall-clock timestamp. */
function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time.slice(0, 8);
}

/**
 * The wall-clock string Zoom's `start_time` takes, paired with `timezone`. NOT a UTC
 * instant, and deliberately not built with `new Date(...)` — see the module header.
 */
export function toZoomWallClock(sessionDate: string, startTime: string): string {
  return `${sessionDate}T${normalizeTime(startTime)}`;
}

/**
 * Minutes between two Chile wall-clock times on the same session date, via the §10
 * helper. The fallback for a NULL `scheduled_duration_minutes`.
 */
export function deriveDurationMinutes(
  sessionDate: string,
  startTime: string,
  endTime: string
): number {
  const start = getSessionDateTime(sessionDate, normalizeTime(startTime));
  const end = getSessionDateTime(sessionDate, normalizeTime(endTime));
  return Math.round((end.getTime() - start.getTime()) / MINUTE_MS);
}

/**
 * The band `countHostLoads` queries. Mirrors the SQL window's buffers — see the
 * constants' comment for why duplicating them here is safe.
 */
export function reservationOverlapBounds(
  startsAtMs: number,
  durationMinutes: number
): { boundLowerIso: string; boundUpperIso: string } {
  const buffer = (RESERVATION_LEAD_MINUTES + RESERVATION_TRAIL_MINUTES) * MINUTE_MS;
  const endsAtMs = startsAtMs + durationMinutes * MINUTE_MS;
  return {
    boundLowerIso: new Date(startsAtMs - buffer).toISOString(),
    boundUpperIso: new Date(endsAtMs + buffer).toISOString(),
  };
}

/**
 * §9 candidate order: hosts mapped to the session's facilitators first (the LEAD
 * facilitator's host ahead of the others — `session_facilitators.is_lead` is the live
 * column that distinguishes one), then org pool hosts (`profile_id IS NULL`).
 *
 * Within each tier, least-loaded first. The tie-break is `zoom_user_id` ascending so
 * two workers racing on identical inputs try candidates in the SAME order — which
 * makes the 23P01 path deterministic and therefore testable, instead of leaving which
 * worker wins to chance.
 */
export function orderHostCandidates(
  hosts: ProvisionHostRow[],
  facilitators: SessionFacilitatorRow[],
  loads: Record<string, number>
): ProvisionHostRow[] {
  const leadIds = new Set(facilitators.filter((f) => f.is_lead).map((f) => f.user_id));
  const facilitatorIds = new Set(facilitators.map((f) => f.user_id));

  // 0 = lead facilitator's host, 1 = other facilitator's host, 2 = org pool.
  // A host mapped to a profile that is NOT a facilitator of this session is somebody
  // else's personal host and is never a candidate.
  const tierOf = (host: ProvisionHostRow): number | null => {
    if (host.profile_id === null) return 2;
    if (leadIds.has(host.profile_id)) return 0;
    if (facilitatorIds.has(host.profile_id)) return 1;
    return null;
  };

  return hosts
    .map((host) => ({ host, tier: tierOf(host) }))
    .filter((entry): entry is { host: ProvisionHostRow; tier: number } => entry.tier !== null)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const loadDelta = (loads[a.host.zoom_user_id] ?? 0) - (loads[b.host.zoom_user_id] ?? 0);
      if (loadDelta !== 0) return loadDelta;
      return a.host.zoom_user_id < b.host.zoom_user_id ? -1 : 1;
    })
    .map((entry) => entry.host);
}

/**
 * §9.4's drift signal, derived from EFFECTIVE settings — the create response, or what a
 * previous attempt persisted from one. Never a constant: a resume that assumed `'none'`
 * would report a clean run for a meeting Zoom is silently recording.
 *
 * A missing/NULL settings object floors to `'none'` — the type-level bottom, and NOT a
 * claim about a meeting. Nothing this handler persists can reach it: every provisioning
 * write is one guarded RPC that lands the number and the settings together (Sol R5/R6),
 * so neither can exist without the other; the create response must carry an
 * explicit string `auto_recording` to be usable at all (Sol R3 ②), and the
 * operator-recovery read-back must clear the same bar before it is written (Sol R3 ①).
 * The state "has a meeting number, has no settings" is unproducible from BOTH sources —
 * which is what makes the floor honest rather than a silent clean bill of health.
 */
export function readAutoRecording(settings: Record<string, unknown> | null | undefined): string {
  return String(settings?.auto_recording ?? 'none');
}

/** The `stage_state.stage` value that marks a landed post-create checkpoint. */
export const CREATED_CHECKPOINT_STAGE = 'created';

/** What a `stage: 'created'` checkpoint carries — enough to persist without Zoom. */
export interface CreatedMeetingCheckpoint {
  meetingId: string;
  number: number;
  passcode: string;
  joinUrl: string;
  settings: Record<string, unknown>;
}

/**
 * Reads a post-create checkpoint out of the claimed job's `stage_state` (anchor 2 in the
 * module header). Total and defensive: `stage_state` is jsonb written by a *previous*
 * deploy of this handler, so anything short of a complete, well-typed checkpoint returns
 * `null` and the caller falls through to the create path. A partial checkpoint must never
 * be persisted as if it were a real meeting.
 */
export function readCreatedCheckpoint(
  stageState: Record<string, unknown> | null | undefined
): CreatedMeetingCheckpoint | null {
  if (!stageState || stageState.stage !== CREATED_CHECKPOINT_STAGE) return null;

  const meetingId = stageState.meeting_id;
  const meeting = stageState.meeting;
  if (typeof meetingId !== 'string' || meetingId === '') return null;
  if (typeof meeting !== 'object' || meeting === null) return null;

  const { number, passcode, join_url: joinUrl, settings } = meeting as Record<string, unknown>;
  if (typeof number !== 'number' || !Number.isFinite(number)) return null;
  if (typeof passcode !== 'string' || passcode === '') return null;
  if (typeof joinUrl !== 'string' || joinUrl === '') return null;
  if (typeof settings !== 'object' || settings === null) return null;

  return {
    meetingId,
    number,
    passcode,
    joinUrl,
    settings: settings as Record<string, unknown>,
  };
}

/**
 * Server-generated, never derived from anything about the session. 10 chars from an
 * unambiguous alphanumeric alphabet, drawn with `crypto.randomInt` (rejection-sampled,
 * so no modulo bias). Zoom allows up to 10 characters for a meeting passcode.
 */
export function generateMeetingPasscode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let passcode = '';
  for (let index = 0; index < 10; index += 1) {
    passcode += alphabet[randomInt(alphabet.length)];
  }
  return passcode;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface MeetingProvisionDeps {
  api?: ZoomApi;
  store?: MeetingProvisionStore;
  env?: NodeJS.ProcessEnv;
  passcodeFactory?: () => string;
}

export interface MeetingProvisionResult extends Record<string, unknown> {
  meeting_id: string;
  zoom_meeting_number: number;
  host_zoom_user_id: string;
  /** false = a previous attempt had already created it (§12 resume). */
  created: boolean;
  candidates_tried: number;
  /** §9.4: effective `auto_recording` came back as something other than 'none'. */
  settings_drift: boolean;
  effective_auto_recording: string;
}

/**
 * What an operator recovery returns when the compare-and-set MISSED (Sol R4): the row
 * moved past `pending` — a webhook advanced it, or another worker finished the same
 * recovery — while the `getMeeting` was in flight.
 *
 * A COMPLETION, not a failure, and that is a design decision worth being explicit about:
 * nothing is wrong, nothing is retryable, and there is no action a human could take, so
 * sending it to triage would put noise on the §18 panel where the real ambiguous parks
 * live. `superseded` is the flag a future health query keys on; a distinct shape from
 * `MeetingProvisionResult` so nothing can read a superseded run as a provisioned one.
 */
export interface MeetingProvisionSupersededResult extends Record<string, unknown> {
  meeting_id: string;
  zoom_meeting_number: number;
  recovered: false;
  superseded: true;
}

/** Checkpoint adoption lost its CAS after the lease check; another writer won. */
export interface MeetingProvisionAdoptionSupersededResult extends Record<string, unknown> {
  meeting_id: string;
  zoom_meeting_number: number;
  adopted: false;
  superseded: true;
}

/**
 * The FRESH create persisted through the same CAS (Sol R6 ①) and lost it: between the
 * post-create checkpoint heartbeat and the write, another worker took the row out of
 * `pending` + NULL-number.
 *
 * A distinct shape from the adoption miss, because the operational meaning is not the
 * same. An adoption miss means somebody else persisted the checkpoint THIS job would
 * have persisted — same meeting, nothing lost. A fresh-create miss is one of two
 * things and this process cannot tell which: either another worker adopted our own
 * checkpoint (same meeting number, nothing lost), or it created a different meeting,
 * in which case the one Zoom just minted for us is an ORPHAN. So the number rides on
 * the result: `complete_zoom_job` REPLACES `stage_state` with what the handler returns
 * (Z1b-3 ③), and this is the last record that can name it.
 *
 * A completion, not a failure, for the same reason the other two misses are: the row
 * is correct, the CAS did its job, and no retry improves anything — a retry would take
 * the replay path off the number the winner wrote.
 */
export interface MeetingProvisionCreateSupersededResult extends Record<string, unknown> {
  meeting_id: string;
  /** The meeting Zoom minted for THIS attempt — possibly an orphan. */
  zoom_meeting_number: number;
  persisted: false;
  superseded: true;
}

interface ProvisionPayload {
  surface_type: ZoomSurfaceType;
  surface_id: string;
}

/**
 * Community surfaces arrive in Z6. Until then an unexpected surface type is a
 * programming error, not a transient one — retrying it forever would hide it.
 */
function readPayload(payload: Record<string, unknown>): ProvisionPayload {
  const surfaceType = payload.surface_type;
  const surfaceId = payload.surface_id;

  if (surfaceType !== 'consultor_session') {
    throw new ZoomNonRetryableError(
      `meeting_provision supports surface_type 'consultor_session' only; received '${String(surfaceType)}'.`,
      { operation: 'meeting_provision' }
    );
  }
  if (typeof surfaceId !== 'string' || surfaceId === '') {
    throw new ZoomNonRetryableError('meeting_provision payload is missing surface_id.', {
      operation: 'meeting_provision',
    });
  }
  return { surface_type: surfaceType, surface_id: surfaceId };
}

export function createMeetingProvisionHandler(deps: MeetingProvisionDeps = {}): ZoomJobHandler {
  return async (ctx) => {
    const env = deps.env ?? process.env;
    const api = deps.api ?? getZoomApi(env);
    const store = deps.store ?? defaultMeetingProvisionStore(env);
    const makePasscode = deps.passcodeFactory ?? generateMeetingPasscode;

    const { surface_type: surfaceType, surface_id: surfaceId } = readPayload(ctx.job.payload);

    const session = await store.readSession(surfaceId);
    if (session === null) {
      throw new ZoomNonRetryableError(
        `consultor_session ${surfaceId} does not exist; nothing to provision.`,
        { operation: 'meeting_provision' }
      );
    }

    // --- §8 eligibility, BEFORE any reservation ---------------------------
    // The handler used to validate only the schedule FIELDS, so a cancelled, draft,
    // soft-deleted, `presencial` or non-Zoom session went all the way to `createMeeting`
    // (Sol F3). This gate runs before a host is even resolved, so the ordinary refusal
    // costs one read and writes nothing.
    const ineligible = checkSessionEligibility(session);
    if (ineligible !== null) {
      // ...but a PREVIOUS attempt may already hold a reservation for this surface, and a
      // session that has since been cancelled must not go on blocking a host for a
      // window nobody will use. Release it — but only when it is a bare reservation.
      // A row carrying `zoom_meeting_number` has a real meeting behind it at Zoom, and
      // freeing that interval would let a second meeting be booked onto a host who is
      // genuinely occupied; deleting the Zoom meeting is Z2's cancel flow, not this
      // job's. Same for a live post-create checkpoint.
      const held = await store.findMeetingBySurface(surfaceType, surfaceId);
      const checkpointHere = readCreatedCheckpoint(ctx.job.stage_state);
      const isBareReservation =
        held !== null &&
        held.zoom_meeting_number === null &&
        (ZOOM_MEETING_ACTIVE_STATUSES as readonly string[]).includes(held.status) &&
        !(checkpointHere !== null && checkpointHere.meetingId === held.id) &&
        // ...and not a row parked by an UNRESOLVED ambiguous create: it has no meeting
        // number precisely because we never learned one, which is not the same as
        // knowing no meeting exists (Sol F4).
        !isAmbiguousCreateMarker(held.last_error);

      if (isBareReservation) {
        await store.releaseReservation(
          (held as ProvisionMeetingRow).id,
          `session_ineligible:${ineligible}`
        );
      }

      throw new ZoomSessionIneligibleError(
        `consultor_session ${surfaceId} is not eligible for Zoom provisioning (${ineligible}).`,
        ineligible
      );
    }

    // --- §10 instants -----------------------------------------------------
    const startsAtMs = getSessionDateTime(
      session.session_date,
      normalizeTime(session.start_time)
    ).getTime();
    const startsAtIso = new Date(startsAtMs).toISOString();
    const wallClock = toZoomWallClock(session.session_date, session.start_time);

    const durationMinutes =
      session.scheduled_duration_minutes ??
      deriveDurationMinutes(session.session_date, session.start_time, session.end_time);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new ZoomNonRetryableError(
        `consultor_session ${surfaceId} has a non-positive duration (${durationMinutes} min).`,
        { operation: 'meeting_provision' }
      );
    }
    // The projection's `ends_at` is NOT derived here any more (Sol R6): every RPC that
    // publishes reads it off `zoom_meetings.ends_at`, the STORED generated column, so
    // the window the UI shows and the window the EXCLUDE constraint defends are the
    // same value rather than two computations that agree today.

    // --- Reservation ------------------------------------------------------
    const existing = await store.findMeetingBySurface(surfaceType, surfaceId);

    let meetingId: string;
    let hostZoomUserId: string;
    let candidatesTried = 0;

    // Anchor 1 (module header): a meeting number means Zoom already holds a meeting for
    // this surface. Never create a second one. Absolute, and deliberately keyed on the
    // number ALONE — every "do not create" guard below reads this flag.
    const hasNumber = existing !== null && existing.zoom_meeting_number !== null;

    // What is left to DO for such a row is not the same question, and the answer is the
    // row's status (Sol R3 ①). The provisioning write lands the number, the passcode,
    // the join_url and the effective settings in ONE transition, so a row that reached
    // `provisioned` — or a later lifecycle status — carries all of them: replaying it
    // just finishes the remaining steps. A row still `pending` with a number is the
    // other case entirely: an OPERATOR wrote that number by hand to resolve a parked
    // ambiguous create, and NOTHING has ever read the meeting. Replaying that one
    // published a `scheduled` projection for a meeting with no passcode and no join_url,
    // on a row that still said `pending` and still carried the park marker.
    const operatorRecovery = hasNumber && (existing as ProvisionMeetingRow).status === 'pending';
    const alreadyCreated = hasNumber && !operatorRecovery;

    // Anchor 2: the previous attempt created at Zoom and checkpointed, then died before
    // the provisioning write landed. The checkpoint is only adoptable onto the row it names —
    // a checkpoint whose `meeting_id` is not this surface's row is stale, and writing it
    // anywhere else would corrupt a different reservation.
    const checkpoint = readCreatedCheckpoint(ctx.job.stage_state);
    const adoption =
      !hasNumber && existing !== null && checkpoint !== null && checkpoint.meetingId === existing.id
        ? { row: existing, checkpoint }
        : null;

    // --- The parked-ambiguous gate (Sol R2 ②) -----------------------------
    // A row parked by an unresolved ambiguous create is SHAPE-IDENTICAL to a
    // crashed-pre-create reservation: `pending`, a host, no meeting number. So the
    // reservation-reuse path below would happily adopt it and create — which makes
    // REQUEUEING the terminal job, the designated manual-triage lever, the exact
    // second-create that R1-F4 exists to prevent. Parking has to be enforced HERE, by
    // the handler, not merely recorded on the row.
    //
    // Deliberately after the two anchors and before everything else: a row that now
    // carries a meeting number, or a checkpoint that names one, IS the resolution —
    // those take the recovery/adopt branches instead. Below this line nothing is
    // touched: not the reservation, not the row, not Zoom.
    if (!hasNumber && adoption === null && existing !== null) {
      const parked = parseAmbiguousCreateMarker(existing.last_error);
      if (parked !== null) {
        throw new ZoomAmbiguousUnresolvedError(
          `consultor_session ${surfaceId} is parked by an UNRESOLVED ambiguous create; a meeting may already exist at Zoom for this host and window. Requeueing cannot create: resolve it first by recording the discovered zoom_meeting_number, or by clearing last_error if reconciliation proved no meeting exists${
            parked.request_id === null ? '' : ` (x-zm-request-id ${parked.request_id})`
          }.`,
          parked.request_id ?? undefined
        );
      }
    }

    // The crashed-pre-create path: a `pending` row under a host, no meeting at Zoom.
    // Reusing it blindly was Sol F3's second half — the session may have been
    // RESCHEDULED since, in which case the interval the EXCLUDE constraint is
    // protecting is not the interval about to be sent to Zoom, and the host is
    // double-bookable for the time the meeting will actually occupy.
    const heldReservation =
      !hasNumber &&
      adoption === null &&
      existing !== null &&
      existing.status === 'pending' &&
      existing.host_zoom_user_id !== null
        ? existing
        : null;

    let resumedHost: string | null = null;
    if (heldReservation !== null) {
      if (reservationMatchesSource(heldReservation, startsAtIso, durationMinutes)) {
        resumedHost = heldReservation.host_zoom_user_id;
      } else {
        // Re-reserve ATOMICALLY on the host we already hold: the UPDATE carries the new
        // interval through the same EXCLUDE predicate, so it either moves the
        // reservation or answers 23P01 because the new window collides with somebody
        // else. There is no moment in between where the row protects neither interval.
        const rereserved = await store.reserveExistingMeeting(
          heldReservation.id,
          heldReservation.host_zoom_user_id as string,
          startsAtIso,
          durationMinutes
        );
        // 23P01 ⇒ this host is busy at the NEW time. Fall through and walk candidates
        // exactly as the fresh path does; the row is still ours to re-point.
        if (rereserved) resumedHost = heldReservation.host_zoom_user_id;
      }
    }

    if (hasNumber) {
      meetingId = (existing as ProvisionMeetingRow).id;
      hostZoomUserId = (existing as ProvisionMeetingRow).host_zoom_user_id ?? '';
    } else if (adoption !== null) {
      meetingId = adoption.row.id;
      hostZoomUserId = adoption.row.host_zoom_user_id ?? '';
    } else if (resumedHost !== null) {
      // Crashed between the reservation and the create, and the reservation still
      // matches the source (either it never drifted, or we just moved it). Re-resolving
      // a host from scratch would only fight our own constraint.
      meetingId = (heldReservation as ProvisionMeetingRow).id;
      hostZoomUserId = resumedHost;
    } else {
      const [hosts, facilitators] = await Promise.all([
        store.listActiveHosts(),
        store.listFacilitators(session.id),
      ]);
      const { boundLowerIso, boundUpperIso } = reservationOverlapBounds(
        startsAtMs,
        durationMinutes
      );
      const loads = await store.countHostLoads(boundLowerIso, boundUpperIso);
      const candidates = orderHostCandidates(hosts, facilitators, loads);

      let reservedId: string | null = null;
      let reservedHost: string | null = null;

      for (const candidate of candidates) {
        candidatesTried += 1;

        if (existing === null) {
          const outcome = await store.insertReservation({
            surface_type: surfaceType,
            surface_id: surfaceId,
            school_id: session.school_id,
            host_zoom_user_id: candidate.zoom_user_id,
            starts_at: startsAtIso,
            duration_minutes: durationMinutes,
          });
          // 23P01 → this host is busy for the window. Nothing was written, so there is
          // nothing to release; try the next candidate.
          if (outcome.reserved === false) continue;
          reservedId = outcome.row.id;
        } else {
          // Resume from `error` (or any other non-active status): the UPDATE back into
          // `pending` re-checks the EXCLUDE constraint, so it can 23P01 too.
          const ok = await store.reserveExistingMeeting(
            existing.id,
            candidate.zoom_user_id,
            startsAtIso,
            durationMinutes
          );
          if (!ok) continue;
          reservedId = existing.id;
        }
        reservedHost = candidate.zoom_user_id;
        break;
      }

      if (reservedId === null || reservedHost === null) {
        // §9: terminal, and visible on the health panel. The ticker stores this
        // structurally — triage keys on `reason`, never on the message.
        throw new ZoomNoHostAvailableError(
          `No Zoom host is free for consultor_session ${surfaceId} at ${startsAtIso} (+${durationMinutes} min); ${candidatesTried} candidate(s) tried.`,
          candidatesTried
        );
      }
      meetingId = reservedId;
      hostZoomUserId = reservedHost;
    }

    // --- Create at Zoom ---------------------------------------------------
    // EVERY branch below publishes the projection inside its own guarded RPC. There is
    // no trailing projection write in this handler any more, and no way to make one:
    // `ProvisionPublicClient` no longer carries an `upsert`.
    let zoomMeetingNumber: number;
    let effectiveAutoRecording: string;

    if (alreadyCreated) {
      zoomMeetingNumber = existing.zoom_meeting_number as number;
      // Nothing is re-read from Zoom: the row already holds the effective settings the
      // create returned, and a GET here would cost a round trip to learn nothing new.
      // DERIVED from those persisted settings, never assumed — a row provisioned with
      // drifted `auto_recording` must still report the drift on every replay.
      effectiveAutoRecording = readAutoRecording(existing.effective_settings);

      // --- The replay projection is DERIVED, not asserted (Sol R6 ②) ------
      // This branch used to re-upsert a hard-coded `scheduled` through an unguarded
      // ON CONFLICT DO UPDATE, so a redelivered job arriving after `meeting.started`
      // put the badge back to `scheduled` for a meeting that was live — or over an
      // `ended` one. The status is now read off the internal row INSIDE the RPC,
      // under FOR UPDATE, behind the same never-backward guard the webhook path uses.
      //
      // No heartbeat guards this call, and none is needed: unlike recovery, nothing
      // here is a verdict this process formed before a network round trip. The value
      // written is whatever the row says at the moment of writing, so a worker whose
      // lease was stolen an hour ago still publishes the truth. That is also what
      // makes it HEALING — a surface whose projection never landed gets one created
      // at the meeting's real status, `ended` included.
      const synced = await store.syncProjectionFromMeeting(
        meetingId,
        session.growth_community_id
      );
      if (synced === 'not_publishable' || synced === 'missing') {
        // Neither is retryable in a useful way. `missing` especially must NOT throw:
        // a retry would find no row, take the fresh path, and create a SECOND meeting
        // for a surface that already has one at Zoom.
        console.warn(
          `[meeting-provision] projection sync for meeting ${meetingId} (zoom ${zoomMeetingNumber}) returned '${synced}'; nothing was published.`
        );
      }
    } else if (operatorRecovery) {
      // Sol R3 ①. The operator recorded the number reconciliation found; the create
      // response that carried the passcode, the join_url and the effective settings is
      // the thing that was lost. So this branch RE-READS the meeting — the only source
      // those values can come from — and `createMeeting` is unreachable from it under
      // every outcome, because the number is anchor 1 and anchor 1 is absolute.
      const recorded = (existing as ProvisionMeetingRow).zoom_meeting_number as number;
      const marker = parseAmbiguousCreateMarker((existing as ProvisionMeetingRow).last_error);

      let discovered: ZoomMeeting;
      try {
        discovered = await api.getMeeting(recorded);
      } catch (error) {
        // No writes. The row stays parked exactly as the operator left it — reservation
        // intact, marker intact — so nothing is lost by refusing, and a corrected number
        // resolves it on the next requeue.
        throw new ZoomRecoveryUnusableError(
          `consultor_session ${surfaceId} carries an operator-recorded zoom_meeting_number that could not be read back from Zoom: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)} The row is untouched; re-check the recorded number.`,
          recorded,
          marker?.request_id ?? undefined
        );
      }

      // The same fail-closed bar a create response has to clear (Sol R3 ②), plus the one
      // check only this path can make: Zoom must have answered about the meeting we
      // asked for. Persisting a read-back that names a different meeting would bind the
      // surface to somebody else's.
      const problems = findUnusableProvisionedMeetingFields(discovered);
      if (discovered.id !== recorded) problems.push('the read-back names a different meeting');
      if (problems.length > 0) {
        throw new ZoomRecoveryUnusableError(
          `consultor_session ${surfaceId} carries an operator-recorded zoom_meeting_number whose read-back cannot be used: ${problems.join('; ')}. The row is untouched; re-check the recorded number.`,
          recorded,
          marker?.request_id ?? undefined
        );
      }

      // --- The lease guard (Sol R4) ---------------------------------------
      // Nothing has heartbeated since BEFORE the GET, and the GET is a network round
      // trip. Check the lease the moment the read-back validates and before any write:
      // a worker that no longer owns the job must not persist its verdict onto another
      // worker's row. Lease lost ⇒ zero writes — not the row, and not the projection
      // (the runner handles `ZoomJobLeaseLostError` without a `fail_zoom_job` call).
      // No `stage_state` argument: this path has no checkpoint of its own to keep, and
      // passing one would overwrite whatever the job already carries.
      const stillLeased = await ctx.heartbeat();
      if (!stillLeased) throw new ZoomJobLeaseLostError(ctx.job.id);

      // --- The state guard (Sol R4) ---------------------------------------
      // ONE write, and it is the entire resolution: the number, the passcode, the
      // join_url, the effective settings and `provisioned` — with `last_error` cleared
      // in the SAME UPDATE. The marker must not outlive the row it parks: it is the
      // record of an UNRESOLVED create, and this row is now resolved.
      //
      // And it is COMPARE-AND-SET, not an id-only write. The row was read before the
      // GET; `LIFECYCLE_STARTED_APPLIES_FROM` includes `pending`, so a webhook may have
      // advanced it to `started` (then `ended`) in between, and an id-only write would
      // reset a meeting that is running to `provisioned`. The guard is the state this
      // branch was decided from — still `pending`, still carrying the recorded number.
      const applied = await store.recoverProvisionedMeeting(meetingId, {
        zoom_meeting_number: recorded,
        passcode: discovered.passcode,
        join_url: discovered.joinUrl,
        effective_settings: discovered.settings as Record<string, unknown>,
        status: 'provisioned',
        growth_community_id: session.growth_community_id,
      });

      if (!applied) {
        // STOP — before the projection, which is the whole point: republishing
        // `scheduled` over a meeting the webhook path already moved to `live` or `ended`
        // is the second half of the clobber, and it would be visible in the UI. Nothing
        // was written, so there is nothing to undo; the job completes (see
        // `MeetingProvisionSupersededResult`) rather than failing into triage.
        console.warn(
          `[meeting-provision] recovery SUPERSEDED for meeting ${meetingId} (zoom ${recorded}): the row left 'pending' while the read-back was in flight; nothing written, nothing published.`
        );
        const superseded: MeetingProvisionSupersededResult = {
          meeting_id: meetingId,
          zoom_meeting_number: recorded,
          recovered: false,
          superseded: true,
        };
        return superseded;
      }
      zoomMeetingNumber = recorded;
      // Read off what Zoom just said, exactly as the create path does — §9.4 drift is
      // reported for a recovered meeting like any other.
      effectiveAutoRecording = readAutoRecording(discovered.settings);
    } else if (adoption !== null) {
      // Anchor 2. The former heartbeat exemption was unsound under two adopters (Sol R5
      // ②): a stale worker could write after a fresh adopter plus lifecycle had advanced
      // the row. The argumentless form preserves the checkpoint because the heartbeat
      // RPC COALESCEs a NULL stage_state, while proving this worker still owns the lease.
      const stillLeased = await ctx.heartbeat();
      if (!stillLeased) throw new ZoomJobLeaseLostError(ctx.job.id);

      // One guarded transaction: pending + NULL number → provisioned, then projection.
      // A miss is an ordinary world-advance and must never be followed by another write.
      const adopted = await store.adoptCheckpointMeeting(adoption.row.id, {
        zoom_meeting_number: adoption.checkpoint.number,
        passcode: adoption.checkpoint.passcode,
        join_url: adoption.checkpoint.joinUrl,
        effective_settings: adoption.checkpoint.settings,
        status: 'provisioned',
        growth_community_id: session.growth_community_id,
      });
      if (!adopted) {
        const superseded: MeetingProvisionAdoptionSupersededResult = {
          meeting_id: adoption.row.id,
          zoom_meeting_number: adoption.checkpoint.number,
          adopted: false,
          superseded: true,
        };
        return superseded;
      }
      zoomMeetingNumber = adoption.checkpoint.number;
      effectiveAutoRecording = readAutoRecording(adoption.checkpoint.settings);
    } else {
      // The reservation is held; the Zoom call is the slow part. Checkpoint before it so
      // a lost lease is noticed before we spend a network round trip on it. Only on this
      // path: the resume paths above must not touch `stage_state`.
      const alive = await ctx.heartbeat({ meeting_id: meetingId, stage: 'reserved' });
      if (!alive) throw new ZoomJobLeaseLostError(ctx.job.id);

      let created;
      try {
        created = await api.createMeeting({
          hostZoomUserId,
          // Staff-authored session title, verbatim. Participant names are NEVER
          // appended — the topic is visible to everyone who joins (§8, Ley 21.719).
          topic: session.title,
          startTime: wallClock,
          durationMinutes,
          timezone: SESSION_TIMEZONE,
          passcode: makePasscode(),
          settings: PROVISION_MEETING_SETTINGS,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Did the request reach Zoom? The client answers that, so nothing here does
        // status-code archaeology. A non-`ZoomError` escaping `createMeeting` is treated
        // as ambiguous too: an untyped throw is precisely the case where we do not know.
        const ambiguous = !isZoomError(error) || error.outcome === 'ambiguous';

        if (ambiguous) {
          // NOT markError. Moving the row to `error` would release the interval, and a
          // meeting may exist at Zoom on that host at that time — the retry would then
          // create a SECOND one against a host we had just declared free (Sol F4). The
          // row keeps its `pending` status and its reservation; only `last_error` is
          // written, and the job fails NON-retryably so nothing auto-creates again.
          const requestId = isZoomError(error) ? error.requestId : undefined;
          await store.recordLastError(meetingId, ambiguousCreateMarker(requestId, message));
          throw new ZoomAmbiguousCreateError(
            `createMeeting for consultor_session ${surfaceId} failed with an AMBIGUOUS outcome; a meeting may exist at Zoom and cannot be named from here. Reconcile against Zoom${
              requestId === undefined ? '' : ` (x-zm-request-id ${requestId})`
            }.`,
            requestId
          );
        }

        // DEFINITE pre-create rejection: Zoom answered, and answered without creating.
        // Park the failure on the row and rethrow so `fail_zoom_job` applies its own
        // backoff / dead-letter rules. `error` is NOT an active status, so this also
        // RELEASES the reservation — the EXCLUDE WHERE covers pending/provisioned/
        // started only, and a host held by a job that is not progressing is worse than
        // one that has to be re-reserved on the retry.
        await store.markError(meetingId, message.slice(0, 500));
        throw error;
      }

      // Zoom's create has no idempotency key, so THIS is the irreversible step and the
      // next line is the narrowest the window gets: checkpoint what Zoom just minted
      // into the job's own `stage_state`, atomically with the lease extension, so a
      // crash before the provisioning write resumes by ADOPTING rather than creating again.
      // The plaintext passcode is safe here in the §5 sense and adds no surface:
      // `stage_state` lives in `zoom_internal.zoom_jobs`, whose grants are service-role
      // only — the same exposure `zoom_meetings.passcode` already has.
      // Lease lost ⇒ ZoomJobLeaseLostError and NO markError: this worker no longer owns
      // the job, so it must not write its verdict onto another worker's row. Nothing is
      // checkpointed in that case — see the module header's RESIDUAL.
      const stillLeased = await ctx.heartbeat({
        meeting_id: meetingId,
        stage: CREATED_CHECKPOINT_STAGE,
        meeting: {
          number: created.id,
          passcode: created.passcode,
          join_url: created.joinUrl,
          settings: created.settings,
        },
      });
      if (!stillLeased) throw new ZoomJobLeaseLostError(ctx.job.id);

      // Read the RESPONSE, never the request: Zoom reflects EFFECTIVE settings on a
      // capability mismatch (§20) rather than refusing.
      effectiveAutoRecording = readAutoRecording(created.settings);

      // --- The fresh write is the SAME guarded transaction (Sol R6 ①) -----
      // This used to be `markProvisioned` (an id-only UPDATE) followed by a separate
      // `scheduled` projection upsert — the identical two-call gap R5 ① closed for
      // recovery, and the PM's "a fresh create publishes into a projection that cannot
      // pre-exist" framing did not save it: the race never needed a pre-existing
      // projection. A worker that stalls after the checkpoint heartbeat, loses its
      // lease, and wakes up to write finds a row another adopter has already finished
      // and lifecycle has already advanced — and the id-only write resets it, then
      // republishes `scheduled` over a `live` badge.
      //
      // No new function was needed. The row is at this instant EXACTLY
      // `pending` + `zoom_meeting_number IS NULL` — the reservation INSERT/UPDATE put
      // it there and nothing since has touched it — which is `adopt_checkpoint_meeting`'s
      // compare-and-set verbatim, over the identical field set. The checkpoint
      // heartbeat two statements up is the lease proof immediately before the write,
      // exactly as adoption's argumentless heartbeat is.
      const persisted = await store.adoptCheckpointMeeting(meetingId, {
        zoom_meeting_number: created.id,
        passcode: created.passcode,
        join_url: created.joinUrl,
        // Persisted verbatim. This is also where the §9.4 drift signal LIVES: a value
        // other than 'none' in `effective_settings.auto_recording` is the alert. Drift
        // never keys on `recording_disclaimer` (ledger §9.4).
        effective_settings: created.settings as Record<string, unknown>,
        status: 'provisioned',
        // Carried through so the §7 growth-community SELECT policy can match; a NULL
        // here would make the projection invisible to exactly the members it is for.
        growth_community_id: session.growth_community_id,
      });
      // zoom_meeting_uuid is deliberately NOT written — see the module header.

      if (!persisted) {
        // STOP before anything else, projection included. The winner's row is correct
        // and this attempt has nothing left to contribute. The number is on the result
        // because it is the only place it survives: completion REPLACES `stage_state`,
        // taking the checkpoint that named it with it.
        console.warn(
          `[meeting-provision] fresh-create persistence SUPERSEDED for meeting ${meetingId} (zoom ${created.id}): the row left 'pending'/NULL-number between the post-create checkpoint and the write. Nothing written, nothing published. If the winner recorded a DIFFERENT number, zoom ${created.id} is an orphan at Zoom.`
        );
        const superseded: MeetingProvisionCreateSupersededResult = {
          meeting_id: meetingId,
          zoom_meeting_number: created.id,
          persisted: false,
          superseded: true,
        };
        return superseded;
      }
      zoomMeetingNumber = created.id;
    }

    // `consultor_sessions.meeting_link` is NEVER written: §8 keeps it NULL for managed
    // sessions, so the join path stays the authorized endpoint rather than a bare URL
    // sitting in a public column.
    const settingsDrift = effectiveAutoRecording !== 'none';
    if (settingsDrift) {
      console.warn(
        `[meeting-provision] §9.4 settings drift on meeting ${zoomMeetingNumber}: auto_recording='${effectiveAutoRecording}'`
      );
    }

    const result: MeetingProvisionResult = {
      meeting_id: meetingId,
      zoom_meeting_number: zoomMeetingNumber,
      host_zoom_user_id: hostZoomUserId,
      // Every resume anchor means a PREVIOUS attempt created it at Zoom — the replay,
      // the checkpoint adoption and the operator recovery alike.
      created: !hasNumber && adoption === null,
      candidates_tried: candidatesTried,
      settings_drift: settingsDrift,
      effective_auto_recording: effectiveAutoRecording,
    };
    return result;
  };
}

/** The registry entry. Built per invocation so it can close over deps in tests. */
export const meetingProvisionJobHandler: ZoomJobHandler = (ctx) =>
  createMeetingProvisionHandler()(ctx);
