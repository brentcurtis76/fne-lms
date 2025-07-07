// Export supabase client for backward compatibility
// This is a temporary measure for emergency deployment
// TODO: Migrate all components to use useSupabaseClient hook
export { supabase } from './supabase-wrapper';