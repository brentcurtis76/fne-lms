/**
 * `host_sync` — reconciles `zoom_internal.zoom_hosts` against the Zoom account's user
 * list (plan §9 host inventory).
 *
 * ## What it owns, and what it must never touch
 *
 * It owns exactly three columns: `email`, `is_active`, `updated_at`. `profile_id` and
 * `org_owned` are **admin-managed** (§9: `profile_id` NULL means an org pool host,
 * `org_owned` gates admin ZAK issuance) — Zoom knows nothing about either, so a sync
 * that wrote them would silently undo an administrator's decision on every tick. The
 * upsert payload simply omits them, which is what makes PostgREST leave them alone:
 * its generated `ON CONFLICT DO UPDATE SET` covers only the keys present in the body.
 *
 * It NEVER deletes. A host that vanished from Zoom is flipped `is_active = false`, so
 * the meetings that reference it (`zoom_meetings.host_zoom_user_id` is a foreign key)
 * keep resolving and history stays readable.
 *
 * ## Only Licensed, only active
 *
 * §9: cloud recording requires a Licensed host, so Basic users are excluded — that is
 * `isLicensedHost()`, and it checks the license type AND the account status. The list
 * is also requested with `status: 'active'`, so the predicate is a second line of
 * defence rather than the only one.
 *
 * ## Idempotent
 *
 * Two runs against an unchanged account produce identical rows: the upsert is
 * keyed on `zoom_user_id` and the deactivation set is computed from a full snapshot,
 * not from a delta.
 */
import { getZoomApi, isLicensedHost, type ZoomApi, type ZoomUser } from '../api';
import { ZoomNonRetryableError, ZoomRetryableError } from '../errors';
import { ZoomJobLeaseLostError, type ZoomJobHandler } from './types';
import { createZoomServiceClient, zoomInternalSchema } from '../service-client';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Zoom's maximum page size for `GET /users`. */
export const HOST_SYNC_PAGE_SIZE = 300;

/**
 * A hard stop on pagination. At 300 users a page this is 30,000 accounts — orders of
 * magnitude above FNE's, so reaching it means the cursor is not advancing. Throwing
 * (rather than stopping early) matters: a truncated snapshot would look like "every
 * host after page 100 disappeared" and deactivate them all.
 */
const MAX_PAGES = 100;

// ---------------------------------------------------------------------------
// Store seam
// ---------------------------------------------------------------------------

export interface ZoomHostUpsert {
  zoom_user_id: string;
  email: string;
}

export interface KnownZoomHost {
  zoom_user_id: string;
  is_active: boolean;
}

export interface ZoomHostStore {
  /** Every row currently in `zoom_hosts`. */
  listKnownHosts(): Promise<KnownZoomHost[]>;
  /**
   * `ON CONFLICT (zoom_user_id) DO UPDATE`, setting `email`, `is_active = true` and
   * `updated_at` — and nothing else. See the module header.
   */
  upsertActiveHosts(hosts: ZoomHostUpsert[]): Promise<void>;
  /** Flips `is_active = false`. Never deletes. */
  deactivateHosts(zoomUserIds: string[]): Promise<void>;
}

interface PostgrestError {
  message: string;
}

/** The ONLY untyped boundary in this module. See `service-client.ts`. */
export interface HostSchemaClient {
  from(table: string): {
    select(columns: string): PromiseLike<{
      data: KnownZoomHost[] | null;
      error: PostgrestError | null;
    }>;
    upsert(
      values: Record<string, unknown>[],
      options: { onConflict: string }
    ): PromiseLike<{ error: PostgrestError | null }>;
    update(values: Record<string, unknown>): {
      in(column: string, values: string[]): PromiseLike<{ error: PostgrestError | null }>;
    };
  };
}

export function createSupabaseHostStore(client: HostSchemaClient): ZoomHostStore {
  return {
    async listKnownHosts() {
      const { data, error } = await client.from('zoom_hosts').select('zoom_user_id, is_active');
      if (error) throw new Error(`zoom_hosts read failed: ${error.message}`);
      return data ?? [];
    },

    async upsertActiveHosts(hosts) {
      if (hosts.length === 0) return;
      const now = new Date().toISOString();
      const { error } = await client.from('zoom_hosts').upsert(
        hosts.map((host) => ({
          zoom_user_id: host.zoom_user_id,
          email: host.email,
          is_active: true,
          updated_at: now,
          // profile_id and org_owned are deliberately absent — see the module header.
        })),
        { onConflict: 'zoom_user_id' }
      );
      if (error) throw new Error(`zoom_hosts upsert failed: ${error.message}`);
    },

    async deactivateHosts(zoomUserIds) {
      if (zoomUserIds.length === 0) return;
      const { error } = await client
        .from('zoom_hosts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('zoom_user_id', zoomUserIds);
      if (error) throw new Error(`zoom_hosts deactivate failed: ${error.message}`);
    },
  };
}

export function defaultZoomHostStore(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): ZoomHostStore {
  return createSupabaseHostStore(zoomInternalSchema<HostSchemaClient>(clientFactory(env)));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export interface HostSyncDeps {
  api?: ZoomApi;
  store?: ZoomHostStore;
  env?: NodeJS.ProcessEnv;
  pageSize?: number;
}

export interface HostSyncResult extends Record<string, unknown> {
  pages: number;
  fetched: number;
  licensed: number;
  deactivated: number;
}

/** Fetches every active user, following `nextPageToken` to exhaustion. */
async function fetchAllActiveUsers(
  api: ZoomApi,
  pageSize: number,
  onPage: (pages: number, fetched: number) => Promise<void>
): Promise<{ users: ZoomUser[]; pages: number }> {
  const users: ZoomUser[] = [];
  let nextPageToken: string | undefined;
  let pages = 0;

  do {
    const page = await api.listUsers({ status: 'active', pageSize, nextPageToken });
    users.push(...page.users);
    pages += 1;

    if (page.nextPageToken && page.nextPageToken === nextPageToken) {
      throw new ZoomNonRetryableError(
        'Zoom user pagination returned the same nextPageToken twice; refusing to loop.',
        { operation: 'GET /users' }
      );
    }
    if (pages >= MAX_PAGES && page.nextPageToken) {
      throw new ZoomNonRetryableError(
        `Zoom user pagination exceeded ${MAX_PAGES} pages; refusing a truncated snapshot.`,
        { operation: 'GET /users' }
      );
    }

    nextPageToken = page.nextPageToken;
    if (nextPageToken) await onPage(pages, users.length);
  } while (nextPageToken);

  return { users, pages };
}

export function createHostSyncHandler(deps: HostSyncDeps = {}): ZoomJobHandler {
  return async (ctx) => {
    const env = deps.env ?? process.env;
    const api = deps.api ?? getZoomApi(env);
    const store = deps.store ?? defaultZoomHostStore(env);
    const pageSize = deps.pageSize ?? HOST_SYNC_PAGE_SIZE;

    const { users, pages } = await fetchAllActiveUsers(api, pageSize, async (page, fetched) => {
      // Long accounts page for a while; keep the lease alive and checkpoint where we
      // are. `false` means somebody else owns the job now — stop immediately.
      const alive = await ctx.heartbeat({ pages: page, fetched });
      if (!alive) throw new ZoomJobLeaseLostError(ctx.job.id);
    });

    // Zoom can repeat a user across a page boundary; key by id so it cannot double.
    const licensed = new Map<string, ZoomUser>();
    for (const user of users) {
      if (isLicensedHost(user)) licensed.set(user.id, user);
    }

    const known = await store.listKnownHosts();
    const knownActive = known.filter((host) => host.is_active);

    // An account that returns zero users while we hold active hosts is an anomaly,
    // not news: acting on it would deactivate the entire inventory and make every
    // future provisioning attempt fail with "no host available". Retryable, because
    // the next tick usually sees the real list.
    if (users.length === 0 && knownActive.length > 0) {
      throw new ZoomRetryableError(
        `Zoom returned no active users while ${knownActive.length} host(s) are active; refusing to deactivate the inventory.`,
        { operation: 'GET /users' }
      );
    }

    await store.upsertActiveHosts(
      [...licensed.values()].map((user) => ({ zoom_user_id: user.id, email: user.email }))
    );

    const disappeared = knownActive
      .filter((host) => !licensed.has(host.zoom_user_id))
      .map((host) => host.zoom_user_id);
    await store.deactivateHosts(disappeared);

    const result: HostSyncResult = {
      pages,
      fetched: users.length,
      licensed: licensed.size,
      deactivated: disappeared.length,
    };
    return result;
  };
}

/** The registry entry. Built per invocation so it can close over deps in tests. */
export const hostSyncJobHandler: ZoomJobHandler = (ctx) => createHostSyncHandler()(ctx);
