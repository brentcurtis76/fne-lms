import { useSupabaseClient } from '@supabase/auth-helpers-react';
/**
 * Enhanced Test Utilities for Complex Integration Tests
 */

import React from 'react';
import { render, RenderOptions, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useRouter } from 'next/router';

import { toast } from 'react-hot-toast';

// Re-export everything from existing test utils
export * from './test-utils';
export * from './test-factories';
export * from './supabase-mock-builder';

// Enhanced setup for integration tests
export const setupIntegrationTest = () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    reload: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
    route: '/',
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    beforePopState: vi.fn(),
    prefetch: vi.fn(),
    isReady: true,
    isPreview: false,
    isLocaleDomain: false,
  };

  // Setup router mock
  vi.mocked(useRouter).mockReturnValue(router as any);

  // Clear all mocks
  vi.clearAllMocks();

  // Reset toast mocks
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.loading).mockClear();

  return {
    router,
    supabase: vi.mocked(supabase),
    toast: vi.mocked(toast),
  };
};

// Wrapper component for tests that need providers
export const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabase = useSupabaseClient();
  return <>{children}</>;
};

// Enhanced render with automatic async handling
export const renderWithProviders = async (
  ui: React.ReactElement,
  options?: RenderOptions
) => {
  let result: any;
  
  await act(async () => {
    result = render(ui, {
      wrapper: TestWrapper,
      ...options,
    });
  });

  // Wait for any initial async operations
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  return result;
};

// Helper for waiting for loading states to resolve
export const waitForLoadingToFinish = async (
  getByText: (text: string | RegExp) => HTMLElement
) => {
  await waitFor(() => {
    expect(() => getByText(/cargando/i)).toThrow();
  }, { timeout: 5000 });
};

// Helper for mocking fetch responses
export const mockFetchResponse = (response: any, options: { ok?: boolean; status?: number } = {}) => {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => response,
    text: async () => JSON.stringify(response),
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
  } as Response);
};

// Helper for setting up authenticated user
export const setupAuthenticatedUser = (userOverrides = {}, sessionOverrides = {}) => {
  const user = {
    id: 'test-user-123',
    email: 'test@example.com',
    ...userOverrides
  };

  const session = {
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
    ...sessionOverrides
  };

  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session },
    error: null
  });

  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user },
    error: null
  });

  return { user, session };
};

// Helper for async form submissions
export const submitForm = async (onSubmit: () => void | Promise<void>) => {
  let submitPromise: Promise<void>;
  
  await act(async () => {
    submitPromise = Promise.resolve(onSubmit());
  });

  await act(async () => {
    await submitPromise!;
  });

  // Wait for any state updates
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
};