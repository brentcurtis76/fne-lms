// Test environment Supabase configuration
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NODE_ENV === 'test' 
  ? 'http://127.0.0.1:54321'
  : process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseAnonKey = process.env.NODE_ENV === 'test'
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);