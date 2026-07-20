// @vitest-environment jsdom
/**
 * pages/admin/tractor-signups.tsx — grant response handling.
 *
 * A successful grant whose response carries generation.warning must surface
 * that warning as an informational toast while still reporting the grant as
 * successful (never as an error).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const { mockToast, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(mockToast, {
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    pathname: '/admin/tractor-signups',
    query: {},
    isReady: true,
  }),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: vi.fn(),
}));

vi.mock('../../lib/api-auth', () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock('../../utils/roleUtils', () => ({
  isGlobalAdmin: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import TractorSignupsAdminPage from '../../pages/admin/tractor-signups';

const SIGNUP_ID = '22222222-2222-4222-8222-222222222222';
const WARNING = 'La generación no se aplicó porque el perfil pertenece a otro colegio.';

function signupFixture() {
  return {
    id: SIGNUP_ID,
    source: 'registro_general',
    source_label: 'Registro general',
    first_name: 'Ana',
    last_name: 'Pérez',
    full_name: 'Ana Pérez',
    email: 'ana@example.com',
    email_normalized: 'ana@example.com',
    school_id: 55,
    school_name: 'Colegio Uno',
    generation_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    generation_name: 'Tractor',
    birth_date: '1990-05-10',
    profession: 'Docente de Historia',
    role: 'docente',
    role_label: 'Docente',
    status: 'pending',
    status_label: 'Pendiente',
    consent_accepted_at: '2026-07-01T12:00:00.000Z',
    linked_user_id: null,
    granted_by: null,
    granted_at: null,
    created_at: '2026-07-01T12:00:00.000Z',
    updated_at: null,
    is_existing_user: false,
    existing_user_id: null,
    existing_name: null,
    existing_email: null,
    existing_status: null,
    existing_school_id: null,
    existing_roles: [],
  };
}

function mockFetchRoutes(grantResponse: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/admin/tractor-signups/grant')) {
      expect(init?.method).toBe('POST');
      return { ok: true, json: async () => grantResponse } as Response;
    }
    if (url.includes('/api/admin/tractor-signups')) {
      return {
        ok: true,
        json: async () => ({ signups: [signupFixture()], schools: [{ id: 55, name: 'Colegio Uno' }] }),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function renderAndGrant(grantResponse: Record<string, unknown>) {
  global.fetch = mockFetchRoutes(grantResponse) as unknown as typeof fetch;

  const view = render(<TractorSignupsAdminPage />);

  const manageButtons = await view.findAllByRole('button', { name: /Gestionar/ });
  fireEvent.click(manageButtons[0]);

  const grantButton = await view.findByRole('button', { name: /Otorgar acceso/ });
  fireEvent.click(grantButton);

  await waitFor(() => {
    expect(mockToastSuccess).toHaveBeenCalledWith('Acceso otorgado');
  });

  return view;
}

describe('admin/tractor-signups — grant generation warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces generation.warning as an informational toast on a successful grant', async () => {
    await renderAndGrant({
      success: true,
      status: 'granted',
      existingUser: true,
      linkedUserId: 'user-1',
      generation: { applied: false, warning: WARNING },
    });

    expect(mockToast).toHaveBeenCalledWith(WARNING, expect.objectContaining({ icon: '⚠️' }));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('shows only the success toast when the response has no warning', async () => {
    await renderAndGrant({
      success: true,
      status: 'granted',
      existingUser: true,
      linkedUserId: 'user-1',
      generation: { applied: true, warning: null },
    });

    expect(mockToast).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
