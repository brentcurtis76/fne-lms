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

const findRoleTypeSelect = () =>
  Array.from(document.body.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'docente'),
  ) as HTMLSelectElement | undefined;

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
