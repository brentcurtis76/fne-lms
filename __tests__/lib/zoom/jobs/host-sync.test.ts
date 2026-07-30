// @vitest-environment node
/**
 * `host_sync` suite (§17 slice, Z1b-3). Fake-backed end to end: the Zoom side is
 * `createZoomFake()` (or a hand-rolled `listUsers` stub where the fake deliberately
 * does not model something), the database side is an in-memory host store. No network
 * and no database — `ZOOM_MODE` never even has to be read, because the api is injected.
 *
 * Every identifier here is synthetic and follows the committed fixture library's
 * conventions: `.test` TLD, Zoom-shaped opaque user ids.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  createHostSyncHandler,
  type KnownZoomHost,
  type ZoomHostStore,
  type ZoomHostUpsert,
} from '../../../../lib/zoom/jobs/host-sync';
import { ZoomJobLeaseLostError, type ZoomJobContext } from '../../../../lib/zoom/jobs/types';
import { createZoomFake } from '../../../../lib/zoom/fake';
import type { ZoomApi, ZoomUser } from '../../../../lib/zoom/api';
import type { ZoomJobRow } from '../../../../lib/zoom/db-types';

const LICENSED = 2;
const BASIC = 1;

function user(overrides: Partial<ZoomUser> & { id: string }): ZoomUser {
  return {
    email: `${overrides.id.toLowerCase()}@example-synthetic.test`,
    firstName: 'Sintetico',
    lastName: 'Prueba',
    licenseType: LICENSED,
    status: 'active',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// In-memory host store, carrying the admin-managed columns so the suite can prove
// they survive a sync.
// ---------------------------------------------------------------------------

interface StoredHost extends KnownZoomHost {
  email: string;
  profile_id: string | null;
  org_owned: boolean;
}

function createFakeHostStore(initial: StoredHost[] = []) {
  const rows = new Map<string, StoredHost>(initial.map((host) => [host.zoom_user_id, { ...host }]));

  const store: ZoomHostStore = {
    listKnownHosts: vi.fn(async () =>
      [...rows.values()].map((host) => ({
        zoom_user_id: host.zoom_user_id,
        is_active: host.is_active,
      }))
    ),
    upsertActiveHosts: vi.fn(async (hosts: ZoomHostUpsert[]) => {
      for (const host of hosts) {
        const existing = rows.get(host.zoom_user_id);
        if (existing) {
          // Mirrors PostgREST's ON CONFLICT DO UPDATE: only the supplied keys are set.
          existing.email = host.email;
          existing.is_active = true;
        } else {
          rows.set(host.zoom_user_id, {
            zoom_user_id: host.zoom_user_id,
            email: host.email,
            is_active: true,
            profile_id: null,
            org_owned: false,
          });
        }
      }
    }),
    deactivateHosts: vi.fn(async (ids: string[]) => {
      for (const id of ids) {
        const existing = rows.get(id);
        if (existing) existing.is_active = false;
      }
    }),
  };

  return { store, rows };
}

// ---------------------------------------------------------------------------

function createContext(overrides: { heartbeat?: ZoomJobContext['heartbeat'] } = {}) {
  const job = {
    id: '0b6d8b6c-2a9e-4bfb-9f3c-7a1d5c2e4f88',
    job_type: 'host_sync',
    payload: {},
    dedupe_key: 'host_sync:2026-07-30T12',
    status: 'leased',
    attempts: 0,
    max_attempts: 5,
    run_after: '2026-07-30T12:00:00.000Z',
    lease_expires_at: '2026-07-30T12:05:00.000Z',
    heartbeat_at: '2026-07-30T12:00:00.000Z',
    stage_state: {},
    last_error: null,
    worker_id: 'zoom-ticker:test-worker',
    created_at: '2026-07-30T12:00:00.000Z',
    updated_at: '2026-07-30T12:00:00.000Z',
  } as ZoomJobRow;

  const heartbeat = overrides.heartbeat ?? vi.fn(async () => true);
  const ctx: ZoomJobContext = { job, workerId: 'zoom-ticker:test-worker', heartbeat };
  return { ctx, heartbeat };
}

/** A `listUsers`-only stub, for the paging behaviour `createZoomFake()` does not model. */
function pagingApi(pages: { users: ZoomUser[]; nextPageToken?: string }[]) {
  const seenTokens: (string | undefined)[] = [];
  let index = 0;
  const api = {
    async listUsers(options: { nextPageToken?: string } = {}) {
      seenTokens.push(options.nextPageToken);
      const page = pages[index] ?? { users: [] };
      index += 1;
      return page;
    },
  } as unknown as ZoomApi;
  return { api, seenTokens };
}

// ---------------------------------------------------------------------------

describe('host_sync — inventory filtering (§9 Licensed only)', () => {
  it('keeps Licensed active users and drops Basic ones', async () => {
    const zoom = createZoomFake();
    zoom.setUsers([
      user({ id: 'UserLicensedAaa0001' }),
      user({ id: 'UserBasicBbb0002', licenseType: BASIC }),
      user({ id: 'UserLicensedCcc0003' }),
    ]);
    const { store, rows } = createFakeHostStore();
    const { ctx } = createContext();

    const result = await createHostSyncHandler({ api: zoom, store })(ctx);

    expect(result).toMatchObject({ licensed: 2, deactivated: 0 });
    expect([...rows.keys()].sort()).toEqual(['UserLicensedAaa0001', 'UserLicensedCcc0003']);
    expect(rows.get('UserLicensedAaa0001')?.email).toBe('userlicensedaaa0001@example-synthetic.test');
  });

  it('drops an inactive user even when Zoom leaks one into an active-status page', async () => {
    // The fake filters by status itself, so this needs a stub to reach the predicate.
    const { api } = pagingApi([
      {
        users: [
          user({ id: 'UserLicensedAaa0001' }),
          user({ id: 'UserInactiveDdd0004', status: 'inactive' }),
        ],
      },
    ]);
    const { store, rows } = createFakeHostStore();
    const { ctx } = createContext();

    const result = await createHostSyncHandler({ api, store })(ctx);

    expect(result).toMatchObject({ fetched: 2, licensed: 1 });
    expect([...rows.keys()]).toEqual(['UserLicensedAaa0001']);
  });
});

describe('host_sync — pagination', () => {
  it('follows nextPageToken to exhaustion and heartbeats between pages', async () => {
    const { api, seenTokens } = pagingApi([
      { users: [user({ id: 'UserPageOneAaa001' })], nextPageToken: 'token-page-2' },
      { users: [user({ id: 'UserPageTwoBbb002' })], nextPageToken: 'token-page-3' },
      { users: [user({ id: 'UserPageThreeCcc03' })] },
    ]);
    const { store, rows } = createFakeHostStore();
    const { ctx, heartbeat } = createContext();

    const result = await createHostSyncHandler({ api, store })(ctx);

    expect(result).toMatchObject({ pages: 3, fetched: 3, licensed: 3 });
    expect(seenTokens).toEqual([undefined, 'token-page-2', 'token-page-3']);
    expect(rows.size).toBe(3);
    // One heartbeat per page that had a successor; none after the last page.
    expect(heartbeat).toHaveBeenCalledTimes(2);
    expect(heartbeat).toHaveBeenNthCalledWith(1, { pages: 1, fetched: 1 });
  });

  it('stops immediately when the lease is lost mid-pagination', async () => {
    const { api } = pagingApi([
      { users: [user({ id: 'UserPageOneAaa001' })], nextPageToken: 'token-page-2' },
      { users: [user({ id: 'UserPageTwoBbb002' })] },
    ]);
    const { store } = createFakeHostStore();
    const { ctx } = createContext({ heartbeat: vi.fn(async () => false) });

    await expect(createHostSyncHandler({ api, store })(ctx)).rejects.toBeInstanceOf(
      ZoomJobLeaseLostError
    );
    // Nothing was written — the new leaseholder will redo the whole sync.
    expect(store.upsertActiveHosts).not.toHaveBeenCalled();
    expect(store.deactivateHosts).not.toHaveBeenCalled();
  });

  it('refuses a non-advancing cursor rather than looping forever', async () => {
    const api = {
      async listUsers() {
        return { users: [user({ id: 'UserStuckAaa000001' })], nextPageToken: 'same-token' };
      },
    } as unknown as ZoomApi;
    const { store } = createFakeHostStore();
    const { ctx } = createContext();

    await expect(createHostSyncHandler({ api, store })(ctx)).rejects.toThrow(
      /same nextPageToken twice/
    );
  });
});

describe('host_sync — deactivation', () => {
  it('flips a disappeared host to is_active=false and never deletes it', async () => {
    const zoom = createZoomFake();
    zoom.setUsers([user({ id: 'UserStaysAaa000001' })]);
    const { store, rows } = createFakeHostStore([
      {
        zoom_user_id: 'UserStaysAaa000001',
        email: 'userstaysaaa000001@example-synthetic.test',
        is_active: true,
        profile_id: null,
        org_owned: false,
      },
      {
        zoom_user_id: 'UserGoneBbb0000002',
        email: 'usergonebbb0000002@example-synthetic.test',
        is_active: true,
        profile_id: 'c6c2b1a0-4d5e-4f60-9a71-2b3c4d5e6f70',
        org_owned: true,
      },
    ]);
    const { ctx } = createContext();

    const result = await createHostSyncHandler({ api: zoom, store })(ctx);

    expect(result).toMatchObject({ deactivated: 1 });
    expect(store.deactivateHosts).toHaveBeenCalledWith(['UserGoneBbb0000002']);
    // The row is still there — a FK from zoom_meetings points at it.
    expect(rows.size).toBe(2);
    expect(rows.get('UserGoneBbb0000002')?.is_active).toBe(false);
    expect(rows.get('UserStaysAaa000001')?.is_active).toBe(true);
  });

  it('never touches profile_id or org_owned (admin-managed, §9)', async () => {
    const zoom = createZoomFake();
    zoom.setUsers([user({ id: 'UserMappedAaa00001', email: 'rotated@example-synthetic.test' })]);
    const { store, rows } = createFakeHostStore([
      {
        zoom_user_id: 'UserMappedAaa00001',
        email: 'stale@example-synthetic.test',
        is_active: true,
        profile_id: 'd7d3c2b1-5e6f-4071-8b82-3c4d5e6f7081',
        org_owned: true,
      },
    ]);
    const { ctx } = createContext();

    await createHostSyncHandler({ api: zoom, store })(ctx);

    const row = rows.get('UserMappedAaa00001');
    expect(row?.email).toBe('rotated@example-synthetic.test');
    expect(row?.profile_id).toBe('d7d3c2b1-5e6f-4071-8b82-3c4d5e6f7081');
    expect(row?.org_owned).toBe(true);
    // The upsert payload itself carries only the columns host_sync owns.
    expect(store.upsertActiveHosts).toHaveBeenCalledWith([
      { zoom_user_id: 'UserMappedAaa00001', email: 'rotated@example-synthetic.test' },
    ]);
  });

  it('reactivates a host that came back', async () => {
    const zoom = createZoomFake();
    zoom.setUsers([user({ id: 'UserReturnedAaa001' })]);
    const { store, rows } = createFakeHostStore([
      {
        zoom_user_id: 'UserReturnedAaa001',
        email: 'userreturnedaaa001@example-synthetic.test',
        is_active: false,
        profile_id: null,
        org_owned: false,
      },
    ]);
    const { ctx } = createContext();

    await createHostSyncHandler({ api: zoom, store })(ctx);

    expect(rows.get('UserReturnedAaa001')?.is_active).toBe(true);
  });

  it('refuses to empty the inventory when Zoom returns no users at all', async () => {
    const zoom = createZoomFake();
    zoom.setUsers([]);
    const { store, rows } = createFakeHostStore([
      {
        zoom_user_id: 'UserStaysAaa000001',
        email: 'userstaysaaa000001@example-synthetic.test',
        is_active: true,
        profile_id: null,
        org_owned: false,
      },
    ]);
    const { ctx } = createContext();

    await expect(createHostSyncHandler({ api: zoom, store })(ctx)).rejects.toThrow(
      /refusing to deactivate the inventory/
    );
    expect(store.deactivateHosts).not.toHaveBeenCalled();
    expect(rows.get('UserStaysAaa000001')?.is_active).toBe(true);
  });

  it('an empty account with an empty inventory is a clean no-op', async () => {
    const zoom = createZoomFake();
    zoom.setUsers([]);
    const { store, rows } = createFakeHostStore();
    const { ctx } = createContext();

    const result = await createHostSyncHandler({ api: zoom, store })(ctx);

    expect(result).toMatchObject({ fetched: 0, licensed: 0, deactivated: 0 });
    expect(rows.size).toBe(0);
  });
});

describe('host_sync — idempotence', () => {
  it('a second run over an unchanged account changes nothing', async () => {
    const zoom = createZoomFake();
    zoom.setUsers([user({ id: 'UserOneAaa00000001' }), user({ id: 'UserTwoBbb00000002' })]);
    const { store, rows } = createFakeHostStore();
    const { ctx } = createContext();

    const first = await createHostSyncHandler({ api: zoom, store })(ctx);
    const snapshot = JSON.stringify([...rows.entries()].sort());
    const second = await createHostSyncHandler({ api: zoom, store })(ctx);

    expect(second).toEqual(first);
    expect(JSON.stringify([...rows.entries()].sort())).toBe(snapshot);
  });

  it('deduplicates a user Zoom repeated across a page boundary', async () => {
    const { api } = pagingApi([
      { users: [user({ id: 'UserDupAaa000000001' })], nextPageToken: 'token-page-2' },
      { users: [user({ id: 'UserDupAaa000000001' }), user({ id: 'UserNewBbb000000002' })] },
    ]);
    const { store, rows } = createFakeHostStore();
    const { ctx } = createContext();

    const result = await createHostSyncHandler({ api, store })(ctx);

    expect(result).toMatchObject({ fetched: 3, licensed: 2 });
    expect(rows.size).toBe(2);
  });
});
