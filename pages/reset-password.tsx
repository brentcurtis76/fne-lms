// The default React import is required for the classic JSX transform Vitest
// uses (Next.js compiles with the automatic runtime and does not need it).
// `pages/login.tsx` carries it for the same reason.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import Link from 'next/link';
import { PASSWORD_RULES, firstPasswordPolicyError } from '../lib/auth/password-policy';

/**
 * Password recovery.
 *
 * S12 — WHAT WAS BROKEN. The page's first action was:
 *
 *     const { data: { session } } = await supabase.auth.getSession();
 *     if (session) { setHasValidSession(true); ...; return; }
 *
 * Any session at all satisfied it, and the comment above it said so out loud
 * ("this handles cases where the token was already processed"). Three
 * consequences, in ascending order of seriousness:
 *
 *   1. A signed-in user who simply navigated to /reset-password got a working
 *      password-change form, with no recovery credential of any kind.
 *   2. When a token DID fail to verify, the handler fell back to checking for a
 *      session — and a pre-existing one would answer yes, so an expired or
 *      already-used link still produced a usable form.
 *   3. Worst: opening SOMEONE ELSE'S recovery link while signed in. If the token
 *      failed (expired, reused), the page used the session it already had and
 *      the submit changed the SIGNED-IN account's password — not the account
 *      the link belonged to.
 *
 * WHAT REPLACES IT. Recovery proof must come from the URL, and only from the
 * URL:
 *
 *   - The page reads the URL for recovery material FIRST, synchronously, before
 *     anything can consume or rewrite it. No material → the invalid-link screen.
 *     A session is never proof of anything here.
 *   - When material IS present and a session already exists, the existing
 *     session is signed out BEFORE the credential is consumed. That is what
 *     makes case 3 impossible: if verification then fails there is no session
 *     left to fall back onto, and if it succeeds the session belongs to the
 *     link's owner. Signing out a user who opened a stale link is a small cost
 *     for a failure mode with no safe reading.
 *   - The verified user's id is captured and re-checked at submit time, so the
 *     update can only ever land on the account the link proved.
 *   - The URL is stripped only AFTER the material has been consumed.
 */

type Phase = 'validating' | 'ready' | 'invalid' | 'updated';

/** What the URL carried, read once and synchronously. */
interface RecoveryMaterial {
  tokenHash: string | null;
  code: string | null;
  rawToken: string | null;
  hashRecovery: boolean;
}

export const RECOVERY_MESSAGES = {
  expired:
    'El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo desde la página de inicio de sesión.',
  missing:
    'Este enlace no es válido. Para cambiar tu contraseña, solicita un enlace de recuperación desde la página de inicio de sesión.',
  rawToken:
    'El enlace no contiene la información necesaria. Solicita un enlace de recuperación nuevo desde la página de inicio de sesión.',
  identityChanged:
    'La sesión de recuperación cambió. Por seguridad no se actualizó ninguna contraseña. Solicita un enlace nuevo.',
  sessionLost:
    'Tu sesión de recuperación expiró. Solicita un enlace de recuperación nuevo.',
  mismatch: 'Las contraseñas no coinciden',
  samePassword: 'La nueva contraseña debe ser diferente a la anterior',
  weak: 'La contraseña no cumple con los requisitos de seguridad del sistema',
  generic: 'No se pudo actualizar la contraseña. Inténtalo nuevamente.',
  success: 'Contraseña actualizada exitosamente',
} as const;

/** Reads recovery material out of a URL. Exported for direct testing. */
export function readRecoveryMaterial(search: string, hash: string): RecoveryMaterial {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

  return {
    tokenHash: query.get('token_hash'),
    code: query.get('code'),
    rawToken: query.get('token'),
    // The legacy implicit flow. `type=recovery` alone is not enough — without an
    // access token there is nothing to consume.
    hashRecovery: fragment.get('type') === 'recovery' && Boolean(fragment.get('access_token')),
  };
}

export function hasRecoveryMaterial(material: RecoveryMaterial): boolean {
  return Boolean(
    material.tokenHash || material.code || material.rawToken || material.hashRecovery
  );
}

export default function ResetPasswordPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>('validating');

  /**
   * The account the recovery credential proved. Every update is checked against
   * it, so a session that changes underneath the form (a second tab, a
   * background refresh, a link opened for a different account) cannot redirect
   * the password change onto another identity.
   */
  const recoveredUserIdRef = useRef<string | null>(null);

  /**
   * The credential may be consumed at most ONCE per page load.
   *
   * React 18 Strict Mode (`reactStrictMode: true` in next.config.js) invokes an
   * effect, runs its cleanup, and invokes it again — in development. A second
   * `verifyOtp` on a one-time token would burn it and report "expired" for a
   * link that was perfectly valid, so the consuming half of the effect is
   * guarded by this ref.
   *
   * What the guard must NOT do is abort the first run. An earlier shape here
   * paired this ref with a `cancelled` flag set by the cleanup: the first
   * invocation started, the cleanup cancelled it, and the second invocation
   * returned early because the ref was already set — so the page sat on
   * "Validando enlace de recuperación..." forever. The subscription below is
   * therefore re-established on every invocation (cleanup unsubscribes it,
   * which is ordinary React), while only `consumeMaterial` is guarded.
   */
  const consumedRef = useRef(false);

  const stripUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.history.replaceState({}, '', '/reset-password');
  }, []);

  const fail = useCallback((text: string) => {
    setMessage(text);
    setPhase('invalid');
  }, []);

  const succeed = useCallback((userId: string | undefined) => {
    recoveredUserIdRef.current = userId ?? null;
    setPhase('ready');
  }, []);

  useEffect(() => {
    // The legacy implicit flow is processed asynchronously by supabase-js, which
    // announces it as PASSWORD_RECOVERY. That event IS recovery proof — it can
    // only follow a recovery token. A plain SIGNED_IN is not, and is ignored.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        stripUrl();
        succeed(session.user?.id);
      }
    });

    const consumeMaterial = async () => {
      // Read the URL BEFORE anything else. supabase-js can consume the hash
      // fragment on its own, and the router can rewrite the query — both would
      // erase the evidence this decision depends on.
      const material =
        typeof window === 'undefined'
          ? { tokenHash: null, code: null, rawToken: null, hashRecovery: false }
          : readRecoveryMaterial(window.location.search, window.location.hash);

      // --- No recovery material: there is nothing to prove identity with. ----
      // This is the entire S12 fix in one branch. The old code asked for a
      // session here and accepted any it found.
      if (!hasRecoveryMaterial(material)) {
        fail(RECOVERY_MESSAGES.missing);
        return;
      }

      // A raw `{{ .Token }}` link needs the account's e-mail to verify, and the
      // page does not have it. Say so plainly rather than falling through.
      if (material.rawToken && !material.tokenHash && !material.code) {
        stripUrl();
        fail(RECOVERY_MESSAGES.rawToken);
        return;
      }

      // --- Discard any pre-existing session BEFORE consuming the credential --
      // Without this, a failed verification leaves the previous session intact
      // and the form would act on it — which is how opening someone else's
      // expired link could change YOUR password.
      if (material.tokenHash || material.code) {
        try {
          const { data: { session: existing } } = await supabase.auth.getSession();
          if (existing) {
            await supabase.auth.signOut();
          }
        } catch {
          // A failed sign-out must not silently leave the old session in play,
          // so treat it as a failed recovery rather than continuing.
          fail(RECOVERY_MESSAGES.expired);
          return;
        }
      }

      // --- Method 1: token_hash (Supabase e-mail links, PKCE templates) ------
      if (material.tokenHash) {
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: material.tokenHash,
            type: 'recovery',
          });

          stripUrl();

          if (error || !data?.session) {
            fail(RECOVERY_MESSAGES.expired);
            return;
          }

          succeed(data.session.user?.id);
          return;
        } catch {
          stripUrl();
          fail(RECOVERY_MESSAGES.expired);
          return;
        }
      }

      // --- Method 2: PKCE code ----------------------------------------------
      if (material.code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(material.code);

          stripUrl();

          if (error || !data?.session) {
            fail(RECOVERY_MESSAGES.expired);
            return;
          }

          succeed(data.session.user?.id);
          return;
        } catch {
          stripUrl();
          fail(RECOVERY_MESSAGES.expired);
          return;
        }
      }

      // --- Method 3: legacy hash fragment -----------------------------------
      // supabase-js consumes it and emits PASSWORD_RECOVERY, handled by the
      // listener above. Give it a bounded window, then check whether a session
      // actually materialised. `getSession()` is safe to consult HERE and only
      // here: we already know this page load carried recovery material in the
      // fragment, so a session that appears now came from consuming it.
      if (material.hashRecovery) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            stripUrl();
            succeed(session.user?.id);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        stripUrl();
        fail(RECOVERY_MESSAGES.expired);
      }
    };

    if (!consumedRef.current) {
      consumedRef.current = true;
      void consumeMaterial();
    }

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fail, succeed, stripUrl]);

  const handlePasswordUpdate = async () => {
    if (phase !== 'ready') return;

    if (password !== confirmPassword) {
      setMessage(RECOVERY_MESSAGES.mismatch);
      return;
    }

    // S5: the shared policy. This form used to accept six characters with no
    // character classes — weaker than what the platform would then accept as a
    // replacement for the very password being set here.
    const policyError = firstPasswordPolicyError(password);
    if (policyError) {
      setMessage(policyError);
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setMessage(RECOVERY_MESSAGES.sessionLost);
        setPhase('invalid');
        return;
      }

      // The identity check. The session that reaches the update must be the one
      // the recovery credential established — not one that appeared since.
      if (recoveredUserIdRef.current && session.user?.id !== recoveredUserIdRef.current) {
        console.error('[ResetPassword] session identity changed since verification');
        setMessage(RECOVERY_MESSAGES.identityChanged);
        setPhase('invalid');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const code = (error as { code?: string }).code;
        const status = (error as { status?: number }).status;

        if (code === 'same_password' || /different from the old password/i.test(error.message ?? '')) {
          setMessage(RECOVERY_MESSAGES.samePassword);
        } else if (status === 422 || /password/i.test(error.message ?? '')) {
          // GoTrue applies its own minimum length and, when enabled, a
          // leaked-password check. Those are dashboard settings the application
          // does not own, so its refusal is surfaced rather than swallowed.
          setMessage(RECOVERY_MESSAGES.weak);
        } else {
          setMessage(RECOVERY_MESSAGES.generic);
        }
        return;
      }

      // The forced-change flag is cleared for the account that was just
      // recovered — this is the path a newly invited user takes to their first
      // password, and S4 will otherwise hold them at /change-password.
      const { error: profileFlagError } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', session.user.id);

      if (profileFlagError) {
        console.error('[ResetPassword] could not clear the forced-change flag:', profileFlagError);
      }

      setMessage(RECOVERY_MESSAGES.success);
      setPhase('updated');
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err) {
      console.error('[ResetPassword] unexpected error:', err);
      setMessage(RECOVERY_MESSAGES.generic);
    } finally {
      setLoading(false);
    }
  };

  const isValidatingToken = phase === 'validating';

  // The banner used to pick its colour by looking for the substring "Error" in
  // the message. None of the messages this page emits contains that word any
  // more, so "las contraseñas no coinciden" would have rendered in the success
  // palette. Derive it from the one thing that actually distinguishes them.
  const isErrorMessage = Boolean(message) && message !== RECOVERY_MESSAGES.success;

  // Show loading state while validating token
  if (isValidatingToken) {
    return (
      <>
        <Head>
          <title>Restablecer Contraseña | Genera</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-brand_beige">
          <div className="text-center" data-testid="reset-validating">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand_blue"></div>
            <p className="mt-2 text-gray-600">Validando enlace de recuperación...</p>
          </div>
        </div>
      </>
    );
  }

  // S12: an invalid, expired, reused or absent recovery link gets THIS — not a
  // usable password form. The old page reached the form whenever any session
  // existed, which is what let a signed-in visitor change a password with no
  // recovery credential at all.
  if (phase === 'invalid') {
    return (
      <>
        <Head>
          <title>Restablecer Contraseña | Genera</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="w-full max-w-md text-center" data-testid="reset-invalid-link">
            <Link href="/">
              <img
                src="/images/logo.png"
                alt="Fundación Nueva Educación"
                className="h-16 w-auto mx-auto mb-8 cursor-pointer"
              />
            </Link>

            <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-[#0a0a0a] mb-3">
              Enlace no válido
            </h1>
            <p className="text-gray-600 mb-8">
              {message || RECOVERY_MESSAGES.missing}
            </p>

            <button
              type="button"
              onClick={() => router.push('/login')}
              data-testid="reset-invalid-back-to-login"
              className="w-full bg-gradient-to-r from-[#0a0a0a] to-[#002844] hover:from-[#002844] hover:to-[#0a0a0a] text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg"
            >
              Ir a iniciar sesión
            </button>

            <p className="mt-8 text-sm text-gray-600">
              ¿Necesitas ayuda?
              <a
                href="mailto:soporte@nuevaeducacion.org"
                className="font-medium text-[#0a0a0a] hover:text-[#fbbf24] transition-colors duration-200 ml-1"
              >
                Contacta soporte
              </a>
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Restablecer Contraseña | Genera</title>
      </Head>

      <div className="min-h-screen flex relative overflow-hidden">
        {/* Left Side - Hero Section */}
        <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#0a0a0a] via-[#0a0a0a] to-[#002844]">
          {/* Animated Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fdb933' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
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
                  src="/images/logo.png"
                  alt="Fundación Nueva Educación"
                  className="h-32 w-auto drop-shadow-2xl cursor-pointer"
                />
              </Link>
            </div>

            {/* Text Content */}
            <h1 className="text-5xl font-bold mb-4 text-center animate-fade-in-up">
              Plataforma de
              <span className="block text-[#fbbf24] mt-2">Crecimiento</span>
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
            <div className="absolute top-10 right-10 w-8 h-8 bg-[#fbbf24] rounded-full animate-bounce"></div>
            <div className="absolute bottom-10 left-10 w-6 h-6 bg-[#fbbf24] rounded-full animate-bounce animation-delay-1000"></div>
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
              <h2 className="text-3xl font-bold text-[#0a0a0a] mb-2">
                Restablecer Contraseña
              </h2>
              <p className="text-gray-600">
                Ingresa tu nueva contraseña para continuar
              </p>
            </div>

            <form
              data-testid="reset-password-form"
              onSubmit={(e) => {
                e.preventDefault();
                handlePasswordUpdate();
              }}
            >
              {/* New Password input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nueva Contraseña</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400 group-focus-within:text-[#0a0a0a] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    data-testid="reset-new-password"
                    className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent transition-all duration-200 hover:border-gray-400"
                  />
                </div>
              </div>

              {/* Confirm Password input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Confirmar Contraseña</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400 group-focus-within:text-[#0a0a0a] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    data-testid="reset-confirm-password"
                    className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent transition-all duration-200 hover:border-gray-400"
                  />
                </div>
              </div>

              {/* Password requirements — the shared policy (S5). This form used
                  to accept six characters with no character classes. */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Requisitos de la contraseña:
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(password);
                    return (
                      <li
                        key={rule.id}
                        className={`flex items-center gap-1 ${met ? 'text-green-600' : ''}`}
                      >
                        <span>{met ? '✓' : '•'}</span>
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Update Password Button */}
              <div className="mb-6">
                <button
                  type="submit"
                  data-testid="reset-submit"
                  disabled={loading || phase === 'updated'}
                  className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform text-white shadow-lg
                    ${loading || phase === 'updated'
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#0a0a0a] to-[#002844] hover:from-[#002844] hover:to-[#0a0a0a] hover:scale-[1.02] hover:shadow-xl'
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
                  className="text-sm font-medium text-[#0a0a0a] hover:text-[#fbbf24] transition-colors duration-200 flex items-center justify-center mx-auto"
                >
                  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Volver al inicio de sesión
                </button>
              </div>

              {/* Error/success message */}
              {message && (
                <div
                  data-testid="reset-message"
                  className={`mt-6 p-4 rounded-lg flex items-start space-x-3 animate-fade-in ${
                  isErrorMessage
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-[#fbbf24]/10 border border-[#fbbf24]/30'
                }`}>
                  {isErrorMessage ? (
                    <svg className="h-5 w-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-[#b8860b] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <p className={`text-sm ${
                    isErrorMessage
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
                <a href="mailto:soporte@nuevaeducacion.org" className="font-medium text-[#0a0a0a] hover:text-[#fbbf24] transition-colors duration-200 ml-1">
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
