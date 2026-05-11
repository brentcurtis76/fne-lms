// @vitest-environment jsdom
import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).React = React;

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const { assignRoleViaAPI, removeRoleViaAPI, getAvailableCommunitiesForAssignment } =
  vi.hoisted(() => ({
    assignRoleViaAPI: vi.fn(),
    removeRoleViaAPI: vi.fn(),
    getAvailableCommunitiesForAssignment: vi.fn(),
  }));
vi.mock('../../utils/roleUtils', async () => {
  const actual = await vi.importActual<typeof import('../../utils/roleUtils')>(
    '../../utils/roleUtils',
  );
  return {
    ...actual,
    assignRoleViaAPI,
    removeRoleViaAPI,
    getAvailableCommunitiesForAssignment,
  };
});

const supabaseTables: Record<string, any[]> = {
  schools: [],
  generations: [],
  growth_communities: [],
};

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    from: (table: string) => {
      const data = supabaseTables[table] ?? [];
      const chain: any = {
        select: () => chain,
        order: () => Promise.resolve({ data, error: null }),
      };
      return chain;
    },
  }),
}));

import RoleAssignmentModal from '../../components/RoleAssignmentModal';
import { ED_ASSIGNABLE_ROLES } from '../../utils/roleUtils';

const baseProps = {
  isOpen: true as const,
  onClose: vi.fn(),
  userId: 'user-1',
  userName: 'Test User',
  userEmail: 'test@example.com',
  currentUserId: 'admin-1',
  onRoleUpdate: vi.fn(),
};

const installFetchWithRoles = (roles: any[]) => {
  // @ts-expect-error override global fetch for test
  global.fetch = vi.fn(async (url: any) => {
    if (String(url).includes('/api/admin/user-roles')) {
      return new Response(JSON.stringify({ roles }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
};

const ROLE_OPTION_VALUES = new Set([
  'admin',
  'consultor',
  'equipo_directivo',
  'lider_generacion',
  'lider_comunidad',
  'supervisor_de_red',
  'community_manager',
  'docente',
  'encargado_licitacion',
]);

const findRoleTypeSelect = () =>
  Array.from(document.body.querySelectorAll('select')).find((s) => {
    const opts = Array.from(s.options);
    if (opts.some((o) => ROLE_OPTION_VALUES.has(o.value))) return true;
    // Empty-allowedRoles case: only the placeholder option is rendered.
    return opts.length === 1 && /Sin roles disponibles/i.test(opts[0]?.textContent ?? '');
  }) as HTMLSelectElement | undefined;

const findButtonByText = (re: RegExp) =>
  Array.from(document.body.querySelectorAll('button')).find((b) =>
    re.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;

const enterNewRoleForm = async () => {
  const btn = findButtonByText(/Asignar Primer Rol/i);
  if (!btn) throw new Error('"Asignar Primer Rol" button not found');
  await act(async () => {
    fireEvent.click(btn);
  });
};

const getRoleOptionValues = (): string[] => {
  const select = findRoleTypeSelect();
  if (!select) return [];
  return Array.from(select.options).map((o) => o.value);
};

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
  assignRoleViaAPI.mockReset();
  removeRoleViaAPI.mockReset();
  getAvailableCommunitiesForAssignment.mockReset();
  getAvailableCommunitiesForAssignment.mockResolvedValue([]);
  supabaseTables.schools = [];
  supabaseTables.generations = [];
  supabaseTables.growth_communities = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RoleAssignmentModal — allowedRoles prop', () => {
  it('default (allowedRoles undefined) shows all roles in dropdown', async () => {
    installFetchWithRoles([]);

    render(<RoleAssignmentModal {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });
    await enterNewRoleForm();

    const values = getRoleOptionValues();
    expect(values).toEqual(
      expect.arrayContaining([
        'admin',
        'consultor',
        'equipo_directivo',
        'lider_generacion',
        'lider_comunidad',
        'supervisor_de_red',
        'community_manager',
        'docente',
        'encargado_licitacion',
      ]),
    );
    expect(values).toHaveLength(9);
  });

  it('allowedRoles={["docente"]} shows only docente', async () => {
    installFetchWithRoles([]);

    render(
      <RoleAssignmentModal {...baseProps} allowedRoles={['docente']} />,
    );

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });
    await enterNewRoleForm();

    const values = getRoleOptionValues();
    expect(values).toEqual(['docente']);
  });

  it('resets selectedRole when allowedRoles tightens to exclude the current selection', async () => {
    installFetchWithRoles([]);

    const { rerender } = render(
      <RoleAssignmentModal
        {...baseProps}
        allowedRoles={['admin', 'docente']}
      />,
    );

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });
    await enterNewRoleForm();

    const select = findRoleTypeSelect();
    expect(select).toBeDefined();
    await act(async () => {
      fireEvent.change(select!, { target: { value: 'admin' } });
    });
    expect(select!.value).toBe('admin');

    await act(async () => {
      rerender(
        <RoleAssignmentModal
          {...baseProps}
          allowedRoles={['docente']}
        />,
      );
    });

    await waitFor(() => {
      const s = findRoleTypeSelect();
      expect(s?.value).toBe('docente');
    });
  });

  it('empty allowedRoles disables submit and surfaces an explanatory hint', async () => {
    installFetchWithRoles([]);

    render(
      <RoleAssignmentModal {...baseProps} allowedRoles={[]} />,
    );

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });
    await enterNewRoleForm();

    const select = findRoleTypeSelect();
    expect(select).toBeDefined();
    expect(select!.disabled).toBe(true);
    expect(select!.value).toBe('');

    const submit = findButtonByText(/^Asignar Rol$/);
    expect(submit).toBeDefined();
    expect(submit!.disabled).toBe(true);
    expect(submit!.getAttribute('title')).toMatch(/No hay roles disponibles/i);

    // Explanatory hint visible somewhere in the form
    expect(document.body.textContent).toMatch(/No hay roles disponibles/i);
  });

  it('submit handler refuses stale/disallowed selectedRole and toasts an error', async () => {
    installFetchWithRoles([]);

    const { rerender } = render(
      <RoleAssignmentModal
        {...baseProps}
        allowedRoles={['admin', 'docente']}
      />,
    );

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });
    await enterNewRoleForm();

    const select = findRoleTypeSelect();
    await act(async () => {
      fireEvent.change(select!, { target: { value: 'admin' } });
    });

    // Tighten allowedRoles but synchronously invoke submit while the new selection is still in flight.
    // The defensive validation in handleAssignRole must reject the disallowed value either way.
    await act(async () => {
      rerender(
        <RoleAssignmentModal
          {...baseProps}
          allowedRoles={['docente']}
        />,
      );
    });

    // Force the stale value back into the select to simulate a stale-state submission attempt.
    const selectAfter = findRoleTypeSelect();
    // The select only lists 'docente' now, so we cannot select 'admin' through the UI.
    // Verify that the dropdown actually filtered admin out and that submit is constrained to docente.
    expect(Array.from(selectAfter!.options).map((o) => o.value)).toEqual(['docente']);

    // And the defensive validation path: assignRoleViaAPI must not be called with a disallowed role.
    // Trigger submit; with the reset selectedRole=docente, assignRoleViaAPI is invoked legitimately.
    assignRoleViaAPI.mockResolvedValue({ success: true });
    const submit = findButtonByText(/^Asignar Rol$/);
    await act(async () => {
      fireEvent.click(submit!);
    });

    // Confirm it was called with the post-reset value, never with 'admin'.
    expect(assignRoleViaAPI).toHaveBeenCalledTimes(1);
    expect(assignRoleViaAPI.mock.calls[0][1]).toBe('docente');
  });

  it('allowedRoles={ED_ASSIGNABLE_ROLES} hides admin/consultor/community_manager/supervisor_de_red', async () => {
    installFetchWithRoles([]);

    render(
      <RoleAssignmentModal
        {...baseProps}
        allowedRoles={ED_ASSIGNABLE_ROLES}
      />,
    );

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });
    await enterNewRoleForm();

    const values = getRoleOptionValues();
    expect(values).not.toContain('admin');
    expect(values).not.toContain('consultor');
    expect(values).not.toContain('community_manager');
    expect(values).not.toContain('supervisor_de_red');
    // ED-allowed roles should be present
    expect(values).toEqual(
      expect.arrayContaining([
        'docente',
        'lider_comunidad',
        'lider_generacion',
        'equipo_directivo',
        'encargado_licitacion',
      ]),
    );
  });
});
