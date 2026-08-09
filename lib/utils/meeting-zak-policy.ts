/**
 * The §9 ZAK / `role:1` issuance rule (plan §9, Z3-2).
 *
 * A ZAK is the credential that lets a browser join actually START a meeting.
 * §9 provisions consultor sessions with `join_before_host: false`, so it is the
 * difference between a facilitator opening the call and a facilitator sitting in
 * a waiting room — and it is a bearer credential for a HOST IDENTITY, which is
 * why who may receive one is spelled out to the letter:
 *
 * > `role:1` + ZAK issued only to (a) the **assigned facilitator**, and only for
 * > **their own** mapped host identity (`profile_id = facilitator` AND that host
 * > is the meeting's `host_zoom_user_id`); (b) **admins**, but only for
 * > **organization-controlled pool identities** (`profile_id IS NULL`) or
 * > explicitly FNE-owned accounts flagged `org_owned=true` — an admin never
 * > receives a consultant's personal ZAK. Every issuance writes a `zak_issued`
 * > audit event. Other consultants — even same-school — never receive host
 * > credentials. If a meeting is hosted on a consultant's personal identity and
 * > that consultant is absent, an admin's path is host-reassignment to a pool
 * > identity (re-provision job), not impersonation.
 *
 * ## Why this is not `meeting-join-policy.ts`
 *
 * The §5 matrix answers "may this caller join, and as what?" and resolves BOTH
 * admins and assigned facilitators to the single descriptive value
 * `role: 'host'`. §9 asks a narrower question of the same two personas and gives
 * them DIFFERENT answers, keyed on the identity the meeting happens to be hosted
 * on — a fact §5 never reads. Collapsing the two personas is the mistake this
 * module exists to prevent: it is exactly what would hand an admin a
 * consultant's personal ZAK.
 *
 * So the persona is resolved from its own two facts rather than inferred from
 * `decision.role`:
 *
 *  - `isAssignedFacilitator` — a `session_facilitators` row for (session, caller).
 *  - `isAdmin` — the caller's highest role.
 *
 * They are not exclusive, and both branches are evaluated. An admin who is also
 * the assigned facilitator is a real person in this product, and they hold both
 * capabilities: `admin ∧ ¬facilitator` would have been a cheaper inference — the
 * §5 matrix only reaches `'host'` through those two doors — but it would deny
 * that person the pool-host branch their admin role plainly grants.
 *
 * ## Denial is silent, and it is not an error
 *
 * `null` means "no ZAK, no `role:1`". Per §9 the answer to an absent consultant
 * is host-reassignment, NOT impersonation, so there is nothing to escalate here:
 * the join route falls back to link mode, which works, in the same fail-safe
 * direction every other embed failure takes. A refusal writes no audit row —
 * the log records issuances, not attempts.
 */

/** The row `zoom_internal.zoom_hosts` holds for one Zoom identity (§9). */
export interface ZakHostIdentity {
  zoom_user_id: string;
  /** NULL ⇒ organization pool host. Set ⇒ a person's mapped identity. */
  profile_id: string | null;
  /** Explicitly FNE-owned. The only way a `profile_id`-bearing host reaches an admin. */
  org_owned: boolean;
}

/**
 * Which clause of §9 authorized an issuance. Written to the audit row, so a
 * reviewer reading the log can tell a facilitator starting their own meeting
 * from an admin starting one on a pool identity without re-deriving it.
 */
export type ZakPersonaBranch =
  | 'facilitator_own_host'
  | 'admin_pool_host'
  | 'admin_org_owned_host';

export interface ZakIssuanceFacts {
  /** The caller's `profiles.id`. */
  profileId: string;
  /** Is there a `session_facilitators` row for (this session, this caller)? */
  isAssignedFacilitator: boolean;
  /** Is the caller's highest role `admin`? */
  isAdmin: boolean;
  /** `zoom_meetings.host_zoom_user_id` — the identity this meeting runs on. */
  meetingHostZoomUserId: string | null;
  /** The `zoom_hosts` row for that identity; `null` when there is no such row. */
  host: ZakHostIdentity | null;
}

/**
 * Resolves §9 to the clause that authorizes this issuance, or `null` for no ZAK.
 *
 * Pure and total: every input shape has an answer, and the answer for anything
 * unrecognised is `null`. That direction is deliberate — a missing host row, a
 * meeting with no assigned host, a host row that does not match the meeting: all
 * of them mean "we cannot establish whose identity this is", and the fail-safe
 * answer to that question is not a host credential.
 */
export function resolveZakIssuance(facts: ZakIssuanceFacts): ZakPersonaBranch | null {
  const { host, meetingHostZoomUserId } = facts;

  // A meeting with no assigned host has no identity to issue for; a host row we
  // could not read is not evidence of anything.
  if (!meetingHostZoomUserId || !host) {
    return null;
  }

  // The row must be the row for THIS meeting's host. Both callers read it by that
  // id, so a mismatch is impossible today — and it is checked anyway, because the
  // whole rule is "for their own mapped identity" and a lookup that quietly
  // answered about a different identity would satisfy every other clause below.
  if (host.zoom_user_id !== meetingHostZoomUserId) {
    return null;
  }

  // (a) The assigned facilitator, on their OWN mapped identity. `profile_id`
  // non-null is required explicitly: a pool host has no `profile_id`, and
  // comparing `null` to a caller id must never be the thing that decides.
  if (
    facts.isAssignedFacilitator &&
    host.profile_id !== null &&
    host.profile_id === facts.profileId
  ) {
    return 'facilitator_own_host';
  }

  // (b) Admins, on organization-controlled identities ONLY.
  if (facts.isAdmin) {
    if (host.profile_id === null) {
      return 'admin_pool_host';
    }
    if (host.org_owned === true) {
      return 'admin_org_owned_host';
    }
    // profile_id set and not org-owned: a consultant's personal identity. §9's
    // single most explicit sentence — "an admin never receives a consultant's
    // personal ZAK" — and the remedy is host-reassignment, not impersonation.
  }

  return null;
}
