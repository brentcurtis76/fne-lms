import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useRouter } from 'next/router';
import LoginPage from '../../pages/login';
import ChangePasswordPage from '../../pages/change-password';
import { supabase } from '../../lib/supabase';
import { checkProfileCompletion } from '../../utils/profileUtils';

// Mock dependencies
vi.mock('next/router', () => ({
  useRouter: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
      updateUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('../../utils/profileUtils', () => ({
  checkProfileCompletion: vi.fn(),
}));

describe('Password Reset Flow Integration', () => {
  const mockPush = vi.fn();
  const mockRouter = {
    push: mockPush,
    replace: vi.fn(),
    pathname: '/',
    query: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue(mockRouter);
  });

  describe('Login with password reset required', () => {
    it('should redirect to change-password when password_change_required is true', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      // Mock successful login
      (supabase.auth.signInWithPassword as any).mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      // Mock profile with password_change_required
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { 
          must_change_password: false, 
          password_change_required: true 
        },
        error: null,
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      });

      render(<LoginPage />);

      // Fill in login form
      const emailInput = screen.getByPlaceholderText('tu@email.com');
      const passwordInput = screen.getByPlaceholderText('Ingresa tu contraseña');
      const submitButton = screen.getByText('Iniciar sesión');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'temporaryPassword123');
      await user.click(submitButton);

      // Verify redirect to change-password
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/change-password');
      });

      // Verify profile check was made
      expect(mockSelect).toHaveBeenCalledWith('must_change_password, password_change_required');
      expect(mockEq).toHaveBeenCalledWith('id', mockUser.id);
    });

    it('should redirect to profile if password is OK but profile incomplete', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      // Mock successful login
      (supabase.auth.signInWithPassword as any).mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      // Mock profile without password reset required
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { 
          must_change_password: false, 
          password_change_required: false 
        },
        error: null,
      });

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: mockSingle,
      });

      // Mock incomplete profile
      (checkProfileCompletion as any).mockResolvedValueOnce(false);

      render(<LoginPage />);

      // Fill in login form
      const emailInput = screen.getByPlaceholderText('tu@email.com');
      const passwordInput = screen.getByPlaceholderText('Ingresa tu contraseña');
      const submitButton = screen.getByText('Iniciar sesión');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      // Verify redirect to profile
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/profile');
      });
    });
  });

  describe('Change Password Page', () => {
    it('should show admin reset message when password_reset_by_admin is true', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          user_metadata: {
            password_reset_by_admin: true,
          },
        },
      };

      // Mock session check
      (supabase.auth.getSession as any).mockResolvedValueOnce({
        data: { session: mockSession },
        error: null,
      });

      // Mock profile check
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { 
          must_change_password: false, 
          password_change_required: true 
        },
        error: null,
      });

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: mockSingle,
      });

      render(<ChangePasswordPage />);

      await waitFor(() => {
        expect(screen.getByText(/El administrador ha restablecido tu contraseña/)).toBeInTheDocument();
      });
    });

    it('should update password and clear flags on successful change', async () => {
      const user = userEvent.setup();
      const mockSession = {
        user: {
          id: 'user-123',
          user_metadata: {
            password_reset_by_admin: true,
          },
        },
      };

      // Mock session check
      (supabase.auth.getSession as any).mockResolvedValueOnce({
        data: { session: mockSession },
        error: null,
      });

      // Mock profile checks
      const mockSingle = vi.fn()
        .mockResolvedValueOnce({
          data: { password_change_required: true },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { 
            first_name: 'Test',
            last_name: 'User',
            school: 'Test School'
          },
          error: null,
        });

      const mockUpdate = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockResolvedValueOnce({
        data: null,
        error: null,
      });

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: mockSingle,
        update: mockUpdate,
      });

      mockUpdate.mockReturnValue({ eq: mockEq });

      // Mock password update
      (supabase.auth.updateUser as any).mockResolvedValueOnce({
        error: null,
      });

      render(<ChangePasswordPage />);

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText('Cambio de Contraseña Requerido')).toBeInTheDocument();
      });

      // Fill in password form
      const newPasswordInput = screen.getByLabelText('Nueva Contraseña');
      const confirmPasswordInput = screen.getByLabelText('Confirmar Nueva Contraseña');

      await user.type(newPasswordInput, 'NewSecurePass123!');
      await user.type(confirmPasswordInput, 'NewSecurePass123!');

      // Submit form
      const submitButton = screen.getByText('Cambiar Contraseña');
      await user.click(submitButton);

      // Verify password update was called
      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalledWith({
          password: 'NewSecurePass123!',
        });
      });

      // Verify profile flags were cleared
      expect(mockUpdate).toHaveBeenCalledWith({
        must_change_password: false,
        password_change_required: false,
      });

      // Verify metadata clear was attempted
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        data: {
          password_reset_by_admin: null,
          password_reset_at: null,
        },
      });

      // Verify redirect to dashboard
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    it('should enforce password requirements', async () => {
      const user = userEvent.setup();
      const mockSession = {
        user: { id: 'user-123' },
      };

      // Mock session check
      (supabase.auth.getSession as any).mockResolvedValueOnce({
        data: { session: mockSession },
        error: null,
      });

      // Mock profile check
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { password_change_required: true },
          error: null,
        }),
      });

      render(<ChangePasswordPage />);

      await waitFor(() => {
        expect(screen.getByText('Cambio de Contraseña Requerido')).toBeInTheDocument();
      });

      // Check password requirements are displayed
      expect(screen.getByText('Al menos 8 caracteres')).toBeInTheDocument();
      expect(screen.getByText('Al menos una letra mayúscula')).toBeInTheDocument();
      expect(screen.getByText('Al menos una letra minúscula')).toBeInTheDocument();
      expect(screen.getByText('Al menos un número')).toBeInTheDocument();

      // Type a password to see requirements update
      const newPasswordInput = screen.getByLabelText('Nueva Contraseña');
      
      // Start with weak password
      await user.type(newPasswordInput, 'weak');
      
      // Only length requirement should not be met
      expect(screen.getByText('Al menos 8 caracteres').className).not.toContain('text-green-600');
      
      // Type a password that meets all requirements
      await user.clear(newPasswordInput);
      await user.type(newPasswordInput, 'StrongPass123');
      
      // All requirements should be met
      await waitFor(() => {
        expect(screen.getByText('Al menos 8 caracteres').className).toContain('text-green-600');
        expect(screen.getByText('Al menos una letra mayúscula').className).toContain('text-green-600');
        expect(screen.getByText('Al menos una letra minúscula').className).toContain('text-green-600');
        expect(screen.getByText('Al menos un número').className).toContain('text-green-600');
      });
    });

    it('should redirect to dashboard if password change not required', async () => {
      const mockSession = {
        user: { id: 'user-123' },
      };

      // Mock session check
      (supabase.auth.getSession as any).mockResolvedValueOnce({
        data: { session: mockSession },
        error: null,
      });

      // Mock profile check - no password change required
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { 
            must_change_password: false,
            password_change_required: false 
          },
          error: null,
        }),
      });

      render(<ChangePasswordPage />);

      // Should redirect to dashboard
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });
  });
});