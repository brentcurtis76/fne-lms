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

/**
 * IMPLICIT URL DETECTION IS OFF, deliberately (F2).
 *
 * supabase-js defaults `detectSessionInUrl` to true: on construction it kicks
 * off an asynchronous pass that looks for `#access_token=…` (or `?code=…`) in
 * `window.location`, exchanges it for a session, and then REWRITES the address
 * bar to remove it. That is a race with any page that needs to read the same
 * material, and `/reset-password` is exactly such a page — it has to decide
 * whether this page load carried recovery proof, and the answer was being erased
 * out from under it by a client constructed in `_app`'s module scope. When the
 * client won, a perfectly valid recovery link produced an "invalid link" screen;
 * when the page won, it worked. Which one happened depended on timing.
 *
 * Turning it off removes the race by removing the competitor: nothing consumes
 * the URL implicitly, and `/reset-password` consumes it explicitly, in one
 * place, with every token validated. Nothing else in this application uses an
 * implicit-flow URL — there is no `signInWithOAuth` call anywhere in the
 * codebase, and `__tests__/lib/supabaseWrapper.detectSessionInUrl.test.ts`
 * fails if one appears without revisiting this decision.
 */
const BROWSER_AUTH_OPTIONS = {
  options: {
    auth: {
      detectSessionInUrl: false,
    },
  },
} as const;

// Create a singleton that matches what _app.tsx creates
// This ensures we use the same instance throughout the app
let supabaseInstance: any = null;

export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    // Server-side: Use auth-helpers for consistency
    return createPagesBrowserClient(BROWSER_AUTH_OPTIONS as any);
  }

  // Client-side: Create singleton that matches _app.tsx
  if (!supabaseInstance) {
    supabaseInstance = createPagesBrowserClient(BROWSER_AUTH_OPTIONS as any);
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