// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F7e S6 (GENERA fixes): the one-by-one expense switch leaves user
 * administration (/admin/user-management). Who files expenses is decided by
 * role since F7d, so the page neither reads nor writes expense_report_access
 * and shows no «Reportes de gastos» control. Synthetic people only.
 */

const fake = vi.hoisted(() => ({ ref: null as any }));
vi.mock('@supabase/auth-helpers-react', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { useSupabaseClient: () => fake.ref.client };
});
vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
const router = { query: {}, push: vi.fn() };
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../../components/RoleAssignmentModal', () => ({ default: () => null }));
vi.mock('../../../components/ConsultantAssignmentModal', () => ({ default: () => null }));
vi.mock('../../../components/PasswordResetModal', () => ({ default: () => null }));
vi.mock('../../../components/admin/BulkUserImportModal', () => ({ default: () => null }));
vi.mock('../../../components/admin/UserEditModal', () => ({ default: () => null }));
vi.mock('../../../utils/roleUtils', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/roleUtils')>('../../../utils/roleUtils');
  return { ...actual, getUserPrimaryRole: async () => 'admin' };
});

(globalThis as any).React = React;

import UserManagement from '../../../pages/admin/user-management';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
  userId: string | null;
};

const USERS = [
  { id: 'f7e-u-1', email: 'docente@f7e.test.local', first_name: 'Diana', last_name: 'Docente', approval_status: 'approved', user_roles: [{ role_type: 'docente' }] },
  { id: 'f7e-u-2', email: 'consultor@f7e.test.local', first_name: 'Carlos', last_name: 'Consultor', approval_status: 'approved', user_roles: [{ role_type: 'consultor' }] },
];

beforeEach(() => {
  h.requests.length = 0;
  h.userId = 'f7e-admin-1';
  h.respond = (req) => {
    if (req.target === 'expense_report_access') return { data: [{ user_id: 'f7e-u-1', can_submit: true }], error: null };
    if (req.target === 'profiles') return { data: { avatar_url: null }, error: null };
    return { data: null, error: null };
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ users: USERS, total: 2, page: 1, summary: { total: 2, pending: 0, approved: 2 }, schools: [] }), { status: 200 })
  ) as any;
});

describe('F7e S6 the one-by-one expense switch leaves user administration', () => {
  it('the page makes no request to expense_report_access and shows no control for it', async () => {
    render(<UserManagement />);
    await waitFor(() => expect(screen.getByText('docente@f7e.test.local')).toBeTruthy());
    for (const email of ['docente@f7e.test.local', 'consultor@f7e.test.local']) {
      fireEvent.click(screen.getByText(email));
      // the person's actions are open (the edit control is there) ...
      await waitFor(() => expect(screen.getAllByText(/Editar/).length).toBeGreaterThan(0));
      // ... and none of them is about expenses
      expect(screen.queryByText('Reportes de gastos')).toBeNull();
      expect(screen.queryByText('Habilitar')).toBeNull();
      expect(screen.queryByText('Deshabilitar')).toBeNull();
    }
    expect(h.requests.filter((r) => r.target === 'expense_report_access')).toEqual([]);
  });
});
