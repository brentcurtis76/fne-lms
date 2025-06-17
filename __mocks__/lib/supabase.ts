import { vi } from 'vitest';

export const supabase = {
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: { 
        session: { 
          user: { 
            id: 'test-user-id',
            user_metadata: { role: 'admin' }
          } 
        } 
      }
    }),
    signOut: vi.fn(),
  },
  from: vi.fn(),
};

export const createPagesServerClient = vi.fn(() => supabase);