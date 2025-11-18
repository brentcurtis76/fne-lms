import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { checkProfileCompletion } from '../utils/profileUtils';
import HomePage from '../pages/index';
import { vi, Mock } from 'vitest';

// Mock the next/router
vi.mock('next/router', () => ({
  useRouter: vi.fn(),
}));

// Mock the Supabase client hook
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: vi.fn(),
}));

// Mock the profile utils
vi.mock('../utils/profileUtils', () => ({
  checkProfileCompletion: vi.fn(),
}));

describe('Profile Completion Routing', () => {
  const mockPush = vi.fn();
  const mockGetSession = vi.fn();
  const mockSupabase = {
    auth: {
      getSession: mockGetSession,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup router mock
    (useRouter as Mock).mockReturnValue({
      push: mockPush,
    });
    
    // Setup Supabase client mock
    (useSupabaseClient as Mock).mockReturnValue(mockSupabase);
  });

  test('should redirect to profile page when user is logged in but profile is incomplete', async () => {
    // Mock user is logged in
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'test-user-id' },
        },
      },
    });
    
    // Mock profile is incomplete
    (checkProfileCompletion as Mock).mockResolvedValue(false);
    
    render(<HomePage />);
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/profile');
    });
  });

  test('should redirect to dashboard when user is logged in and profile is complete', async () => {
    // Mock user is logged in
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'test-user-id' },
        },
      },
    });
    
    // Mock profile is complete
    (checkProfileCompletion as Mock).mockResolvedValue(true);
    
    render(<HomePage />);
    
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('should not redirect when user is not logged in', async () => {
    // Mock user is not logged in
    mockGetSession.mockResolvedValue({
      data: {
        session: null,
      },
    });
    
    render(<HomePage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
