// @vitest-environment jsdom
/**
 * GrowthCommunityMembersPage — Leaders panel UI tests
 *
 * Exercises the leaders panel on
 * pages/admin/growth-communities/[id]/members.tsx: rendering, promote
 * confirmation flow, demote (change leader) flow, error mapping, and the
 * empty / non-leader-only views. Heavy dependencies (MainLayout, page
 * header, Supabase, router, api-auth) are mocked so the page's own state
 * machine is the thing under test.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockRouterPush,
  mockGetSession,
  mockSignOut,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockGetSession: vi.fn(async () => ({ data: { session: null } })),
  mockSignOut: vi.fn().mockResolvedValue({}),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    query: { id: 'community-1' },
    isReady: true,
    pathname: '/admin/growth-communities/[id]/members',
    push: mockRouterPush,
    replace: vi.fn(),
  }),
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  }),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({
    title,
    subtitle,
  }: {
    title: string;
    subtitle?: string;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}));

vi.mock('../../lib/api-auth', () => ({
  createServiceRoleClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the page AFTER mocks are registered.
// ---------------------------------------------------------------------------
import GrowthCommunityMembersPage from '../../pages/admin/growth-communities/[id]/members';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const COMMUNITY_ID = 'community-1';

const LEADER_USER = {
  user_id: 'leader-uuid-1',
  user_roles_id: 'role-leader-1',
  role_type: 'lider_comunidad',
  first_name: 'Lidia',
  last_name: 'Líder',
  email: 'lidia.leader@example.com',
};

const MEMBER_USER = {
  user_id: 'member-uuid-1',
  user_roles_id: 'role-member-1',
  role_type: 'docente',
  first_name: 'Mateo',
  last_name: 'Miembro',
  email: 'mateo.member@example.com',
};

function makeMembersResponse(
  overrides: Partial<{
    currentMembers: Array<typeof LEADER_USER | typeof MEMBER_USER>;
  }> = {}
) {
  return {
    community: {
      id: COMMUNITY_ID,
      name: 'Comunidad de Prueba',
      school_id: 1,
      school_name: 'Escuela Test',
      generation_id: null,
      max_teachers: null,
    },
    currentMembers: overrides.currentMembers ?? [LEADER_USER, MEMBER_USER],
    eligibleUsers: {
      unassigned: [],
      reassignFrom: [],
    },
    excludedSummary: {
      count: 0,
      reasons: { is_leader: 0, generation_mismatch: 0 },
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type FetchCall = {
  url: string;
  method: string;
  body: unknown;
};

/**
 * Stub fetch with a router that:
 *   - Returns the supplied membersResponse on GET .../members
 *   - Routes POST/DELETE .../leaders to the supplied handler
 *   - Records every call so tests can assert on URLs / methods / payloads
 */
function installFetch(opts: {
  membersResponse: ReturnType<typeof makeMembersResponse>;
  leaders?: (init: { method: string; body: unknown }) => Response;
}) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    let parsedBody: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }
    calls.push({ url: u, method, body: parsedBody });

    if (
      u === `/api/admin/growth-communities/${COMMUNITY_ID}/members` &&
      method === 'GET'
    ) {
      return jsonResponse(opts.membersResponse);
    }
    if (
      u === `/api/admin/growth-communities/${COMMUNITY_ID}/leaders` &&
      opts.leaders
    ) {
      return opts.leaders({ method, body: parsedBody });
    }
    return jsonResponse(
      { error: 'unhandled in test fetch mock', url: u, method },
      500
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const findButtonByText = (re: RegExp): HTMLButtonElement | undefined =>
  Array.from(document.body.querySelectorAll('button')).find((b) =>
    re.test(b.textContent ?? '')
  ) as HTMLButtonElement | undefined;

const findAllButtonsByText = (re: RegExp): HTMLButtonElement[] =>
  Array.from(document.body.querySelectorAll('button')).filter((b) =>
    re.test(b.textContent ?? '')
  ) as HTMLButtonElement[];

const baseProps = {
  role: 'admin' as const,
  community: {
    id: COMMUNITY_ID,
    name: 'Comunidad de Prueba',
    school_name: 'Escuela Test',
  },
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockRouterPush.mockReset();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'tok',
        user: { id: 'admin-user', email: 'admin@example.com' },
      },
    },
  });
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue({});
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GrowthCommunityMembersPage — leaders panel', () => {
  it('(a) renders the "Líderes de la comunidad" panel listing leaders derived from currentMembers', async () => {
    installFetch({ membersResponse: makeMembersResponse() });

    render(<GrowthCommunityMembersPage {...baseProps} />);

    await waitFor(() => {
      expect(
        document.body.textContent ?? ''
      ).toMatch(/Líderes de la comunidad/);
    });

    // Leader row appears in the leaders panel.
    await waitFor(() => {
      expect(document.body.textContent ?? '').toMatch(/Lidia Líder/);
    });
    expect(document.body.textContent ?? '').toMatch(/lidia\.leader@example\.com/);

    // Header shows the leader count = 1.
    expect(document.body.textContent ?? '').toMatch(
      /Líderes de la comunidad \(1\)/
    );

    // The leader row exposes a "Cambiar líder" action.
    expect(findButtonByText(/Cambiar líder/i)).toBeTruthy();
  });

  it('(b) clicking "Promotear a líder" opens the confirm modal and Confirmar fires POST /leaders with the right body', async () => {
    const { calls } = installFetch({
      membersResponse: makeMembersResponse(),
      leaders: ({ method }) => {
        if (method === 'POST') return jsonResponse({ ok: true });
        return jsonResponse({ error: 'unexpected' }, 500);
      },
    });

    render(<GrowthCommunityMembersPage {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Promotear a líder/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Promotear a líder/i)!);
    });

    // Modal opens with the question copy.
    await waitFor(() => {
      expect(document.body.textContent ?? '').toMatch(
        /¿Promover a .* como líder de esta comunidad\?/
      );
    });

    // Two "Confirmar" buttons could exist in theory; pick the one inside the
    // promote modal — the only Confirmar visible at this time.
    const confirmButtons = findAllButtonsByText(/^Confirmar$/);
    expect(confirmButtons.length).toBe(1);

    await act(async () => {
      fireEvent.click(confirmButtons[0]);
    });

    await waitFor(() => {
      const postCall = calls.find(
        (c) =>
          c.url ===
            `/api/admin/growth-communities/${COMMUNITY_ID}/leaders` &&
          c.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      expect(postCall!.body).toEqual({ userId: MEMBER_USER.user_id });
    });

    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('(c) "Cambiar líder" → switch to "Quitar de esta comunidad" → Confirmar fires DELETE with mode: remove_from_community', async () => {
    const { calls } = installFetch({
      membersResponse: makeMembersResponse(),
      leaders: ({ method }) => {
        if (method === 'DELETE') return jsonResponse({ ok: true });
        return jsonResponse({ error: 'unexpected' }, 500);
      },
    });

    render(<GrowthCommunityMembersPage {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Cambiar líder/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Cambiar líder/i)!);
    });

    // Demote modal renders both radios.
    const removeRadio = (await waitFor(() => {
      const r = document.body.querySelector(
        'input[type="radio"][name="demote_mode"][value="remove_from_community"]'
      ) as HTMLInputElement | null;
      expect(r).toBeTruthy();
      return r!;
    }))!;

    await act(async () => {
      fireEvent.click(removeRadio);
    });
    expect(removeRadio.checked).toBe(true);

    await act(async () => {
      fireEvent.click(findButtonByText(/^Confirmar$/)!);
    });

    await waitFor(() => {
      const del = calls.find(
        (c) =>
          c.url ===
            `/api/admin/growth-communities/${COMMUNITY_ID}/leaders` &&
          c.method === 'DELETE'
      );
      expect(del).toBeTruthy();
      expect(del!.body).toEqual({
        userId: LEADER_USER.user_id,
        mode: 'remove_from_community',
      });
    });
  });

  it('(d) confirming demote without changing the radio sends mode: demote_to_member', async () => {
    const { calls } = installFetch({
      membersResponse: makeMembersResponse(),
      leaders: ({ method }) => {
        if (method === 'DELETE') return jsonResponse({ ok: true });
        return jsonResponse({ error: 'unexpected' }, 500);
      },
    });

    render(<GrowthCommunityMembersPage {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Cambiar líder/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Cambiar líder/i)!);
    });

    // Default radio is demote_to_member — assert and confirm directly.
    const demoteRadio = (await waitFor(() => {
      const r = document.body.querySelector(
        'input[type="radio"][name="demote_mode"][value="demote_to_member"]'
      ) as HTMLInputElement | null;
      expect(r).toBeTruthy();
      return r!;
    }))!;
    expect(demoteRadio.checked).toBe(true);

    await act(async () => {
      fireEvent.click(findButtonByText(/^Confirmar$/)!);
    });

    await waitFor(() => {
      const del = calls.find(
        (c) =>
          c.url ===
            `/api/admin/growth-communities/${COMMUNITY_ID}/leaders` &&
          c.method === 'DELETE'
      );
      expect(del).toBeTruthy();
      expect(del!.body).toEqual({
        userId: LEADER_USER.user_id,
        mode: 'demote_to_member',
      });
    });
  });

  it('(e) a 409 no_eligible_role_to_demote_to response shows the user-friendly message', async () => {
    installFetch({
      membersResponse: makeMembersResponse(),
      leaders: ({ method }) => {
        if (method === 'DELETE') {
          return jsonResponse(
            { error: 'no_eligible_role_to_demote_to' },
            409
          );
        }
        return jsonResponse({ error: 'unexpected' }, 500);
      },
    });

    render(<GrowthCommunityMembersPage {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Cambiar líder/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Cambiar líder/i)!);
    });

    await waitFor(() => {
      expect(findButtonByText(/^Confirmar$/)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/^Confirmar$/)!);
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Este usuario no tiene otro rol en este colegio. Usa 'Quitar de esta comunidad' en su lugar."
      );
    });
  });

  it('(f) the "Miembros actuales" table excludes leader rows', async () => {
    installFetch({ membersResponse: makeMembersResponse() });

    render(<GrowthCommunityMembersPage {...baseProps} />);

    await waitFor(() => {
      expect(document.body.textContent ?? '').toMatch(
        /Miembros actuales \(no líderes\)/
      );
    });

    // Locate the "Miembros actuales" section's table.
    const headers = Array.from(document.body.querySelectorAll('span'));
    const sectionHeader = headers.find((s) =>
      /Miembros actuales \(no líderes\)/.test(s.textContent ?? '')
    );
    expect(sectionHeader).toBeTruthy();

    // The non-leaders table is the next table sibling within the same card.
    const card = sectionHeader!.closest('.bg-white') as HTMLElement;
    expect(card).toBeTruthy();
    const tableText = card.querySelector('tbody')?.textContent ?? '';

    // Member is present, leader is NOT.
    expect(tableText).toMatch(/Mateo Miembro/);
    expect(tableText).not.toMatch(/Lidia Líder/);

    // Header reflects non-leader count = 1.
    expect(sectionHeader!.textContent).toMatch(/\(1\)/);
  });

  it('(g) the empty-leaders state shows the inline notice', async () => {
    installFetch({
      membersResponse: makeMembersResponse({ currentMembers: [MEMBER_USER] }),
    });

    render(<GrowthCommunityMembersPage {...baseProps} />);

    await waitFor(() => {
      expect(document.body.textContent ?? '').toMatch(
        /Esta comunidad no tiene líderes activos\. Promueve un miembro abajo\./
      );
    });

    // Header shows zero leaders, no Cambiar líder button is rendered.
    expect(document.body.textContent ?? '').toMatch(
      /Líderes de la comunidad \(0\)/
    );
    expect(findButtonByText(/Cambiar líder/i)).toBeUndefined();
  });
});
