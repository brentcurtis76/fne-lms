/**
 * Enhanced test utilities for 100% test pass rate
 */
import React from 'react';
import { render, RenderOptions, act } from '@testing-library/react';
import { vi } from 'vitest';



// Helper for async state updates
export const waitForStateUpdate = async (fn: () => Promise<void>) => {
  await act(async () => {
    await fn();
  });
};

// Mock data factory
export const createMockFeedback = (overrides: any = {}) => ({
  id: 'feedback-123',
  title: null,
  description: 'Test feedback description',
  type: 'bug' as const,
  status: 'new' as const,
  page_url: 'https://example.com/test',
  user_agent: 'Test User Agent',
  browser_info: {
    userAgent: 'Test User Agent',
    platform: 'Test Platform',
    language: 'en-US'
  },
  screenshot_url: 'http://example.com/screenshot.png',
  screenshot_filename: 'screenshot.png',
  created_by: 'user-123',
  created_at: '2025-01-23T10:00:00Z',
  updated_at: '2025-01-23T10:00:00Z',
  resolved_at: null,
  resolution_notes: null,
  profiles: {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com'
  },
  ...overrides
});

// Mock supabase response helper
export const createMockSupabaseResponse = (data: any, error: any = null) => ({
  data,
  error
});

// Advanced mock setup for complex scenarios
export const setupComplexMocks = () => {
  // Mock successful authentication
  const mockUser = {
    id: 'test-user',
    email: 'test@example.com',
    user_metadata: {
      first_name: 'Test',
      last_name: 'User'
    }
  };

  // Return configuration object
  return {
    mockUser,
    mockProfile: {
      id: 'test-user',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      role: 'admin'
    },
    mockFeedback: createMockFeedback(),
    mockStats: {
      new_count: 1,
      seen_count: 0,
      in_progress_count: 1,
      resolved_count: 2,
      bug_count: 2,
      idea_count: 1,
      feedback_count: 1
    }
  };
};

// File creation helper for upload tests
export const createMockFile = (name: string, size: number, type: string) => {
  const content = 'x'.repeat(size);
  return new File([content], name, { type });
};

// Timer utilities
export const setupTimers = () => {
  vi.useFakeTimers();
  return {
    advanceTime: (ms: number) => {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
    restoreTimers: () => {
      vi.useRealTimers();
    }
  };
};

// Mock event helpers
export const createMockEvent = (type: string, data: any = {}) => {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: { value: '', ...data },
    ...data
  };
};



// Form interaction helper
export const submitFormWithAct = async (form: HTMLElement) => {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

// Error boundary test helper
export const expectNoErrors = (container: HTMLElement) => {
  const errors = container.querySelectorAll('[role="alert"]');
  expect(errors).toHaveLength(0);
};

// Accessibility helpers
export const expectAriaAttribute = (element: HTMLElement, attribute: string, value: string) => {
  expect(element.getAttribute(attribute)).toBe(value);
};

// Custom matchers for better assertions
export const expectToastCalled = (mockToast: any, type: string, message: string) => {
  expect(mockToast[type]).toHaveBeenCalledWith(message);
};

// Component state verification
export const expectElementState = (element: HTMLElement, state: 'enabled' | 'disabled' | 'loading') => {
  switch (state) {
    case 'disabled':
      expect(element).toBeDisabled();
      break;
    case 'enabled':
      expect(element).not.toBeDisabled();
      break;
    case 'loading':
      expect(element).toHaveAttribute('aria-busy', 'true');
      break;
  }
};

// Modal interaction helpers
export const expectModalOpen = (container: HTMLElement) => {
  const modal = container.querySelector('[role="dialog"]');
  expect(modal).toBeInTheDocument();
};

export const expectModalClosed = (container: HTMLElement) => {
  const modal = container.querySelector('[role="dialog"]');
  expect(modal).not.toBeInTheDocument();
};

// Network request simulation
export const simulateNetworkDelay = async (ms: number = 100) => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
};

export default {
  waitForStateUpdate,
  createMockFeedback,
  setupComplexMocks,
  createMockFile,
  setupTimers,
  expectToastCalled,
  expectElementState,
  expectModalOpen,
  expectModalClosed,
  simulateNetworkDelay
};