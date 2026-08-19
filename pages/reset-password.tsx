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
 * WHAT WAS BROKEN, in three rounds. The third is the one that matters.
 * ==========================================================================
 *
 * ROUND ONE (S12). The page's first action was `getSession()`, and ANY session
 * satisfied it. A signed-in visitor got a working password form with no
 * credential at all, and opening SOMEONE ELSE'S expired link while signed in
 * changed YOUR password.
 *
 * ROUND TWO closed four holes in that fix: the legacy fragment branch still
 * trusted the session; `detectSessionInUrl` raced the page for the URL;
 * `signOut()`'s `{ error }` return was ignored; and the password write still
 * happened in the browser with no audit row.
 *
 * ROUND THREE — the finding this version answers. Round two moved the write to
 * the server, which was right, and then PROVED IDENTITY TO THAT SERVER WITH AN
 * ACCESS TOKEN. The page consumed the recovery material here (`verifyOtp`), took
 * the session that fell out of it, and posted that token as a bearer credential.
 * `/api/auth/recovery-complete` called `auth.getUser(token)` and changed the
 * named account's password.
 *
 * `getUser` proves a token is valid and says whose it is. It does not say WHAT
 * MINTED IT — and an ordinary password login mints an indistinguishable token.
 * So any signed-in account could post its own access token to that endpoint and
 * set a new password with no link and no current password. The S12 defect,
 * closed in the page, had reopened one layer down at the API.
 *
 * ==========================================================================
 * WHAT REPLACES IT: THIS PAGE VERIFIES NOTHING.
 * ==========================================================================
 *
 *   THE BROWSER NO LONGER CONSUMES THE CREDENTIAL. There is no `verifyOtp`, no
 *   `exchangeCodeForSession`, no `setSession`, no `getUser` and no `getSession`
 *   anywhere on this page. The one-time `token_hash` is forwarded to
 *   `/api/auth/recovery-exchange`, which consumes it server-side and returns an
 *   opaque, short-lived grant. `/api/auth/recovery-complete` accepts only that
 *   grant, whose provider attempts are bounded and atomically leased.
 *
 *   ONE FORMAT IS ACCEPTED, and it is the format this application itself sends.
 *   `lib/auth/recovery-link.ts` builds every recovery URL the platform emits —
 *   invitation, resend, and now self-service too (`/api/auth/recovery-request`) —
 *   as `/reset-password?token_hash=...&type=recovery`.
 *
 *   THE OTHER FORMATS ARE REFUSED BY NAME. An implicit `#access_token=` fragment
 *   is an ORDINARY SESSION CREDENTIAL: there is no server-side check that could
 *   tell it apart from a login, so accepting it would be the same defect wearing
 *   a different hat. A PKCE `?code=` can only be exchanged with a verifier held
 *   in this browser, so there is nothing the server could verify. Both get a
 *   plain es-CL "solicita un enlace nuevo" instead of a fall-through.
 *
 *   THE FORM OPENS ONLY AFTER EXCHANGE. Provider policy rejection, 5xx, and
 *   network failure do not require a second e-mail: the grant remains usable
 *   until its short lifetime or bounded attempt count ends.
 *
 *   ANY PRE-EXISTING SESSION IS SIGNED OUT before the form opens, and the
 *   `{ error }` return is checked. Nothing here depends on a session any more,
 *   so this is defence in depth rather than the control — but a recovery form
 *   rendered over somebody else's live session is a state worth refusing.
 *
 *   NOTHING IS LOGGED. No hash, no fragment, no URL and no password reaches the
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
  /**
   * Whether the URL carried an implicit-flow fragment of ANY completeness.
   * Recorded only so the page can refuse it explicitly.
   */
  hasImplicitFragment: boolean;
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
  unsupportedFormat:
    'Este enlace usa un formato que ya no aceptamos por seguridad. Solicita un enlace de recuperación nuevo desde la página de inicio de sesión.',
  signOutFailed:
    'No pudimos cerrar la sesión anterior de forma segura, así que no abrimos el formulario. Cierra sesión e intenta con el enlace nuevamente.',
  sessionLost:
    'Tu sesión de recuperación expiró. Solicita un enlace de recuperación nuevo.',
  mismatch: 'Las contraseñas no coinciden',
  samePassword: 'La nueva contraseña debe ser diferente a la anterior',
  weak: 'La contraseña no cumple con los requisitos de seguridad del sistema',
  generic: 'No se pudo actualizar la contraseña. Inténtalo nuevamente.',
  grantUnavailable:
    'No pudimos preparar la recuperación. Inténtalo nuevamente en unos momentos.',
  success: 'Contraseña actualizada exitosamente',
} as const;

/**
 * Reads recovery material out of a URL. Pure, exported, and tested directly.
 *
 * It only reads. Every judgement about what is usable lives in
 * `judgeRecoveryMaterial` below, so the admission rule is one function that can
 * be asserted on directly rather than a sequence of early returns in an effect.
 */
export function readRecoveryMaterial(search: string, hash: string): RecoveryMaterial {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  const fragmentType = fragment.get('type');

  return {
    tokenHash: query.get('token_hash'),
    code: query.get('code'),
    rawToken: query.get('token'),
    type: query.get('type') ?? fragmentType,
    // Recorded so the page can REFUSE it by name rather than ignoring it. See
    // the header: a fragment access token is an ordinary session credential and
    // is not recovery proof.
    hasImplicitFragment: Boolean(accessToken || refreshToken || fragmentType),
  };
}

export function hasRecoveryMaterial(material: RecoveryMaterial): boolean {
  return Boolean(
    material.tokenHash || material.code || material.rawToken || material.hasImplicitFragment
  );
}

/** The only `type` this page will act on. Absent means recovery. */
function typeIsRecovery(material: RecoveryMaterial): boolean {
  return material.type === null || material.type === 'recovery';
}

/**
 * The verdict this page reaches from the URL alone, with no network call.
 *
 * Exported and pure so it can be asserted directly: it is the whole of the
 * page's admission logic, and it admits exactly ONE shape.
 */
export type UsableMaterial = { usable: true; tokenHash: string };
export type UnusableMaterial = { usable: false; message: string };
export type MaterialVerdict = UsableMaterial | UnusableMaterial;

/** A guard, not truthiness: this project compiles with `strict: false`. */
export function isUnusableMaterial(verdict: MaterialVerdict): verdict is UnusableMaterial {
  return verdict.usable === false;
}

export function judgeRecoveryMaterial(material: RecoveryMaterial): MaterialVerdict {
  if (!hasRecoveryMaterial(material)) {
    return { usable: false, message: RECOVERY_MESSAGES.missing };
  }

  // An implicit fragment carries an ORDINARY ACCESS TOKEN. Refused by name,
  // before anything else looks at it, because "it says type=recovery" was the
  // admission ticket that let a hand-typed fragment open this form.
  if (material.hasImplicitFragment) {
    return { usable: false, message: RECOVERY_MESSAGES.unsupportedFormat };
  }

  if (!typeIsRecovery(material)) {
    return { usable: false, message: RECOVERY_MESSAGES.wrongType };
  }

  // PKCE. The code can only be exchanged with a verifier this browser holds, so
  // there is nothing the SERVER could verify — and the server is where the
  // ceremony now lives. Every link this platform sends is `token_hash`.
  if (material.code) {
    return { usable: false, message: RECOVERY_MESSAGES.unsupportedFormat };
  }

  // A raw `{{ .Token }}` link needs the account's e-mail to verify, and the page
  // does not have it.
  if (!material.tokenHash) {
    return { usable: false, message: RECOVERY_MESSAGES.rawToken };
  }

  return { usable: true, tokenHash: material.tokenHash };
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
   * The material this page will FORWARD. It is not a credential this page has
   * verified — nothing here verifies anything any more — it is the one-time
   * string from the URL, held so it survives the URL being stripped.
   *
   * A ref rather than state: it must never influence rendering and must never be
   * serialised into the DOM.
   */
  const grantRef = useRef<string | null>(null);

  /** The admission decision runs at most once per page load. */
  const judgedRef = useRef(false);

  const stripUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.history.replaceState({}, '', '/reset-password');
  }, []);

  const fail = useCallback((text: string) => {
    setMessage(text);
    setPhase('invalid');
  }, []);

  useEffect(() => {
    if (judgedRef.current) return;
    judgedRef.current = true;

    const admit = async () => {
      const verdict = judgeRecoveryMaterial(material);

      if (isUnusableMaterial(verdict)) {
        stripUrl();
        fail(verdict.message);
        return;
      }

      // --- Discard any pre-existing session BEFORE opening the form ----------
      // Nothing here depends on a session any more, so this is not load-bearing
      // for identity — but a recovery form rendered over somebody else's live
      // session is a confusing and dangerous state, and the previous defect was
      // exactly a session surviving into a decision about who you are.
      // `scope: 'local'` because the goal is that THIS TAB has nothing; revoking
      // the person's other devices because they clicked a link would be punitive.
      //
      // The RETURN VALUE is checked: supabase-js reports failure as `{ error }`
      // rather than throwing, so a try/catch alone cannot see it.
      try {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) {
          stripUrl();
          fail(RECOVERY_MESSAGES.signOutFailed);
          return;
        }
      } catch {
        stripUrl();
        fail(RECOVERY_MESSAGES.signOutFailed);
        return;
      }

      let exchange: Response;
      try {
        exchange = await fetch('/api/auth/recovery-exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenHash: verdict.tokenHash, type: 'recovery' }),
        });
      } catch {
        stripUrl();
        fail(RECOVERY_MESSAGES.grantUnavailable);
        return;
      }

      const exchanged = await exchange.json().catch(() => ({} as Record<string, unknown>));
      if (!exchange.ok || typeof (exchanged as { grant?: unknown }).grant !== 'string') {
        stripUrl();
        fail(
          exchange.status >= 500
            ? RECOVERY_MESSAGES.grantUnavailable
            : RECOVERY_MESSAGES.expired
        );
        return;
      }

      grantRef.current = (exchanged as { grant: string }).grant;
      stripUrl();
      setPhase('ready');
    };

    void admit();
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

    const grant = grantRef.current;
    if (!grant) {
      setMessage(RECOVERY_MESSAGES.sessionLost);
      setPhase('invalid');
      return;
    }

    setLoading(true);
    try {
      // The e-mailed one-time proof has already been exchanged. This request
      // carries only the bounded grant; no session credential is accepted.
      //
      // No Authorization header. There is deliberately no session credential in
      // this request: an access token is not proof of a recovery, and the
      // endpoint would refuse one anyway because it never reads one.
      const response = await fetch('/api/auth/recovery-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant, newPassword: password }),
      });

      const result = await response.json().catch(() => ({} as Record<string, unknown>));

      if (!response.ok) {
        const code = (result as { code?: string }).code;

        if (
          code === 'RECOVERY_GRANT_INVALID' ||
          code === 'RECOVERY_ATTEMPTS_EXHAUSTED'
        ) {
          grantRef.current = null;
          setMessage(RECOVERY_MESSAGES.expired);
          setPhase('invalid');
          return;
        }

        // Provider policy and transient failures leave the bounded grant alive.
        // The endpoint's message is es-CL and contains no provider wording.
        setMessage((result as { error?: string }).error || RECOVERY_MESSAGES.generic);
        return;
      }

      grantRef.current = null;
      setMessage(RECOVERY_MESSAGES.success);
      setPhase('updated');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch {
      // No error object is logged: it can carry the request, and the request
      // carries the one-time material.
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
