import { createClient } from '@supabase/supabase-js';

// Enhanced Supabase client with extensive debugging
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log('[Supabase Debug] Creating client with:', {
  url: SUPABASE_URL,
  keyLength: SUPABASE_ANON_KEY?.length,
  isBrowser: typeof window !== 'undefined',
  userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'SSR'
});

// Create client with custom fetch that logs everything
const customFetch = (url: string, options: any = {}) => {
  console.log('[Supabase Debug] Fetch intercepted:', {
    url,
    method: options.method || 'GET',
    headers: options.headers,
    hasBody: !!options.body
  });
  
  // Add timestamp to track request timing
  const startTime = Date.now();
  
  return fetch(url, options)
    .then(response => {
      const duration = Date.now() - startTime;
      console.log('[Supabase Debug] Response received:', {
        url,
        status: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      // Clone response to log body without consuming it
      const clonedResponse = response.clone();
      clonedResponse.text().then(body => {
        try {
          const parsed = JSON.parse(body);
          console.log('[Supabase Debug] Response body:', parsed);
        } catch {
          console.log('[Supabase Debug] Response body (text):', body.substring(0, 200));
        }
      });
      
      return response;
    })
    .catch(error => {
      console.error('[Supabase Debug] Fetch error:', {
        url,
        error: error.message,
        stack: error.stack
      });
      throw error;
    });
};

export const supabaseDebug = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: {
      getItem: (key: string) => {
        if (typeof window === 'undefined') return null;
        const value = window.localStorage.getItem(key);
        console.log('[Supabase Debug] Storage GET:', { key, hasValue: !!value });
        return value;
      },
      setItem: (key: string, value: string) => {
        if (typeof window === 'undefined') return;
        console.log('[Supabase Debug] Storage SET:', { key, valueLength: value.length });
        window.localStorage.setItem(key, value);
      },
      removeItem: (key: string) => {
        if (typeof window === 'undefined') return;
        console.log('[Supabase Debug] Storage REMOVE:', { key });
        window.localStorage.removeItem(key);
      }
    }
  },
  global: {
    fetch: customFetch,
    headers: {
      'X-Client-Info': 'supabase-debug-client',
      'X-Debug': 'true'
    }
  }
});

// Test function to verify auth works
export async function testAuth(email: string, password: string) {
  console.log('[Supabase Debug] Testing authentication...');
  
  try {
    const { data, error } = await supabaseDebug.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error('[Supabase Debug] Auth failed:', error);
      return { success: false, error };
    }
    
    console.log('[Supabase Debug] Auth successful:', {
      user: data.user?.email,
      session: !!data.session,
      expiresAt: data.session?.expires_at
    });
    
    return { success: true, data };
  } catch (error: any) {
    console.error('[Supabase Debug] Auth exception:', error);
    return { success: false, error };
  }
}