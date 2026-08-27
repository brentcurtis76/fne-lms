/**
 * Z1c — the Zoom-domain half of the synthetic e2e tenant.
 *
 * The plan (§15) named a standalone `scripts/seed-e2e-zoom.js`. It survives here as a
 * MODULE rather than a second entry point: `scripts/ci/seed-e2e.mjs` is the one seeder
 * CI invokes (.github/workflows/ci.yml), and a parallel seeder would need its own guard,
 * its own CI step and its own fixture file — three chances to drift from the fixtures the
 * specs actually log in as.
 *
 * ## Why this file has no local-only guard of its own
 *
 * It has no connection path to guard. It never reads the environment, never builds a
 * client and never chooses a host: it operates on the `supabase` client the caller hands
 * it, so it can only ever reach the host the caller already resolved. That resolution is
 * `resolveConfig()` in scripts/ci/seed-e2e.mjs (:33-49), which throws on any non-local
 * Supabase host and has no override flag. Re-implementing the check here would be a
 * second copy of a guard that is deliberately singular — the caller is the guard.
 *
 * Correspondingly, this module has no `main()` and no shebang: it is not runnable.
 *
 * ## Idempotency
 *
 * Every row has a fixed synthetic id from `e2e-fixtures.json`, so every write is an
 * upsert on a stable key and a second run converges instead of duplicating. Nothing is
 * ever deleted.
 *
 * ## Ley 21.719
 *
 * 100% synthetic: invented school, invented growth community, invented session, no real
 * person, school or meeting. Nothing here is student data.
 */
import { resolveGenerationId } from './e2e-fixture-scopes.mjs';

/**
 * `consultor_sessions.scheduled_duration_minutes` is GENERATED ALWAYS from
 * end_time - start_time (verified against the live local schema, not types/supabase.ts,
 * which is known to lag). Writing it is an error, so it is absent from the payload below
 * by design rather than by omission.
 */
async function ensureGrowthCommunity(supabase, community, schoolId, generationId) {
  const { error } = await supabase.from('growth_communities').upsert(
    {
      id: community.id,
      school_id: schoolId,
      name: community.name,
      generation_id: generationId,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`growth_communities upsert failed: ${error.message}`);
}

/**
 * A session that satisfies every gate in `checkSessionEligibility`
 * (lib/zoom/jobs/meeting-provision.ts:459-471): is_active, status `programada`,
 * a modality with a remote leg, and `meeting_provider = 'zoom'` as the managed-intent
 * signal.
 *
 * `meeting_link` comes from the fixture and is NULL when absent. The three seeded sessions
 * take the branches deliberately:
 *   `zoom.session`        NULL — a provisionable session that has not been provisioned yet
 *                         has no link. No meeting row is created for it: seeding
 *                         zoom_internal.zoom_meetings and deriving the public projection
 *                         through the real sync RPC is Z2's surface, and the PM has ruled
 *                         that nothing in Z1c needs it (has_meeting/join_path derive from
 *                         this legacy column, not from session_meetings_public).
 *   `zoom.linkedSession`  a legacy MANUAL link, provider `otro`. Nothing in Z1c can prove
 *                         the disclosure layer strips a raw link without a row that has
 *                         one to strip, and a NULL link makes every such assertion vacuous.
 *   `zoom.managedSession` Z2-S8 — `is_zoom_managed` TRUE and no link at all. Added because
 *                         the column is NOT NULL DEFAULT false and this seeder never wrote
 *                         it, so every seeded session was unmanaged and no e2e had ever
 *                         reached a managed one. `is_zoom_managed` is written for ALL three
 *                         rows now (false for the first two — the value they already had),
 *                         so the column is stated by the fixture rather than defaulted.
 *
 * `sessionDate` is a fixed far-future date, not a date computed from "now": a relative
 * date would make the seeder's second run write a different row, which is exactly the
 * non-idempotency this file is built to avoid.
 */
async function ensureSession(supabase, session, { schoolId, communityId, createdBy }) {
  const { error } = await supabase.from('consultor_sessions').upsert(
    {
      id: session.id,
      school_id: schoolId,
      growth_community_id: communityId,
      title: session.title,
      description: session.description,
      session_date: session.sessionDate,
      start_time: session.startTime,
      end_time: session.endTime,
      modality: session.modality,
      status: session.status,
      meeting_provider: session.meetingProvider,
      meeting_link: session.meetingLink ?? null,
      is_zoom_managed: session.isZoomManaged === true,
      created_by: createdBy,
      is_active: true,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`consultor_sessions upsert failed: ${error.message}`);
}

/** `session_facilitators` has UNIQUE (session_id, user_id) — upsert on it. */
async function ensureFacilitator(supabase, sessionId, userId, facilitator) {
  const { error } = await supabase.from('session_facilitators').upsert(
    {
      session_id: sessionId,
      user_id: userId,
      facilitator_role: facilitator.facilitatorRole,
      is_lead: facilitator.isLead,
    },
    { onConflict: 'session_id,user_id' }
  );
  if (error) {
    throw new Error(`session_facilitators upsert failed for ${facilitator.user}: ${error.message}`);
  }
}

/**
 * `session_attendees` has UNIQUE (session_id, user_id) — upsert on it.
 *
 * Attendee rows exist so "names WITHOUT e-mails" is a real assertion: the embedded
 * `profiles` carry the fixture addresses, so a payload that leaked them would visibly
 * differ from one that did not. `marked_by`/`marked_at` stay NULL — nothing in Z1c
 * asserts on attendance bookkeeping, and inventing values would be fixture noise.
 */
async function ensureAttendee(supabase, sessionId, userId, attendee) {
  const { error } = await supabase.from('session_attendees').upsert(
    {
      session_id: sessionId,
      user_id: userId,
      expected: attendee.expected ?? true,
      attended: attendee.attended ?? null,
      arrival_status: attendee.arrivalStatus ?? null,
    },
    { onConflict: 'session_id,user_id' }
  );
  if (error) throw new Error(`session_attendees upsert failed for ${attendee.user}: ${error.message}`);
}

/**
 * `session_reports` has no natural unique key, so the fixture supplies a fixed synthetic
 * id and the write upserts on it.
 *
 * The two rows carry the two `visibility` values on purpose: `filterReportsByVisibility`
 * is a filter, and a fixture with only one visibility cannot tell a working filter from a
 * removed one. Their authors differ so the pair also respects the app's own rule of one
 * `session_report` per session per author (pages/api/sessions/[id]/reports.ts:204-216) —
 * a fixture that the API itself would have refused to create is a fixture that proves
 * nothing about the API.
 */
async function ensureReport(supabase, sessionId, authorId, report) {
  const { error } = await supabase.from('session_reports').upsert(
    {
      id: report.id,
      session_id: sessionId,
      author_id: authorId,
      content: report.content,
      visibility: report.visibility,
      report_type: report.reportType,
      audio_url: null,
      transcript: null,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`session_reports upsert failed for ${report.id}: ${error.message}`);
}

/** Resolve a fixture-key reference to a seeded auth user id, or fail by name. */
function requireUserId(userIds, key, what) {
  const id = userIds[key];
  if (!id) throw new Error(`${what} "${key}" is not a seeded fixture user`);
  return id;
}

/**
 * Seed one session and everything hanging off it. Shared by both fixture sessions so the
 * write path cannot diverge between them; the optional blocks are simply absent from the
 * session that does not need them.
 */
async function seedSession(supabase, session, { schoolId, communityId, userIds, label }) {
  const createdBy = requireUserId(userIds, session.createdBy, `zoom.${label}.createdBy`);

  await ensureSession(supabase, session, { schoolId, communityId, createdBy });
  console.log(
    `[seed-e2e-zoom] ${label} ${session.id} ready — ${session.status}/${session.modality}, ` +
      `provider ${session.meetingProvider}, ${session.meetingLink ? 'legacy meeting_link' : 'no meeting_link'}, ` +
      `${session.isZoomManaged === true ? 'PLATFORM-MANAGED' : 'unmanaged'}`
  );

  for (const facilitator of session.facilitators ?? []) {
    const userId = requireUserId(userIds, facilitator.user, `zoom.${label} facilitator`);
    await ensureFacilitator(supabase, session.id, userId, facilitator);
    console.log(
      `[seed-e2e-zoom] ${label} facilitator ${facilitator.user} linked — ${facilitator.facilitatorRole}, lead ${facilitator.isLead}`
    );
  }

  for (const attendee of session.attendees ?? []) {
    const userId = requireUserId(userIds, attendee.user, `zoom.${label} attendee`);
    await ensureAttendee(supabase, session.id, userId, attendee);
    console.log(`[seed-e2e-zoom] ${label} attendee ${attendee.user} linked`);
  }

  for (const report of session.reports ?? []) {
    const authorId = requireUserId(userIds, report.author, `zoom.${label} report author`);
    await ensureReport(supabase, session.id, authorId, report);
    console.log(
      `[seed-e2e-zoom] ${label} report ${report.id} ready — ${report.reportType}/${report.visibility}, author ${report.author}`
    );
  }
}

/**
 * Seed the Zoom session graph.
 *
 * Called by scripts/ci/seed-e2e.mjs AFTER the auth users and profiles exist (each session's
 * `created_by`, every facilitator, attendee and report author is an FK to `profiles`) and
 * BEFORE the role rows are written (a `user_roles.community_id` is an FK to
 * `growth_communities`).
 *
 * @param {object}  params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase  service-role client,
 *   built and host-validated by the caller
 * @param {object}  params.fixtures  the parsed e2e-fixtures.json
 * @param {Record<string, string>} params.userIds  fixture key -> auth user id
 */
export async function seedZoomFixtures({ supabase, fixtures, userIds }) {
  const { community, session, linkedSession, managedSession } = fixtures.zoom;
  const schoolId = fixtures.school.id;

  const generationId = resolveGenerationId(fixtures, community.generation, 'zoom.community');
  await ensureGrowthCommunity(supabase, community, schoolId, generationId);
  console.log(`[seed-e2e-zoom] growth community ${community.id} "${community.name}" ready`);

  // All three sessions live in the SAME school and growth community on purpose: the
  // persona tiers are then identical across them, so a difference the specs observe
  // between two of them is attributable to the meeting link and to the managed flag,
  // and to nothing else.
  const ctx = { schoolId, communityId: community.id, userIds };
  await seedSession(supabase, session, { ...ctx, label: 'session' });
  await seedSession(supabase, linkedSession, { ...ctx, label: 'linkedSession' });
  await seedSession(supabase, managedSession, { ...ctx, label: 'managedSession' });
}
