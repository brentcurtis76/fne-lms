/**
 * Supabase Wrapper - Temporary compatibility layer
 * 
 * This module provides a way to access Supabase client without creating
 * multiple instances. It reuses the client from _app.tsx to prevent
 * the "Multiple GoTrueClient instances" warning.
 * 
 * TODO: Remove this file once all components are migrated to auth-helpers
 */

import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';

// Create a singleton that matches what _app.tsx creates
// This ensures we use the same instance throughout the app
let supabaseInstance: any = null;

export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    // Server-side: Use auth-helpers for consistency
    return createPagesBrowserClient();
  }

  // Client-side: Create singleton that matches _app.tsx
  if (!supabaseInstance) {
    supabaseInstance = createPagesBrowserClient();
  }

  return supabaseInstance;
}

// Re-export the client getter for backward compatibility
// This creates a proxy that forwards all property access to the real client
export const supabase = new Proxy({} as any, {
  get(target, prop) {
    const client = getSupabaseClient();
    return client[prop];
  }
});