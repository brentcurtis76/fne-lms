// @vitest-environment node
/**
 * Z3-2 — the §9 ZAK issuance rule as a pure function.
 *
 * The route suite (`__tests__/api/meet/session-join-zak.test.ts`) proves the bytes a
 * caller receives; this one proves the RULE, exhaustively, over the whole fact
 * space. Both are needed: an end-to-end suite can only reach the combinations it
 * bothers to arrange, and §9 is precise enough that the combinations it does not
 * reach are exactly where an admin ends up holding a consultant's credential.
 *
 * Synthetic ids only.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveZakIssuance,
  type ZakIssuanceFacts,
} from '../../../lib/utils/meeting-zak-policy';

const FACILITATOR = '2b3c4d5e-6f70-4b8c-9d0e-1f2a3b4c5d6e';
const OTHER_CONSULTOR = '5e6f7081-9203-4e1f-8021-4c5d6e7f8091';
const ADMIN = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const HOST_ID = 'zoom_host_facilitator_1';
const POOL_HOST_ID = 'zoom_host_pool_1';

/** The identity a consultant is mapped to: personal, and NOT organization-owned. */
const personalHost = (profileId: string, zoomUserId = HOST_ID) => ({
  zoom_user_id: zoomUserId,
  profile_id: profileId,
  org_owned: false,
});

/** An org pool identity — `profile_id IS NULL` is what makes it one. */
const poolHost = (zoomUserId = POOL_HOST_ID) => ({
  zoom_user_id: zoomUserId,
  profile_id: null,
  org_owned: false,
});

/** A personal identity FNE owns outright. §9's second admin clause. */
const orgOwnedHost = (profileId: string, zoomUserId = HOST_ID) => ({
  zoom_user_id: zoomUserId,
  profile_id: profileId,
  org_owned: true,
});

function facts(overrides: Partial<ZakIssuanceFacts> = {}): ZakIssuanceFacts {
  return {
    profileId: FACILITATOR,
    isAssignedFacilitator: false,
    isAdmin: false,
    meetingHostZoomUserId: HOST_ID,
    host: personalHost(FACILITATOR),
    ...overrides,
  };
}

describe('§9 (a) — the assigned facilitator, on their own mapped identity [B2] [B3]', () => {
  it('facilitator whose own mapped host IS the meeting host → facilitator_own_host [B2]', () => {
    expect(
      resolveZakIssuance(facts({ isAssignedFacilitator: true }))
    ).toBe('facilitator_own_host');
  });

  it('facilitator whose mapped host is NOT the meeting host → no ZAK [B3]', () => {
    // The meeting runs on a colleague's identity. §9's remedy is host-reassignment,
    // not impersonation, so there is nothing to issue here.
    expect(
      resolveZakIssuance(
        facts({
          isAssignedFacilitator: true,
          host: personalHost(OTHER_CONSULTOR),
        })
      )
    ).toBeNull();
  });

  it('facilitator with no mapped host at all → no ZAK [B3]', () => {
    expect(
      resolveZakIssuance(facts({ isAssignedFacilitator: true, host: null }))
    ).toBeNull();
  });

  it('facilitator on a POOL identity → no ZAK: null profile_id is not "their own" [B3]', () => {
    // The load-bearing case for the explicit non-null guard in the rule: without it,
    // a caller whose id compared loosely against a NULL mapping could pass clause (a).
    expect(
      resolveZakIssuance(
        facts({
          isAssignedFacilitator: true,
          meetingHostZoomUserId: POOL_HOST_ID,
          host: poolHost(),
        })
      )
    ).toBeNull();
  });

  it('a consultant mapped to the meeting host but NOT assigned → no ZAK', () => {
    // §5 would never route them here, and §9 says "other consultants — even
    // same-school — never receive host credentials". Belt and braces.
    expect(resolveZakIssuance(facts({ isAssignedFacilitator: false }))).toBeNull();
  });

  it('the meeting has no assigned host identity → no ZAK', () => {
    expect(
      resolveZakIssuance(
        facts({ isAssignedFacilitator: true, meetingHostZoomUserId: null })
      )
    ).toBeNull();
  });
});

describe('§9 (b) — admins, on organization-controlled identities only [B4] [B5]', () => {
  it('admin + pool host (profile_id IS NULL) → admin_pool_host [B4]', () => {
    expect(
      resolveZakIssuance(
        facts({
          profileId: ADMIN,
          isAdmin: true,
          meetingHostZoomUserId: POOL_HOST_ID,
          host: poolHost(),
        })
      )
    ).toBe('admin_pool_host');
  });

  it('admin + org_owned = true → admin_org_owned_host [B4]', () => {
    expect(
      resolveZakIssuance(
        facts({
          profileId: ADMIN,
          isAdmin: true,
          host: orgOwnedHost(OTHER_CONSULTOR),
        })
      )
    ).toBe('admin_org_owned_host');
  });

  it("admin + a consultant's PERSONAL identity → NO ZAK [B5]", () => {
    // §9's single most explicit sentence. If this ever returns a branch, an admin is
    // impersonating a consultant on that consultant's own Zoom identity.
    expect(
      resolveZakIssuance(
        facts({
          profileId: ADMIN,
          isAdmin: true,
          host: personalHost(OTHER_CONSULTOR),
        })
      )
    ).toBeNull();
  });

  it("admin + their OWN personal identity, not org-owned → still no ZAK [B5]", () => {
    // The same clause: (b) is about organization-controlled identities, and an
    // admin's personal mapping is not one. They reach it through (a) or not at all.
    expect(
      resolveZakIssuance(
        facts({ profileId: ADMIN, isAdmin: true, host: personalHost(ADMIN) })
      )
    ).toBeNull();
  });

  it('a non-admin, non-facilitator on a pool host → no ZAK', () => {
    expect(
      resolveZakIssuance(
        facts({ meetingHostZoomUserId: POOL_HOST_ID, host: poolHost() })
      )
    ).toBeNull();
  });
});

describe('§9 — the two personas are evaluated, never collapsed', () => {
  it('an admin who is ALSO the assigned facilitator gets their own-host branch', () => {
    expect(
      resolveZakIssuance(
        facts({ profileId: ADMIN, isAdmin: true, isAssignedFacilitator: true, host: personalHost(ADMIN) })
      )
    ).toBe('facilitator_own_host');
  });

  it('…and still gets the admin branch when the meeting runs on a pool identity', () => {
    // The case an `admin ∧ ¬facilitator` inference would have denied: they are the
    // assigned facilitator, so clause (a) is evaluated first and misses, and clause
    // (b) must still be reached.
    expect(
      resolveZakIssuance(
        facts({
          profileId: ADMIN,
          isAdmin: true,
          isAssignedFacilitator: true,
          meetingHostZoomUserId: POOL_HOST_ID,
          host: poolHost(),
        })
      )
    ).toBe('admin_pool_host');
  });

  it("…and never the admin branch on a colleague's personal identity [B5]", () => {
    expect(
      resolveZakIssuance(
        facts({
          profileId: ADMIN,
          isAdmin: true,
          isAssignedFacilitator: true,
          host: personalHost(OTHER_CONSULTOR),
        })
      )
    ).toBeNull();
  });
});

describe('§9 — the rule refuses anything it cannot establish', () => {
  it('a host row that is not the meeting’s host row issues nothing', () => {
    // Impossible through the route, which reads the row BY the meeting's host id —
    // and checked anyway, because a lookup that quietly answered about a different
    // identity would satisfy every other clause.
    expect(
      resolveZakIssuance(
        facts({
          isAssignedFacilitator: true,
          meetingHostZoomUserId: 'zoom_host_some_other',
          host: personalHost(FACILITATOR, HOST_ID),
        })
      )
    ).toBeNull();
  });

  it('nobody at all — no facilitator flag, no admin flag — issues nothing', () => {
    for (const host of [personalHost(FACILITATOR), poolHost(HOST_ID), orgOwnedHost(FACILITATOR)]) {
      expect(resolveZakIssuance(facts({ host }))).toBeNull();
    }
  });
});
