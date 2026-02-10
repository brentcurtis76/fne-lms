/**
 * Enhanced auth helpers that work in both browser and server contexts
 * Provides fallback mechanisms when useUser() fails
 */

import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';
import { getEffectiveRoleAndStatus } from './roleUtils';

interface AuthUser {
  id: string;
  email?: string;
}

interface UserRoleInfo {
  user: AuthUser | null;
  isAdmin: boolean;
  userRole: string;
  source: 'context' | 'session' | 'api' | 'none';
}

/**
 * Get user and role information with multiple fallback strategies
 * This handles the case where useUser() returns null but session exists
 */
export async function getEnhancedUserInfo(
  contextUser: AuthUser | null,
  supabase: any
): Promise<UserRoleInfo> {
  // Strategy 1: Use context user if available
  if (contextUser) {
    try {
      const { effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, contextUser.id);

      return {
        user: contextUser,
        isAdmin,
        userRole: effectiveRole,
        source: 'context'
      };
    } catch (error) {
      console.error('[authHelpers] Context user role detection failed');
    }
  }

  // Strategy 2: Check Supabase session directly
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[authHelpers] Session error');
    } else if (session?.user) {
      const { effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, session.user.id);

      return {
        user: {
          id: session.user.id,
          email: session.user.email
        },
        isAdmin,
        userRole: effectiveRole,
        source: 'session'
      };
    }
  } catch (sessionError) {
    console.error('[authHelpers] Session check failed');
  }

  // Strategy 3: API endpoint fallback (browser only)
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const sessionData = await response.json();

        if (sessionData.user && sessionData.user.id) {
          const { effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, sessionData.user.id);

          return {
            user: sessionData.user,
            isAdmin,
            userRole: effectiveRole,
            source: 'api'
          };
        }
      }
    } catch (apiError) {
      console.error('[authHelpers] API session fallback failed');
    }
  }

  // Strategy 4: Final fallback
  return {
    user: null,
    isAdmin: false,
    userRole: '',
    source: 'none'
  };
}

/**
 * Browser-compatible Supabase client creator
 * Ensures consistent client creation across components
 */
export function createBrowserSupabaseClient() {
  return createPagesBrowserClient();
}