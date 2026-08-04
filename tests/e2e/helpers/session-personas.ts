/**
 * Z1c-2 — the three authorization tiers the seeded personas fall into, in one place.
 *
 * `canViewSession()` (lib/utils/session-policy.ts:92-123) answers "may this caller open
 * the session at all?". `lib/utils/session-disclosure.ts` answers the narrower question
 * that comes next: what is allowed INSIDE the payload. The two are deliberately different,
 * and the difference is the whole point of these specs — a suite that only proved
 * allow-vs-deny would still pass with the disclosure layer removed entirely.
 *
 *   PRIVILEGED     admins, the session's own facilitators, and school-scoped or global
 *                  consultors. Receive participant e-mails and the raw `meeting_link`.
 *                  NOT automatically `facilitators_only` reports — that is a strictly
 *                  narrower set again (REPORT_PRIVILEGED_PERSONAS below), and conflating
 *                  the two is the easiest way to write an authorization suite that asserts
 *                  more access than the code actually grants.
 *   VIEW_ONLY      passes canViewSession, is NOT privileged. Growth-community members,
 *                  leaders included (session-disclosure.ts:52 states this explicitly, and
 *                  :25 is deliberately narrower than canEditSession — a GC leader may edit
 *                  a session's content but is not a facilitator). Gets names WITHOUT
 *                  e-mails, `has_meeting`/`join_path` INSTEAD of the raw link, and only
 *                  `all_participants` reports.
 *   DENIED         fails canViewSession outright.
 *
 * Every persona in the fixture file belongs to exactly one tier, and
 * `assertTierPartitionIsTotal()` enforces that at module load: a persona added to
 * e2e-fixtures.json is either classified here or it fails the suite loudly, rather than
 * quietly escaping the matrix.
 */
import { FIXTURE_KEYS, type FixtureKey } from './auth';

/**
 * Receives e-mails and the raw meeting_link — `canViewParticipantEmails` /
 * `canViewRawMeetingLink` (session-disclosure.ts:52, :90).
 */
export const PRIVILEGED_PERSONAS: FixtureKey[] = [
  'admin',
  // The lead facilitator of BOTH fixture sessions, and a consultor scoped to their school.
  'consultorAssigned',
  // school_id IS NULL on the role row — getConsultorAccess().isGlobal.
  'consultorGlobal',
];

/**
 * Receives `facilitators_only` reports and `meeting_transcript` —
 * `canViewRestrictedReports` (session-disclosure.ts:25), which is a STRICTLY SMALLER set:
 * admins and the session's own facilitators, and nobody else.
 *
 * `consultorGlobal` is the persona that makes the two rules observably different. They get
 * every participant e-mail and the raw meeting link, and still do NOT get a
 * facilitators_only report, because raw session content follows the narrower rule
 * (PROJECT_STATE: *el asesor nunca lee contenido crudo de sesiones ajenas*). A suite that
 * modelled "privileged" as a single tier would either miss that or assert it backwards.
 */
export const REPORT_PRIVILEGED_PERSONAS: FixtureKey[] = ['admin', 'consultorAssigned'];

/** Privileged for e-mails and the link, but NOT for restricted reports. */
export const EMAIL_ONLY_PRIVILEGED_PERSONAS: FixtureKey[] = PRIVILEGED_PERSONAS.filter(
  (key) => !REPORT_PRIVILEGED_PERSONAS.includes(key)
);

/**
 * Passes canViewSession, receives the redacted payload. The highest-value tier in this
 * chunk: the assertions that only these personas can make are what give the suite teeth.
 */
export const VIEW_ONLY_PERSONAS: FixtureKey[] = ['gcLeader'];

/** Fails canViewSession. Must be indistinguishable from "no such session". */
export const DENIED_PERSONAS: FixtureKey[] = [
  // A consultor scoped to the OTHER fixture school.
  'consultorOtherSchool',
  // Plain docente: no admin, no consultor scope, no community membership.
  'docente',
  // Holds a consultor role row at the right school, but is_active=false — getUserRoles
  // filters on is_active, so the deactivated grant must not resurface.
  'inactiveConsultor',
];

/** Everyone who may open the session at all. */
export const VIEWER_PERSONAS: FixtureKey[] = [...PRIVILEGED_PERSONAS, ...VIEW_ONLY_PERSONAS];

/**
 * The tiers must PARTITION the fixture roster: no persona in two tiers, none in none.
 *
 * Without this, a persona added to e2e-fixtures.json would be seeded, would be logged in
 * by ci-fixture.spec.ts, and would then be silently absent from every authorization
 * assertion in this chunk — covered where it is cheap and uncovered where it matters.
 */
function assertTierPartitionIsTotal(): void {
  const tiered = [...PRIVILEGED_PERSONAS, ...VIEW_ONLY_PERSONAS, ...DENIED_PERSONAS];
  const duplicated = tiered.filter((key, i) => tiered.indexOf(key) !== i);
  const unclassified = FIXTURE_KEYS.filter((key) => !tiered.includes(key));
  const unknown = tiered.filter((key) => !FIXTURE_KEYS.includes(key));

  const problems = [
    unclassified.length > 0 ? `classified in no tier: ${unclassified.join(', ')}` : null,
    duplicated.length > 0 ? `classified in more than one tier: ${duplicated.join(', ')}` : null,
    unknown.length > 0 ? `classified but not a seeded persona: ${unknown.join(', ')}` : null,
  ].filter(Boolean);

  if (problems.length === 0) return;

  throw new Error(
    `[session-personas] the tiers must partition the fixture roster — ${problems.join('; ')}. ` +
      'Assign every persona to exactly one tier; an unclassified persona is one the ' +
      'authorization matrix never exercises.'
  );
}

assertTierPartitionIsTotal();
