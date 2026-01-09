import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Simplified profile completion check that handles RLS and edge cases robustly
 * This approach uses minimal fields and handles all error scenarios gracefully
 */
export async function checkProfileCompletionSimple(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!userId) {
    console.warn('checkProfileCompletionSimple: No userId provided');
    return false;
  }

  try {
    // Try a simple query for just the essential fields
    // Using explicit client instance to ensure proper auth context
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('id', userId)
      .maybeSingle(); // Use maybeSingle to avoid errors if no row exists
    
    if (error) {
      // Log the error but don't block the user
      console.warn('Profile check error:', {
        code: error.code,
        message: error.message,
        hint: error.hint
      });
      
      // For any error, assume profile is incomplete to redirect to profile setup
      // This prevents infinite loops when profile fetch fails
      return false;
    }
    
    if (!data) {
      // No profile found - this is a new user
      console.log('No profile found for user, redirecting to profile setup');
      return false;
    }
    
    // Check if basic fields are filled
    const hasName = Boolean(data.first_name?.trim() && data.last_name?.trim());
    
    if (!hasName) {
      console.log('Profile incomplete - missing name fields');
      return false;
    }
    
    // If we get here, profile has at least basic info
    return true;
    
  } catch (error) {
    // Catch any unexpected errors
    console.error('Unexpected error in profile check:', error);
    // In case of any error, assume profile is incomplete to avoid infinite loops
    return false;
  }
}

/**
 * Quick check if user needs to complete profile
 * This is even more lenient and focused on avoiding blocking users
 */
export async function needsProfileSetup(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!userId) return true;
  
  try {
    // Just check if a profile exists at all
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('id', userId);
    
    if (error) {
      console.warn('Profile existence check failed:', error);
      // On error, assume profile exists to avoid blocking
      return false;
    }
    
    // If count is 0, user needs profile setup
    return count === 0;
    
  } catch (error) {
    console.error('Error checking profile existence:', error);
    // On error, assume profile exists
    return false;
  }
}