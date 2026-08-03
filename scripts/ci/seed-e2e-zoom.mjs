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

/**
 * `consultor_sessions.scheduled_duration_minutes` is GENERATED ALWAYS from
 * end_time - start_time (verified against the live local schema, not types/supabase.ts,
 * which is known to lag). Writing it is an error, so it is absent from the payload below
 * by design rather than by omission.
 */
async function ensureGrowthCommunity(supabase, community, schoolId) {
  const { error } = await supabase.from('growth_communities').upsert(
    {
      id: community.id,
      school_id: schoolId,
      name: community.name,
      // generation_id stays NULL: the fixture school has has_generations=false.
      generation_id: null,
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
 * `meeting_link` is deliberately NULL. A provisionable session that has not been
 * provisioned yet has no link, and Z1c-1 does not create meeting rows — how a seeded
 * session acquires a Zoom meeting is Q1 in docs/planning/reviews/fase-4-review-request.md,
 * pending a PM ruling.
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
      meeting_link: null,
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
 * Seed the Zoom session graph.
 *
 * Called by scripts/ci/seed-e2e.mjs AFTER the auth users and profiles exist (the session's
 * `created_by` and every facilitator row are FKs to `profiles`) and BEFORE the role rows
 * are written (a `user_roles.community_id` is an FK to `growth_communities`).
 *
 * @param {object}  params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase  service-role client,
 *   built and host-validated by the caller
 * @param {object}  params.fixtures  the parsed e2e-fixtures.json
 * @param {Record<string, string>} params.userIds  fixture key -> auth user id
 */
export async function seedZoomFixtures({ supabase, fixtures, userIds }) {
  const { community, session } = fixtures.zoom;
  const schoolId = fixtures.school.id;

  await ensureGrowthCommunity(supabase, community, schoolId);
  console.log(`[seed-e2e-zoom] growth community ${community.id} "${community.name}" ready`);

  const createdBy = userIds[session.createdBy];
  if (!createdBy) {
    throw new Error(`zoom.session.createdBy "${session.createdBy}" is not a seeded fixture user`);
  }

  await ensureSession(supabase, session, { schoolId, communityId: community.id, createdBy });
  console.log(
    `[seed-e2e-zoom] session ${session.id} ready — ${session.status}/${session.modality}, provider ${session.meetingProvider}, no meeting_link`
  );

  for (const facilitator of session.facilitators) {
    const userId = userIds[facilitator.user];
    if (!userId) {
      throw new Error(`zoom.session facilitator "${facilitator.user}" is not a seeded fixture user`);
    }
    await ensureFacilitator(supabase, session.id, userId, facilitator);
    console.log(
      `[seed-e2e-zoom] facilitator ${facilitator.user} linked — ${facilitator.facilitatorRole}, lead ${facilitator.isLead}`
    );
  }
}
