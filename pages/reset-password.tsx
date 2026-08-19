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
 * ==========================================================================
 * WHAT WAS BROKEN, in two rounds.
 * ==========================================================================
 *
 * ROUND ONE (S12). The page's first action was `getSession()`, and ANY session
 * satisfied it. A signed-in visitor got a working password form with no
 * credential at all; a token that failed to verify fell back to the session that
 * was already there; and opening SOMEONE ELSE'S expired link while signed in
 * changed YOUR password.
 *
 * ROUND TWO — what the first fix missed, and this one closes:
 *
 *   1. THE LEGACY FRAGMENT BRANCH STILL TRUSTED THE SESSION. The sign-out
 *      before consumption was applied only to `token_hash` and `code`. The
 *      implicit branch went straight to polling `getSession()` — and the
 *      admission ticket for that branch was merely "the fragment CONTAINS the
 *      strings `type=recovery` and `access_token`". Anyone could type those into
 *      an address bar. A signed-in visitor appending
 *      `#access_token=x&type=recovery` was handed the form on their OWN live
 *      session, which is the original defect wearing a hat. Supabase's own
 *      behaviour makes it worse: when implicit processing FAILS it leaves the
 *      pre-existing session in place, so a genuinely broken link landed in the
 *      same hole.
 *
 *   2. A RACE decided whether valid links worked. The shared browser client is
 *      built in `_app`'s module scope with `detectSessionInUrl` on by default,
 *      so it asynchronously consumed and ERASED the fragment. Whether this
 *      page's effect or that pass ran first was timing.
 *
 *   3. `signOut()`'s RETURN was ignored. supabase-js reports failure as
 *      `{ error }` — it does not throw — so the `try/catch` around it caught
 *      nothing and a failed sign-out continued into consumption with the old
 *      session intact.
 *
 *   4. THE PASSWORD WRITE HAPPENED IN THE BROWSER. `supabase.auth.updateUser`,
 *      then a browser PATCH to clear `must_change_password` whose failure was
 *      logged and ignored while the UI said "exitosamente", and no audit row
 *      anywhere.
 *
 * ==========================================================================
 * WHAT REPLACES IT.
 * ==========================================================================
 *
 *   THE URL IS THE ONLY SOURCE OF IDENTITY. Material is read during the first
 *   render, before any effect, and `detectSessionInUrl` is off on the shared
 *   client (see lib/supabase-wrapper.ts) so nothing else can consume it. There
 *   is no race left to lose.
 *
 *   EVERY BRANCH SIGNS OUT FIRST, and checks the `{ error }` it gets back.
 *   Local scope: the point is that this tab cannot fall back on a session, not
 *   to revoke the person's phone.
 *
 *   EVERY BRANCH VERIFIES WITH THE AUTH SERVER. After consumption the resulting
 *   access token is handed to `getUser(token)` — a round trip that validates
 *   signature, expiry and revocation and returns the account it belongs to. The
 *   form opens for that account or for nobody. `getSession()` is never consulted
 *   as proof anywhere on this page.
 *
 *   THE LEGACY FRAGMENT NEEDS ALL THREE TOKENS — `access_token`,
 *   `refresh_token` and `type=recovery` — and is established with an explicit
 *   `setSession()` whose error is checked, then verified like the others. The
 *   presence of a string is no longer an admission ticket.
 *
 *   THE PASSWORD IS WRITTEN BY THE SERVER. The verified access token goes to
 *   `/api/auth/recovery-complete` as a bearer credential; that endpoint
 *   re-verifies it with `getUser()`, re-checks the shared policy, writes the
 *   password for the account the AUTH SERVER names, clears the forced-change
 *   flag through the trusted database path, and records
 *   `password_change_recovery`. Opening another account's link can therefore
 *   only ever act on that link's owner — the bearer token came from the link.
 *
 *   NOTHING IS LOGGED. No token, no hash, no fragment, no URL reaches the
 *   console or any response body.
 */

type Phase = 'validating' | 'ready' | 'invalid' | 'updated';

/** What the URL carried, read once and synchronously. */
export interface RecoveryMaterial {
  tokenHash: string | null;
  code: string | null;
  rawToken: string | null;
  /** The declared `type`, if the link carried one. */
  type: string | null;
  /** The legacy implicit fragment, only when it is COMPLETE. */
  implicit: { accessToken: string; refreshToken: string } | null;
  /** An implicit-looking fragment that is missing something. Never usable. */
  implicitIncomplete: boolean;
}

export const RECOVERY_MESSAGES = {
  expired:
    'El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo desde la página de inicio de sesión.',
  missing:
    'Este enlace no es válido. Para cambiar tu contraseña, solicita un enlace de recuperación desde la página de inicio de sesión.',
  rawToken:
    'El enlace no contiene la información necesaria. Solicita un enlace de recuperación nuevo desde la página de inicio de sesión.',
  wrongType:
    'Este enlace no sirve para cambiar la contraseña. Solicita un enlace de recuperación desde la página de inicio de sesión.',
  signOutFailed:
    'No pudimos cerrar la sesión anterior de forma segura, así que no abrimos el formulario. Cierra sesión e intenta con el enlace nuevamente.',
  sessionLost:
    'Tu sesión de recuperación expiró. Solicita un enlace de recuperación nuevo.',
  mismatch: 'Las contraseñas no coinciden',
  samePassword: 'La nueva contraseña debe ser diferente a la anterior',
  weak: 'La contraseña no cumple con los requisitos de seguridad del sistema',
  generic: 'No se pudo actualizar la contraseña. Inténtalo nuevamente.',
  success: 'Contraseña actualizada exitosamente',
} as const;

/**
 * Reads recovery material out of a URL. Pure, exported, and tested directly.
 *
 * The implicit fragment is admitted ONLY when all three parts are present. A
 * fragment that names `type=recovery` and nothing else — or an `access_token`
 * with no refresh token — is reported as `implicitIncomplete`, which is a hard
 * failure rather than a fall-through, because falling through is what let a
 * hand-typed fragment reach the form on the visitor's own session.
 */
export function readRecoveryMaterial(search: string, hash: string): RecoveryMaterial {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  const fragmentType = fragment.get('type');
  const looksImplicit = Boolean(accessToken || refreshToken || fragmentType);
  const completeImplicit =
    Boolean(accessToken) && Boolean(refreshToken) && fragmentType === 'recovery';

  return {
    tokenHash: query.get('token_hash'),
    code: query.get('code'),
    rawToken: query.get('token'),
    type: query.get('type') ?? fragmentType,
    implicit: completeImplicit
      ? { accessToken: accessToken as string, refreshToken: refreshToken as string }
      : null,
    implicitIncomplete: looksImplicit && !completeImplicit,
  };
}

export function hasRecoveryMaterial(material: RecoveryMaterial): boolean {
  return Boolean(
    material.tokenHash ||
      material.code ||
      material.rawToken ||
      material.implicit ||
      material.implicitIncomplete
  );
}

/** The only `type` this page will act on. Absent means recovery. */
function typeIsRecovery(material: RecoveryMaterial): boolean {
  return material.type === null || material.type === 'recovery';
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
   * The URL, captured during the FIRST RENDER via a lazy initialiser — before
   * any effect of this page or any other component can run, and before the
   * router has a chance to rewrite the query. Combined with
   * `detectSessionInUrl: false` on the shared client, this is what removes the
   * initialisation race entirely rather than narrowing it.
   */
  const [material] = useState<RecoveryMaterial>(() =>
    typeof window === 'undefined'
      ? readRecoveryMaterial('', '')
      : readRecoveryMaterial(window.location.search, window.location.hash)
  );

  /**
   * The credential the recovery proved: the account id, and the access token the
   * server will re-verify. Held in a ref rather than state because it must never
   * influence rendering and must never be serialised into the DOM.
   */
  const provedRef = useRef<{ userId: string; accessToken: string } | null>(null);

  /**
   * The credential may be consumed at most ONCE per page load.
   *
   * React 18 Strict Mode invokes an effect, runs its cleanup, and invokes it
   * again — in development. A second `verifyOtp` on a one-time token would burn
   * it and report "expired" for a link that was perfectly valid.
   *
   * What the guard must NOT do is abort the first run. An earlier shape paired
   * this ref with a `cancelled` flag set by the cleanup: the first invocation
   * was cancelled and the second returned early, leaving the page on
   * "Validando enlace de recuperación..." forever.
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

  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;

    const consume = async () => {
      // --- No recovery material at all -------------------------------------
      // The whole fix in one branch. The old page asked for a session here and
      // accepted any it found.
      if (!hasRecoveryMaterial(material)) {
        fail(RECOVERY_MESSAGES.missing);
        return;
      }

      // A fragment that looks like an implicit link but is missing a token is
      // REFUSED, not ignored. This is the hand-typed
      // `#access_token=x&type=recovery` case.
      if (material.implicitIncomplete) {
        stripUrl();
        fail(RECOVERY_MESSAGES.expired);
        return;
      }

      if (!typeIsRecovery(material)) {
        stripUrl();
        fail(RECOVERY_MESSAGES.wrongType);
        return;
      }

      // A raw `{{ .Token }}` link needs the account's e-mail to verify, and the
      // page does not have it. Say so plainly rather than falling through.
      if (material.rawToken && !material.tokenHash && !material.code && !material.implicit) {
        stripUrl();
        fail(RECOVERY_MESSAGES.rawToken);
        return;
      }

      // --- Discard any pre-existing session BEFORE consuming anything -------
      // Unconditionally, for every branch — the implicit one included, which is
      // where the previous shape left the hole. `scope: 'local'` because the
      // goal is that THIS TAB has nothing to fall back on; revoking the person's
      // other devices because they clicked a stale link would be punitive.
      //
      // The RETURN VALUE is checked. supabase-js reports failure as `{ error }`
      // rather than throwing, so the old try/catch could not see it — and a
      // failed sign-out that continues is precisely how a live session survives
      // into a branch that is about to decide who you are.
      try {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) {
          fail(RECOVERY_MESSAGES.signOutFailed);
          return;
        }
      } catch {
        fail(RECOVERY_MESSAGES.signOutFailed);
        return;
      }

      // --- Consume, then VERIFY WITH THE AUTH SERVER ------------------------
      let accessToken: string | null = null;

      try {
        if (material.tokenHash) {
          // Method 1 — the format this application's own invitation and reset
          // e-mails carry (lib/email/invitations.ts builds
          // `/reset-password?token_hash=…&type=recovery` from
          // `generateLink().properties.hashed_token`), and the format the
          // mandatory e2e opens.
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: material.tokenHash,
            type: 'recovery',
          });
          if (error || !data?.session?.access_token) {
            stripUrl();
            fail(RECOVERY_MESSAGES.expired);
            return;
          }
          accessToken = data.session.access_token;
        } else if (material.code) {
          // Method 2 — PKCE.
          const { data, error } = await supabase.auth.exchangeCodeForSession(material.code);
          if (error || !data?.session?.access_token) {
            stripUrl();
            fail(RECOVERY_MESSAGES.expired);
            return;
          }
          accessToken = data.session.access_token;
        } else if (material.implicit) {
          // Method 3 — the legacy implicit fragment, established EXPLICITLY.
          // We no longer wait for supabase-js to do it and then look for a
          // session: we hand it both tokens and check what it says.
          const { data, error } = await supabase.auth.setSession({
            access_token: material.implicit.accessToken,
            refresh_token: material.implicit.refreshToken,
          });
          if (error || !data?.session?.access_token) {
            stripUrl();
            fail(RECOVERY_MESSAGES.expired);
            return;
          }
          accessToken = data.session.access_token;
        }
      } catch {
        stripUrl();
        fail(RECOVERY_MESSAGES.expired);
        return;
      }

      if (!accessToken) {
        stripUrl();
        fail(RECOVERY_MESSAGES.expired);
        return;
      }

      // The verification every branch shares. `getUser(token)` asks the auth
      // server; it does not decode anything locally. A token that is forged,
      // expired or already revoked dies here even if the step above somehow
      // produced one.
      const { data: verified, error: verifyError } = await supabase.auth.getUser(accessToken);

      // The URL is stripped only AFTER the material has been captured and used.
      stripUrl();

      if (verifyError || !verified?.user?.id) {
        fail(RECOVERY_MESSAGES.expired);
        return;
      }

      provedRef.current = { userId: verified.user.id, accessToken };
      setPhase('ready');
    };

    void consume();
  }, [supabase, material, fail, stripUrl]);

  const handlePasswordUpdate = async () => {
    if (phase !== 'ready') return;

    if (password !== confirmPassword) {
      setMessage(RECOVERY_MESSAGES.mismatch);
      return;
    }

    // The shared policy, for usability. The endpoint re-checks it, and THAT is
    // the boundary — this form used to be the only check anywhere.
    const policyError = firstPasswordPolicyError(password);
    if (policyError) {
      setMessage(policyError);
      return;
    }

    const proved = provedRef.current;
    if (!proved) {
      setMessage(RECOVERY_MESSAGES.sessionLost);
      setPhase('invalid');
      return;
    }

    setLoading(true);
    try {
      // The verified recovery token is the credential. The server re-verifies it
      // and writes the password for whichever account the auth server says it
      // belongs to — never one this page names.
      const response = await fetch('/api/auth/recovery-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${proved.accessToken}`,
        },
        body: JSON.stringify({ newPassword: password }),
      });

      const result = await response.json().catch(() => ({} as Record<string, unknown>));

      if (!response.ok) {
        const code = (result as { code?: string }).code;

        if (code === 'NO_RECOVERY_TOKEN' || code === 'RECOVERY_TOKEN_INVALID') {
          setMessage(RECOVERY_MESSAGES.sessionLost);
          setPhase('invalid');
          return;
        }

        // Everything else is a message the endpoint already wrote in es-CL and
        // already stripped of provider wording.
        setMessage((result as { error?: string }).error || RECOVERY_MESSAGES.generic);
        return;
      }

      // The password is set. Drop the recovery session so the next thing that
      // happens is a real sign-in with the new credential.
      provedRef.current = null;
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

      setMessage(RECOVERY_MESSAGES.success);
      setPhase('updated');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch {
      // No error object is logged: it can carry the request, and the request
      // carries the bearer token.
      console.error('[ResetPassword] the completion request failed');
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
