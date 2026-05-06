// @vitest-environment jsdom
/**
 * GrowthCommunitiesIndexPage — CRUD regression tests
 *
 * Exercises the create / edit / delete surfaces of
 * pages/admin/growth-communities/index.tsx. The page does its own
 * Supabase queries (schools list, school meta, generations, communities,
 * member counts) and calls the admin API via fetch for mutations, so we
 * mock both: a chainable Supabase client stub plus a fetch router that
 * records every call body so we can assert the exact POST / PATCH /
 * DELETE payloads the UI sends.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockRouterPush, mockToastError, mockToastSuccess, supabaseHolder } =
  vi.hoisted(() => ({
    mockRouterPush: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
    supabaseHolder: { current: null as any },
  }));

vi.mock('next/router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    pathname: '/admin/growth-communities',
    query: {},
    isReady: true,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabaseHolder.current,
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
import GrowthCommunitiesIndexPage from '../../pages/admin/growth-communities/index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SCHOOL_ID = 42;
const COMMUNITY_ID = 'comm-uuid-1';
const COMMUNITY_NAME = 'Comunidad Alfa';

interface CommunityFixture {
  id: string;
  name: string;
  generation_id: string | null;
  max_teachers: number | null;
  description: string | null;
  school_id: number;
}

interface SupabaseFixtures {
  schools: Array<{ id: number; name: string }>;
  schoolMeta: { id: number; has_generations: boolean | null } | null;
  generations: Array<{ id: string; name: string }>;
  communities: CommunityFixture[];
  memberRows: Array<{ community_id: string }>;
}

function defaultFixtures(
  overrides: Partial<SupabaseFixtures> = {}
): SupabaseFixtures {
  return {
    schools: [
      { id: SCHOOL_ID, name: 'Escuela Test' },
      { id: 99, name: 'Otra Escuela' },
    ],
    schoolMeta: { id: SCHOOL_ID, has_generations: false },
    generations: [],
    communities: [
      {
        id: COMMUNITY_ID,
        name: COMMUNITY_NAME,
        generation_id: null,
        max_teachers: 16,
        description: null,
        school_id: SCHOOL_ID,
      },
    ],
    memberRows: [],
    ...overrides,
  };
}

function makeSupabaseMock(fx: SupabaseFixtures) {
  const client = {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({
          data: {
            session: { user: { id: 'admin-uid', email: 'admin@example.com' } },
          },
        }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select: (_cols?: string) => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          filters[`in:${col}`] = vals;
          return builder;
        },
        order: () => builder,
        single: async () => {
          if (table === 'schools') {
            return { data: fx.schoolMeta, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
          let result: { data: unknown; error: unknown };
          if (table === 'schools') {
            result = { data: fx.schools, error: null };
          } else if (table === 'generations') {
            result = { data: fx.generations, error: null };
          } else if (table === 'growth_communities') {
            const sid = filters['school_id'];
            const list = fx.communities.filter(
              (c) => String(c.school_id) === String(sid)
            );
            result = {
              data: list.map((c) => ({
                id: c.id,
                name: c.name,
                generation_id: c.generation_id,
                max_teachers: c.max_teachers,
                description: c.description,
              })),
              error: null,
            };
          } else if (table === 'user_roles') {
            const ids = (filters['in:community_id'] as string[]) ?? [];
            const rows = fx.memberRows.filter((r) =>
              ids.includes(r.community_id)
            );
            result = { data: rows, error: null };
          } else {
            result = { data: [], error: null };
          }
          resolve(result);
          return Promise.resolve(result);
        },
      };
      return builder;
    },
  };
  return client;
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

type FetchHandler = (call: FetchCall) => Response | Promise<Response>;

function installFetch(handler: FetchHandler) {
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
    const call: FetchCall = { url: u, method, body: parsedBody };
    calls.push(call);
    return handler(call);
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

const findIconButton = (label: RegExp): HTMLButtonElement | undefined =>
  Array.from(document.body.querySelectorAll('button')).find((b) =>
    label.test(b.getAttribute('aria-label') ?? '')
  ) as HTMLButtonElement | undefined;

async function selectSchoolViaDropdown(value: string) {
  // Wait for the option to be rendered (schools are loaded async).
  await waitFor(() => {
    const opt = document.body.querySelector(
      `select#filter-school option[value="${value}"]`
    );
    expect(opt).toBeTruthy();
  });
  const select = document.body.querySelector(
    'select#filter-school'
  ) as HTMLSelectElement;
  await act(async () => {
    fireEvent.change(select, { target: { value } });
  });
}

async function waitForCommunitiesRow(name: string) {
  await waitFor(() => {
    expect(document.body.textContent ?? '').toMatch(new RegExp(name));
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockRouterPush.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  supabaseHolder.current = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GrowthCommunitiesIndexPage — CRUD', () => {
  it('(a) admin view renders "Crear comunidad" once a school is selected', async () => {
    supabaseHolder.current = makeSupabaseMock(defaultFixtures());
    installFetch(() => jsonResponse({ error: 'unhandled' }, 500));

    render(
      <GrowthCommunitiesIndexPage role="admin" schoolId={null as any} />
    );

    // Button exists but is disabled before a school is selected.
    await waitFor(() => {
      expect(findButtonByText(/Crear comunidad/)).toBeTruthy();
    });
    const initialBtn = findButtonByText(/Crear comunidad/)!;
    expect(initialBtn.disabled).toBe(true);

    await selectSchoolViaDropdown(String(SCHOOL_ID));

    // After selection the same button becomes enabled.
    await waitFor(() => {
      const btn = findButtonByText(/Crear comunidad/)!;
      expect(btn.disabled).toBe(false);
    });
  });

  it('(b) clicking "Crear comunidad" submits POST with the right body, closes the modal on 201, and refreshes the list', async () => {
    supabaseHolder.current = makeSupabaseMock(defaultFixtures());

    const { calls } = installFetch((call) => {
      if (
        call.url === '/api/admin/growth-communities' &&
        call.method === 'POST'
      ) {
        return jsonResponse({ id: 'new-community-uuid' }, 201);
      }
      return jsonResponse({ error: 'unhandled' }, 500);
    });

    render(
      <GrowthCommunitiesIndexPage role="admin" schoolId={null as any} />
    );

    await selectSchoolViaDropdown(String(SCHOOL_ID));
    await waitFor(() => {
      expect(findButtonByText(/Crear comunidad/)?.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Crear comunidad/)!);
    });

    // Modal opens.
    await waitFor(() => {
      expect(document.body.querySelector('#cc-name')).toBeTruthy();
    });

    const nameInput = document.body.querySelector(
      '#cc-name'
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Nueva Comunidad' } });
    });

    // Submit by clicking the submit button inside the modal form.
    const submitBtn = findAllButtonsByText(/^Crear comunidad$/).find(
      (b) => b.getAttribute('type') === 'submit'
    );
    expect(submitBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(submitBtn!);
    });

    await waitFor(() => {
      const post = calls.find(
        (c) =>
          c.url === '/api/admin/growth-communities' && c.method === 'POST'
      );
      expect(post).toBeTruthy();
      expect(post!.body).toEqual({
        name: 'Nueva Comunidad',
        school_id: SCHOOL_ID,
        max_teachers: 16,
      });
    });

    // Modal closes (cc-name no longer in the DOM).
    await waitFor(() => {
      expect(document.body.querySelector('#cc-name')).toBeFalsy();
    });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Comunidad creada correctamente.'
    );

    // Refresh: a second growth_communities query happened. Indirect check —
    // the existing community row is still rendered after refresh.
    await waitForCommunitiesRow(COMMUNITY_NAME);
  });

  it('(c) empty Nombre prevents the create POST and surfaces a validation toast', async () => {
    supabaseHolder.current = makeSupabaseMock(defaultFixtures());

    const { calls } = installFetch(() =>
      jsonResponse({ error: 'should-not-be-called' }, 500)
    );

    render(
      <GrowthCommunitiesIndexPage role="admin" schoolId={null as any} />
    );

    await selectSchoolViaDropdown(String(SCHOOL_ID));
    await waitFor(() => {
      expect(findButtonByText(/Crear comunidad/)?.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Crear comunidad/)!);
    });

    await waitFor(() => {
      expect(document.body.querySelector('#cc-name')).toBeTruthy();
    });

    // Leave name empty and submit the form directly to bypass HTML5 native
    // validation (JSDOM doesn't enforce required reliably on click).
    const form = document.body.querySelector(
      '#cc-name'
    )!.closest('form') as HTMLFormElement;
    expect(form).toBeTruthy();
    await act(async () => {
      fireEvent.submit(form);
    });

    // No POST went out.
    const post = calls.find(
      (c) => c.url === '/api/admin/growth-communities' && c.method === 'POST'
    );
    expect(post).toBeUndefined();
    expect(mockToastError).toHaveBeenCalled();
  });

  it('(d) when the selected school does not use generations, the generation field is hidden', async () => {
    supabaseHolder.current = makeSupabaseMock(
      defaultFixtures({
        schoolMeta: { id: SCHOOL_ID, has_generations: false },
      })
    );
    installFetch(() => jsonResponse({}, 200));

    render(
      <GrowthCommunitiesIndexPage role="admin" schoolId={null as any} />
    );

    await selectSchoolViaDropdown(String(SCHOOL_ID));

    // Wait for school meta to load.
    await waitFor(() => {
      expect(findButtonByText(/Crear comunidad/)?.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Crear comunidad/)!);
    });

    await waitFor(() => {
      expect(document.body.querySelector('#cc-name')).toBeTruthy();
    });

    // Generation field is NOT rendered.
    expect(document.body.querySelector('#cc-generation')).toBeFalsy();
  });

  it('(e) clicking the pencil opens an edit modal prefilled with current values; PATCH only sends changed fields', async () => {
    supabaseHolder.current = makeSupabaseMock(defaultFixtures());

    const { calls } = installFetch((call) => {
      if (
        call.url === `/api/admin/growth-communities/${COMMUNITY_ID}` &&
        call.method === 'PATCH'
      ) {
        return jsonResponse({ id: COMMUNITY_ID }, 200);
      }
      return jsonResponse({ error: 'unhandled' }, 500);
    });

    render(
      <GrowthCommunitiesIndexPage role="admin" schoolId={null as any} />
    );

    await selectSchoolViaDropdown(String(SCHOOL_ID));
    await waitForCommunitiesRow(COMMUNITY_NAME);

    const pencil = findIconButton(/Editar comunidad/);
    expect(pencil).toBeTruthy();
    await act(async () => {
      fireEvent.click(pencil!);
    });

    // Edit modal renders with prefilled values.
    const nameInput = (await waitFor(() => {
      const i = document.body.querySelector(
        '#ec-name'
      ) as HTMLInputElement | null;
      expect(i).toBeTruthy();
      return i!;
    }))!;
    expect(nameInput.value).toBe(COMMUNITY_NAME);

    const maxInput = document.body.querySelector(
      '#ec-max'
    ) as HTMLInputElement;
    expect(maxInput.value).toBe('16');

    const descInput = document.body.querySelector(
      '#ec-description'
    ) as HTMLTextAreaElement;
    expect(descInput.value).toBe('');

    // Change ONLY the name.
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Comunidad Beta' } });
    });

    const saveBtn = findButtonByText(/Guardar cambios/);
    expect(saveBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(saveBtn!);
    });

    await waitFor(() => {
      const patch = calls.find(
        (c) =>
          c.url === `/api/admin/growth-communities/${COMMUNITY_ID}` &&
          c.method === 'PATCH'
      );
      expect(patch).toBeTruthy();
      expect(patch!.body).toEqual({ name: 'Comunidad Beta' });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('Comunidad actualizada.');
  });

  it('(f) PATCH error members_have_other_generation renders the Spanish friendly message with the conflict count', async () => {
    const generationId = 'gen-uuid-1';
    const otherGenerationId = 'gen-uuid-2';
    supabaseHolder.current = makeSupabaseMock(
      defaultFixtures({
        schoolMeta: { id: SCHOOL_ID, has_generations: true },
        generations: [
          { id: generationId, name: 'Generación 2024' },
          { id: otherGenerationId, name: 'Generación 2025' },
        ],
        communities: [
          {
            id: COMMUNITY_ID,
            name: COMMUNITY_NAME,
            generation_id: generationId,
            max_teachers: 16,
            description: null,
            school_id: SCHOOL_ID,
          },
        ],
      })
    );

    installFetch((call) => {
      if (
        call.url === `/api/admin/growth-communities/${COMMUNITY_ID}` &&
        call.method === 'PATCH'
      ) {
        return jsonResponse(
          {
            error: 'members_have_other_generation',
            conflicting_member_count: 3,
          },
          409
        );
      }
      return jsonResponse({ error: 'unhandled' }, 500);
    });

    render(
      <GrowthCommunitiesIndexPage role="admin" schoolId={null as any} />
    );

    await selectSchoolViaDropdown(String(SCHOOL_ID));
    await waitForCommunitiesRow(COMMUNITY_NAME);

    // Wait for school meta + generations to load so the field renders.
    await waitFor(() => {
      const pencil = findIconButton(/Editar comunidad/);
      expect(pencil).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(findIconButton(/Editar comunidad/)!);
    });

    const genSelect = (await waitFor(() => {
      const s = document.body.querySelector(
        '#ec-generation'
      ) as HTMLSelectElement | null;
      expect(s).toBeTruthy();
      return s!;
    }))!;

    // Switch to the other generation.
    await act(async () => {
      fireEvent.change(genSelect, { target: { value: otherGenerationId } });
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Guardar cambios/)!);
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Algunos miembros pertenecen a otra generación. No se puede cambiar la generación. (Conflictos: 3)'
      );
    });
  });

  it('(g) trash → preview DELETE without confirm → confirm copy + Eliminar → second DELETE { confirm: true } → 200 toast + refresh', async () => {
    supabaseHolder.current = makeSupabaseMock(defaultFixtures());

    let deleteCalls = 0;
    const { calls } = installFetch((call) => {
      if (
        call.url === `/api/admin/growth-communities/${COMMUNITY_ID}` &&
        call.method === 'DELETE'
      ) {
        deleteCalls += 1;
        if (deleteCalls === 1) {
          return jsonResponse({ deletable: true, blockers: [] }, 200);
        }
        return jsonResponse({ deleted: true }, 200);
      }
      return jsonResponse({ error: 'unhandled' }, 500);
    });

    render(
      <GrowthCommunitiesIndexPage role="admin" schoolId={null as any} />
    );

    await selectSchoolViaDropdown(String(SCHOOL_ID));
    await waitForCommunitiesRow(COMMUNITY_NAME);

    const trash = findIconButton(/Eliminar comunidad/);
    expect(trash).toBeTruthy();
    await act(async () => {
      fireEvent.click(trash!);
    });

    // Preview DELETE fires immediately, no body.
    await waitFor(() => {
      const preview = calls.find(
        (c) =>
          c.url === `/api/admin/growth-communities/${COMMUNITY_ID}` &&
          c.method === 'DELETE'
      );
      expect(preview).toBeTruthy();
      expect(preview!.body).toBeUndefined();
    });

    // Confirm copy + Eliminar button appear.
    await waitFor(() => {
      expect(document.body.textContent ?? '').toMatch(
        /Esta comunidad no tiene miembros ni dependencias\. ¿Confirmas la eliminación\?/
      );
    });

    const eliminarBtn = findButtonByText(/^Eliminar$/);
    expect(eliminarBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(eliminarBtn!);
    });

    await waitFor(() => {
      const second = calls.filter(
        (c) =>
          c.url === `/api/admin/growth-communities/${COMMUNITY_ID}` &&
          c.method === 'DELETE'
      )[1];
      expect(second).toBeTruthy();
      expect(second!.body).toEqual({ confirm: true });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('Comunidad eliminada');

    // Modal closes & refresh runs.
    await waitFor(() => {
      expect(
        document.body.textContent?.includes(
          '¿Confirmas la eliminación?'
        )
      ).toBe(false);
    });
  });

  it('(h) preview 409 has_dependencies lists each blocker with the friendly Spanish label and shows no Eliminar button', async () => {
    supabaseHolder.current = makeSupabaseMock(defaultFixtures());

    installFetch((call) => {
      if (
        call.url === `/api/admin/growth-communities/${COMMUNITY_ID}` &&
        call.method === 'DELETE'
      ) {
        return jsonResponse(
          {
            error: 'has_dependencies',
            blockers: [
              { kind: 'members_or_leaders', count: 4 },
              { kind: 'sessions', count: 2 },
              { kind: 'workspaces', count: 1 },
            ],
          },
          409
        );
      }
      return jsonResponse({ error: 'unhandled' }, 500);
    });

    render(
      <GrowthCommunitiesIndexPage role="admin" schoolId={null as any} />
    );

    await selectSchoolViaDropdown(String(SCHOOL_ID));
    await waitForCommunitiesRow(COMMUNITY_NAME);

    await act(async () => {
      fireEvent.click(findIconButton(/Eliminar comunidad/)!);
    });

    await waitFor(() => {
      expect(document.body.textContent ?? '').toMatch(
        /No se puede eliminar esta comunidad/
      );
    });

    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Miembros \/ líderes activos: 4/);
    expect(text).toMatch(/Sesiones de consultoría: 2/);
    expect(text).toMatch(/Espacios de trabajo de la comunidad: 1/);

    // No "Eliminar" button — only "Cerrar".
    expect(findButtonByText(/^Eliminar$/)).toBeUndefined();
    expect(findButtonByText(/^Cerrar$/)).toBeTruthy();
  });

  it('(i) Equipo Directivo view hides the school selector but CRUD targets their own school correctly', async () => {
    supabaseHolder.current = makeSupabaseMock(defaultFixtures());

    const { calls } = installFetch((call) => {
      if (
        call.url === '/api/admin/growth-communities' &&
        call.method === 'POST'
      ) {
        return jsonResponse({ id: 'new-uuid' }, 201);
      }
      return jsonResponse({ error: 'unhandled' }, 500);
    });

    render(
      <GrowthCommunitiesIndexPage
        role="equipo_directivo"
        schoolId={SCHOOL_ID}
      />
    );

    // School selector is NOT rendered.
    await waitFor(() => {
      expect(findButtonByText(/Crear comunidad/)).toBeTruthy();
    });
    expect(document.body.querySelector('#filter-school')).toBeFalsy();

    // The community list loads for the ED's school.
    await waitForCommunitiesRow(COMMUNITY_NAME);

    // Wait until create button is enabled (selectedSchoolId is preset).
    await waitFor(() => {
      expect(findButtonByText(/Crear comunidad/)?.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/Crear comunidad/)!);
    });

    await waitFor(() => {
      expect(document.body.querySelector('#cc-name')).toBeTruthy();
    });

    const nameInput = document.body.querySelector(
      '#cc-name'
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'ED Comunidad' } });
    });

    const submitBtn = findAllButtonsByText(/^Crear comunidad$/).find(
      (b) => b.getAttribute('type') === 'submit'
    );
    await act(async () => {
      fireEvent.click(submitBtn!);
    });

    await waitFor(() => {
      const post = calls.find(
        (c) =>
          c.url === '/api/admin/growth-communities' && c.method === 'POST'
      );
      expect(post).toBeTruthy();
      expect(post!.body).toEqual({
        name: 'ED Comunidad',
        school_id: SCHOOL_ID,
        max_teachers: 16,
      });
    });
  });
});
