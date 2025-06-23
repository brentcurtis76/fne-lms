import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useRouter } from 'next/router';
import UserManagement from '../user-management';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';

// Mock dependencies
vi.mock('next/router', () => ({
  useRouter: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock fetch for API calls
global.fetch = vi.fn();

describe('User Management - Password Reset Feature', () => {
  const mockPush = vi.fn();
  const mockRouter = {
    push: mockPush,
    pathname: '/admin/user-management',
    query: {},
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
      role: 'docente',
      school: 'Test School',
      created_at: '2024-01-01',
      approval_status: 'approved',
      user_roles: [],
    },
    {
      id: 'user-2',
      email: 'user2@example.com',
      first_name: 'Jane',
      last_name: 'Smith',
      role: 'docente',
      school: 'Test School',
      created_at: '2024-01-02',
      approval_status: 'pending',
      user_roles: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue(mockRouter);
    
    // Mock admin session
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: mockAdminSession },
      error: null,
    });

    // Mock admin profile
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { 
          role: 'admin',
          first_name: 'Admin',
          last_name: 'User',
        },
        error: null,
      }),
      order: vi.fn().mockReturnThis(),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return mockFrom();
      }
      if (table === 'users_detailed_view') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockUsers,
            error: null,
          }),
        };
      }
      return mockFrom();
    });
  });

  it('should show password reset button only for approved users', async () => {
    render(<UserManagement />);

    // Wait for users to load
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    // Password reset button should be visible for approved user
    const approvedUserRow = screen.getByText('John Doe').closest('tr');
    const resetButton = approvedUserRow?.querySelector('button[title="Restablecer contraseña"]');
    expect(resetButton).toBeInTheDocument();

    // Password reset button should NOT be visible for pending user
    const pendingUserRow = screen.getByText('Jane Smith').closest('tr');
    const pendingResetButton = pendingUserRow?.querySelector('button[title="Restablecer contraseña"]');
    expect(pendingResetButton).not.toBeInTheDocument();
  });

  it('should open password reset modal when reset button is clicked', async () => {
    const user = userEvent.setup();
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click password reset button
    const resetButton = screen.getByTitle('Restablecer contraseña');
    await user.click(resetButton);

    // Modal should appear
    expect(screen.getByText('Restablecer Contraseña')).toBeInTheDocument();
    expect(screen.getByText('Usuario:')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('user1@example.com')).toBeInTheDocument();
  });

  it('should successfully reset password through API', async () => {
    const user = userEvent.setup();
    
    // Mock successful API response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Open modal
    const resetButton = screen.getByTitle('Restablecer contraseña');
    await user.click(resetButton);

    // Fill in password
    const passwordInput = screen.getByLabelText('Contraseña Temporal');
    const confirmInput = screen.getByLabelText('Confirmar Contraseña');
    
    await user.type(passwordInput, 'TempPass123!');
    await user.type(confirmInput, 'TempPass123!');

    // Submit
    const submitButton = screen.getByRole('button', { name: 'Restablecer Contraseña' });
    await user.click(submitButton);

    // Verify API call
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
        body: JSON.stringify({
          userId: 'user-1',
          temporaryPassword: 'TempPass123!',
        }),
      });
    });

    // Verify success toast
    expect(toast.success).toHaveBeenCalledWith('Contraseña restablecida correctamente');

    // Modal should close
    await waitFor(() => {
      expect(screen.queryByText('Restablecer Contraseña')).not.toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    const user = userEvent.setup();
    
    // Mock failed API response
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Failed to reset password' }),
    });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Open modal
    const resetButton = screen.getByTitle('Restablecer contraseña');
    await user.click(resetButton);

    // Fill in password
    const passwordInput = screen.getByLabelText('Contraseña Temporal');
    const confirmInput = screen.getByLabelText('Confirmar Contraseña');
    
    await user.type(passwordInput, 'TempPass123!');
    await user.type(confirmInput, 'TempPass123!');

    // Submit
    const submitButton = screen.getByRole('button', { name: 'Restablecer Contraseña' });
    await user.click(submitButton);

    // Verify error toast
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error al restablecer la contraseña');
    });

    // Modal should remain open
    expect(screen.getByText('Restablecer Contraseña')).toBeInTheDocument();
  });

  it('should generate random password when button is clicked', async () => {
    const user = userEvent.setup();
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Open modal
    const resetButton = screen.getByTitle('Restablecer contraseña');
    await user.click(resetButton);

    // Click generate password
    const generateButton = screen.getByText('Generar contraseña aleatoria');
    await user.click(generateButton);

    // Check that passwords are filled
    const passwordInput = screen.getByLabelText('Contraseña Temporal') as HTMLInputElement;
    const confirmInput = screen.getByLabelText('Confirmar Contraseña') as HTMLInputElement;
    
    expect(passwordInput.value).toHaveLength(12);
    expect(confirmInput.value).toHaveLength(12);
    expect(passwordInput.value).toEqual(confirmInput.value);
  });

  it('should not show password reset for non-admin users', async () => {
    // Mock non-admin session
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { 
              role: 'docente', // Non-admin role
              first_name: 'Teacher',
              last_name: 'User',
            },
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
    });

    render(<UserManagement />);

    // Should redirect to dashboard
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
});