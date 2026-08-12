/**
 * Identity matching for Zoom participants — a PURE module (plan §11; Z7-2 [R5]/[R6]/[R8]).
 *
 * Pure so that the one behaviour this design exists to prevent is a unit test rather
 * than an integration guess. **A row matched to the wrong person is the defect; an
 * unmatched row is correct behaviour** (§15.3.5 blind spot 1) — a facilitator confirms
 * an unmatched suggestion by hand, whereas a mis-match silently asserts that someone
 * attended a session they were never in, on a surface an admin uses to compare a
 * consultant's billable presence.
 *
 * ## The hierarchy is fixed and its order is the whole point ([R5])
 *
 *   `customer_key` → `email` → `display_name` → `unmatched`
 *
 * Confidence descends strictly. `customer_key` is minted by us; `email` is unique and
 * identifying; a display name is a string a human typed into a join box. Reversing any
 * two of these trades a certain match for a guessable one.
 *
 * ## `participant.user_id` is NEVER a matching key
 *
 * Z0B recorded that trap explicitly: it is per-occurrence, so it identifies a seat in
 * one meeting rather than a person. The committed fixtures carry `62143101` and
 * `12344623` and neither means anything outside its own occurrence. It is not read here
 * and there is no parameter for it.
 *
 * ## Empty string is Zoom saying "absent"
 *
 * On the committed `participant_left` capture, FOUR fields are `""` — `email`,
 * `participant_user_id`, `id` and `registrant_id`. A matcher that treats `""` as a value
 * matches every anonymous guest to the same phantom person, which is the mis-match
 * failure mode at scale. `readParticipantField` is the single chokepoint that turns
 * absent-shaped values into `null`, and every field goes through it.
 */

/** How a row's `user_id` was decided. Mirrors the `matched_by` CHECK on the table. */
export type AttendanceMatchedBy = 'customer_key' | 'email' | 'name' | 'unmatched';

/** The participant fields this module is allowed to see. Note: no `user_id`. */
export interface ParticipantIdentity {
  customerKey: string | null;
  email: string | null;
  displayName: string | null;
}

/**
 * One person who is EXPECTED at this surface — the only pool a display name may be
 * matched against ([R6]). Supplied by the caller as plain data.
 */
export interface AttendeeCandidate {
  userId: string;
  name: string | null;
}

/**
 * Pre-resolved lookups the caller performs; this module does no I/O.
 *
 * `customerKeyProfileId` / `emailProfileId` are non-null only when a `profiles` row was
 * actually found. That is what keeps `user_id` a valid FK and keeps the promise in
 * [R5]: a decoded key that names nobody is not a match.
 */
export interface IdentityLookups {
  customerKeyProfileId: string | null;
  emailProfileId: string | null;
  expectedAttendees: AttendeeCandidate[];
}

export interface IdentityMatch {
  userId: string | null;
  matchedBy: AttendanceMatchedBy;
}

/**
 * Zoom's "absent" is inconsistent: a missing key, `null`, or `""`. All three become
 * `null` here, and whitespace-only is treated the same — a name of `"   "` identifies
 * nobody.
 */
export function readParticipantField(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Reads the three matchable fields off a participant block. `user_id` is not one. */
export function readParticipantIdentity(participant: unknown): ParticipantIdentity {
  const block = (participant ?? {}) as Record<string, unknown>;
  return {
    customerKey: readParticipantField(block.customer_key),
    email: readParticipantField(block.email),
    displayName: readParticipantField(block.user_name),
  };
}

/**
 * The inverse of `toCustomerKey` (`pages/api/meet/session/[id]/join.ts:250`), which is
 * "the user's UUID with hyphens stripped".
 *
 * Strict on purpose. Only a 32-character hex string can be one of ours, so a
 * `customer_key` set by some other integration — or by a participant who typed one —
 * decodes to null and falls through to the next branch rather than being reshaped into
 * a uuid that might collide with a real profile.
 *
 * Returning a well-formed uuid is NOT a match. The caller still has to find the
 * `profiles` row; see `IdentityLookups`.
 */
export function profileIdFromCustomerKey(customerKey: string | null): string | null {
  if (customerKey === null) return null;
  if (!/^[0-9a-f]{32}$/i.test(customerKey)) return null;
  const hex = customerKey.toLowerCase();
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Trim, case-fold, collapse internal whitespace. Exactly those three, and deliberately
 * NOT accent folding: "Martin" and "Martín" are different people until somebody proves
 * otherwise, and the cost of that strictness is an unmatched row a facilitator confirms
 * — the cheap failure.
 */
export function normalizeDisplayName(raw: string | null): string | null {
  if (raw === null) return null;
  const normalized = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Exact-after-normalisation match against the expected attendees, and **two candidates
 * mean no match** ([R6]).
 *
 * Ambiguity is the whole reason this returns null rather than a first hit: two people
 * named "Ana Pérez" in one growth community is ordinary, and picking either would be a
 * coin flip presented to an admin as evidence. No fuzzy matching, no partial matching,
 * no first-name matching — those would each turn this from a conservative suggestion
 * into a guess.
 */
export function matchByDisplayName(
  displayName: string | null,
  expectedAttendees: AttendeeCandidate[]
): string | null {
  const target = normalizeDisplayName(displayName);
  if (target === null) return null;

  const hits = expectedAttendees.filter(
    (candidate) => normalizeDisplayName(candidate.name) === target
  );
  // Distinct people, not distinct rows: the same attendee listed twice is one candidate.
  const distinct = new Set(hits.map((hit) => hit.userId));
  return distinct.size === 1 ? hits[0].userId : null;
}

/**
 * The hierarchy, applied in order. The first branch that names an actual profile wins;
 * everything else is `unmatched` with a NULL `user_id`.
 */
export function matchParticipantIdentity(
  identity: ParticipantIdentity,
  lookups: IdentityLookups
): IdentityMatch {
  if (identity.customerKey !== null && lookups.customerKeyProfileId !== null) {
    return { userId: lookups.customerKeyProfileId, matchedBy: 'customer_key' };
  }
  if (identity.email !== null && lookups.emailProfileId !== null) {
    return { userId: lookups.emailProfileId, matchedBy: 'email' };
  }
  const byName = matchByDisplayName(identity.displayName, lookups.expectedAttendees);
  if (byName !== null) {
    return { userId: byName, matchedBy: 'name' };
  }
  return { userId: null, matchedBy: 'unmatched' };
}

/**
 * The fallback interval key, used only when Zoom omitted `participant_uuid` ([R3]).
 *
 * Same descending confidence as the match hierarchy, and normalised the same way, so
 * that a rejoin by the same person lands on the same token. Null when the participant
 * offered nothing at all — at which point the applier has no way to pair a leave with a
 * join and says so rather than guessing.
 */
export function identityToken(identity: ParticipantIdentity): string | null {
  if (identity.customerKey !== null) return `ck:${identity.customerKey.toLowerCase()}`;
  if (identity.email !== null) return `em:${identity.email.toLowerCase()}`;
  const name = normalizeDisplayName(identity.displayName);
  return name === null ? null : `nm:${name}`;
}
