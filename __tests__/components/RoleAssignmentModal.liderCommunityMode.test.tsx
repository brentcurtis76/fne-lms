// @vitest-environment jsdom
import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// RoleAssignmentModal.tsx uses JSX without importing React, so the classic
// JSX transform needs React available globally at render time.
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
vi.mock('../../utils/roleUtils', () => ({
  assignRoleViaAPI,
  removeRoleViaAPI,
  getAvailableCommunitiesForAssignment,
}));

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

const SCHOOL_ID = 'school-1';
const COMMUNITY_ID = '11111111-1111-1111-1111-111111111111';

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
    Array.from(s.options).some((o) => o.value === 'lider_comunidad'),
  ) as HTMLSelectElement;

const findButtonByText = (re: RegExp) =>
  Array.from(document.body.querySelectorAll('button')).find((b) =>
    re.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;

const findRadio = (value: 'new' | 'existing') =>
  document.body.querySelector(
    `input[type="radio"][name="liderCommunityMode"][value="${value}"]`,
  ) as HTMLInputElement | null;

const findCommunityDropdown = () =>
  document.body.querySelector(
    'select[aria-label="Comunidad existente"]',
  ) as HTMLSelectElement | null;

const enterNewRoleForm = async () => {
  const btn = findButtonByText(/Asignar Primer Rol/i);
  if (!btn) throw new Error('"Asignar Primer Rol" button not found');
  await act(async () => {
    fireEvent.click(btn);
  });
};

const pickLiderComunidad = async () => {
  const select = findRoleTypeSelect();
  await act(async () => {
    fireEvent.change(select, { target: { value: 'lider_comunidad' } });
  });
};

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
  assignRoleViaAPI.mockReset();
  removeRoleViaAPI.mockReset();
  getAvailableCommunitiesForAssignment.mockReset();

  supabaseTables.schools = [
    { id: SCHOOL_ID, name: 'Escuela Uno', has_generations: false },
  ];
  supabaseTables.generations = [];
  supabaseTables.growth_communities = [
    {
      id: COMMUNITY_ID,
      name: 'Comunidad Existente',
      school_id: SCHOOL_ID,
      generation_id: null,
    },
  ];

  getAvailableCommunitiesForAssignment.mockResolvedValue([
    {
      id: COMMUNITY_ID,
      name: 'Comunidad Existente',
      school_id: SCHOOL_ID,
      generation_id: null,
    },
  ]);
  assignRoleViaAPI.mockResolvedValue({ success: true });
  removeRoleViaAPI.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RoleAssignmentModal — lider_comunidad mode', () => {
  it('(a) shows the radio group with "new" selected by default when picking lider_comunidad', async () => {
    installFetchWithRoles([]);

    render(<RoleAssignmentModal {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });

    await enterNewRoleForm();
    await pickLiderComunidad();

    const newRadio = findRadio('new');
    const existingRadio = findRadio('existing');

    expect(newRadio).toBeTruthy();
    expect(existingRadio).toBeTruthy();
    expect(newRadio!.checked).toBe(true);
    expect(existingRadio!.checked).toBe(false);
  });

  it('(b) in "new" mode, clicking Asignar Rol calls assignRoleViaAPI without a communityId', async () => {
    installFetchWithRoles([]);

    render(<RoleAssignmentModal {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });

    await enterNewRoleForm();
    await pickLiderComunidad();

    const submit = findButtonByText(/Asignar Rol/i)!;
    expect(submit.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(assignRoleViaAPI).toHaveBeenCalledTimes(1);
    });

    const [targetUserId, roleType, scope] = assignRoleViaAPI.mock.calls[0];
    expect(targetUserId).toBe('user-1');
    expect(roleType).toBe('lider_comunidad');
    expect(scope.communityId).toBeUndefined();
  });

  it('(c) switching to "existing" reveals the community dropdown and keeps submit disabled until a community is picked', async () => {
    installFetchWithRoles([]);

    render(<RoleAssignmentModal {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });

    await enterNewRoleForm();
    await pickLiderComunidad();

    expect(findCommunityDropdown()).toBeNull();

    const existingRadio = findRadio('existing')!;
    await act(async () => {
      fireEvent.click(existingRadio);
    });

    const dropdown = findCommunityDropdown();
    expect(dropdown).toBeTruthy();

    const submit = findButtonByText(/Asignar Rol/i)!;
    expect(submit.disabled).toBe(true);
  });

  it('(d) in "existing" mode with a picked community, assignRoleViaAPI is called with that communityId', async () => {
    installFetchWithRoles([]);

    render(<RoleAssignmentModal {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/Asignar Primer Rol/i)).toBeDefined();
    });

    await enterNewRoleForm();
    await pickLiderComunidad();

    const existingRadio = findRadio('existing')!;
    await act(async () => {
      fireEvent.click(existingRadio);
    });

    await waitFor(() => {
      expect(findCommunityDropdown()).toBeTruthy();
    });

    const dropdown = findCommunityDropdown()!;
    await waitFor(() => {
      expect(
        Array.from(dropdown.options).some((o) => o.value === COMMUNITY_ID),
      ).toBe(true);
    });

    await act(async () => {
      fireEvent.change(dropdown, { target: { value: COMMUNITY_ID } });
    });

    const submit = findButtonByText(/Asignar Rol/i)!;
    expect(submit.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(submit);
    });

    await waitFor(() => {
      expect(assignRoleViaAPI).toHaveBeenCalledTimes(1);
    });

    const [, , scope] = assignRoleViaAPI.mock.calls[0];
    expect(scope.communityId).toBe(COMMUNITY_ID);
  });

  it('(e) editing a lider_comunidad role with community_id prefills the dropdown and defaults to "existing"', async () => {
    const existingRole = {
      id: 'role-1',
      user_id: 'user-1',
      role_type: 'lider_comunidad',
      school_id: SCHOOL_ID,
      generation_id: null,
      community_id: COMMUNITY_ID,
      is_active: true,
      assigned_at: '2026-01-01',
      created_at: '2026-01-01',
      school: { id: SCHOOL_ID, name: 'Escuela Uno', has_generations: false },
      community: { id: COMMUNITY_ID, name: 'Comunidad Existente' },
    };
    installFetchWithRoles([existingRole]);

    render(<RoleAssignmentModal {...baseProps} />);

    // Wait for the role view to render and the inline "Editar" button to appear.
    await waitFor(() => {
      expect(findButtonByText(/^Editar$/)).toBeDefined();
    });

    const editBtn = findButtonByText(/^Editar$/)!;
    await act(async () => {
      fireEvent.click(editBtn);
    });

    // Role select should show 'lider_comunidad' and radio should be 'existing'.
    const roleSelect = findRoleTypeSelect();
    expect(roleSelect.value).toBe('lider_comunidad');

    const existingRadio = findRadio('existing')!;
    const newRadio = findRadio('new')!;
    expect(existingRadio.checked).toBe(true);
    expect(newRadio.checked).toBe(false);

    await waitFor(() => {
      const dropdown = findCommunityDropdown();
      expect(dropdown).toBeTruthy();
      expect(dropdown!.value).toBe(COMMUNITY_ID);
    });
  });

  it('(f) switching from "existing" back to "new" clears the selected community and does not submit a stale id', async () => {
    const existingRole = {
      id: 'role-1',
      user_id: 'user-1',
      role_type: 'lider_comunidad',
      school_id: SCHOOL_ID,
      generation_id: null,
      community_id: COMMUNITY_ID,
      is_active: true,
      assigned_at: '2026-01-01',
      created_at: '2026-01-01',
      school: { id: SCHOOL_ID, name: 'Escuela Uno', has_generations: false },
      community: { id: COMMUNITY_ID, name: 'Comunidad Existente' },
    };
    installFetchWithRoles([existingRole]);

    render(<RoleAssignmentModal {...baseProps} />);

    await waitFor(() => {
      expect(findButtonByText(/^Editar$/)).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(findButtonByText(/^Editar$/)!);
    });

    await waitFor(() => {
      const dropdown = findCommunityDropdown();
      expect(dropdown?.value).toBe(COMMUNITY_ID);
    });

    // Switch back to "new" — onChange clears selectedCommunity.
    const newRadio = findRadio('new')!;
    await act(async () => {
      fireEvent.click(newRadio);
    });

    expect(findCommunityDropdown()).toBeNull();
    expect(newRadio.checked).toBe(true);

    const updateBtn = findButtonByText(/Actualizar Rol/i)!;
    expect(updateBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(updateBtn);
    });

    await waitFor(() => {
      expect(assignRoleViaAPI).toHaveBeenCalledTimes(1);
    });

    const [, roleType, scope] = assignRoleViaAPI.mock.calls[0];
    expect(roleType).toBe('lider_comunidad');
    expect(scope.communityId).toBeUndefined();
  });
});
