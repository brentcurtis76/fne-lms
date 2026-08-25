// The default React import is required for the classic JSX transform Vitest
// uses (Next.js compiles with the automatic runtime and does not need it).
// `pages/login.tsx` and `pages/reset-password.tsx` carry it for the same reason.
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import { LockClosedIcon, ExclamationIcon, LogoutIcon } from '@heroicons/react/outline';
import { PASSWORD_RULES, firstPasswordPolicyError } from '../lib/auth/password-policy';
import {
  FORCED_CHANGE_UNVERIFIED_PARAM,
  FORCED_CHANGE_UNVERIFIED_VALUE,
} from '../lib/auth/forced-password-change';

export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isAdminReset, setIsAdminReset] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  // S4: the middleware could not READ the flag (database unreachable) rather
  // than finding it set. It fails closed and sends the user here with a marker.
  // Without the marker this page would read the flag, find it false, push to
  // /dashboard, and be bounced straight back — a redirect ping-pong lasting as
  // long as the outage. With it, the page stops and offers a retry.
  const [verificationUnavailable, setVerificationUnavailable] = useState(false);

  useEffect(() => {
    if (!hasCheckedAuth) {
      checkAuth();
      setHasCheckedAuth(true);
    }
  }, [hasCheckedAuth]);

  /**
   * F1/F3 — the page's state comes from the SERVER now.
   *
   * It used to come from two places the page could not trust and can no longer
   * reach: a browser `profiles` SELECT for the flag, which the database gate in
   * `20260819120000` refuses for precisely the flagged accounts this page
   * serves; and `session.user.user_metadata` for the administrative-reset
   * banner, which is decoded from a cookie the caller owns.
   *
   * `/api/auth/password-change-state` answers both with a service-role read,
   * after establishing the caller with `auth.getUser()`.
   */
  const checkAuth = async () => {
    const arrivedUnverified =
      router.query[FORCED_CHANGE_UNVERIFIED_PARAM] === FORCED_CHANGE_UNVERIFIED_VALUE;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      const response = await fetch('/api/auth/password-change-state', {
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        // The server could not determine the state. Staying put is the safe
        // answer — the alternative is pushing to /dashboard, which the
        // middleware may bounce straight back here.
        console.error('[ChangePassword] could not read the password-change state');
        setVerificationUnavailable(true);
        setLoading(false);
        return;
      }

      const state = (await response.json()) as {
        mustChangePassword?: boolean;
        isAdminReset?: boolean;
      };

      if (!state.mustChangePassword) {
        // The flag is not set. Normally that means the user landed here by
        // mistake and belongs on the dashboard — but if the middleware sent
        // them here because it could not verify, redirecting back is exactly
        // the loop the marker exists to break. Stop and let them choose.
        if (arrivedUnverified) {
          setVerificationUnavailable(true);
          setLoading(false);
          return;
        }
        router.push('/dashboard');
        return;
      }

      setIsAdminReset(state.isAdminReset === true);
      setLoading(false);
    } catch (error) {
      console.error('Auth check error:', error);
      // A network failure is not a reason to sign somebody out, and it is not a
      // reason to send them to a dashboard the middleware will bounce.
      setVerificationUnavailable(true);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // S5: the rule lives in lib/auth/password-policy and is re-checked
  // server-side by /api/auth/force-password-change. This is the usability half.
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    const validationError = firstPasswordPolicyError(newPassword);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUpdating(true);

    try {
      // F3 — ALWAYS the audited server endpoint. This used to call
      // `supabase.auth.updateUser({ password })` from the browser and fall back
      // here only on a 422. "Secure password change" is off on this project, so
      // the 422 never came, so the fallback never fired: the ordinary forced
      // change bypassed the server policy check, bypassed the trusted flag
      // clear, and wrote no `password_change_forced` audit row.
      //
      // There is no direct-update branch any more, and there is no browser write
      // to `profiles` either — the endpoint clears the flag through the database
      // path and tells us whether it worked.
      const response = await fetch('/api/auth/force-password-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        // `passwordChanged` distinguishes "type a different password" from "your
        // password DID change but we could not finish" — which the old code
        // could not express at all, because it reported success either way.
        if (result?.passwordChanged) {
          toast.error(result.error || 'Tu contraseña se actualizó, pero no pudimos completar el proceso.');
        } else {
          toast.error(result?.error || 'Error al actualizar la contraseña. Por favor intenta nuevamente.');
        }
        return;
      }

      // THE SESSION IS GONE, and that is not a bug to work around.
      //
      // The password is now written by the server through
      // `auth.admin.updateUserById`, and GoTrue revokes the account's refresh
      // tokens when its password changes. So by the time this line runs the
      // browser is holding a dead session: the old code's next steps — a
      // `profiles` read, then `router.push('/dashboard')` — would have failed
      // and then bounced off the middleware to `/login` anyway, which is exactly
      // what the e2e observed.
      //
      // Sending the user to sign in with the credential they just chose is both
      // the honest end of this flow and the same rule `/reset-password` follows,
      // so "you completed a password change through the server, now sign in"
      // holds everywhere rather than in one place.
      toast.success('Contraseña actualizada exitosamente. Inicia sesión con tu nueva contraseña.');

      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

      setTimeout(() => {
        router.push('/login');
      }, 1000);
    } catch (error: any) {
      console.error('[ChangePassword] password update failed:', {
        message: error?.message,
        userId: user?.id,
      });
      toast.error('Error al actualizar la contraseña. Por favor intenta nuevamente.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a]"></div>
      </div>
    );
  }

  if (verificationUnavailable) {
    return (
      <>
        <Head>
          <title>Cambiar Contraseña - Genera</title>
        </Head>
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center">
                <ExclamationIcon className="w-10 h-10 text-yellow-600" />
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-extrabold text-gray-900">
              No pudimos verificar tu cuenta
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              No pudimos comprobar si necesitas cambiar tu contraseña. Es un problema temporal
              de conexión, no de tu cuenta.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => router.replace('/dashboard')}
                data-testid="forced-change-retry"
                className="inline-flex justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition-colors"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={handleLogout}
                data-testid="forced-change-logout"
                className="inline-flex justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Cambiar Contraseña - Genera</title>
      </Head>

      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        {/* Logout button in top right corner */}
        <div className="absolute top-4 right-4">
          <button
            onClick={handleLogout}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a]"
          >
            <LogoutIcon className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </button>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-[#0a0a0a] rounded-full flex items-center justify-center">
              <LockClosedIcon className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Cambio de Contraseña Requerido
          </h2>
          <div className="mt-2 text-center">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 inline-flex items-center gap-2">
              <ExclamationIcon className="w-5 h-5 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                {isAdminReset
                  ? 'El administrador ha restablecido tu contraseña. Por seguridad, debes crear una nueva.'
                  : 'Por seguridad, debes cambiar tu contraseña en el primer inicio de sesión'
                }
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <form className="space-y-6" onSubmit={handlePasswordChange}>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                  Nueva Contraseña
                </label>
                <div className="mt-1 relative">
                  <input
                    id="new-password"
                    name="new-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#0a0a0a] focus:border-[#0a0a0a] sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                  Confirmar Nueva Contraseña
                </label>
                <div className="mt-1">
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#0a0a0a] focus:border-[#0a0a0a] sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="show-password"
                  name="show-password"
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                  className="h-4 w-4 text-[#0a0a0a] focus:ring-[#0a0a0a] border-gray-300 rounded"
                />
                <label htmlFor="show-password" className="ml-2 block text-sm text-gray-900">
                  Mostrar contraseñas
                </label>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Requisitos de la contraseña:
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(newPassword);
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

              <div>
                <button
                  type="submit"
                  disabled={updating || !newPassword || !confirmPassword}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {updating ? 'Actualizando...' : 'Cambiar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}