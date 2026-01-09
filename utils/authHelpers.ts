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
  console.log('🔍 [authHelpers] getEnhancedUserInfo called with contextUser:', contextUser?.id);
  
  // Strategy 1: Use context user if available
  if (contextUser) {
    try {
      const { effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, contextUser.id);
      console.log('✅ [authHelpers] Context user role detection successful:', {
        userId: contextUser.id,
        effectiveRole,
        isAdmin
      });
      
      return {
        user: contextUser,
        isAdmin,
        userRole: effectiveRole,
        source: 'context'
      };
    } catch (error) {
      console.error('❌ [authHelpers] Context user role detection failed:', error);
    }
  }

  // Strategy 2: Check Supabase session directly
  console.log('🔄 [authHelpers] Context user unavailable, checking Supabase session');
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('❌ [authHelpers] Session error:', sessionError.message);
    } else if (session?.user) {
      console.log('✅ [authHelpers] Found session user:', session.user.id);
      
      const { effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, session.user.id);
      console.log('✅ [authHelpers] Session user role detection successful:', {
        userId: session.user.id,
        effectiveRole,
        isAdmin
      });
      
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
    console.error('❌ [authHelpers] Session check failed:', sessionError);
  }

  // Strategy 3: API endpoint fallback (browser only)
  if (typeof window !== 'undefined') {
    console.log('🔄 [authHelpers] Browser context, trying API session fallback');
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const sessionData = await response.json();
        console.log('🔍 [authHelpers] API session response:', sessionData);
        
        if (sessionData.user && sessionData.user.id) {
          const { effectiveRole, isAdmin } = await getEffectiveRoleAndStatus(supabase, sessionData.user.id);
          console.log('✅ [authHelpers] API session role detection successful:', {
            userId: sessionData.user.id,
            effectiveRole,
            isAdmin
          });
          
          return {
            user: sessionData.user,
            isAdmin,
            userRole: effectiveRole,
            source: 'api'
          };
        }
      }
    } catch (apiError) {
      console.error('❌ [authHelpers] API session fallback failed:', apiError);
    }
  }

  // Strategy 4: Final fallback
  console.log('❌ [authHelpers] All auth detection strategies failed');
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