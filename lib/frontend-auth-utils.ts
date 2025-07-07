/**
 * Frontend Authentication Utilities
 * 
 * Centralized authentication utilities for frontend pages to ensure
 * consistent authentication patterns and prevent security vulnerabilities.
 * 
 * PRINCIPLES:
 * 1. Single source of truth for authentication state
 * 2. Type-safe authentication checks
 * 3. Consistent error handling
 * 4. No direct Supabase client imports in pages
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import { User, SupabaseClient } from '@supabase/supabase-js';

export interface AuthCheckOptions {
  redirectTo?: string;
  requireProfile?: boolean;
  requireApproval?: boolean;
  requireRole?: string[];
  onSuccess?: (user: User, profile: any) => void;
  onError?: (error: Error) => void;
}

export interface ProfileCheckResult {
  hasProfile: boolean;
  isComplete: boolean;
  isApproved: boolean;
  profile: any | null;
  error: Error | null;
}

/**
 * Hook to check authentication and redirect if not authenticated
 * This replaces the old pattern of checking session in useEffect
 */
export function useAuthCheck(options: AuthCheckOptions = {}) {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const {
    redirectTo = '/login',
    requireProfile = true,
    requireApproval = true,
    requireRole = [],
    onSuccess,
    onError
  } = options;

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        // No session means not authenticated
        if (!session?.user) {
          console.log('[Auth] No session found, redirecting to:', redirectTo);
          if (isMounted) router.push(redirectTo);
          return;
        }

        // If profile is required, check it
        if (requireProfile) {
          const profileCheck = await checkUserProfile(supabase, {
            requireApproval,
            requireRole
          });

          if (profileCheck.error || !profileCheck.hasProfile) {
            console.log('[Auth] Profile check failed or profile not found, redirecting.');
            if (isMounted) router.push(profileCheck.isComplete ? '/pending-approval' : '/profile');
            return;
          }

          if (requireApproval && !profileCheck.isApproved) {
            console.log('[Auth] Profile not approved, redirecting to pending approval');
            if (isMounted) router.push('/pending-approval');
            return;
          }

          if (requireRole.length > 0 && !requireRole.includes(profileCheck.profile?.role)) {
            console.log('[Auth] User role not authorized:', profileCheck.profile?.role);
            if (isMounted) router.push('/dashboard');
            return;
          }

          // Call success callback with user and profile
          if (onSuccess && isMounted) {
            onSuccess(session.user, profileCheck.profile);
          }
        } else {
          // Just authenticated, no profile check needed
          if (onSuccess && isMounted) {
            onSuccess(session.user, null);
          }
        }
      } catch (err) {
        console.error('[Auth] Error during authentication check:', err);
        if (isMounted) setError(err as Error);
        if (onError && isMounted) {
          onError(err as Error);
        } else {
          // Default error handling - redirect to login
          if (isMounted) router.push(redirectTo);
        }
      }
    };

    if (session !== undefined) { // Only run check once session is loaded
      checkAuth().finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [session, router, supabase, redirectTo, requireProfile, requireApproval, JSON.stringify(requireRole), onSuccess, onError]);

  return {
    user: session?.user || null,
    loading: loading || session === undefined,
    authenticated: !!session?.user,
    error
  };
}

/**
 * Check user profile status
 * This is a utility function that can be used independently
 */
export async function checkUserProfile(
  supabase: any,
  options: {
    requireApproval?: boolean;
    requireRole?: string[];
  } = {}
): Promise<ProfileCheckResult> {
  const { requireApproval, requireRole } = options;
  try {
    // Get the current user session first
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return {
        hasProfile: false,
        isComplete: false,
        isApproved: false,
        profile: null,
        error: userError || new Error('No authenticated user')
      };
    }

    // RLS is enforced by the authenticated client for this query.
    // CRITICAL: Always filter by user ID explicitly for defense in depth
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      return {
        hasProfile: false,
        isComplete: false,
        isApproved: false,
        profile: null,
        error: error || new Error('Profile not found')
      };
    }

    // Check if profile is complete (has required fields)
    const isComplete = !!(
      profile.first_name &&
      profile.last_name &&
      profile.school
    );

    // Check approval status
    const isApproved = profile.approval_status === 'approved';

    return {
      hasProfile: true,
      isComplete,
      isApproved,
      profile,
      error: null
    };
  } catch (error) {
    return {
      hasProfile: false,
      isComplete: false,
      isApproved: false,
      profile: null,
      error: error as Error
    };
  }
}

/**
 * Hook to get current user profile with caching
 * This prevents multiple queries to the profiles table
 */
export function useUserProfile() {
  const session = useSession();
  const supabase = useSupabaseClient();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        // Check session storage cache first
        const cacheKey = `profile-${session.user.id}`;
        const cached = sessionStorage.getItem(cacheKey);
        
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          // Cache for 5 minutes
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            setProfile(data);
            setLoading(false);
            return;
          }
        }

        // Fetch from database - RLS is enforced by the authenticated client.
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) throw error;

        // Cache the result
        sessionStorage.setItem(cacheKey, JSON.stringify({
          data,
          timestamp: Date.now()
        }));

        setProfile(data);
        setError(null);
      } catch (err) {
        console.error('[Profile] Error loading profile:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [session, supabase]);

  return { profile, loading, error };
}

/**
 * Checks if a user's profile is complete based on required fields
 * This is the centralized, secure version that should be used everywhere
 * @param supabase The authenticated Supabase client
 * @param userId The user's ID to check
 * @returns A promise that resolves to true if profile is complete, false otherwise
 */
export async function checkProfileCompletion(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!userId) return false;
  
  try {
    // Fetch the user's profile using the provided authenticated client
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('first_name, last_name, description, school, avatar_url')
      .eq('id', userId)
      .single();
    
    if (error || !profile) {
      console.error('[checkProfileCompletion] Error fetching profile:', error);
      return false;
    }
    
    // Check if all required fields are filled
    const isComplete = 
      !!profile.first_name && 
      !!profile.last_name && 
      !!profile.description && 
      !!profile.school && 
      !!profile.avatar_url;
    
    return isComplete;
  } catch (error) {
    console.error('[checkProfileCompletion] Unexpected error:', error);
    return false;
  }
}

/**
 * Hook to handle logout consistently across the app
 */
export function useLogout() {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const logout = async () => {
    try {
      // Clear all caches
      sessionStorage.clear();
      localStorage.removeItem('supabase.auth.token');
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('[Auth] Error during logout:', error);
      }
      
      // Always redirect to login, even if there's an error
      router.push('/login');
    } catch (error) {
      console.error('[Auth] Unexpected error during logout:', error);
      // Still redirect to login
      router.push('/login');
    }
  };

  return logout;
}

// Re-export commonly used hooks from auth-helpers for convenience
export { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';