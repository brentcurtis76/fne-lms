import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import Link from 'next/link';
import { checkProfileCompletionSimple } from '../utils/profileCompletionCheck';

export default function LoginPage() {
  const router = useRouter();
  const supabaseClient = useSupabaseClient();
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

  // Safety timeout to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        console.warn('[Login Page] Loading timeout reached, forcing render');
        setIsLoading(false);
        // If we have a session but stuck here, it means redirect failed
        if (session) {
          setMessage('Session detected but redirect failed. Please try refreshing.');
        }
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isLoading, session]);

  // Debug Supabase configuration
  useEffect(() => {
    console.log('[Login Page] Supabase config check:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      keyExists: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      keyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length,
      supabaseInstance: !!supabaseClient,
      timestamp: new Date().toISOString()
    });
    
    // Test the connection immediately
    const testConnection = async () => {
      try {
        const { data, error } = await supabaseClient.auth.getSession();
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
  }, [supabaseClient]);

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
      const { error, data } = await supabaseClient.auth.signInWithPassword({ 
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
        
        // Get user ID for profile checks
        const userId = data.user?.id;
        if (userId) {
          try {
            // Wait a moment for auth session to be fully established
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // First check if user must change password
            const { data: profile, error: profileError } = await supabaseClient
              .from('profiles')
              .select('must_change_password')
              .eq('id', userId)
              .single();
            
            if (profileError) {
              console.error('Error fetching profile for password check:', profileError);
              // On profile fetch error, check profile completion to determine redirect
              const isProfileComplete = await checkProfileCompletionSimple(supabaseClient, userId);
              if (isProfileComplete) {
                router.push('/dashboard');
              } else {
                router.push('/profile?from=login&error=profile-check-failed');
              }
              return;
            }
            
            if (profile?.must_change_password) {
              // Redirect to password change page
              router.push('/change-password');
            } else {
              // Check if profile is complete
              const isProfileComplete = await checkProfileCompletionSimple(supabaseClient, userId);
              
              console.log('[Login] Profile completion check result:', isProfileComplete);
              
              if (isProfileComplete) {
                // If profile is complete, redirect to dashboard
                console.log('[Login] Redirecting to dashboard');
                router.push('/dashboard');
              } else {
                // If profile is incomplete, redirect to profile page
                console.log('[Login] Redirecting to profile page');
                router.push('/profile?from=login');
              }
            }
          } catch (error) {
            console.error('Error during profile checks:', error);
            // On any error, assume profile is incomplete and redirect to profile page
            router.push('/profile?from=login&error=check-failed');
          }
        } else {
          // Fallback if user ID is not available
          router.push('/profile?from=login');
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
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
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
      
      <div className="min-h-screen flex relative overflow-hidden">
        {/* Left Side - Hero Section */}
        <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#00365b] via-[#00365b] to-[#002844]">
          {/* Animated Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fdb933' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}></div>
          </div>
          
          {/* Glowing Orbs */}
          <div className="absolute top-20 left-20 w-72 h-72 bg-[#fdb933] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-72 h-72 bg-[#fdb933] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>
          
          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center items-center w-full px-12 text-white">
            {/* Logo */}
            <div className="mb-12 transform hover:scale-105 transition-transform duration-300">
              <Link href="/">
                <img 
                  src="/images/logo.png" 
                  alt="Fundación Nueva Educación" 
                  className="h-32 w-auto drop-shadow-2xl cursor-pointer"
                />
              </Link>
            </div>
            
            {/* Text Content */}
            <h1 className="text-5xl font-bold mb-4 text-center animate-fade-in-up">
              Plataforma de
              <span className="block text-[#fdb933] mt-2">Crecimiento</span>
            </h1>
            
            <p className="text-xl text-gray-200 mb-8 text-center animate-fade-in-up animation-delay-200">
              Fundación Nueva Educación
            </p>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 max-w-md animate-fade-in-up animation-delay-400">
              <p className="text-lg text-center">
                Transformando la educación a través de herramientas innovadoras y colaborativas
              </p>
            </div>
            
            {/* Decorative Elements */}
            <div className="absolute top-10 right-10 w-8 h-8 bg-[#fdb933] rounded-full animate-bounce"></div>
            <div className="absolute bottom-10 left-10 w-6 h-6 bg-[#fdb933] rounded-full animate-bounce animation-delay-1000"></div>
          </div>
        </div>
        
        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
          {/* Mobile Logo - Only shown on small screens */}
          <div className="lg:hidden absolute top-8 left-1/2 transform -translate-x-1/2">
            <Link href="/">
              <img 
                src="/images/logo.png" 
                alt="Fundación Nueva Educación" 
                className="h-16 w-auto cursor-pointer hover:opacity-80 transition-opacity duration-200"
              />
            </Link>
          </div>
          
          {/* Login Card */}
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-[#00365b] mb-2">
                {isResetMode ? 'Recuperar contraseña' : '¡Bienvenido de vuelta!'}
              </h2>
              <p className="text-gray-600">
                {isResetMode ? 'Te ayudaremos a recuperar el acceso' : 'Ingresa a tu cuenta para continuar'}
              </p>
            </div>
        
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
          <label className="block text-sm font-semibold text-gray-700 mb-2">Correo electrónico</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400 group-focus-within:text-[#00365b] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
            </div>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fdb933] focus:border-transparent transition-all duration-200 hover:border-gray-400"
            />
          </div>
        </div>
        
        {/* Password input - only show in login mode */}
        {!isResetMode && (
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Contraseña</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400 group-focus-within:text-[#00365b] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fdb933] focus:border-transparent transition-all duration-200 hover:border-gray-400"
              />
            </div>
          </div>
        )}

        {/* Reset mode instructions */}
        {isResetMode && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>
        )}
        
        {/* Forgot password - only show in login mode */}
        {!isResetMode && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <button 
                type="button"
                onClick={() => setIsResetMode(true)}
                className="text-sm font-medium text-[#00365b] hover:text-[#fdb933] transition-colors duration-200 flex items-center"
              >
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>
        )}
        
        {/* Buttons */}
        {isResetMode ? (
          <div className="flex gap-3 mb-6">
            <button 
              type="button"
              onClick={() => setIsResetMode(false)} 
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
            >
              <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver
            </button>
            <button 
              type="button"
              onClick={handlePasswordReset} 
              className="flex-1 bg-gradient-to-r from-[#00365b] to-[#002844] hover:from-[#002844] hover:to-[#00365b] text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
            >
              <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Enviar enlace
            </button>
          </div>
        ) : (
          <div className="mb-6">
            <button 
              type="submit"
              disabled={isSigningIn}
              className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform text-white shadow-lg
                ${isSigningIn 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-[#00365b] to-[#002844] hover:from-[#002844] hover:to-[#00365b] hover:scale-[1.02] hover:shadow-xl'
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
                <span className="flex items-center justify-center">
                  Iniciar Sesión
                  <svg className="h-5 w-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </span>
              )}
            </button>
          </div>
        )}
        
        {/* Error/success message */}
        {message && (
          <div className={`p-4 rounded-lg flex items-start space-x-3 animate-fade-in ${
            message.includes('failed') || message.includes('Error') || message.includes('incorrectos')
              ? 'bg-red-50 border border-red-200'
              : 'bg-[#fdb933]/10 border border-[#fdb933]/30'
          }`}>
            {message.includes('failed') || message.includes('Error') || message.includes('incorrectos') ? (
              <svg className="h-5 w-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-[#b8860b] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <p className={`text-sm ${
              message.includes('failed') || message.includes('Error') || message.includes('incorrectos')
                ? 'text-red-700'
                : 'text-[#8b6914]'
            }`}>
              {message}
            </p>
          </div>
        )}
        
        {/* Additional Links */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            ¿Necesitas ayuda? 
            <a href="mailto:soporte@nuevaeducacion.org" className="font-medium text-[#00365b] hover:text-[#fdb933] transition-colors duration-200">
              Contacta soporte
            </a>
          </p>
        </div>
        
        </form>
          </div>
        </div>
      </div>
    </>
  );
}
