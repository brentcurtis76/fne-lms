import { test, expect, type Page } from '@playwright/test';
import {
  E2E_GENERATION,
  E2E_NETWORK,
  E2E_NETWORK_SECONDARY,
  E2E_ROLE_COMMUNITY,
  E2E_SCHOOL,
  E2E_SCHOOL_SECONDARY,
  E2E_USERS,
  E2E_ZOOM,
  FIXTURE_KEYS,
  ensureStorageState,
  loginViaUi,
  storageStatePath,
} from './helpers/auth';

/**
 * T2 — proves the CI e2e topology itself: the seeded synthetic fixtures exist,
 * every one can authenticate through the real login form, and role gating actually
 * differs between them. This spec is mandatory (scripts/ci/e2e-mandatory.mjs);
 * it fails the gate if it is skipped.
 *
 * Z1c — the login block now iterates every persona in the fixture file instead of the
 * original two. A persona that is seeded but cannot authenticate is a fixture that would
 * fail obscurely inside some later authorization spec; here it fails as itself.
 *
 * QA-ROLES — the roster reaches all nine roles in types/roles.ts, and logging in stopped
 * being the whole assertion. Each persona's ACTIVE ROLE AND ORGANIZATION SCOPE is now read
 * back through `/api/auth/my-roles`, so a persona whose role row was seeded against the
 * wrong school, generation, community or network fails here rather than inside whichever
 * later spec happened to depend on that scope. The last block adds the cross-network
 * separation the later supervisor_de_red batches will use as their negative control — see
 * its own header for what that does and does not prove.
 *
 * Requires the seeded local Supabase stack — see .github/workflows/ci.yml gate 4
 * and `node scripts/ci/seed-e2e.mjs`.
 */
const ADMIN_ONLY_PAGE = '/admin/schools';
const ADMIN_PAGE_HEADING = 'Gestión de Escuelas';

// Every test here does a full login round trip plus a cold navigation. CI serves a
// production build, but a local run compiles these pages on demand — well past the
// 30s default. Generous by design: this spec guards infrastructure, not latency.
test.setTimeout(120_000);

test.describe('CI fixtures — login', () => {
  // Anonymous on purpose: this block exercises the login form itself.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const key of FIXTURE_KEYS) {
    test(`${key} fixture logs in through the login form`, async ({ page }) => {
      const user = E2E_USERS[key];
      await loginViaUi(page, user);
      await expect(page).toHaveURL(/\/dashboard(\?|$)/);

      // A successful login is not enough: prove the seeded account received the intended
      // active role and organization scope through the same API the application uses.
      const response = await page.request.get('/api/auth/my-roles');
      expect(response.ok()).toBe(true);
      const body = await response.json();
      const role = body.roles.find((row: { role_type: string }) => row.role_type === user.role);
      expect(role).toBeTruthy();
      expect(body.highestRole).toBe(user.role);

      const expectedSchoolId = user.roleScope === 'global'
        ? null
        : user.school === 'secondary'
          ? E2E_SCHOOL_SECONDARY.id
          : E2E_SCHOOL.id;
      expect(role.school_id).toBe(expectedSchoolId);
      expect(role.generation_id).toBe(user.generation ? E2E_GENERATION.id : null);
      const expectedCommunityId = user.community === 'zoom'
        ? E2E_ZOOM.community.id
        : user.community === 'role'
          ? E2E_ROLE_COMMUNITY.id
          : null;
      expect(role.community_id).toBe(expectedCommunityId);

      // Network scope. `primary` or nothing, deliberately: the seeder can also map
      // `network: 'secondary'` (scripts/ci/seed-e2e.mjs) and this spec refuses to, so a
      // roster edit that scoped a persona to networkSecondary fails here instead of
      // quietly dissolving the cross-network negative control.
      expect(role.red_id).toBe(user.network === 'primary' ? E2E_NETWORK.id : null);

      // Asserted over EVERY role row this persona holds, not just the matched one, and for
      // every persona rather than only the supervisor: the property later batches lean on
      // is "no seeded account holds any role in networkSecondary". A check written against
      // `networkSupervisor` alone would not notice a second persona acquiring one.
      for (const row of body.roles as { red_id: string | null }[]) {
        expect(row.red_id).not.toBe(E2E_NETWORK_SECONDARY.id);
      }
    });
  }
});

/**
 * The cross-network negative control, asserted as topology.
 *
 * Read back through the running application rather than from the fixture JSON: a spec that
 * compared the fixture file to itself would pass on a database the seeder never touched.
 * Everything below goes through an API route, so what it observes is the rows
 * `scripts/ci/seed-e2e.mjs` actually wrote.
 *
 * The two halves use DIFFERENT personas because the product only exposes each half to one
 * of them. `GET /api/admin/networks` is where a network's schools are visible; a persona's
 * own network scope is only visible through `GET /api/auth/my-roles`, as that persona.
 *
 * WHY THE SUPERVISOR HALF IS NOT ASSERTED THROUGH THE ADMIN ROUTE: it cannot be.
 * `/api/admin/networks` builds its "admin" client with `createServerSupabaseClient({req,res},
 * { supabaseKey: SERVICE_ROLE })`, which sets the apikey but still sends the CALLER's session
 * JWT as the bearer — so PostgREST resolves `authenticated`, not `service_role`, and
 * `user_roles` has no admin-read policy (only `read_own_roles` and
 * `user_roles_community_member_view`; baseline.sql:21424, :21834). Its `supervisors` array
 * and `supervisor_count` therefore come back EMPTY for every network and every caller, and
 * the handler swallows the error. Asserting `secondary.supervisors` is empty there would
 * pass vacuously and would keep passing if the seeding broke — the exact failure this
 * control exists to prevent. Reported as a product finding, not repaired here.
 *
 * SCOPE, stated so no later batch over-reads it: this proves WHO IS SCOPED WHERE and nothing
 * else — that the two synthetic networks hold disjoint schools, and that the supervisor
 * belongs to exactly one of them. It does NOT prove that any product surface denies a
 * supervisor access across that boundary. That is per-surface behaviour, and each batch that
 * touches one owes its own positive and negative end-to-end checks.
 */
test.describe('CI fixtures — cross-network separation', () => {
  interface AdminNetwork {
    id: string;
    name: string;
    schools: { id: number }[];
  }

  test.describe('as admin', () => {
    test.use({ storageState: storageStatePath('admin') });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, 'admin');
    });

    test('the two synthetic networks exist and hold disjoint schools', async ({ page }) => {
      const response = await page.request.get('/api/admin/networks');
      expect(response.ok()).toBe(true);
      const body = (await response.json()) as { networks: AdminNetwork[] };

      const byId = new Map(body.networks.map((network) => [network.id, network]));
      const primary = byId.get(E2E_NETWORK.id);
      const secondary = byId.get(E2E_NETWORK_SECONDARY.id);

      // Both must EXIST. An absent — or empty — second network is the failure mode this
      // whole block is built to catch: every denial assertion a later batch writes against
      // it would pass trivially, and would keep passing after the scoping it guards broke.
      expect(primary, `network ${E2E_NETWORK.id} is not seeded`).toBeTruthy();
      expect(secondary, `network ${E2E_NETWORK_SECONDARY.id} is not seeded`).toBeTruthy();

      expect((primary as AdminNetwork).schools.map((school) => school.id)).toEqual([
        E2E_SCHOOL.id,
      ]);
      expect((secondary as AdminNetwork).schools.map((school) => school.id)).toEqual([
        E2E_SCHOOL_SECONDARY.id,
      ]);

      // Disjointness restated as the intersection, because the two assertions above would
      // both still hold if a future edit added the SAME school to both networks as a second
      // entry — and a shared school is exactly what makes a cross-network control worthless.
      const primaryIds = new Set((primary as AdminNetwork).schools.map((school) => school.id));
      const shared = (secondary as AdminNetwork).schools.filter((school) =>
        primaryIds.has(school.id)
      );
      expect(shared).toEqual([]);
    });
  });

  test.describe('as the network supervisor', () => {
    test.use({ storageState: storageStatePath('networkSupervisor') });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, 'networkSupervisor');
    });

    test('supervises the primary network and holds no role in the other', async ({ page }) => {
      const response = await page.request.get('/api/auth/my-roles');
      expect(response.ok()).toBe(true);
      const body = (await response.json()) as {
        roles: { role_type: string; red_id: string | null }[];
      };

      // EXACTLY one active role, which the per-persona login block above does not assert:
      // a second grant appearing on this account would widen the control's blast radius
      // without changing the red_id the login block checks.
      expect(body.roles.map((role) => role.role_type)).toEqual(['supervisor_de_red']);
      expect(body.roles[0].red_id).toBe(E2E_NETWORK.id);
      expect(body.roles[0].red_id).not.toBe(E2E_NETWORK_SECONDARY.id);
    });
  });
});

test.describe('CI fixtures — admin storage state', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeAll(async ({ browser }) => {
    // A file-level test.setTimeout does not reach hooks — set it here too.
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
  });

  test('carries an authenticated session', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('reaches an admin-only page', async ({ page }) => {
    await page.goto(ADMIN_ONLY_PAGE);
    // Two gates have to pass for this heading to render: the middleware role
    // check on /admin/* and the page's own getUserPrimaryRole() check.
    // Scoped to the main landmark: the layout renders the same title twice
    // (page heading + layout header), which trips Playwright's strict mode.
    await expect(
      page.getByRole('main').getByRole('heading', { name: ADMIN_PAGE_HEADING })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`${ADMIN_ONLY_PAGE}(\\?|$)`));
  });
});

test.describe('CI fixtures — docente storage state', () => {
  test.use({ storageState: storageStatePath('docente') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'docente');
  });

  test('carries an authenticated session', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('is denied the admin-only page', async ({ page }) => {
    await page.goto(ADMIN_ONLY_PAGE);
    // Denied, not merely unauthenticated: the middleware bounces a signed-in
    // non-admin to /dashboard rather than to /login.
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: ADMIN_PAGE_HEADING })).toHaveCount(0);
  });
});
