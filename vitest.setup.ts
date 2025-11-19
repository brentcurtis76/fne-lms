import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Set up test environment variables
// These are used by Supabase client initialization in tests
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

// Mock the 'canvas' module globally.
// This prevents the "Module did not self-register" error by replacing the native
// canvas dependency with a simple object during tests.
vi.mock('canvas', () => ({}));

// Some components (e.g. DocumentPreview) depend on react-pdf, which internally
// pulls in pdfjs-dist and the native canvas bindings. We mock react-pdf at the
// setup level so that any import resolves to lightweight stubs and never tries
// to touch the native module.
vi.mock('react-pdf', () => ({
  Document: () => null,
  Page: () => null,
  pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: ''
    }
  }
}));

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: any) => children ?? null,
  Page: () => null,
  Text: () => null,
  View: ({ children }: any) => children ?? null,
  StyleSheet: {
    create: () => ({}),
  },
  Font: {
    register: vi.fn(),
  },
}));

vi.mock('react-pdf/dist/esm/Page/AnnotationLayer.css', () => ({}));
vi.mock('react-pdf/dist/esm/Page/TextLayer.css', () => ({}));
