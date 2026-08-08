#!/usr/bin/env node
/**
 * T2 — seed the synthetic fixtures the CI e2e gate logs in as.
 *
 * Creates, against the *local* Supabase stack only:
 *   - two school rows (the org rows the fixtures hang off; the second exists so a
 *     consultor can be assigned somewhere OTHER than the session's school),
 *   - one auth user + profile + role row per entry in `e2e-fixtures.json`,
 *   - (A8) one Pasantías interest lead, for the admin triage surface,
 *   - (Z1c, extended by Z2-S8) the Zoom domain graph — growth community, three sessions
 *     (one unprovisioned, one carrying a legacy manual meeting link, one PLATFORM-MANAGED
 *     with no link at all), their facilitators, attendees and reports — via
 *     `scripts/ci/seed-e2e-zoom.mjs`.
 *
 * Ordering is load-bearing and is why the users are seeded in two passes:
 *   schools -> auth users + profiles -> zoom domain -> role rows
 * Each zoom session's `created_by`, and every facilitator, attendee and report author,
 * is an FK to `profiles`, so they need pass 1; a `user_roles.community_id` is an FK to
 * `growth_communities`, so the role rows need the zoom domain.
 *
 * Idempotent: safe to re-run against an already-seeded stack. Every write is an
 * upsert or a look-before-insert; nothing is deleted.
 *
 * Ley 21.719: fixtures are 100% synthetic (RFC 2606 reserved domain, invented
 * names). This script hard-refuses any non-local Supabase URL — there is no
 * override flag, by design.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service role key> \
 *   node scripts/ci/seed-e2e.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { seedZoomFixtures } from './seed-e2e-zoom.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(readFileSync(join(HERE, 'e2e-fixtures.json'), 'utf8'));

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

function resolveConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is required');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `refusing to seed e2e fixtures against non-local Supabase host "${host}". ` +
        'This script only ever runs against the ephemeral local stack (supabase start).'
    );
  }

  return { url, serviceRoleKey };
}

/** auth.users has no upsert; find-by-email then create-or-update the password. */
async function ensureAuthUser(supabase, fixture) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);

  const existing = data.users.find(
    (u) => (u.email || '').toLowerCase() === fixture.email.toLowerCase()
  );

  if (existing) {
    // Re-assert the password/confirmation so a partially-seeded stack converges.
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password: fixture.password,
      email_confirm: true,
    });
    if (updateError) throw new Error(`updateUserById(${fixture.email}) failed: ${updateError.message}`);
    return { id: existing.id, created: false };
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: fixture.email,
    password: fixture.password,
    email_confirm: true,
  });
  if (createError) throw new Error(`createUser(${fixture.email}) failed: ${createError.message}`);
  return { id: created.user.id, created: true };
}

async function ensureSchool(supabase, school) {
  const { error } = await supabase
    .from('schools')
    .upsert({ id: school.id, name: school.name, has_generations: false }, { onConflict: 'id' });
  if (error) throw new Error(`school upsert failed: ${error.message}`);
}

/**
 * The login page checks `must_change_password` and then first/last name
 * (utils/profileCompletionCheck) before it honours the post-login destination —
 * an incomplete profile would bounce the fixture to /profile instead.
 */
async function ensureProfile(supabase, userId, fixture, schoolId) {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email: fixture.email,
      name: `${fixture.firstName} ${fixture.lastName}`,
      first_name: fixture.firstName,
      last_name: fixture.lastName,
      must_change_password: false,
      approval_status: 'approved',
      school_id: schoolId,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`profile upsert failed for ${fixture.email}: ${error.message}`);
}

/**
 * user_roles has no natural unique key, so look before inserting — keyed on
 * (user_id, role_type), which is why a fixture's extra rows must use a DIFFERENT
 * role_type from its primary one.
 *
 * An existing row is CONVERGED onto the spec (school/community/is_active) rather than
 * merely reactivated: a persona whose spec says `is_active:false` has to end up
 * inactive on a re-run too, or the second seed would silently grant the access the
 * first one denied.
 */
async function ensureRole(supabase, userId, email, spec) {
  const desired = {
    school_id: spec.schoolId,
    community_id: spec.communityId,
    is_active: spec.isActive,
  };

  const { data: existing, error: selectError } = await supabase
    .from('user_roles')
    .select('id, school_id, community_id, is_active')
    .eq('user_id', userId)
    .eq('role_type', spec.roleType)
    .limit(1);
  if (selectError) throw new Error(`user_roles select failed for ${email}: ${selectError.message}`);

  if (existing && existing.length > 0) {
    const row = existing[0];
    const converged =
      row.school_id === desired.school_id &&
      row.community_id === desired.community_id &&
      row.is_active === desired.is_active;
    if (converged) return;

    const { error } = await supabase.from('user_roles').update(desired).eq('id', row.id);
    if (error) throw new Error(`user_roles converge failed for ${email}: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role_type: spec.roleType, ...desired });
  if (error) throw new Error(`user_roles insert failed for ${email}: ${error.message}`);
}

/**
 * A fixture's optional `school` / `roleScope` / `community` / `inactiveRoles` fields,
 * turned into the concrete role rows to write. Defaults reproduce the pre-Z1c behaviour
 * exactly: one active row at the primary school with no community.
 *
 * `roleScope: 'global'` means school_id NULL, which is what
 * lib/utils/session-policy.ts:31 reads as GLOBAL consultor access. It is a real
 * app-produced shape, not an invented one — pages/api/admin/assign-role.ts:440-457 and
 * pages/api/admin/create-user.ts:146-159 both preserve the caller's school_id verbatim
 * (or its absence) precisely so that scoped and global consultors stay distinguishable.
 */
/**
 * A8 — one Pasantías interest lead, for the admin triage surface.
 *
 * Look-before-insert on the table's own unique key `(email_normalized, cohort)`,
 * and an existing row is left EXACTLY as it is: the specs read the lead but
 * never triage it, so a re-seed must not reset a status a human moved while
 * looking at the page either.
 *
 * `email_normalized` has to equal `lower(btrim(email))` or the CHECK rejects the
 * row; `consent_accepted_at` / `consent_notice_version` are NOT NULL with no
 * default; `marketing_opt_in` is all-or-nothing with its two companion columns,
 * so the false case writes none of them and takes the defaults.
 */
async function ensurePasantiasLead(supabase, lead) {
  const emailNormalized = lead.email.trim().toLowerCase();

  const { data: existing, error: selectError } = await supabase
    .from('pasantias_leads')
    .select('id, status')
    .eq('email_normalized', emailNormalized)
    .eq('cohort', lead.cohort)
    .limit(1);
  if (selectError) throw new Error(`pasantias_leads select failed: ${selectError.message}`);

  if (existing && existing.length > 0) {
    console.log(`[seed-e2e] pasantias lead reused — id ${existing[0].id}, status ${existing[0].status}`);
    return;
  }

  const { data: inserted, error } = await supabase
    .from('pasantias_leads')
    .insert({
      cohort: lead.cohort,
      first_name: lead.firstName,
      last_name: lead.lastName,
      email: lead.email,
      email_normalized: emailNormalized,
      institution: lead.institution,
      phone: lead.phone,
      role_title: lead.roleTitle,
      num_people: lead.numPeople,
      message: lead.message,
      source_path: lead.sourcePath,
      utm_source: lead.utmSource,
      utm_medium: lead.utmMedium,
      utm_campaign: lead.utmCampaign,
      status: lead.status,
      consent_accepted_at: lead.consentAcceptedAt,
      consent_notice_version: lead.consentNoticeVersion,
    })
    .select('id')
    .limit(1);
  if (error) throw new Error(`pasantias_leads insert failed: ${error.message}`);

  console.log(`[seed-e2e] pasantias lead created — id ${inserted?.[0]?.id ?? 'unknown'}`);
}

function resolveSchoolId(fixtures, name) {
  return name === 'secondary' ? fixtures.schoolSecondary.id : fixtures.school.id;
}

function roleSpecsFor(fixtures, fixture) {
  const communityIdFor = (name) => (name === 'zoom' ? fixtures.zoom.community.id : null);

  const primary = {
    roleType: fixture.role,
    schoolId: fixture.roleScope === 'global' ? null : resolveSchoolId(fixtures, fixture.school),
    communityId: communityIdFor(fixture.community),
    isActive: true,
  };

  const inactive = (fixture.inactiveRoles ?? []).map((extra) => ({
    roleType: extra.role,
    schoolId: extra.roleScope === 'global' ? null : resolveSchoolId(fixtures, extra.school),
    communityId: communityIdFor(extra.community),
    isActive: false,
  }));

  return [primary, ...inactive];
}

async function main() {
  const { url, serviceRoleKey } = resolveConfig();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const school of [FIXTURES.school, FIXTURES.schoolSecondary]) {
    await ensureSchool(supabase, school);
    console.log(`[seed-e2e] school ${school.id} "${school.name}" ready`);
  }

  // Pass 1 — auth users + profiles. The zoom domain FKs into `profiles`, so it cannot
  // run before this completes.
  const userIds = {};
  for (const [key, fixture] of Object.entries(FIXTURES.users)) {
    const { id, created } = await ensureAuthUser(supabase, fixture);
    await ensureProfile(supabase, id, fixture, resolveSchoolId(FIXTURES, fixture.school));
    userIds[key] = id;
    console.log(`[seed-e2e] ${key} <${fixture.email}> ${created ? 'created' : 'reused'} — id ${id}`);
  }

  // The Zoom domain graph, between the two passes: it needs the profiles from pass 1 and
  // the role rows in pass 2 need its growth community.
  await seedZoomFixtures({ supabase, fixtures: FIXTURES, userIds });

  // Pass 2 — role rows.
  for (const [key, fixture] of Object.entries(FIXTURES.users)) {
    for (const spec of roleSpecsFor(FIXTURES, fixture)) {
      await ensureRole(supabase, userIds[key], fixture.email, spec);
      console.log(
        `[seed-e2e] ${key} role ${spec.roleType} — school ${spec.schoolId ?? 'NULL (global)'}, ` +
          `community ${spec.communityId ?? 'NULL'}, active ${spec.isActive}`
      );
    }
  }

  // Independent of the persona graph — the leads table has no FK to any of it.
  await ensurePasantiasLead(supabase, FIXTURES.pasantiasLead);

  console.log('[seed-e2e] done');
}

main().catch((error) => {
  console.error(`[seed-e2e] FAILED: ${error.message}`);
  process.exit(1);
});
