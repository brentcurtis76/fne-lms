import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import Link from 'next/link';
import { checkProfileCompletion } from '../utils/profileUtils';

export default function LoginPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const session = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    if (session) {
      // User is already logged in, redirect to dashboard
      router.push('/dashboard');
    } else {
      // No session, user can proceed with login
      setIsLoading(false);
    }
  }, [session, router]);

  // Debug Supabase configuration
  useEffect(() => {
    console.log('[Login Page] Supabase config check:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      keyExists: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      keyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length,
      supabaseInstance: !!supabase,
      timestamp: new Date().toISOString()
    });
    
    // Test the connection immediately
    const testConnection = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        console.log('[Login Page] Session check:', {
          hasSession: !!data?.session,
          error: error?.message,
          errorStatus: error?.status
        });
      } catch (e) {
        console.error('[Login Page] Session check exception:', e);
      }
    };
    
    testConnection();
  }, []);

  const handleSignIn = async () => {
    // Clear any previous messages
    setMessage('');
    
    // Validate inputs
    if (!email || !password) {
      setMessage('Por favor ingresa tu correo y contraseña');
      return;
    }

    // Set signing in state
    setIsSigningIn(true);

    try {
      const { error, data } = await supabase.auth.signInWithPassword({ 
        email: email.trim(), 
        password
      });

      if (error) {
        console.error('[Login Page] Auth error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
          details: error
        });
        
        // Provide user-friendly error messages
        if (error.message.includes('Invalid login credentials')) {
          setMessage('Correo o contraseña incorrectos');
        } else if (error.message.includes('Email not confirmed')) {
          setMessage('Por favor confirma tu correo electrónico antes de iniciar sesión');
        } else {
          setMessage('Error al iniciar sesión: ' + error.message);
        }
        
        // Error occurred, user can try again
        setIsSigningIn(false);
      } else {
        setMessage('Login successful!');
        
        // Check if profile is complete and if password change is required
        const userId = data.user?.id;
        if (userId) {
          // First check if user must change password
          const { data: profile } = await supabase
            .from('profiles')
            .select('must_change_password, password_change_required')
            .eq('id', userId)
            .single();
          
          if (profile?.must_change_password || profile?.password_change_required) {
            // Redirect to password change page
            router.push('/change-password');
          } else {
            // Check if profile is complete
            const isProfileComplete = await checkProfileCompletion(userId);
            
            if (isProfileComplete) {
              // If profile is complete, redirect to dashboard
              router.push('/dashboard');
            } else {
              // If profile is incomplete, redirect to profile page
              router.push('/profile');
            }
          }
        } else {
          // Fallback if user ID is not available
          router.push('/profile');
        }
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setMessage('Error al iniciar sesión: Ocurrió un error inesperado');
      setIsSigningIn(false);
    }
  };


  const handlePasswordReset = async () => {
    if (!email) {
      setMessage('Por favor ingresa tu correo electrónico');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        setMessage('Error al enviar email: ' + error.message);
      } else {
        setMessage('Se ha enviado un link de recuperación a tu correo electrónico');
        setIsResetMode(false);
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setMessage('Error al enviar email: An unexpected error occurred');
    }
  };

  // Show loading state while checking session
  if (isLoading) {
    return (
      <>
        <Head>
          <title>Inicia sesión en tu cuenta | FNE LMS</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-brand_beige">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand_blue"></div>
            <p className="mt-2 text-gray-600">Verificando sesión...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Inicia sesión en tu cuenta | FNE LMS</title>
      </Head>
      
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand_beige relative overflow-hidden">
      
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-brand_yellow opacity-20 -mr-20 -mt-20"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-gray-300 opacity-30 -ml-20 -mb-20"></div>
      
      
      {/* Login Card */}
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md z-10">
        <h1 className="text-2xl font-bold text-center text-brand_blue mb-8">
          {isResetMode ? 'Recuperar contraseña' : 'Inicia sesión en tu cuenta'}
        </h1>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!isResetMode) {
            handleSignIn();
          } else {
            handlePasswordReset();
          }
        }}>
        
        {/* Email input */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Correo electrónico</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="fa-solid fa-envelope text-gray-400"></i>
            </div>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
            />
          </div>
        </div>
        
        {/* Password input - only show in login mode */}
        {!isResetMode && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-gray-400"></i>
              </div>
              <input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Reset mode instructions */}
        {isResetMode && (
          <div className="mb-6">
            <p className="text-sm text-gray-600">
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>
        )}
        
        {/* Forgot password - only show in login mode */}
        {!isResetMode && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <button 
                type="button"
                onClick={() => setIsResetMode(true)}
                className="text-sm text-brand_blue hover:text-brand_yellow"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>
        )}
        
        {/* Buttons */}
        {isResetMode ? (
          <div className="flex gap-4 mb-6">
            <button 
              onClick={() => setIsResetMode(false)} 
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
            >
              Volver
            </button>
            <button 
              onClick={handlePasswordReset} 
              className="flex-1 bg-brand_blue hover:bg-brand_yellow text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
            >
              Enviar enlace
            </button>
          </div>
        ) : (
          <div className="mb-6">
            <button 
              type="submit"
              disabled={isSigningIn}
              className={`w-full font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out text-white
                ${isSigningIn 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-brand_blue hover:bg-brand_yellow'
                }`}
            >
              {isSigningIn ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Iniciando sesión...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </div>
        )}
        
        {/* Error/success message */}
        {message && (
          <div className={`text-center p-2 rounded ${message.includes('failed') || message.includes('Error') || message.includes('incorrectos') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}
        
        </form>
      </div>

    </div>
    </>
  );
}