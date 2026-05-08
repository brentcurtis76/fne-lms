// @vitest-environment jsdom
/**
 * UnifiedUserManagement — ED-scoped read-only props
 *
 * Verifies the optional props that allow the ED user-management page to reuse
 * the admin component in a school-locked, expense-free, no-bulk-import mode:
 *   - `hideBulkImport`   hides the "Importar Usuarios" button
 *   - `hideExpenseAccess` hides the "Reportes de gastos" block in the
 *      expanded actions for approved users
 *   - `lockedSchoolId`   forces the effective school filter to that id and
 *      prevents the user from changing it; community options derive from the
 *      locked school only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));

import UnifiedUserManagement from '../../components/admin/UnifiedUserManagement';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SCHOOL_42_ID = 42;
const SCHOOL_99_ID = 99;
const COMMUNITY_42 = 'community-42';
const COMMUNITY_99 = 'community-99';

const schoolsFixture = [
  { id: String(SCHOOL_42_ID), name: 'Colegio 42' },
  { id: String(SCHOOL_99_ID), name: 'Otro Colegio' },
];

// One approved user per school. Each has a user_role pointing to a community
// in that school so the component's local community-derivation can pick them
// up. Roles use `docente` so the expense block is rendered for non-admins.
const approvedUserSchool42 = {
  id: 'user-42',
  email: 'docente42@example.com',
  first_name: 'Profe',
  last_name: 'Cuarenta',
  approval_status: 'approved' as const,
  user_roles: [
    {
      role_type: 'docente',
      school: { id: SCHOOL_42_ID, name: 'Colegio 42' },
      community: {
        id: COMMUNITY_42,
        name: 'Comunidad 42',
        school: { id: SCHOOL_42_ID },
      },
    },
  ],
  expense_access_enabled: false,
};

const approvedUserSchool99 = {
  id: 'user-99',
  email: 'docente99@example.com',
  first_name: 'Profe',
  last_name: 'Noventa',
  approval_status: 'approved' as const,
  user_roles: [
    {
      role_type: 'docente',
      school: { id: SCHOOL_99_ID, name: 'Otro Colegio' },
      community: {
        id: COMMUNITY_99,
        name: 'Comunidad 99',
        school: { id: SCHOOL_99_ID },
      },
    },
  ],
  expense_access_enabled: false,
};

const baseProps = {
  users: [approvedUserSchool42, approvedUserSchool99],
  schools: schoolsFixture,
  searchQuery: '',
  selectedStatus: 'approved' as const,
  selectedSchoolId: '',
  selectedCommunityId: '',
  onSearchChange: vi.fn(),
  onSearchSubmit: vi.fn(),
  onClearSearch: vi.fn(),
  onStatusChange: vi.fn(),
  onSchoolChange: vi.fn(),
  onCommunityChange: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onDelete: vi.fn(),
  onRoleChange: vi.fn(),
  onAssign: vi.fn(),
  onPasswordReset: vi.fn(),
  onExpenseAccessToggle: vi.fn(),
  onAddUser: vi.fn(),
  onBulkImport: vi.fn(),
  onEditUser: vi.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const findButtonByText = (re: RegExp): HTMLButtonElement | undefined =>
  Array.from(document.body.querySelectorAll('button')).find((b) =>
    re.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;

const findSchoolSelect = () =>
  document.body.querySelector('#school-filter') as HTMLSelectElement | null;

const findCommunitySelect = () =>
  document.body.querySelector('#community-filter') as HTMLSelectElement | null;

const expandUserRow = async (userId: string) => {
  // The row has no test id, but its avatar/name container is the closest
  // clickable parent. Click on the user's email span instead — bubbles up to
  // the row's onClick handler.
  const emailSpans = Array.from(document.body.querySelectorAll('span')).filter(
    (s) => s.textContent?.includes(`${userId}@`) || s.textContent?.includes(userId),
  );
  // Fallback: find the chevron container row by matching the email text from fixtures.
  const target =
    emailSpans[0] ??
    Array.from(document.body.querySelectorAll('h3')).find((h) =>
      /Profe/.test(h.textContent ?? ''),
    );
  if (!target) throw new Error('expandable user row not found');
  await act(async () => {
    fireEvent.click(target);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UnifiedUserManagement — ED-scoped props', () => {
  it('default: renders Importar Usuarios, expense block, and an enabled school filter', async () => {
    render(<UnifiedUserManagement {...baseProps} />);

    // (a) Bulk import visible.
    expect(findButtonByText(/Importar Usuarios/i)).toBeDefined();

    // (b) School filter is rendered and not disabled.
    const schoolSelect = findSchoolSelect();
    expect(schoolSelect).toBeTruthy();
    expect(schoolSelect!.disabled).toBe(false);

    // (c) Expanding the first approved user reveals the expense block.
    await act(async () => {
      fireEvent.click(
        Array.from(document.body.querySelectorAll('h3')).find((h) =>
          /Profe Cuarenta/.test(h.textContent ?? ''),
        )!,
      );
    });
    expect(document.body.textContent).toContain('Reportes de gastos');
  });

  it('hideBulkImport: omits the "Importar Usuarios" button but keeps "Nuevo Usuario"', () => {
    render(<UnifiedUserManagement {...baseProps} hideBulkImport />);

    expect(findButtonByText(/Importar Usuarios/i)).toBeUndefined();
    expect(findButtonByText(/Nuevo Usuario/i)).toBeDefined();
  });

  it('hideExpenseAccess: omits the "Reportes de gastos" block from the approved user actions', async () => {
    render(<UnifiedUserManagement {...baseProps} hideExpenseAccess />);

    // Expand the approved user.
    await act(async () => {
      fireEvent.click(
        Array.from(document.body.querySelectorAll('h3')).find((h) =>
          /Profe Cuarenta/.test(h.textContent ?? ''),
        )!,
      );
    });

    // Other approved-user actions still render (sanity).
    expect(findButtonByText(/Editar Usuario/i)).toBeDefined();
    expect(findButtonByText(/Gestionar Roles/i)).toBeDefined();

    // The expense block is gone.
    expect(document.body.textContent).not.toContain('Reportes de gastos');
  });

  it('hideCommunityFilter: removes the community filter UI and drops a stale selectedCommunityId', () => {
    const onCommunityChange = vi.fn();

    render(
      <UnifiedUserManagement
        {...baseProps}
        // Stale prior selection — should not surface anywhere when hidden.
        selectedCommunityId={COMMUNITY_42}
        onCommunityChange={onCommunityChange}
        hideCommunityFilter
      />,
    );

    // (a) Filter UI is absent — no label, no select.
    expect(findCommunitySelect()).toBeNull();
    expect(
      Array.from(document.body.querySelectorAll('label')).find((l) =>
        /Filtrar por Comunidad/i.test(l.textContent ?? ''),
      ),
    ).toBeUndefined();

    // (b) Nothing the component renders carries the stale community id —
    // any read of the rendered DOM cannot leak `communityId` back into a
    // request/export payload built by callers.
    const inputsAndSelects = Array.from(
      document.body.querySelectorAll('input,select'),
    ) as Array<HTMLInputElement | HTMLSelectElement>;
    for (const el of inputsAndSelects) {
      expect(el.value).not.toBe(COMMUNITY_42);
    }
    const allOptions = Array.from(document.body.querySelectorAll('option'));
    expect(
      allOptions.find((o) => (o as HTMLOptionElement).value === COMMUNITY_42),
    ).toBeUndefined();

    // (c) The component never invokes onCommunityChange on its own when the
    // filter is hidden, so the parent's communityId state cannot drift.
    expect(onCommunityChange).not.toHaveBeenCalled();
  });

  it('lockedSchoolId=42: school filter is disabled at value="42" and community options only include school-42 communities', () => {
    // Parent passes a different selectedSchoolId on purpose; lockedSchoolId
    // must override it for both the select value and the community derivation.
    render(
      <UnifiedUserManagement
        {...baseProps}
        selectedSchoolId="99"
        lockedSchoolId={SCHOOL_42_ID}
      />,
    );

    // (a) The school select is rendered, disabled, and pinned to "42".
    const schoolSelect = findSchoolSelect();
    expect(schoolSelect).toBeTruthy();
    expect(schoolSelect!.disabled).toBe(true);
    expect(schoolSelect!.value).toBe(String(SCHOOL_42_ID));

    // (b) The community select only exposes the school-42 community; the
    // school-99 community is filtered out by the effective school id.
    const communitySelect = findCommunitySelect();
    expect(communitySelect).toBeTruthy();
    const optionValues = Array.from(communitySelect!.options).map((o) => o.value);
    expect(optionValues).toContain(COMMUNITY_42);
    expect(optionValues).not.toContain(COMMUNITY_99);
  });
});
