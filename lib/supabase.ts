import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key is missing from environment variables.');
}

// Initialize the client, explicitly providing an options object with URL and Key.
// If you have a Database type, use createClientComponentClient<Database>({ supabaseUrl, supabaseKey: supabaseAnonKey });
export const supabase = createClientComponentClient({ 
  supabaseUrl,
  supabaseKey: supabaseAnonKey,
});

console.log('Supabase client initialized in lib/supabase.ts (with explicit URL/Key)');