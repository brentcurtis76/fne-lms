#!/usr/bin/env node
/**
 * T2 — seed the synthetic fixtures the CI e2e gate logs in as.
 *
 * Creates, against the *local* Supabase stack only:
 *   - two school rows (the org rows the fixtures hang off; the second exists so a
 *     consultor can be assigned somewhere OTHER than the session's school),
 *   - (QA-ROLES) the organization scopes the nine-role roster needs: one generation, one
 *     extra growth community, and TWO school networks holding one school each — the second
 *     network carries no persona, so it is the cross-network negative control,
 *   - one auth user + profile + role row per entry in `e2e-fixtures.json`,
 *   - (A8) one Pasantías interest lead, for the admin triage surface,
 *   - (Z1c, extended by Z2-S8) the Zoom domain graph — growth community, three sessions
 *     (one unprovisioned, one carrying a legacy manual meeting link, one PLATFORM-MANAGED
 *     with no link at all), their facilitators, attendees and reports — via
 *     `scripts/ci/seed-e2e-zoom.mjs`.
 *
 * Ordering is load-bearing and is why the users are seeded in two passes:
 *   schools + generation -> auth users + profiles -> networks + zoom domain -> role rows
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
import {
  assertFixtureScopes,
  resolveCommunityId,
  resolveGenerationId,
  resolveNetworkId,
  resolveRoleSchoolId,
  resolveSchoolId,
} from './e2e-fixture-scopes.mjs';

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
    .upsert(
      {
        id: school.id,
        name: school.name,
        has_generations: school.hasGenerations ?? false,
      },
      { onConflict: 'id' }
    );
  if (error) throw new Error(`school upsert failed: ${error.message}`);
}

async function ensureGeneration(supabase, fixtures) {
  const { error } = await supabase.from('generations').upsert(
    {
      id: fixtures.generation.id,
      school_id: fixtures.school.id,
      name: fixtures.generation.name,
      grade_range: fixtures.generation.gradeRange,
      description: 'Generacion local para pruebas E2E. No corresponde a una generacion real.',
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`generation upsert failed: ${error.message}`);
}

/**
 * One synthetic school network plus its single school link.
 *
 * Called once per network block, and the school comes from the block's own `school`
 * field rather than from a hardcoded `fixtures.school.id`: the two networks must stay
 * DISJOINT (primary network -> primary school, secondary network -> secondary school),
 * and that property is only worth asserting if the seeder could express its violation.
 *
 * `redes_de_colegios.nombre` is UNIQUE and `red_escuelas` is UNIQUE (red_id, school_id),
 * so both upserts are keyed on the fixed fixture `id` and are idempotent across re-runs.
 */
async function ensureNetwork(supabase, fixtures, userIds, key) {
  const network = fixtures[key];
  const creatorId = userIds[network.createdBy];
  if (!creatorId) throw new Error(`${key} creator ${network.createdBy} was not seeded`);

  const { error: networkError } = await supabase.from('redes_de_colegios').upsert(
    {
      id: network.id,
      nombre: network.name,
      descripcion: network.description,
      created_by: creatorId,
      last_updated_by: creatorId,
    },
    { onConflict: 'id' }
  );
  if (networkError) throw new Error(`${key} upsert failed: ${networkError.message}`);

  const { error: schoolLinkError } = await supabase.from('red_escuelas').upsert(
    {
      id: network.schoolLinkId,
      red_id: network.id,
      school_id: resolveSchoolId(fixtures, network.school, key),
      agregado_por: creatorId,
    },
    { onConflict: 'id' }
  );
  if (schoolLinkError) {
    throw new Error(`${key} school link upsert failed: ${schoolLinkError.message}`);
  }
}

async function ensureRoleCommunity(supabase, fixtures) {
  const community = fixtures.roleCommunity;
  const { error } = await supabase.from('growth_communities').upsert(
    {
      id: community.id,
      school_id: fixtures.school.id,
      name: community.name,
      generation_id: resolveGenerationId(fixtures, community.generation, 'roleCommunity'),
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`role growth community upsert failed: ${error.message}`);
}

/**
 * The login page checks `must_change_password` and then first/last name
 * (utils/profileCompletionCheck) before it honours the post-login destination —
 * an incomplete profile would bounce the fixture to /profile instead.
 */
async function ensureProfile(supabase, userId, fixture, schoolId, generationId) {
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
      generation_id: generationId,
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
    generation_id: spec.generationId,
    community_id: spec.communityId,
    red_id: spec.redId,
    is_active: spec.isActive,
  };

  const { data: existing, error: selectError } = await supabase
    .from('user_roles')
    .select('id, school_id, generation_id, community_id, red_id, is_active')
    .eq('user_id', userId)
    .eq('role_type', spec.roleType)
    .limit(1);
  if (selectError) throw new Error(`user_roles select failed for ${email}: ${selectError.message}`);

  if (existing && existing.length > 0) {
    const row = existing[0];
    const converged =
      row.school_id === desired.school_id &&
      row.generation_id === desired.generation_id &&
      row.community_id === desired.community_id &&
      row.red_id === desired.red_id &&
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

/**
 * A fixture's five optional scope fields — `school`, `roleScope`, `generation`,
 * `community`, `network` — plus its `inactiveRoles` entries, turned into the concrete
 * role rows to write. Defaults reproduce the pre-Z1c behaviour exactly: one active row at
 * the primary school with no generation, no community and no network.
 *
 * `roleScope: 'global'` means school_id NULL, which is what
 * lib/utils/session-policy.ts:31 reads as GLOBAL consultor access. It is a real
 * app-produced shape, not an invented one — pages/api/admin/assign-role.ts:440-457 and
 * pages/api/admin/create-user.ts:146-159 both preserve the caller's school_id verbatim
 * (or its absence) precisely so that scoped and global consultors stay distinguishable.
 *
 * Every value goes through the FAIL-CLOSED resolvers in `./e2e-fixture-scopes.mjs`: an
 * unsupported value throws instead of collapsing to the primary fixture or to NULL. This
 * function produces ROLE ROWS ONLY — an `inactiveRoles` entry's scope fields reach
 * `user_roles` and never `profiles`, which is written once per persona from the top-level
 * fields in `main()`.
 */
function roleSpecsFor(fixtures, fixture, key) {
  const specFor = (spec, label, isActive) => ({
    roleType: spec.role,
    schoolId: resolveRoleSchoolId(fixtures, spec, label),
    generationId: resolveGenerationId(fixtures, spec.generation, label),
    communityId: resolveCommunityId(fixtures, spec.community, label),
    redId: resolveNetworkId(fixtures, spec.network, label),
    isActive,
  });

  const primary = specFor(fixture, `users.${key}`, true);

  const inactive = (fixture.inactiveRoles ?? []).map((extra, index) =>
    specFor(extra, `users.${key}.inactiveRoles[${index}]`, false)
  );

  return [primary, ...inactive];
}

async function main() {
  // ORDER IS LOAD-BEARING, and this is the one place it is enforced.
  //
  // resolveConfig() FIRST: the non-local host refusal has to be the first thing that can
  // fail, and it has to fail before `createClient` — so a misconfigured run never opens a
  // connection to anything. Nothing may be inserted above it.
  const { url, serviceRoleKey } = resolveConfig();

  // Then fail closed on the fixture file, still before any client exists. A typo'd scope
  // value is reported here, once, with every offender named — rather than being mapped
  // silently onto the primary fixture and discovered as a mystery failure in some later
  // authorization spec.
  assertFixtureScopes(FIXTURES);

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const school of [FIXTURES.school, FIXTURES.schoolSecondary]) {
    await ensureSchool(supabase, school);
    console.log(`[seed-e2e] school ${school.id} "${school.name}" ready`);
  }
  await ensureGeneration(supabase, FIXTURES);

  // Pass 1 — auth users + profiles. The zoom domain FKs into `profiles`, so it cannot
  // run before this completes.
  const userIds = {};
  for (const [key, fixture] of Object.entries(FIXTURES.users)) {
    const { id, created } = await ensureAuthUser(supabase, fixture);
    // The PROFILE takes the persona's top-level `school` / `generation` only. `roleScope`
    // is a role-row concept (a profile is never global) and an `inactiveRoles` entry never
    // reaches this call at all.
    await ensureProfile(
      supabase,
      id,
      fixture,
      resolveSchoolId(FIXTURES, fixture.school, `users.${key}`),
      resolveGenerationId(FIXTURES, fixture.generation, `users.${key}`)
    );
    userIds[key] = id;
    console.log(`[seed-e2e] ${key} <${fixture.email}> ${created ? 'created' : 'reused'} — id ${id}`);
  }

  // The extra scopes make all nine roles useful for browser testing rather than merely
  // able to log in: generation leaders and network supervisors receive real local FKs.
  //
  // TWO networks. The second one holds only the secondary school and no persona at all,
  // which is what makes `networkSupervisor` a usable cross-network negative control: it is
  // scoped to the primary network while a real, populated network it does not supervise
  // exists alongside. Seeding only one network would make any future denial assertion pass
  // against a non-existent id — i.e. for the wrong reason.
  for (const key of ['network', 'networkSecondary']) {
    await ensureNetwork(supabase, FIXTURES, userIds, key);
    const linkedSchool = resolveSchoolId(FIXTURES, FIXTURES[key].school, key);
    console.log(
      `[seed-e2e] ${key} ${FIXTURES[key].id} "${FIXTURES[key].name}" ready — school ${linkedSchool}`
    );
  }
  await ensureRoleCommunity(supabase, FIXTURES);

  // The Zoom domain graph, between the two passes: it needs the profiles from pass 1 and
  // the role rows in pass 2 need its growth community.
  await seedZoomFixtures({ supabase, fixtures: FIXTURES, userIds });

  // Pass 2 — role rows.
  for (const [key, fixture] of Object.entries(FIXTURES.users)) {
    for (const spec of roleSpecsFor(FIXTURES, fixture, key)) {
      await ensureRole(supabase, userIds[key], fixture.email, spec);
      console.log(
        `[seed-e2e] ${key} role ${spec.roleType} — school ${spec.schoolId ?? 'NULL (global)'}, ` +
          `generation ${spec.generationId ?? 'NULL'}, community ${spec.communityId ?? 'NULL'}, ` +
          `network ${spec.redId ?? 'NULL'}, active ${spec.isActive}`
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
