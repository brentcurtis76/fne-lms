/**
 * Supabase Wrapper - Temporary compatibility layer
 * 
 * This module provides a way to access Supabase client without creating
 * multiple instances. It should be used temporarily while migrating to
 * auth-helpers.
 * 
 * TODO: Remove this file once all components are migrated to auth-helpers
 */

let supabaseInstance: any = null;

export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    // Server-side: Create a new client for each request
    const { createClient } = require('@supabase/supabase-js');
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  
  // Client-side: Try to get the auth-helpers client first
  try {
    // Check if we're in a React component context
    const authHelpersClient = (window as any).__SUPABASE_CLIENT__;
    if (authHelpersClient) {
      return authHelpersClient;
    }
  } catch (e) {
    // Not in auth-helpers context
  }
  
  // Fallback: Create a singleton instance
  if (!supabaseInstance) {
    const { createClient } = require('@supabase/supabase-js');
    supabaseInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );
    
    // Store it globally so auth-helpers can find it
    (window as any).__SUPABASE_CLIENT__ = supabaseInstance;
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