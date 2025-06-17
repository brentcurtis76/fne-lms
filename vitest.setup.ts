import '@testing-library/jest-dom';
import 'dotenv/config';
import { vi } from 'vitest';

// Support legacy `jest` global usage in tests
globalThis.jest = vi as any;

// Set up test environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
