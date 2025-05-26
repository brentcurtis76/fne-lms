import '@testing-library/jest-dom';
import 'dotenv/config';
import { vi } from 'vitest';

// Support legacy `jest` global usage in tests
globalThis.jest = vi as any;
