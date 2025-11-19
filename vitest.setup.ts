import { vi } from 'vitest';
import '@testing-library/jest-dom';


// Mock the 'canvas' module globally.
// This prevents the "Module did not self-register" error by replacing the native
// canvas dependency with a simple object during tests.
vi.mock('canvas', () => ({}));

// Some components (e.g. DocumentPreview) depend on react-pdf, which internally
// pulls in pdfjs-dist and the native canvas bindings. We mock react-pdf at the
// setup level so that any import resolves to lightweight stubs and never tries
// to touch the native module.
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

// Mock 'react-pdf' to prevent it from loading 'pdfjs-dist' and 'canvas'.
// This is a more robust way to avoid the native module crash.
vi.mock('react-pdf', () => ({
  Document: ({ children }) => `<div>{children}</div>`,
  Page: () => `<div></div>`,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));
