import { createClient } from '@supabase/supabase-js';

// Debug: Log environment variables (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('[Supabase Client] Environment check:', {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    anonKeyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length,
    nodeEnv: process.env.NODE_ENV
  });
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Supabase environment variables are missing');
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    global: {
      headers: {
        'x-source': 'local-dev'
      }
    }
  }
);

// Debug: Add request interceptor to log auth attempts
if (process.env.NODE_ENV === 'development') {
  const originalSignIn = supabase.auth.signInWithPassword;
  supabase.auth.signInWithPassword = async (credentials) => {
    console.log('[Supabase Auth] Attempting sign in:', {
      email: 'email' in credentials ? credentials.email : undefined,
      phone: 'phone' in credentials ? credentials.phone : undefined,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      timestamp: new Date().toISOString()
    });
    
    try {
      const result = await originalSignIn.call(supabase.auth, credentials);
      console.log('[Supabase Auth] Sign in result:', {
        success: !result.error,
        error: result.error?.message,
        errorStatus: result.error?.status
      });
      return result;
    } catch (error) {
      console.error('[Supabase Auth] Sign in exception:', error);
      throw error;
    }
  };
}