import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import {
  E2E_NETWORK,
  E2E_NETWORK_SECONDARY,
  E2E_SCHOOL,
  E2E_USERS,
  ensureStorageState,
  storageStatePath,
} from './helpers/auth';

/**
 * B2a — the network-supervisor management surface, end to end against the real
 * server and the seeded local stack. Mandatory (scripts/ci/e2e-mandatory.mjs):
 * it fails the gate if it is skipped.
 *
 * This is the product-level test the fixture file and ci-fixture.spec.ts
 * promised: ci-fixture proves the cross-network TOPOLOGY (who is scoped
 * where); this spec proves the SURFACES — that /api/admin/networks reports the
 * supervisors RLS used to hide, that assignment and removal actually work, and
 * that the one-active-network-per-supervisor rule holds against the seeded
 * secondary network (a real, populated network — never a nonexistent id, which
 * would pass vacuously).
 *
 * Non-vacuity: these assertions are only satisfiable through a genuinely
 * server-only service-role client. `user_roles` has NO admin-read policy
 * (baseline.sql — only read_own_roles and the community-member view), so the
 * pre-repair handler — whose "admin" client still carried the caller's JWT —
 * answered every supervisor list EMPTY. The positive listing assertions below
 * fail on that code.
 *
 * MUTATION DISCIPLINE: the lifecycle block runs SERIAL and mutates only an
 * ISOLATED synthetic candidate it creates and removes itself (unique
 * per-run address under a fixed purge prefix, RFC 2606 example.com, no
 * password minted). The canonical `networkSupervisor` fixture is never
 * written to, and nothing is ever assigned to the secondary network, so the
 * "secondary has no supervisor" property other specs rely on can never be
 * perturbed — even transiently. Successful assignments target the PRIMARY
 * network only, and only for the throwaway candidate.
 *
 * All fixture data is synthetic (Ley 21.719 — no student or staff PII).
 */

const ROOT = join(__dirname, '..', '..');

/**
 * The e2e job writes `.env.local` and sources it only for the seed step, so the
 * Playwright process does not inherit the service key. Read the file directly;
 * a real `process.env` entry still wins. (Same convention as
 * auth-lifecycle.spec.ts.)
 */
const envFile = join(ROOT, '.env.local');
const fileEnv: Record<string, string> = existsSync(envFile)
  ? parseEnv(readFileSync(envFile, 'utf8'))
  : {};

function requiredEnv(key: string): string {
  const value = process.env[key] || fileEnv[key];
  if (!value) {
    throw new Error(
      `[network-supervisors] ${key} is not set. The e2e environment must declare it — see ` +
        'the .env.local block in .github/workflows/ci.yml.'
    );
  }
  return value;
}

const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');

/** Refuse to run against anything but the ephemeral local stack. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
if (!LOCAL_HOSTS.has(new URL(SUPABASE_URL).hostname)) {
  throw new Error(
    `[network-supervisors] refusing to run against non-local Supabase host ` +
      `"${new URL(SUPABASE_URL).hostname}". This spec creates and deletes synthetic accounts.`
  );
}

const admin: SupabaseClient = createClient(SUPABASE_URL, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SUPERVISORS_API = '/api/admin/networks/supervisors';
const NETWORKS_API = '/api/admin/networks';

/**
 * The isolated assignee. A FIXED prefix (so stale leftovers from a crashed run
 * are purged) plus a per-run stamp (so a retry never collides with a row the
 * purge has not reached yet). RFC 2606 reserved domain; no real person; the
 * account is created WITHOUT a password and can never sign in.
 */
const CANDIDATE_PREFIX = 'e2e-b2a-cand-';
const CANDIDATE_EMAIL = `${CANDIDATE_PREFIX}${Date.now()}@example.com`;
const CANDIDATE_FIRST_NAME = 'Candidata';
const CANDIDATE_LAST_NAME = 'Sintetica B2a';

const SUPERVISOR_FIXTURE = E2E_USERS.networkSupervisor;
const SUPERVISOR_FULL_NAME = `${SUPERVISOR_FIXTURE.firstName} ${SUPERVISOR_FIXTURE.lastName}`;

interface AdminNetwork {
  id: string;
  name: string;
  supervisor_count: number;
  supervisors: { user_id: string; email: string; first_name: string; last_name: string }[];
  schools: { id: number }[];
}

/** Every test does a full navigation or API round trip against a cold server. */
test.setTimeout(120_000);

async function fetchNetworks(page: Page): Promise<Map<string, AdminNetwork>> {
  const response = await page.request.get(NETWORKS_API);
  expect(response.ok(), `GET ${NETWORKS_API} answered ${response.status()}`).toBe(true);
  const body = (await response.json()) as { networks: AdminNetwork[] };
  return new Map(body.networks.map((network) => [network.id, network]));
}

/** Remove every trace of a purge-prefixed candidate: role rows, profile, account. */
async function purgeCandidates(): Promise<void> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`[network-supervisors] listUsers failed: ${error.message}`);

  for (const user of data.users) {
    if (!user.email?.startsWith(CANDIDATE_PREFIX)) continue;
    const { error: rolesError } = await admin.from('user_roles').delete().eq('user_id', user.id);
    if (rolesError) {
      throw new Error(`[network-supervisors] purge of user_roles failed: ${rolesError.message}`);
    }
    const { error: profileError } = await admin.from('profiles').delete().eq('id', user.id);
    if (profileError) {
      throw new Error(`[network-supervisors] purge of profiles failed: ${profileError.message}`);
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      throw new Error(`[network-supervisors] deleteUser failed: ${deleteError.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Authorization boundary — 401 for anonymous, 403 for authenticated non-admin
// ---------------------------------------------------------------------------

test.describe('network supervisors — anonymous callers', () => {
  // Anonymous on purpose: no storage state at all.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('every method answers 401', async ({ page }) => {
    const list = await page.request.get(NETWORKS_API);
    expect(list.status()).toBe(401);

    const assign = await page.request.post(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK.id, userId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(assign.status()).toBe(401);

    const remove = await page.request.delete(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK.id, userId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(remove.status()).toBe(401);
  });
});

test.describe('network supervisors — the supervisor persona is not an admin', () => {
  test.use({ storageState: storageStatePath('networkSupervisor') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'networkSupervisor');
  });

  test('supervisor_de_red gets 403 from every network-management method', async ({ page }) => {
    const list = await page.request.get(NETWORKS_API);
    expect(list.status()).toBe(403);

    // A supervisor may not grant supervision — not even to themself, and not
    // even over the network they already supervise.
    const assign = await page.request.post(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK_SECONDARY.id, userId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(assign.status()).toBe(403);
    expect(((await assign.json()) as { error: string }).error).toContain('administradores');

    const remove = await page.request.delete(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK.id, userId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(remove.status()).toBe(403);
  });

  test('supervisor active scope is exactly the primary network', async ({ page }) => {
    // The one-active-network rule, read back as the persona itself: the
    // canonical supervisor's ACTIVE role rows carry the primary red_id and
    // nothing else.
    const response = await page.request.get('/api/auth/my-roles');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      roles: { role_type: string; red_id: string | null }[];
    };
    expect(body.roles.map((role) => role.role_type)).toEqual(['supervisor_de_red']);
    expect(body.roles[0].red_id).toBe(E2E_NETWORK.id);
    for (const role of body.roles) {
      expect(role.red_id).not.toBe(E2E_NETWORK_SECONDARY.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Admin listing — the repaired GET, over the canonical seeded topology
// ---------------------------------------------------------------------------

test.describe('network supervisors — admin listing', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
  });

  test('the primary network lists its synthetic supervisor; the secondary reports none', async ({
    page,
  }) => {
    const networks = await fetchNetworks(page);
    const primary = networks.get(E2E_NETWORK.id);
    const secondary = networks.get(E2E_NETWORK_SECONDARY.id);

    expect(primary, `network ${E2E_NETWORK.id} is not seeded`).toBeTruthy();
    expect(secondary, `network ${E2E_NETWORK_SECONDARY.id} is not seeded`).toBeTruthy();

    // The assertion the pre-repair handler could never satisfy: under the
    // caller's JWT the supervisor read came back empty for EVERY network.
    const primaryEmails = (primary as AdminNetwork).supervisors.map((s) => s.email);
    expect(primaryEmails).toContain(SUPERVISOR_FIXTURE.email);

    // Empty because the query SUCCEEDED and found nothing — the response is a
    // 200 whose primary network is simultaneously non-empty, so this cannot be
    // the swallowed-error emptiness the defect produced.
    expect((secondary as AdminNetwork).supervisors).toEqual([]);
    expect((secondary as AdminNetwork).supervisor_count).toBe(0);

    for (const network of networks.values()) {
      expect(network.supervisor_count).toBe(network.supervisors.length);
    }
  });

  test('malformed ids are rejected as 400, not surfaced as server errors', async ({ page }) => {
    const response = await page.request.post(SUPERVISORS_API, {
      data: { networkId: 'not-a-uuid', userId: 'also-not-a-uuid' },
    });
    expect(response.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Assignment lifecycle — isolated candidate, serial, self-cleaning
// ---------------------------------------------------------------------------

test.describe('network supervisors — assignment lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: storageStatePath('admin') });

  let candidateId: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
    await purgeCandidates();

    const { data: created, error } = await admin.auth.admin.createUser({
      email: CANDIDATE_EMAIL,
      email_confirm: true,
    });
    if (error || !created?.user) {
      throw new Error(`[network-supervisors] candidate createUser failed: ${error?.message}`);
    }
    candidateId = created.user.id;

    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: candidateId,
        email: CANDIDATE_EMAIL,
        name: `${CANDIDATE_FIRST_NAME} ${CANDIDATE_LAST_NAME}`,
        first_name: CANDIDATE_FIRST_NAME,
        last_name: CANDIDATE_LAST_NAME,
        must_change_password: false,
        approval_status: 'approved',
        school_id: E2E_SCHOOL.id,
      },
      { onConflict: 'id' }
    );
    if (profileError) {
      throw new Error(`[network-supervisors] candidate profile upsert failed: ${profileError.message}`);
    }
  });

  test.afterAll(async () => {
    await purgeCandidates();
  });

  test('the admin assigns the candidate to the primary network', async ({ page }) => {
    const response = await page.request.post(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK.id, userId: candidateId },
    });
    expect(response.status(), await response.text()).toBe(201);
    const body = (await response.json()) as { message: string; audited: boolean };
    // Success message names the REAL network (nombre — the pre-repair code
    // selected the non-existent `name` and 404'd before ever getting here).
    expect(body.message).toContain(E2E_NETWORK.name);
    expect(body.message).toContain(CANDIDATE_FIRST_NAME);
    expect(body.audited).toBe(true);

    const networks = await fetchNetworks(page);
    const primary = networks.get(E2E_NETWORK.id) as AdminNetwork;
    const emails = primary.supervisors.map((s) => s.email);
    expect(emails).toContain(CANDIDATE_EMAIL);
    expect(emails).toContain(SUPERVISOR_FIXTURE.email);
    expect(primary.supervisor_count).toBe(primary.supervisors.length);

    // Correction round: the grant left a DURABLE role_assigned row in the real
    // security_audit_events table, carrying ids-only metadata — no names, no
    // e-mail (Ley 21.719). Read back through the service client.
    const { data: auditRows, error: auditError } = await admin
      .from('security_audit_events')
      .select('action, outcome, actor_role, target_user_id, metadata')
      .eq('action', 'role_assigned')
      .eq('target_user_id', candidateId);
    expect(auditError).toBeNull();
    expect(auditRows).toHaveLength(1);
    expect(auditRows?.[0].outcome).toBe('success');
    expect(auditRows?.[0].actor_role).toBe('admin');
    expect(auditRows?.[0].metadata).toEqual({
      role_type: 'supervisor_de_red',
      red_id: E2E_NETWORK.id,
    });
  });

  test('a duplicate assignment to the same network is rejected', async ({ page }) => {
    const response = await page.request.post(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK.id, userId: candidateId },
    });
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain(`ya es supervisor de la red "${E2E_NETWORK.name}"`);

    // Still exactly one row for the candidate — the rejection wrote nothing.
    const networks = await fetchNetworks(page);
    const primary = networks.get(E2E_NETWORK.id) as AdminNetwork;
    expect(primary.supervisors.filter((s) => s.email === CANDIDATE_EMAIL)).toHaveLength(1);
  });

  test('cross-network assignment is rejected while the primary role is active', async ({ page }) => {
    // The negative control the fixtures seeded for exactly this batch: a REAL,
    // populated second network the candidate genuinely does not supervise.
    const response = await page.request.post(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK_SECONDARY.id, userId: candidateId },
    });
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain(`"${E2E_NETWORK.name}"`);
    expect(body.error).toContain('una red a la vez');

    // The rejection left the secondary network untouched — it must not display
    // any supervisor, and the candidate's only active role stays primary.
    const networks = await fetchNetworks(page);
    const secondary = networks.get(E2E_NETWORK_SECONDARY.id) as AdminNetwork;
    expect(secondary.supervisors).toEqual([]);
    expect(secondary.supervisor_count).toBe(0);

    const { data: candidateRoles, error } = await admin
      .from('user_roles')
      .select('red_id, is_active')
      .eq('user_id', candidateId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true);
    expect(error).toBeNull();
    expect((candidateRoles ?? []).map((role) => role.red_id)).toEqual([E2E_NETWORK.id]);
  });

  test('the admin removes the candidate; the role row is deactivated, not deleted', async ({
    page,
  }) => {
    const response = await page.request.delete(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK.id, userId: candidateId },
    });
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as { message: string; audited: boolean };
    expect(body.message).toContain(CANDIDATE_FIRST_NAME);
    expect(body.message).toContain(E2E_NETWORK.name);
    expect(body.audited).toBe(true);

    const networks = await fetchNetworks(page);
    const primary = networks.get(E2E_NETWORK.id) as AdminNetwork;
    const emails = primary.supervisors.map((s) => s.email);
    expect(emails).not.toContain(CANDIDATE_EMAIL);
    // The canonical supervisor was never touched by any of this.
    expect(emails).toContain(SUPERVISOR_FIXTURE.email);

    // Correction round: the removal's durable role_removed counterpart, with
    // the same ids-only metadata discipline.
    const { data: auditRows, error: auditError } = await admin
      .from('security_audit_events')
      .select('action, outcome, actor_role, target_user_id, metadata')
      .eq('action', 'role_removed')
      .eq('target_user_id', candidateId);
    expect(auditError).toBeNull();
    expect(auditRows).toHaveLength(1);
    expect(auditRows?.[0].outcome).toBe('success');
    expect(auditRows?.[0].actor_role).toBe('admin');
    expect(auditRows?.[0].metadata).toEqual({
      role_type: 'supervisor_de_red',
      red_id: E2E_NETWORK.id,
    });

    // Deactivated, NOT deleted: the row survives as the audit trail, inactive.
    const { data: candidateRoles, error } = await admin
      .from('user_roles')
      .select('red_id, is_active')
      .eq('user_id', candidateId)
      .eq('role_type', 'supervisor_de_red');
    expect(error).toBeNull();
    expect(candidateRoles).toHaveLength(1);
    expect(candidateRoles?.[0]).toEqual({ red_id: E2E_NETWORK.id, is_active: false });
  });

  test('removing an assignment that no longer exists is a 404, not a 500', async ({ page }) => {
    const response = await page.request.delete(SUPERVISORS_API, {
      data: { networkId: E2E_NETWORK.id, userId: candidateId },
    });
    expect(response.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// The admin UI renders what the repaired GET returns
// ---------------------------------------------------------------------------

test.describe('network supervisors — admin UI', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
  });

  test('the management page shows the primary supervisor and an unsupervised secondary network', async ({
    page,
  }) => {
    await page.goto('/admin/network-management');
    await expect(page.getByRole('heading', { name: 'Gestión de Redes' }).first()).toBeVisible({
      timeout: 30_000,
    });

    const primaryCard = page
      .locator('div.bg-white.rounded-lg.shadow')
      .filter({ has: page.getByRole('heading', { name: E2E_NETWORK.name, exact: true }) });
    const secondaryCard = page
      .locator('div.bg-white.rounded-lg.shadow')
      .filter({ has: page.getByRole('heading', { name: E2E_NETWORK_SECONDARY.name, exact: true }) });

    await expect(primaryCard).toHaveCount(1);
    await expect(secondaryCard).toHaveCount(1);

    // The supervisor name only renders when the GET response carried a
    // non-empty supervisors array for that card's network.
    await expect(primaryCard.getByText(SUPERVISOR_FULL_NAME)).toBeVisible();
    await expect(secondaryCard.getByText(SUPERVISOR_FULL_NAME)).toHaveCount(0);
  });
});
