import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient, useSessionContext } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import Link from 'next/link';
import { checkProfileCompletionSimple } from '../utils/profileCompletionCheck';
import { resolveSafeInternalPath } from '../lib/utils/safe-redirect';

export const LOGIN_TIMEOUT_MS = 15_000;
const LOGIN_RETRY_MESSAGE = 'No pudimos completar el inicio de sesión. Revisa tu conexión y vuelve a intentarlo.';

export default function LoginPage() {
  const router = useRouter();
  const supabaseClient = useSupabaseClient();
  const { session, isLoading: sessionLoading } = useSessionContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const activeAttempt = useRef<number | null>(null);
  const attemptSequence = useRef(0);
  const attemptedSession = useRef(false);
  const reloadRequired = useRef(false);
  const attemptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // S9: the recovery request had no in-flight state at all, so the "Enviar
  // enlace" button stayed live and every impatient click issued another
  // request — each one invalidating the previous link, which is how a user ends
  // up with three e-mails of which only the last one works.
  const [isSendingReset, setIsSendingReset] = useState(false);
  // The guard is a REF, not the state above. State drives the button's disabled
  // attribute, but it does not update until React re-renders — so several clicks
  // dispatched before that flush would all read `false` and all fire a request.
  // A ref is written synchronously and closes the window completely.
  const sendingResetRef = useRef(false);

  // One owner for both an existing session and a submitted sign-in. In
  // particular, SIGNED_IN must not start a second redirect during this flow.
  const runLogin = useCallback(async (credentials?: { email: string; password: string }) => {
    if (activeAttempt.current || reloadRequired.current) return;
    const attempt = ++attemptSequence.current;
    activeAttempt.current = attempt;
    attemptedSession.current = true;
    setMessage('');
    setIsLoading(false);
    setIsSigningIn(true);

    const assertCurrent = () => {
      if (activeAttempt.current !== attempt) throw new Error('Inactive login attempt');
    };

    const complete = async (): Promise<string | null> => {
      let userId: string;
      if (credentials) {
        const { data, error } = await supabaseClient.auth.signInWithPassword(credentials);
        assertCurrent();
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            return 'Correo o contraseña incorrectos';
          }
          if (error.message.includes('Email not confirmed')) {
            return 'Por favor confirma tu correo electrónico antes de iniciar sesión';
          }
          throw new Error('Sign-in unavailable');
        }
        if (!data.user) throw new Error('Missing authenticated user');
        userId = data.user.id;
      } else {
        // A cached session can outlive a password reset. Validate it before
        // navigating, rather than treating the cookie as proof of a live login.
        const { data, error } = await supabaseClient.auth.getUser();
        assertCurrent();
        if (error || !data.user) {
          const expiredSession = !error || error.status === 401 || error.status === 403 ||
            error.name === 'AuthSessionMissingError' ||
            ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'bad_jwt', 'user_not_found'].includes(error.code ?? '');
          if (!expiredSession) {
            throw new Error('Session verification unavailable');
          }
          const { error: signOutError } = await supabaseClient.auth.signOut({ scope: 'local' });
          assertCurrent();
          if (signOutError) throw new Error('Session cleanup unavailable');
          return 'Tu sesión venció. Inicia sesión con tu nueva contraseña.';
        }
        userId = data.user.id;
      }

      const { data: mustChangePassword, error: flagError } = await supabaseClient.rpc(
        'current_password_change_state'
      );
      assertCurrent();
      // Stay here on a failed check. Never guess that a password change is not
      // required, or bounce between the dashboard and the change-password page.
      if (flagError || typeof mustChangePassword !== 'boolean') {
        throw new Error('Password state unavailable');
      }

      let destination = '/change-password';
      if (!mustChangePassword) {
        const profileComplete = await checkProfileCompletionSimple(supabaseClient, userId);
        assertCurrent();
        const requested = resolveSafeInternalPath(router.query.next);
        const requestedPath = requested ? new URL(requested, 'http://internal.invalid').pathname : '';
        const authDestination = ['/login', '/logout', '/reset-password'].includes(requestedPath.replace(/\/$/, ''));
        destination = profileComplete
          ? (requested && !authDestination ? requested : '/dashboard')
          : '/profile?from=login';
      }

      assertCurrent();
      const navigated = await router.push(destination);
      assertCurrent();
      if (!navigated) throw new Error('Login navigation cancelled');
      return null;
    };

    try {
      const timeout = new Promise<never>((_, reject) => {
        attemptTimer.current = setTimeout(() => reject(new Error('Login timed out')), LOGIN_TIMEOUT_MS);
      });
      const result = await Promise.race([complete(), timeout]);
      if (activeAttempt.current === attempt && result) setMessage(result);
    } catch {
      if (activeAttempt.current !== attempt) return;
      // Supabase signInWithPassword cannot be cancelled. Reload for a retry so
      // a late SDK response cannot overwrite a newer attempt's session. Checks
      // after each await also prevent stale work from initiating navigation.
      reloadRequired.current = true;
      setRequiresReload(true);
      setMessage(LOGIN_RETRY_MESSAGE);
    } finally {
      if (activeAttempt.current === attempt) {
        if (attemptTimer.current) clearTimeout(attemptTimer.current);
        attemptTimer.current = null;
        activeAttempt.current = null;
        setIsSigningIn(false);
        setIsLoading(false);
      }
    }
  }, [router, supabaseClient]);

  useEffect(() => () => {
    activeAttempt.current = null;
    attemptedSession.current = false;
    if (attemptTimer.current) clearTimeout(attemptTimer.current);
  }, []);

  useEffect(() => {
    if (reloadRequired.current || activeAttempt.current) return;
    if (sessionLoading || !router.isReady) {
      const timer = setTimeout(() => {
        reloadRequired.current = true;
        setRequiresReload(true);
        setMessage(LOGIN_RETRY_MESSAGE);
        setIsLoading(false);
      }, LOGIN_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
    if (session && !attemptedSession.current) {
      void runLogin();
    } else {
      setIsLoading(false);
    }
  }, [session, sessionLoading, router.isReady, runLogin]);

  const handleSignIn = async () => {
    if (!router.isReady || sessionLoading || activeAttempt.current || reloadRequired.current) return;
    if (!email.trim() || !password) {
      setMessage('Por favor ingresa tu correo y contraseña');
      return;
    }
    await runLogin({ email: email.trim(), password });
  };

  /**
   * S9 — password recovery request.
   *
   * Three fixes, all small and all user-visible:
   *
   *   NORMALISATION. The address went to Supabase exactly as typed. A trailing
   *   space from a copy-paste, or `Nombre@Colegio.cl` when the account is stored
   *   lowercase, produced a request that matched nothing — and, because the
   *   endpoint is deliberately silent about whether an account exists, the user
   *   was told the mail had been sent. Trimmed and lower-cased, matching
   *   `normalizeEmail` in lib/signups.ts, which is how every address in this
   *   platform is stored.
   *
   *   IN-FLIGHT STATE. There was none, so repeated clicks issued repeated
   *   requests and each new link invalidated the last.
   *
   *   ANTI-ENUMERATION. Supabase answers identically whether or not the account
   *   exists — and the old code then leaked the difference anyway by printing
   *   the provider's error message. The response here is now the same sentence
   *   in every outcome, success or failure, so the form cannot be used to test
   *   whether an address has an account. The provider error still reaches the
   *   console for operators.
   */
  const RESET_ACKNOWLEDGEMENT =
    'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. ' +
    'Revisa tu bandeja de entrada y la carpeta de spam.';

  const handlePasswordReset = async () => {
    if (sendingResetRef.current) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setMessage('Por favor ingresa tu correo electrónico');
      return;
    }

    sendingResetRef.current = true;
    setIsSendingReset(true);
    setMessage('');

    try {
      // THE SERVER SENDS THE LINK. This used to call
      // `supabaseClient.auth.resetPasswordForEmail()`, which sends SUPABASE'S
      // template with SUPABASE'S link — landing as an implicit `#access_token=`
      // fragment or a PKCE `?code=`, depending on a dashboard setting. Neither of
      // those can be turned into server-verifiable, purpose-bound, one-time proof,
      // which is what the recovery ceremony now requires, and neither is the
      // format the invitation path already used.
      //
      // `/api/auth/recovery-request` mints the same `?token_hash=` URL every other
      // recovery path in this platform sends, through the same server-only mailer.
      // It answers identically whether or not the account exists.
      const response = await fetch('/api/auth/recovery-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        // Logged, never shown. The acknowledgement below is the same sentence on
        // every path, so the form cannot be used to test whether an address has
        // an account.
        console.error('[Login] password reset request failed:', response.status);
      }
    } catch (err) {
      console.error('[Login] password reset request threw:', err);
    } finally {
      // Identical answer on every path.
      setMessage(RESET_ACKNOWLEDGEMENT);
      sendingResetRef.current = false;
      setIsSendingReset(false);
    }
  };

  if (requiresReload) {
    return (
      <>
        <Head><title>Iniciar sesión | Genera</title></Head>
        <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
            <h1 className="text-2xl font-bold text-gray-900">No pudimos iniciar sesión</h1>
            <p role="alert" className="mt-4 text-gray-700">{message}</p>
            <button
              type="button"
              data-testid="login-retry"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-lg bg-[#0a0a0a] px-6 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              Reintentar
            </button>
          </div>
        </main>
      </>
    );
  }

  // Show loading state while checking session
  if (isLoading) {
    return (
      <>
        <Head>
          <title>Inicia sesión en tu cuenta | Genera</title>
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
        <title>Inicia sesión en tu cuenta | Genera</title>
      </Head>
      
      <div className="min-h-screen flex relative overflow-hidden">
        {/* Left Side - Hero Section */}
        <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#0a0a0a] via-[#0a0a0a] to-[#1f1f1f]">
          {/* Animated Background Pattern - Genera Icons */}
          <div className="absolute inset-0 opacity-[0.04]">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 120 120'%3E%3Ccircle cx='60' cy='60' r='50' fill='none' stroke='%23ffffff' stroke-width='10' stroke-dasharray='280 40'/%3E%3Ccircle cx='60' cy='60' r='12' fill='%23ffffff'/%3E%3Cline x1='60' y1='60' x2='95' y2='60' stroke='%23ffffff' stroke-width='10' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundSize: '30px 30px'
            }}></div>
          </div>
          
          {/* Glowing Orbs */}
          <div className="absolute top-20 left-20 w-72 h-72 bg-[#fbbf24] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-20 right-20 w-72 h-72 bg-[#fbbf24] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>
          
          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center items-center w-full px-12 text-white">
            {/* Logo */}
            <div className="mb-12 transform hover:scale-105 transition-transform duration-300">
              <Link href="/">
                <img
                  src="/genera/logo-full-transparent.svg"
                  alt="Genera - Hub de Transformación"
                  className="h-72 w-auto drop-shadow-2xl cursor-pointer"
                />
              </Link>
            </div>

            {/* Decorative Elements */}
            <div className="absolute top-10 right-10 w-8 h-8 bg-[#fbbf24] rounded-full animate-bounce"></div>
            <div className="absolute bottom-10 left-10 w-6 h-6 bg-[#fbbf24] rounded-full animate-bounce animation-delay-1000"></div>
          </div>
        </div>
        
        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
          {/* Mobile Logo - Only shown on small screens */}
          <div className="lg:hidden absolute top-8 left-1/2 transform -translate-x-1/2">
            <Link href="/">
              <img
                src="/genera/logo-horizontal-on-light.svg"
                alt="Genera"
                className="h-10 w-auto cursor-pointer hover:opacity-80 transition-opacity duration-200"
              />
            </Link>
          </div>
          
          {/* Login Card */}
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-[#0a0a0a] mb-2">
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
          <label htmlFor="login-email" className="block text-sm font-semibold text-gray-700 mb-2">Correo electrónico</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400 group-focus-within:text-[#0a0a0a] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
            </div>
            <input
              id="login-email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              data-testid="login-email"
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent transition-all duration-200 hover:border-gray-400"
            />
          </div>
        </div>
        
        {/* Password input - only show in login mode */}
        {!isResetMode && (
          <div className="mb-6">
            <label htmlFor="login-password" className="block text-sm font-semibold text-gray-700 mb-2">Contraseña</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400 group-focus-within:text-[#0a0a0a] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                id="login-password"
                data-testid="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent transition-all duration-200 hover:border-gray-400"
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
                disabled={isSigningIn}
                onClick={() => setIsResetMode(true)}
                data-testid="login-forgot-password"
                className="text-sm font-medium text-[#0a0a0a] hover:text-[#fbbf24] transition-colors duration-200 flex items-center"
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
              disabled={isSendingReset}
              data-testid="login-reset-back"
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver
            </button>
            <button 
              type="button"
              onClick={handlePasswordReset} 
              disabled={isSendingReset}
              data-testid="login-reset-submit"
              className={`flex-1 font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform shadow-lg text-white
                ${isSendingReset
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#0a0a0a] to-[#1f1f1f] hover:from-[#1f1f1f] hover:to-[#0a0a0a] hover:scale-[1.02]'
                }`}
            >
              {isSendingReset ? (
                <>
                  <svg className="animate-spin h-5 w-5 inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Enviando...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Enviar enlace
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="mb-6">
            <button 
              type="submit"
              data-testid="login-submit"
              disabled={isSigningIn}
              className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform text-white shadow-lg
                ${isSigningIn 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-[#0a0a0a] to-[#1f1f1f] hover:from-[#1f1f1f] hover:to-[#0a0a0a] hover:scale-[1.02] hover:shadow-xl'
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
          <div
            data-testid="login-message"
            className={`p-4 rounded-lg flex items-start space-x-3 animate-fade-in ${
            message.includes('failed') || message.includes('Error') || message.includes('incorrectos')
              ? 'bg-red-50 border border-red-200'
              : 'bg-[#fbbf24]/10 border border-[#fbbf24]/30'
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
            <a href="mailto:soporte@nuevaeducacion.org" className="font-medium text-[#0a0a0a] hover:text-[#fbbf24] transition-colors duration-200">
              Contacta soporte
            </a>
          </p>
        </div>

        {/* FNE Logo - Clickable to home */}
        <a href="/" className="mt-8 flex justify-center opacity-50 hover:opacity-80 transition-opacity duration-300">
          <img
            src="/Logo BW.png?v=3"
            alt="Fundación Nueva Educación"
            className="h-12 w-auto"
          />
        </a>

        </form>
          </div>
        </div>
      </div>
    </>
  );
}
