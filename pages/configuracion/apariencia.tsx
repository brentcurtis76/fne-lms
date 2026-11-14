import React, { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import MainLayout from '../../components/layout/MainLayout';
import { createServiceRoleClient, getForcedPasswordChangeVerdict, getServerSideUser } from '../../lib/api-auth';
import { forcedChangeRedirectPath } from '../../lib/auth/forced-password-change';
import { useLook } from '../../contexts/LookContext';
import { isLook, lookFromPreferences, mayChooseLook, type Look } from '../../lib/look';

/**
 * «Apariencia»: the account's own choice between today's look and the redesign's
 * (lib/look.ts). Offered only to accounts that `mayChooseLook` allows; anyone else is
 * sent to the notification settings, as `/configuracion` itself does.
 *
 * The server verifies the caller and reads the stored look; the browser saves only
 * through the owner-only `/api/user/look`, which applies the same rule again.
 */

interface AparienciaProps {
  storedLook: Look;
}

const ROUTE = '/api/user/look';
const SETTINGS = '/configuracion/notificaciones';
const LOGIN_AGAIN = `/login?next=${encodeURIComponent('/configuracion/apariencia')}`;
const SAVE_ERROR = 'No pudimos guardar tu apariencia. Intenta nuevamente.';

const OPTIONS: ReadonlyArray<{ value: Look; label: string; detail: string }> = [
  { value: 'clasico', label: 'Diseño actual', detail: 'La plataforma como la ven hoy todas las cuentas.' },
  {
    value: 'nuevo',
    label: 'Diseño nuevo (en construcción)',
    detail: 'El rediseño de la plataforma. Se irá activando por partes; mientras tanto puede verse igual al actual.',
  },
];

export const getServerSideProps: GetServerSideProps<AparienciaProps> = async (context) => {
  // The verified user (auth server), never the cookie's stored user.
  const viewer = await getServerSideUser(context);
  if (!viewer) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`, permanent: false } };
  }
  const service = createServiceRoleClient();
  // The middleware's page gate also covers /configuracion; the forced-password rule is applied here as well (defence in depth).
  const verdict = await getForcedPasswordChangeVerdict(service, viewer.id);
  if (verdict !== 'allowed') {
    return { redirect: { destination: forcedChangeRedirectPath(verdict), permanent: false } };
  }

  const profile = await service
    .from('profiles')
    .select('can_run_qa_tests, learning_preferences')
    .eq('id', viewer.id)
    .maybeSingle();
  // Not offered to this account, or its profile could not be read: the section does not exist for it.
  if (profile.error || !mayChooseLook(profile.data)) {
    return { redirect: { destination: SETTINGS, permanent: false } };
  }
  return { props: { storedLook: lookFromPreferences(profile.data?.learning_preferences) } };
};

type Notice = { kind: 'saved' | 'error' | 'expired'; text: string } | null;

const button =
  'rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export default function AparienciaPage({ storedLook }: AparienciaProps) {
  const { setLook } = useLook();
  const [saved, setSaved] = useState<Look>(storedLook);
  const [choice, setChoice] = useState<Look>(storedLook);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const save = async () => {
    if (saving || choice === saved) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(ROUTE, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ look: choice }),
      });
      let body: { look?: unknown; error?: unknown } | null = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (res.status === 401) {
        setNotice({ kind: 'expired', text: 'Tu sesión terminó.' });
      } else if (!res.ok || !isLook(body?.look)) {
        setNotice({ kind: 'error', text: typeof body?.error === 'string' ? body.error : SAVE_ERROR });
      } else {
        setSaved(body.look);
        setChoice(body.look);
        setLook(body.look);
        setNotice({ kind: 'saved', text: 'Tu apariencia se guardó.' });
      }
    } catch {
      setNotice({ kind: 'error', text: SAVE_ERROR });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout currentPage="configuracion" pageTitle="Apariencia" breadcrumbs={[{ label: 'Configuración' }, { label: 'Apariencia' }]}>
      <div data-testid="look-settings" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-gray-700">
          Elige cómo se ve la plataforma para tu cuenta. El cambio solo te afecta a ti y puedes volver atrás cuando quieras.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="rounded-lg border border-gray-200 bg-white p-4">
            <legend className="px-1 font-medium text-gray-900">Diseño de la plataforma</legend>
            <div className="space-y-3">
              {OPTIONS.map((option) => {
                const id = `look-option-${option.value}`;
                return (
                  <div key={option.value} className="flex items-start gap-3">
                    <input
                      type="radio"
                      id={id}
                      data-testid={id}
                      name="look"
                      value={option.value}
                      checked={choice === option.value}
                      disabled={saving}
                      onChange={() => {
                        setChoice(option.value);
                        setNotice(null);
                      }}
                      className="mt-1"
                    />
                    <label htmlFor={id} className="text-sm">
                      <span className="block font-medium text-gray-900">{option.label}</span>
                      <span className="block text-gray-600">{option.detail}</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="submit" data-testid="look-save" disabled={saving || choice === saved} className={`${button} bg-brand_primary text-white`}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <p role="status" aria-live="polite" className="text-sm">
              {notice?.kind === 'saved' && (
                <span data-testid="look-saved" className="text-green-700">
                  {notice.text}
                </span>
              )}
              {notice?.kind === 'error' && (
                <span data-testid="look-save-error" className="text-red-700">
                  {notice.text}
                </span>
              )}
              {notice?.kind === 'expired' && (
                <span data-testid="look-expired" className="text-red-700">
                  {notice.text}{' '}
                  <a href={LOGIN_AGAIN} className="font-medium underline">
                    Inicia sesión nuevamente
                  </a>
                </span>
              )}
              {!notice && choice !== saved && (
                <span data-testid="look-unsaved" className="text-gray-600">
                  Tienes cambios sin guardar.
                </span>
              )}
            </p>
          </div>
        </form>
        <p className="mt-8 text-sm">
          <Link href={SETTINGS} data-testid="look-to-notifications" className="font-medium text-gray-700 underline">
            Notificaciones por correo
          </Link>
        </p>
      </div>
    </MainLayout>
  );
}
