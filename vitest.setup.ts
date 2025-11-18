import '@testing-library/jest-dom';
import 'dotenv/config';
import { vi, afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Support legacy `jest` global usage in tests
globalThis.jest = vi as any;

// Set up test environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock Next.js router
vi.mock('next/router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    pathname: '/test',
    query: {},
    asPath: '/test'
  })
}));

// Mock react-hot-toast
const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
  promise: vi.fn(),
  custom: vi.fn()
};

vi.mock('react-hot-toast', () => ({
  default: toastMock,
  toast: toastMock,
  Toaster: () => null
}));


// Mock FileReader with immediate callback
if (typeof FileReader === 'undefined') {
  (global as any).FileReader = class MockFileReader {
    result: string = 'data:image/jpeg;base64,mockbase64data';
    onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;

    readAsDataURL(file: Blob) {
      // Immediate execution in next tick to allow React state updates
      Promise.resolve().then(() => {
        if (this.onload) {
          const event = { target: { result: this.result } } as ProgressEvent<FileReader>;
          (this.onload as any).call(this, event);
        }
      });
    }
  };
}

// Mock fetch globally
if (typeof global.fetch === 'undefined') {
  global.fetch = vi.fn();
}

// Import enhanced test utilities
import { createSupabaseMock } from './__tests__/utils/supabase-mock-builder';

// Enhanced Supabase client mock with sophisticated async handling
vi.mock('./lib/supabase', () => {
  // Create a more realistic mock that handles complex async operations
  const createMockQueryBuilder = (defaultData: any = [], defaultError: any = null) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockImplementation(() => 
          Promise.resolve({ data: defaultData, error: defaultError })
        ),
        order: vi.fn().mockImplementation(() => 
          Promise.resolve({ data: Array.isArray(defaultData) ? defaultData : [defaultData], error: defaultError })
        )
      }),
      in: vi.fn().mockImplementation(() => 
        Promise.resolve({ data: Array.isArray(defaultData) ? defaultData : [defaultData], error: defaultError })
      ),
      order: vi.fn().mockImplementation(() => 
        Promise.resolve({ data: Array.isArray(defaultData) ? defaultData : [defaultData], error: defaultError })
      )
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockImplementation(() => 
          Promise.resolve({ data: { id: 'test-id-123', ...defaultData }, error: defaultError })
        )
      }),
      then: vi.fn().mockImplementation(() => 
        Promise.resolve({ data: { id: 'test-id-123', ...defaultData }, error: defaultError })
      )
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation(() => 
        Promise.resolve({ data: defaultData, error: defaultError })
      )
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation(() => 
        Promise.resolve({ data: null, error: defaultError })
      ),
      in: vi.fn().mockImplementation(() => 
        Promise.resolve({ data: null, error: defaultError })
      )
    })
  });

  const mockSupabaseClient = {
    auth: {
      getUser: vi.fn().mockImplementation(() => 
        Promise.resolve({
          data: { user: { id: 'test-user', email: 'test@example.com' } },
          error: null
        })
      ),
      getSession: vi.fn().mockImplementation(() => 
        Promise.resolve({
          data: { session: { user: { id: 'test-user', email: 'test@example.com' } } },
          error: null
        })
      ),
      signInWithPassword: vi.fn().mockImplementation(() => 
        Promise.resolve({
          data: { user: { id: 'test-user' } },
          error: null
        })
      ),
      signOut: vi.fn().mockImplementation(() => 
        Promise.resolve({ error: null })
      ),
      admin: {
        createUser: vi.fn().mockImplementation(() => 
          Promise.resolve({ data: { user: { id: 'new-user' } }, error: null })
        ),
        deleteUser: vi.fn().mockImplementation(() => 
          Promise.resolve({ error: null })
        )
      }
    },
    from: vi.fn().mockImplementation((table: string) => {
      // Return different mock data based on table
      switch (table) {
        case 'profiles':
          return createMockQueryBuilder({ 
            first_name: 'Test', 
            last_name: 'User', 
            email: 'test@example.com',
            role: 'admin' 
          });
        case 'platform_feedback':
          return {
            ...createMockQueryBuilder([]),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'test-feedback-id',
                    description: 'Test feedback',
                    type: 'feedback',
                    created_at: new Date().toISOString(),
                    created_by: 'test-user'
                  },
                  error: null
                })
              })
            })
          };
        case 'feedback_activity':
          return createMockQueryBuilder([]);
        case 'feedback_stats':
          return createMockQueryBuilder({
            new_count: 0,
            seen_count: 0,
            in_progress_count: 0,
            resolved_count: 0,
            bug_count: 0,
            idea_count: 0,
            feedback_count: 0
          });
        default:
          return createMockQueryBuilder([]);
      }
    }),
    storage: {
      from: vi.fn().mockImplementation(() => ({
        upload: vi.fn().mockImplementation(() => 
          Promise.resolve({
            data: { path: 'test/path.jpg' },
            error: null
          })
        ),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://test.com/image.jpg' }
        }),
        remove: vi.fn().mockImplementation(() => 
          Promise.resolve({ error: null })
        ),
        listBuckets: vi.fn().mockImplementation(() => 
          Promise.resolve({
            data: [{ id: 'feedback-screenshots', public: true }],
            error: null
          })
        )
      }))
    },
    rpc: vi.fn().mockImplementation(() => 
      Promise.resolve({ data: [], error: null })
    )
  };

  return {
    supabase: mockSupabaseClient
  };
});

// Mock notification service
vi.mock('./lib/notificationService', () => ({
  default: {
    triggerNotification: vi.fn().mockResolvedValue({
      success: true,
      notificationsCreated: 1
    })
  }
}));

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Reset any fake timers
  vi.useRealTimers();

  // Mock window.location and other browser APIs after jsdom initializes
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://test.example.com/page',
        search: '',
        pathname: '/page'
      },
      writable: true,
      configurable: true
    });

    Object.defineProperty(window, 'screen', {
      value: {
        width: 1920,
        height: 1080
      },
      configurable: true
    });

    Object.defineProperty(window, 'innerWidth', {
      value: 1200,
      writable: true,
      configurable: true
    });

    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
      configurable: true
    });

    Object.defineProperty(window, 'navigator', {
      value: {
        userAgent: 'Test User Agent',
        language: 'en-US',
        platform: 'Test Platform'
      },
      configurable: true
    });
  }

  if (typeof document !== 'undefined') {
    Object.defineProperty(document, 'referrer', {
      value: 'https://test.example.com',
      writable: true,
      configurable: true
    });
  }
});

// Runs a cleanup after each test case (e.g., clearing jsdom)
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
