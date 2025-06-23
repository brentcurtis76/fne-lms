/**
 * Test utilities for feedback system
 */

export const mockFeedback = {
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
    language: 'en-US',
    screenResolution: '1920x1080',
    viewport: '1200x800',
    referrer: 'https://example.com'
  },
  screenshot_url: 'https://example.com/screenshot.jpg',
  screenshot_filename: 'screenshot.jpg',
  created_by: 'user-123',
  created_at: '2025-01-23T10:00:00Z',
  updated_at: '2025-01-23T10:00:00Z',
  resolved_at: null,
  resolution_notes: null,
  profiles: {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com'
  }
};

export const mockFeedbackActivity = {
  id: 'activity-123',
  feedback_id: 'feedback-123',
  message: 'Test activity message',
  is_system_message: false,
  created_by: 'user-123',
  created_at: '2025-01-23T10:05:00Z',
  profiles: {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com'
  }
};

export const mockUser = {
  id: 'user-123',
  email: 'john@example.com',
  user_metadata: {
    first_name: 'John',
    last_name: 'Doe'
  }
};

export const mockAdminUser = {
  id: 'admin-123',
  email: 'admin@example.com',
  user_metadata: {
    first_name: 'Admin',
    last_name: 'User'
  }
};

export const mockProfile = {
  id: 'user-123',
  email: 'john@example.com',
  first_name: 'John',
  last_name: 'Doe',
  role: 'docente',
  is_active: true
};

export const mockAdminProfile = {
  id: 'admin-123',
  email: 'admin@example.com',
  first_name: 'Admin',
  last_name: 'User',
  role: 'admin',
  is_active: true
};

export const mockFeedbackStats = {
  new_count: 5,
  seen_count: 3,
  in_progress_count: 2,
  resolved_count: 10,
  bug_count: 8,
  idea_count: 7,
  feedback_count: 5
};

export const createMockFile = (name: string, size: number, type: string) => {
  const content = 'x'.repeat(size);
  return new File([content], name, { type });
};

export const mockSupabaseResponse = {
  success: <T>(data: T) => ({ data, error: null }),
  error: (message: string) => ({ data: null, error: { message } }),
  empty: () => ({ data: [], error: null })
};

export const mockFileReader = () => {
  const mockReader = {
    readAsDataURL: jest.fn(),
    onload: null as any,
    result: 'data:image/jpeg;base64,mockbase64data'
  };

  // Mock FileReader implementation
  (global as any).FileReader = jest.fn(() => mockReader);

  return mockReader;
};

export const mockNotificationService = {
  triggerNotification: jest.fn().mockResolvedValue({
    success: true,
    notificationsCreated: 1
  })
};

export const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  loading: jest.fn(),
  dismiss: jest.fn()
};

export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  pathname: '/test',
  query: {},
  asPath: '/test'
};

/**
 * Helper to create a mock Supabase client
 */
export const createMockSupabaseClient = () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      admin: {
        createUser: jest.fn(),
        deleteUser: jest.fn()
      }
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
          order: jest.fn(() => ({
            then: jest.fn()
          }))
        })),
        in: jest.fn(),
        order: jest.fn(),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn()
          }))
        })),
        update: jest.fn(() => ({
          eq: jest.fn()
        })),
        delete: jest.fn(() => ({
          eq: jest.fn(),
          in: jest.fn()
        }))
      }))
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        getPublicUrl: jest.fn(),
        remove: jest.fn(),
        listBuckets: jest.fn()
      }))
    },
    rpc: jest.fn()
  };

  return mockClient;
};

/**
 * Helper to mock successful authentication
 */
export const mockSuccessfulAuth = (client: any, user = mockUser, profile = mockProfile) => {
  client.auth.getUser.mockResolvedValue({
    data: { user },
    error: null
  });

  client.auth.getSession.mockResolvedValue({
    data: { session: { user } },
    error: null
  });

  client.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: profile,
              error: null
            })
          })
        })
      };
    }
    return client.from();
  });
};

/**
 * Helper to mock failed authentication
 */
export const mockFailedAuth = (client: any, errorMessage = 'Not authenticated') => {
  client.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: errorMessage }
  });

  client.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: { message: errorMessage }
  });
};

/**
 * Test data generators
 */
export const generateMockFeedback = (overrides: Partial<typeof mockFeedback> = {}) => ({
  ...mockFeedback,
  ...overrides,
  id: overrides.id || `feedback-${Date.now()}`
});

export const generateMockActivity = (feedbackId: string, overrides: Partial<typeof mockFeedbackActivity> = {}) => ({
  ...mockFeedbackActivity,
  ...overrides,
  id: overrides.id || `activity-${Date.now()}`,
  feedback_id: feedbackId
});

export const generateMockUser = (overrides: Partial<typeof mockUser> = {}) => ({
  ...mockUser,
  ...overrides,
  id: overrides.id || `user-${Date.now()}`
});

/**
 * DOM test helpers
 */
export const findByTextContent = (container: HTMLElement, text: string) => {
  return Array.from(container.querySelectorAll('*')).find(
    element => element.textContent === text
  );
};

export const waitForElementToBeRemoved = async (element: Element) => {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.contains(element)) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
};