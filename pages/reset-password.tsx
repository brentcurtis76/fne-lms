import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  // Use ref to track if we've already attempted token processing
  // IMPORTANT: Don't reset these on mount - they persist to prevent double-processing in Strict Mode
  const processingRef = useRef(false);
  const hasProcessedRef = useRef(false);
  const mountCountRef = useRef(0);

  useEffect(() => {
    mountCountRef.current += 1;
    const currentMount = mountCountRef.current;

    console.log('[ResetPassword] useEffect mount #', currentMount);

    // Handle the password reset token
    const handleRecoveryToken = async () => {
      // First, always check for existing session - this handles cases where
      // the token was already processed (Strict Mode, email client prefetch, etc.)
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession) {
        console.log('[ResetPassword] Existing session found on mount #', currentMount);
        setHasValidSession(true);
        setIsValidatingToken(false);
        // Clean up URL if it has tokens
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('code') || urlParams.get('token_hash') || urlParams.get('token')) {
          window.history.replaceState({}, '', '/reset-password');
        }
        return;
      }

      // Prevent double-processing in React Strict Mode
      if (processingRef.current || hasProcessedRef.current) {
        console.log('[ResetPassword] Already processing or processed, waiting for session...');
        // Wait and check for session that might have been established by the other mount
        await new Promise(resolve => setTimeout(resolve, 1500));
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[ResetPassword] Session found from previous processing');
          setHasValidSession(true);
          setIsValidatingToken(false);
        } else {
          // No session after waiting - show error
          setMessage('Error al validar el enlace de recuperación. El enlace puede haber expirado o ya fue utilizado. Por favor solicita un nuevo enlace.');
          setIsValidatingToken(false);
        }
        return;
      }

      processingRef.current = true;
      console.log('[ResetPassword] Starting token processing on mount #', currentMount);

      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const token = urlParams.get('token');
      const tokenHash = urlParams.get('token_hash');

      // Check for implicit flow: #access_token=xxx&type=recovery (legacy)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashType = hashParams.get('type');
      const accessToken = hashParams.get('access_token');

      console.log('[ResetPassword] Checking for recovery token:', {
        hasCode: !!code,
        hasToken: !!token,
        hasTokenHash: !!tokenHash,
        hasHash: !!window.location.hash,
        hashType: hashType,
        hasAccessToken: !!accessToken,
        fullUrl: window.location.href
      });

      // Method 1: Handle token_hash (from Supabase email links with PKCE)
      if (tokenHash) {
        console.log('[ResetPassword] Token hash found, verifying...');

        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery'
          });

          // Clean URL AFTER verification attempt
          window.history.replaceState({}, '', '/reset-password');
          hasProcessedRef.current = true;

          if (error) {
            console.error('[ResetPassword] Error verifying token_hash:', error);
            // Check if session was somehow established despite error
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession) {
              console.log('[ResetPassword] Session exists despite error, continuing...');
              setHasValidSession(true);
              setIsValidatingToken(false);
              return;
            }
            setMessage('Error al validar el enlace de recuperación. El enlace puede haber expirado. Por favor solicita un nuevo enlace.');
            setIsValidatingToken(false);
            return;
          }

          if (data.session) {
            console.log('[ResetPassword] Session established from token_hash');
            setHasValidSession(true);
            setIsValidatingToken(false);
            return;
          }
        } catch (err) {
          console.error('[ResetPassword] Exception verifying token_hash:', err);
          window.history.replaceState({}, '', '/reset-password');
          hasProcessedRef.current = true;
          setMessage('Error al validar el enlace de recuperación. Por favor solicita un nuevo enlace.');
          setIsValidatingToken(false);
          return;
        }
      }

      // Method 2: Handle raw token (from custom email template with {{ .Token }})
      if (token) {
        hasProcessedRef.current = true;
        console.log('[ResetPassword] Raw token found, this requires email for verification');
        // Raw tokens need the user's email to verify - we don't have it here
        setMessage('Error: El enlace no contiene la información necesaria. Por favor solicita un nuevo enlace de recuperación.');
        setIsValidatingToken(false);
        return;
      }

      // Method 3: Handle PKCE code (from standard Supabase flow)
      if (code) {
        console.log('[ResetPassword] PKCE code found, exchanging for session...');

        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          // Clean URL AFTER exchange attempt
          window.history.replaceState({}, '', '/reset-password');
          hasProcessedRef.current = true;

          if (error) {
            console.error('[ResetPassword] Error exchanging code:', error);
            // Check if session was somehow established despite error
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession) {
              console.log('[ResetPassword] Session exists despite error, continuing...');
              setHasValidSession(true);
              setIsValidatingToken(false);
              return;
            }
            setMessage('Error al validar el enlace de recuperación. El enlace puede haber expirado. Por favor solicita un nuevo enlace.');
            setIsValidatingToken(false);
            return;
          }

          if (data.session) {
            console.log('[ResetPassword] Session established from PKCE code');
            setHasValidSession(true);
            setIsValidatingToken(false);
            return;
          }
        } catch (err) {
          console.error('[ResetPassword] Exception exchanging code:', err);
          window.history.replaceState({}, '', '/reset-password');
          hasProcessedRef.current = true;
          // Check if session exists despite exception
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (retrySession) {
            console.log('[ResetPassword] Session exists despite exception, continuing...');
            setHasValidSession(true);
            setIsValidatingToken(false);
            return;
          }
          setMessage('Error al validar el enlace de recuperación. Por favor solicita un nuevo enlace.');
          setIsValidatingToken(false);
          return;
        }
      }

      // Handle implicit flow with hash fragment (legacy)
      if (hashType === 'recovery' && accessToken) {
        console.log('[ResetPassword] Recovery token found in hash, waiting for session...');
        hasProcessedRef.current = true;

        // Give Supabase time to process the token
        await new Promise(resolve => setTimeout(resolve, 1500));

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[ResetPassword] Error getting session:', error);
          setMessage('Error al validar el enlace de recuperación. El enlace puede haber expirado.');
          setIsValidatingToken(false);
          return;
        }

        if (session) {
          console.log('[ResetPassword] Session established from recovery token');
          setHasValidSession(true);
          setIsValidatingToken(false);
          return;
        }
      }

      // No recovery token found in URL
      hasProcessedRef.current = true;

      // Wait a moment and check session one more time
      // (auth state listener might have processed it)
      await new Promise(resolve => setTimeout(resolve, 500));
      const { data: { session: finalSession } } = await supabase.auth.getSession();

      if (!finalSession) {
        console.log('[ResetPassword] No session and no recovery token, redirecting to login');
        router.push('/login');
        return;
      }

      console.log('[ResetPassword] Existing session found');
      setHasValidSession(true);
      setIsValidatingToken(false);
    };

    // Listen for auth state changes (Supabase may process the token asynchronously)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[ResetPassword] Auth state changed:', event, !!session);

      if (event === 'PASSWORD_RECOVERY') {
        console.log('[ResetPassword] PASSWORD_RECOVERY event received');
        hasProcessedRef.current = true;
        setHasValidSession(true);
        setIsValidatingToken(false);
      } else if (event === 'SIGNED_IN' && session) {
        console.log('[ResetPassword] User signed in from recovery');
        hasProcessedRef.current = true;
        setHasValidSession(true);
        setIsValidatingToken(false);
      }
    });

    handleRecoveryToken();

    return () => {
      subscription.unsubscribe();
      processingRef.current = false;
    };
  }, [router, supabase.auth]);

  const handlePasswordUpdate = async () => {
    if (password !== confirmPassword) {
      setMessage('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setMessage('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      // Verify we have a valid session before attempting update
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('[ResetPassword] No session found when updating password');
        setMessage('Tu sesión ha expirado. Por favor solicita un nuevo enlace de recuperación.');
        return;
      }

      console.log('[ResetPassword] Session found, updating password for user:', session.user.id);

      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        console.error('[ResetPassword] Update error:', error);
        setMessage('Error al actualizar contraseña: ' + error.message);
      } else {
        setMessage('Contraseña actualizada exitosamente');
        // Redirect to dashboard after successful password reset
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      }
    } catch (err) {
      console.error('Password update error:', err);
      setMessage('Error al actualizar contraseña: An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while validating token
  if (isValidatingToken) {
    return (
      <>
        <Head>
          <title>Restablecer Contraseña | FNE LMS</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-brand_beige">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand_blue"></div>
            <p className="mt-2 text-gray-600">Validando enlace de recuperación...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Restablecer Contraseña | FNE LMS</title>
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

        {/* Right Side - Reset Password Form */}
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

          {/* Reset Password Card */}
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-[#00365b] mb-2">
                Restablecer Contraseña
              </h2>
              <p className="text-gray-600">
                Ingresa tu nueva contraseña para continuar
              </p>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              handlePasswordUpdate();
            }}>
              {/* New Password input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nueva Contraseña</label>
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
                    autoComplete="new-password"
                    className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fdb933] focus:border-transparent transition-all duration-200 hover:border-gray-400"
                  />
                </div>
              </div>

              {/* Confirm Password input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Confirmar Contraseña</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400 group-focus-within:text-[#00365b] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fdb933] focus:border-transparent transition-all duration-200 hover:border-gray-400"
                  />
                </div>
              </div>

              {/* Update Password Button */}
              <div className="mb-6">
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform text-white shadow-lg
                    ${loading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#00365b] to-[#002844] hover:from-[#002844] hover:to-[#00365b] hover:scale-[1.02] hover:shadow-xl'
                    }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Actualizando...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center">
                      Actualizar Contraseña
                      <svg className="h-5 w-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>

              {/* Back to Login */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="text-sm font-medium text-[#00365b] hover:text-[#fdb933] transition-colors duration-200 flex items-center justify-center mx-auto"
                >
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Volver al inicio de sesión
                </button>
              </div>

              {/* Error/success message */}
              {message && (
                <div className={`mt-6 p-4 rounded-lg flex items-start space-x-3 animate-fade-in ${
                  message.includes('Error')
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-[#fdb933]/10 border border-[#fdb933]/30'
                }`}>
                  {message.includes('Error') ? (
                    <svg className="h-5 w-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-[#b8860b] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <p className={`text-sm ${
                    message.includes('Error')
                      ? 'text-red-700'
                      : 'text-[#8b6914]'
                  }`}>
                    {message}
                  </p>
                </div>
              )}
            </form>

            {/* Additional Links */}
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-600">
                ¿Necesitas ayuda?
                <a href="mailto:soporte@nuevaeducacion.org" className="font-medium text-[#00365b] hover:text-[#fdb933] transition-colors duration-200 ml-1">
                  Contacta soporte
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}