import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import LoginPage from '../../pages/login';
import ChangePasswordPage from '../../pages/change-password';
import { checkProfileCompletionSimple } from '../../utils/profileCompletionCheck';

// Use vi.hoisted to create the mock object before any imports or mocks
const { mockSupabase, mockRouterPush } = vi.hoisted(() => {
  const mockPush = vi.fn();

  const mockSupabaseClient = {
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
      updateUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
      })),
    },
  };

  return {
    mockSupabase: mockSupabaseClient,
    mockRouterPush: mockPush,
  };
});

vi.mock('../../utils/profileCompletionCheck', () => ({
  checkProfileCompletionSimple: vi.fn(),
}));

const mockProfileCompletion = checkProfileCompletionSimple as unknown as vi.Mock;

vi.mock('next/router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    pathname: '/',
    query: {},
  }),
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => mockSupabase,
  useSession: vi.fn(() => null),
}));

(globalThis as any).React = React;

// Increase timeout for this suite
vi.setConfig({ testTimeout: 10000 });

// Helper to create a chainable query builder mock
const createQueryBuilder = (singleResult: any = { data: null, error: null }) => {
  const builder: any = {};

  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue(singleResult);
  builder.maybeSingle = vi.fn().mockResolvedValue(singleResult);
  builder.update = vi.fn().mockReturnValue(builder);

  return builder;
};

const waitForLoginForm = async () => {
  // Wait for spinner to disappear
  await waitFor(() =>
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()
  ).catch(() => {
    // Fallback if test id not present, look for text
    return waitFor(() =>
      expect(screen.queryByText('Verificando sesión...')).not.toBeInTheDocument()
    );
  });
};

// Smarter mock that responds based on selected columns
const setupProfilesQuery = (authCheckResponse: any, profileCheckResponse: any = null) => {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      const builder: any = {};
      let selectedColumns = '';

      builder.select = vi.fn().mockImplementation((cols) => {
        selectedColumns = cols || '';
        return builder;
      });

      builder.eq = vi.fn().mockReturnValue(builder);

      builder.single = vi.fn().mockImplementation(() => {
        // If checking for password requirement (select('must_change_password'))
        if (selectedColumns.includes('must_change_password')) {
          return Promise.resolve(authCheckResponse);
        }
        // If checking for profile completion (select('first_name, last_name, school'))
        if (profileCheckResponse && (selectedColumns.includes('first_name') || selectedColumns.includes('school'))) {
          return Promise.resolve(profileCheckResponse);
        }
        // Default fallback
        return Promise.resolve({ data: null, error: null });
      });

      builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

      // For update, we need to return a builder that has eq()
      const updateBuilder: any = {};
      updateBuilder.eq = vi.fn().mockResolvedValue({ data: null, error: null });

      builder.update = vi.fn().mockReturnValue(updateBuilder);

      return builder;
    }
    return createQueryBuilder();
  });
};

describe('Password Reset Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterPush.mockReset();
    mockSupabase.auth.signInWithPassword.mockReset();
    mockSupabase.auth.getSession.mockReset();
    mockSupabase.auth.updateUser.mockReset();
    mockSupabase.auth.signOut.mockReset();
    mockSupabase.from.mockReset();
    mockSupabase.storage.from.mockClear();
    mockProfileCompletion.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    // Default session (not logged in)
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    // Default query builder
    mockSupabase.from.mockImplementation(() => createQueryBuilder());
  });

  describe('Login with password reset required', () => {
    it('redirects to change-password when password_change_required is true', async () => {
      const user = userEvent.setup();
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      setupProfilesQuery({
        data: { must_change_password: true },
        error: null,
      });

      render(<LoginPage />);
      await waitForLoginForm();

      const emailInput = await screen.findByPlaceholderText('tu@email.com');
      const passwordInput = await screen.findByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'temporaryPassword123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/change-password');
      });
    });

    it('redirects to profile if password is OK but profile incomplete', async () => {
      const user = userEvent.setup();
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      setupProfilesQuery({
        data: { must_change_password: false, password_change_required: false },
        error: null,
      });

      mockProfileCompletion.mockResolvedValueOnce(false);

      render(<LoginPage />);
      await waitForLoginForm();

      const emailInput = await screen.findByPlaceholderText('tu@email.com');
      const passwordInput = await screen.findByPlaceholderText('••••••••');
      const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/profile?from=login');
      });
    });
  });

  describe('Change Password Page', () => {
    const renderChangePassword = async () => {
      render(<ChangePasswordPage />);

      // Wait for the initial auth check to complete
      await waitFor(() =>
        expect(mockSupabase.auth.getSession).toHaveBeenCalled()
      );

      // Wait for loading spinner to disappear
      await screen.findByText('Cambio de Contraseña Requerido', {}, { timeout: 3000 });
    };

    it('shows admin reset message when password_reset_by_admin is true', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          user_metadata: { password_reset_by_admin: true },
        },
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      setupProfilesQuery({
        data: { must_change_password: true },
        error: null,
      });

      await renderChangePassword();

      await waitFor(() => {
        expect(
          screen.getByText(/El administrador ha restablecido tu contraseña/)
        ).toBeInTheDocument();
      });
    });

    it('updates password and clears flags on successful change', async () => {
      const user = userEvent.setup();
      const mockSession = {
        user: {
          id: 'user-123',
          user_metadata: { password_reset_by_admin: true },
        },
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      setupProfilesQuery(
        // Auth check response
        { data: { must_change_password: true }, error: null },
        // Profile completion check response
        { data: { first_name: 'Test', last_name: 'User', school: 'Test School' }, error: null }
      );

      mockSupabase.auth.updateUser
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: null });

      await renderChangePassword();

      // Use real timers and simple wait
      const newPasswordInput = await screen.findByLabelText('Nueva Contraseña');
      const confirmPasswordInput = screen.getByLabelText('Confirmar Nueva Contraseña');
      const submitButton = screen.getByRole('button', { name: 'Cambiar Contraseña' });

      await user.type(newPasswordInput, 'NewSecurePass123!');
      await user.type(confirmPasswordInput, 'NewSecurePass123!');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSupabase.auth.updateUser).toHaveBeenNthCalledWith(1, {
          password: 'NewSecurePass123!',
        });
      });

      await waitFor(() => {
        expect(mockSupabase.auth.updateUser).toHaveBeenCalledTimes(2);
      });

      expect(mockSupabase.auth.updateUser).toHaveBeenNthCalledWith(2, {
        data: {
          password_reset_by_admin: null,
          password_reset_at: null,
        },
      });

      // Wait for redirect (it has a 1s timeout in component)
      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
      }, { timeout: 2000 });
    });

    it('enforces password requirements', async () => {
      const user = userEvent.setup();
      const mockSession = { user: { id: 'user-123' } };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      setupProfilesQuery({
        data: { must_change_password: true },
        error: null,
      });

      await renderChangePassword();

      const newPasswordInput = await screen.findByLabelText('Nueva Contraseña');

      await user.type(newPasswordInput, 'weak');
      expect(screen.getByText('Al menos 8 caracteres').className).not.toContain(
        'text-green-600'
      );

      await user.clear(newPasswordInput);
      await user.type(newPasswordInput, 'StrongPass123');

      await waitFor(() => {
        expect(screen.getByText('Al menos 8 caracteres').className).toContain(
          'text-green-600'
        );
        expect(
          screen.getByText('Al menos una letra mayúscula').className
        ).toContain('text-green-600');
        expect(
          screen.getByText('Al menos una letra minúscula').className
        ).toContain('text-green-600');
        expect(
          screen.getByText('Al menos un número').className
        ).toContain('text-green-600');
      });
    });

    it('redirects to dashboard if password change not required', async () => {
      const mockSession = { user: { id: 'user-123' } };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      setupProfilesQuery({
        data: { must_change_password: false },
        error: null,
      });

      render(<ChangePasswordPage />);

      await waitFor(() =>
        expect(mockSupabase.auth.getSession).toHaveBeenCalled()
      );

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
      });
    });
  });
});
