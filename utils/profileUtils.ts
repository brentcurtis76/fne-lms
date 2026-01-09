import { supabase } from '../lib/supabase-wrapper';
import { canAccessAdminFeatures } from './roleUtils';

/**
 * Interface for profile fields used in completion check
 */
interface ProfileCompletionFields {
  first_name: string | null;
  last_name: string | null;
  description: string | null;
  school: string | null;
  avatar_url: string | null;
  approval_status?: string | null;
}

/**
 * Checks if a user's profile is complete based on required fields
 * This is a robust implementation that handles various edge cases
 * 
 * @param userId The user's ID to check
 * @returns A promise that resolves to true if profile is complete, false otherwise
 */
export const checkProfileCompletion = async (userId: string): Promise<boolean> => {
  // Validate input
  if (!userId || typeof userId !== 'string') {
    console.warn('checkProfileCompletion: Invalid userId provided');
    return false;
  }
  
  try {
    // Fetch the user's profile with specific fields
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('first_name, last_name, description, school, avatar_url, approval_status')
      .eq('id', userId)
      .single();
    
    if (error) {
      // Handle specific error cases
      if (error.code === '406' || error.message?.includes('406')) {
        console.warn('Profile query returned 406 - likely RLS issue, assuming profile is complete');
        // For RLS errors, assume profile is complete to avoid blocking users
        return true;
      }
      
      if (error.code === 'PGRST116') {
        console.error('Profile not found for user:', userId);
        return false;
      }
      
      console.error('Error fetching profile:', error);
      // For 406 errors without proper code, check the message
      if (error.message?.includes('Not Acceptable')) {
        console.warn('406 Not Acceptable error - assuming profile is complete');
        return true;
      }
      
      // For other errors, assume incomplete to trigger profile page
      return false;
    }
    
    if (!profile) {
      console.warn('No profile found for user:', userId);
      return false;
    }
    
    // Type assertion for TypeScript
    const typedProfile = profile as ProfileCompletionFields;
    
    // For admin users or approved users, we can be more lenient
    const isApproved = typedProfile.approval_status === 'approved';
    
    // Check required fields
    const hasBasicInfo = !!(
      typedProfile.first_name?.trim() && 
      typedProfile.last_name?.trim()
    );
    
    // For approved users, only basic info is required
    if (isApproved) {
      return hasBasicInfo;
    }
    
    // For new users, check all fields
    const isComplete = !!(
      hasBasicInfo &&
      typedProfile.description?.trim() && 
      typedProfile.school?.trim() && 
      typedProfile.avatar_url?.trim()
    );
    
    return isComplete;
  } catch (error) {
    console.error('Unexpected error in checkProfileCompletion:', error);
    // On unexpected errors, assume profile is complete to avoid blocking users
    return true;
  }
};

/**
 * Check if user has admin privileges using new role system
 * Maintains backward compatibility with legacy admin role
 */
export async function hasAdminAccess(userId: string): Promise<boolean> {
  try {
    return await canAccessAdminFeatures(supabase, userId);
  } catch (error) {
    console.error('Error checking admin access:', error);
    return false;
  }
}

/**
 * Get user's primary role from the user_roles table
 * Returns the highest privilege role if multiple exist
 */
export async function getUserPrimaryRole(userId: string): Promise<string | null> {
  if (!userId) return null;
  
  try {
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId);
    
    if (error || !roles || roles.length === 0) {
      return null;
    }
    
    // Priority order for roles
    const rolePriority = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'];
    
    // Find the highest priority role
    for (const priority of rolePriority) {
      if (roles.some(r => r.role_type === priority)) {
        return priority;
      }
    }
    
    return roles[0].role_type;
  } catch (error) {
    console.error('Error getting user primary role:', error);
    return null;
  }
}
