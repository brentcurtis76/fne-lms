#!/usr/bin/env node
/**
 * T2 — seed the synthetic fixtures the CI e2e gate logs in as.
 *
 * Creates, against the *local* Supabase stack only:
 *   - one school row (minimal org row both fixtures hang off),
 *   - an `admin` auth user + profile + active admin role,
 *   - a `docente` auth user + profile + active docente role (the disallowed role,
 *     so role-gating can be proven to differ rather than merely asserted).
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

/** user_roles has no natural unique key, so look before inserting. */
async function ensureRole(supabase, userId, fixture, schoolId) {
  const { data: existing, error: selectError } = await supabase
    .from('user_roles')
    .select('id, is_active')
    .eq('user_id', userId)
    .eq('role_type', fixture.role)
    .limit(1);
  if (selectError) throw new Error(`user_roles select failed for ${fixture.email}: ${selectError.message}`);

  if (existing && existing.length > 0) {
    if (existing[0].is_active) return;
    const { error } = await supabase
      .from('user_roles')
      .update({ is_active: true })
      .eq('id', existing[0].id);
    if (error) throw new Error(`user_roles reactivate failed for ${fixture.email}: ${error.message}`);
    return;
  }

  const { error } = await supabase.from('user_roles').insert({
    user_id: userId,
    role_type: fixture.role,
    school_id: schoolId,
    is_active: true,
  });
  if (error) throw new Error(`user_roles insert failed for ${fixture.email}: ${error.message}`);
}

async function main() {
  const { url, serviceRoleKey } = resolveConfig();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureSchool(supabase, FIXTURES.school);
  console.log(`[seed-e2e] school ${FIXTURES.school.id} "${FIXTURES.school.name}" ready`);

  for (const [key, fixture] of Object.entries(FIXTURES.users)) {
    const { id, created } = await ensureAuthUser(supabase, fixture);
    await ensureProfile(supabase, id, fixture, FIXTURES.school.id);
    await ensureRole(supabase, id, fixture, FIXTURES.school.id);
    console.log(
      `[seed-e2e] ${key} <${fixture.email}> ${created ? 'created' : 'reused'} — role ${fixture.role}, id ${id}`
    );
  }

  console.log('[seed-e2e] done');
}

main().catch((error) => {
  console.error(`[seed-e2e] FAILED: ${error.message}`);
  process.exit(1);
});
