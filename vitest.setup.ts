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

// NOTE: Canvas module handling for tests
// Canvas is an optional peer dependency of jsdom and html2canvas. In test environments,
// we intentionally do NOT install the canvas module because:
//
// 1. vi.mock() cannot intercept native binary loading - Node.js loads canvas.node before Vitest can mock it
// 2. The native canvas binary frequently has Node.js version mismatches causing "Module did not self-register" errors
// 3. html2canvas and jsdom gracefully degrade without canvas - tests run fine
// 4. Production/staging environments can install canvas if server-side PDF/image generation is needed
//
// To test canvas-dependent features, mock html2canvas or the specific component methods rather
// than trying to mock the native canvas module itself.

// Store original implementations to restore after each test
const originalGlobals: {
  window?: {
    location?: PropertyDescriptor;
    screen?: PropertyDescriptor;
    innerWidth?: PropertyDescriptor;
    innerHeight?: PropertyDescriptor;
    navigator?: PropertyDescriptor;
  };
  document?: {
    referrer?: PropertyDescriptor;
  };
} = {};

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Reset any fake timers
  vi.useRealTimers();

  // Save original browser API implementations before mocking
  if (typeof window !== 'undefined') {
    originalGlobals.window = {
      location: Object.getOwnPropertyDescriptor(window, 'location'),
      screen: Object.getOwnPropertyDescriptor(window, 'screen'),
      innerWidth: Object.getOwnPropertyDescriptor(window, 'innerWidth'),
      innerHeight: Object.getOwnPropertyDescriptor(window, 'innerHeight'),
      navigator: Object.getOwnPropertyDescriptor(window, 'navigator')
    };

    // Mock window.location and other browser APIs after jsdom initializes
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
    originalGlobals.document = {
      referrer: Object.getOwnPropertyDescriptor(document, 'referrer')
    };

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

  // Restore original browser API implementations
  if (typeof window !== 'undefined' && originalGlobals.window) {
    if (originalGlobals.window.location) {
      Object.defineProperty(window, 'location', originalGlobals.window.location);
    }
    if (originalGlobals.window.screen) {
      Object.defineProperty(window, 'screen', originalGlobals.window.screen);
    }
    if (originalGlobals.window.innerWidth) {
      Object.defineProperty(window, 'innerWidth', originalGlobals.window.innerWidth);
    }
    if (originalGlobals.window.innerHeight) {
      Object.defineProperty(window, 'innerHeight', originalGlobals.window.innerHeight);
    }
    if (originalGlobals.window.navigator) {
      Object.defineProperty(window, 'navigator', originalGlobals.window.navigator);
    }
  }

  if (typeof document !== 'undefined' && originalGlobals.document?.referrer) {
    Object.defineProperty(document, 'referrer', originalGlobals.document.referrer);
  }
});
// Mock canvas to avoid native bindings loading in test envs
vi.mock('canvas', () => {
  class CanvasRenderingContext2DMock {
    fillRect() {}
    clearRect() {}
    getImageData() {
      return { data: [] };
    }
    putImageData() {}
    createImageData() {
      return [];
    }
    setTransform() {}
    drawImage() {}
    save() {}
    fillText() {}
    restore() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    stroke() {}
    translate() {}
    scale() {}
    rotate() {}
    arc() {}
    fill() {}
    measureText() {
      return { width: 0 };
    }
    transform() {}
    rect() {}
    clip() {}
  }

  class CanvasMock {
    width = 0;
    height = 0;
    getContext() {
      return new CanvasRenderingContext2DMock();
    }
    toBuffer() {
      return Buffer.from([]);
    }
    createPNGStream() {
      return Buffer.from([]);
    }
    toDataURL() {
      return '';
    }
  }

  class ImageMock {
    src = '';
  }

  function createCanvas(width: number, height: number) {
    const canvas = new CanvasMock();
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function loadImage() {
    return Promise.resolve(new ImageMock());
  }

  return {
    Canvas: CanvasMock,
    Image: ImageMock,
    createCanvas,
    loadImage,
    default: {
      Canvas: CanvasMock,
      Image: ImageMock,
      createCanvas,
      loadImage,
    },
  };
});
