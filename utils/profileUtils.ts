import { supabase } from '../lib/supabase';

/**
 * Checks if a user's profile is complete based on required fields
 * @param userId The user's ID to check
 * @returns A promise that resolves to true if profile is complete, false otherwise
 */
export const checkProfileCompletion = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  
  // Fetch the user's profile
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, description, school, avatar_url')
    .eq('id', userId)
    .single();
  
  if (error || !profile) {
    console.error('Error fetching profile or profile not found:', error);
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
};
