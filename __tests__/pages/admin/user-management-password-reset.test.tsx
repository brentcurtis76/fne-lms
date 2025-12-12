import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useRouter } from 'next/router';
import UserManagement from '../../../pages/admin/user-management';

import { toast } from 'react-hot-toast';

// Ensure React is available globally for JSX transform
global.React = React;

// Mock dependencies
vi.mock('next/router', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: vi.fn(),
}));

// react-hot-toast is already mocked globally
// fetch is already mocked globally

// Mock components
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: any) => <div data-testid="main-layout">{children}</div>
}));

vi.mock('../../../components/admin/UnifiedUserManagement', () => ({
  default: ({ users, onPasswordReset }: any) => (
    <div data-testid="unified-user-management">
      {users.map((user: any) => (
        <div key={user.id}>
          <span>{user.first_name} {user.last_name}</span>
          {user.approval_status === 'approved' && (
            <button 
              title="Restablecer contraseña" 
              onClick={() => onPasswordReset(user)}
            >
              Reset Password
            </button>
          )}
        </div>
      ))}
    </div>
  )
}));

vi.mock('../../../components/PasswordResetModal', () => ({
  default: ({ isOpen, user, onPasswordReset, onClose }) => {
    if (!isOpen) return null;

    const handleReset = async () => {
      try {
        await onPasswordReset(user.id, 'new-password-123');
        toast.success('Contraseña restablecida correctamente.');
        onClose();
      } catch (error) {
        toast.error('Error al restablecer la contraseña');
      }
    };

    return (
      <div data-testid="password-reset-modal">
        <h2>Restablecer Contraseña</h2>
        <p>Usuario: {user?.email}</p>
        <button onClick={handleReset}>Reset</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    );
  },
}));

describe('User Management - Password Reset Feature', () => {
  const mockPush = vi.fn();
  const mockFrom = vi.fn();
  const mockGetSession = vi.fn();
  const mockGetUser = vi.fn();
  const mockSupabase = {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
    from: mockFrom,
  };

  const mockAdminSession = {
    user: { id: 'admin-123', email: 'admin@example.com' },
    access_token: 'valid-token',
  };

  const mockUsers = [
    {
      id: 'user-1',
      email: 'user1@example.com',
      first_name: 'John',
      last_name: 'Doe',
      approval_status: 'approved',
    },
    {
      id: 'user-2',
      email: 'user2@example.com',
      first_name: 'Jane',
      last_name: 'Smith',
      approval_status: 'pending',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any);
    vi.mocked(useSupabaseClient).mockReturnValue(mockSupabase as any);

    global.fetch = vi.fn();

    mockGetSession.mockResolvedValue({ data: { session: mockAdminSession } });
    mockGetUser.mockResolvedValue({ data: { user: mockAdminSession.user }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const profilesQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'admin' } }),
          order: vi.fn().mockResolvedValue({ data: mockUsers }),
        };
        return profilesQuery;
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    });
  });

  it('should show password reset button only for approved users', async () => {
    render(<UserManagement />);
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    const resetButtons = screen.getAllByTitle('Restablecer contraseña');
    expect(resetButtons).toHaveLength(1);
  });

  it('should open password reset modal when reset button is clicked', async () => {
    const user = userEvent.setup();
    render(<UserManagement />);
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    await user.click(screen.getByTitle('Restablecer contraseña'));
    expect(screen.getByTestId('password-reset-modal')).toBeInTheDocument();
  });

  it('should call onSuccess when reset is successful in modal', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const user = userEvent.setup();
    render(<UserManagement />);
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    await user.click(screen.getByTitle('Restablecer contraseña'));

    const resetInModalButton = screen.getByText('Reset');
    await user.click(resetInModalButton);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Contraseña restablecida correctamente.');
    });
  });

  it('should not show password reset for non-admin users', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'docente' } }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    render(<UserManagement />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
});