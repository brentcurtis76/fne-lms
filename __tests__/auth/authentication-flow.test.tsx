/**
 * Comprehensive authentication flow tests
 * Run with: npm test __tests__/auth/authentication-flow.test.tsx
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, test } from 'vitest';
import { SessionContextProvider, useSupabaseClient } from '@supabase/auth-helpers-react';
import Router from 'next/router'; // Mocked below
import { AuthProvider } from '../../contexts/AuthContext';
// The real Login page pulls in many dependencies (Supabase env checks, etc.)
// We mock it below with a lightweight form that just calls useAuth.
import Dashboard from '../../pages/dashboard';
import { useAuth } from '../../contexts/AuthContext';

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn()
}));

vi.mock('../../pages/dashboard', () => ({
  default: () => <div>Dashboard</div>,
}));

const TestLogin = () => {
  const supabase = useSupabaseClient();
  const { error, loading } = useAuth(); // Get error/loading state from the provider
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(false);

  const handleLogin = async (e: any) => {
    e.preventDefault();
    if (rememberMe) {
      localStorage.setItem('rememberMe', 'true');
    }
    // This simulates the real login page's behavior
    await supabase.auth.signInWithPassword({ email, password });
  };

  return (
    <form onSubmit={handleLogin}>
      <input type="email" placeholder="correo" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input type="checkbox" aria-label="Recordarme" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
      <button type="submit" disabled={loading}>Iniciar sesión</button>
      {error && <div>{error}</div>}
    </form>
  );
};
vi.mock('../../pages/login', () => ({
  default: TestLogin,
}));

// Mock next/router
vi.mock('next/router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    pathname: '/',
    query: {},
    asPath: '/',
  }),
  Router: {
    push: mockRouterPush,
  },
}));

// Mock Supabase client
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    refreshSession: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(),
        limit: vi.fn(() => ({ data: [], error: null })),
      })),
      order: vi.fn(() => ({ data: [], error: null })),
    })),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  })),
};

describe('Authentication Flow Tests', () => {
  const testRoles = [
    { email: 'admin@test.com', password: 'Test123!', role: 'admin' },
    { email: 'consultor@test.com', password: 'Test123!', role: 'consultor' },
    { email: 'director@test.com', password: 'Test123!', role: 'equipo_directivo' },
    { email: 'lider_gen@test.com', password: 'Test123!', role: 'lider_generacion' },
    { email: 'lider_com@test.com', password: 'Test123!', role: 'lider_comunidad' },
    { email: 'docente@test.com', password: 'Test123!', role: 'docente' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    // Reset localStorage
    localStorage.clear();
  });

  describe('Login Flow', () => {
    testRoles.forEach(({ email, password, role }) => {
      test(`should successfully login as ${role}`, async () => {
        // Mock successful login
        mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
          data: {
            user: { id: '123', email },
            session: {
              access_token: 'mock-token',
              refresh_token: 'mock-refresh',
              expires_at: Date.now() + 3600000,
            },
          },
          error: null,
        });

        // Mock profile fetch
        mockSupabase.from().select().eq().single.mockResolvedValueOnce({
          data: {
            id: '123',
            email,
            role, // Legacy role field
            first_name: 'Test',
            last_name: 'User',
          },
          error: null,
        });

        const { container } = render(
          <SessionContextProvider supabaseClient={mockSupabase as any}>
            <AuthProvider>
              <TestLogin />
            </AuthProvider>
          </SessionContextProvider>
        );

        // Fill in login form
        const emailInput = screen.getByPlaceholderText(/correo/i);
        const passwordInput = screen.getByPlaceholderText(/contraseña/i);
        const loginButton = screen.getByRole('button', { name: /iniciar sesión/i });

        fireEvent.change(emailInput, { target: { value: email } });
        fireEvent.change(passwordInput, { target: { value: password } });
        fireEvent.click(loginButton);

        // Verify login was called
        await waitFor(() => {
          expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
            email,
            password,
          });
        });

        // Verify redirect to dashboard
        await waitFor(() => {
          expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
        });
      });
    });

    test('should handle "Remember Me" functionality', async () => {
      const { container } = render(
        <SessionContextProvider supabaseClient={mockSupabase as any}>
          <AuthProvider>
            <TestLogin />
          </AuthProvider>
        </SessionContextProvider>
      );

      const rememberMeCheckbox = screen.getByLabelText('Recordarme');
      
      // Check the checkbox
      fireEvent.click(rememberMeCheckbox);
      expect(rememberMeCheckbox).toBeChecked();

      // Login with remember me
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: '123', email: 'test@test.com' },
          session: { access_token: 'token', refresh_token: 'refresh', expires_at: Date.now() + 3600000 },
        },
        error: null,
      });

      const loginButton = screen.getByRole('button', { name: /iniciar sesión/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(localStorage.getItem('rememberMe')).toBe('true');
      });
    });
  });

  describe('Session Persistence', () => {
    test('should maintain session across page refreshes', async () => {
      // Mock existing session
      mockSupabase.auth.getSession.mockResolvedValueOnce({
        data: {
          session: {
            user: { id: '123', email: 'admin@test.com' },
            access_token: 'valid-token',
            refresh_token: 'valid-refresh',
            expires_at: Date.now() + 3600000,
          },
        },
        error: null,
      });

      const { rerender } = render(
        <SessionContextProvider supabaseClient={mockSupabase as any}>
          <AuthProvider>
            <Dashboard />
          </AuthProvider>
        </SessionContextProvider>
      );

      // Verify session is loaded
      await waitFor(() => {
        expect(mockSupabase.auth.getSession).toHaveBeenCalled();
      });

      // Simulate page refresh
      rerender(
        <SessionContextProvider supabaseClient={mockSupabase as any}>
          <AuthProvider>
            <Dashboard />
          </AuthProvider>
        </SessionContextProvider>
      );

      // Session should still be valid
      await waitFor(() => {
        expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(2);
      });
    });

    test('should handle token refresh before expiry', async () => {
      // Mock session near expiry (4 minutes left)
      const nearExpiryTime = Date.now() + (4 * 60 * 1000);
      
      mockSupabase.auth.getSession.mockResolvedValueOnce({
        data: {
          session: {
            user: { id: '123', email: 'test@test.com' },
            access_token: 'old-token',
            refresh_token: 'refresh-token',
            expires_at: nearExpiryTime / 1000,
          },
        },
        error: null,
      });

      // Mock refresh session
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: {
          session: {
            user: { id: '123', email: 'test@test.com' },
            access_token: 'new-token',
            refresh_token: 'new-refresh',
            expires_at: (Date.now() + 3600000) / 1000,
          },
        },
        error: null,
      });

      render(
        <SessionContextProvider supabaseClient={mockSupabase as any}>
          <AuthProvider>
            <Dashboard />
          </AuthProvider>
        </SessionContextProvider>
      );

      // Wait for potential refresh
      await waitFor(() => {
        expect(mockSupabase.auth.refreshSession).toHaveBeenCalled();
      }, { timeout: 5000 });
    });
  });

  describe('Logout Flow', () => {
    test('should successfully logout and clear session', async () => {
      // Mock active session
      mockSupabase.auth.getSession.mockResolvedValueOnce({
        data: {
          session: {
            user: { id: '123', email: 'test@test.com' },
            access_token: 'token',
            refresh_token: 'refresh',
            expires_at: Date.now() + 3600000,
          },
        },
        error: null,
      });

      mockSupabase.auth.signOut.mockResolvedValueOnce({ error: null });

      const LogoutComponent = () => {
        const { logout } = useAuth();
        return <button onClick={logout}>Logout</button>;
      };

      render(
        <SessionContextProvider supabaseClient={mockSupabase as any}>
          <AuthProvider>
            <LogoutComponent />
          </AuthProvider>
        </SessionContextProvider>
      );

      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockSupabase.auth.signOut).toHaveBeenCalled();
        expect(localStorage.getItem('rememberMe')).toBeNull();
        expect(mockRouterPush).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      mockSupabase.auth.signInWithPassword.mockRejectedValueOnce(
        new Error('Network error')
      );

      render(
        <SessionContextProvider supabaseClient={mockSupabase as any}>
          <AuthProvider>
            <TestLogin />
          </AuthProvider>
        </SessionContextProvider>
      );

      const loginButton = screen.getByRole('button', { name: /iniciar sesión/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText(/Error al iniciar sesión: Network error/i)).toBeInTheDocument();
      });
    });

    test('should handle invalid credentials', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      render(
        <SessionContextProvider supabaseClient={mockSupabase as any}>
          <AuthProvider>
            <TestLogin />
          </AuthProvider>
        </SessionContextProvider>
      );

      const loginButton = screen.getByRole('button', { name: /iniciar sesión/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText(/Correo o contraseña incorrectos/i)).toBeInTheDocument();
      });
    });
  });
});
