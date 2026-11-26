import React, { useCallback, useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import MainLayout from '../../../components/layout/MainLayout';
import { Button, LoadingBlock, Notice, PageHeader } from '../../../components/ui/kit';
import { createServiceRoleClient, getForcedPasswordChangeVerdict, getServerSideUser } from '../../../lib/api-auth';
import { forcedChangeRedirectPath } from '../../../lib/auth/forced-password-change';
import { isGlobalAdmin } from '../../../utils/roleUtils';

/**
 * Correos, release 1: the sample email in GENERA's brand, and «Enviarme una prueba».
 *
 * Admins only, and reachable only by typing the address: no sidebar entry, no menu entry, no link. The email
 * is drawn by `/api/admin/correos/vista-previa` (GET) inside a sandboxed frame; the test goes to the signed-in
 * admin's own address (POST), never to anyone else.
 */

export const getServerSideProps: GetServerSideProps = async (context) => {
  // The verified user (auth server), never the cookie's stored user.
  const viewer = await getServerSideUser(context);
  if (!viewer) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`, permanent: false } };
  }
  const service = createServiceRoleClient();
  const verdict = await getForcedPasswordChangeVerdict(service, viewer.id);
  if (verdict !== 'allowed') {
    return { redirect: { destination: forcedChangeRedirectPath(verdict), permanent: false } };
  }
  if (!(await isGlobalAdmin(service, viewer.id))) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
  return { props: {} };
};

const API = '/api/admin/correos/vista-previa';

const WIDTHS = {
  escritorio: { label: 'Escritorio', px: 600 },
  telefono: { label: 'Teléfono', px: 375 },
} as const;
type WidthKey = keyof typeof WIDTHS;

interface Preview {
  subject: string;
  html: string;
}

type SendOutcome =
  | { tone: 'success'; title: string; text: string }
  | { tone: 'warning' | 'error'; title: string; text: string };

/** What the page says after «Enviarme una prueba», in plain words. */
function describeSend(httpStatus: number, body: { status?: string; to?: string; reason?: string } | null): SendOutcome {
  if (body?.status === 'sent') {
    return { tone: 'success', title: 'Prueba enviada.', text: `La enviamos a tu dirección${body.to ? `, ${body.to}` : ''}. Revisa tu bandeja de entrada.` };
  }
  if (body?.status === 'not_configured') {
    return {
      tone: 'warning',
      title: 'No se envió.',
      text: 'El servicio de correo no está configurado en este entorno, así que no salió ningún mensaje.',
    };
  }
  if (body?.status === 'not_sent') {
    if (body.reason === 'suppressed_qa') {
      return {
        tone: 'warning',
        title: 'No se envió.',
        text: 'Tu cuenta está vinculada a un colegio de prueba, y a esas cuentas no les enviamos correos reales.',
      };
    }
    if (body.reason === 'missing_recipient') {
      return { tone: 'error', title: 'No se envió.', text: 'Tu cuenta no tiene una dirección de correo registrada.' };
    }
    return {
      tone: 'error',
      title: 'No se envió.',
      text: 'El servicio de correo no aceptó el mensaje o no pudimos comprobar tu cuenta. Inténtalo de nuevo más tarde.',
    };
  }
  if (httpStatus === 401) return { tone: 'error', title: 'No se envió.', text: 'Tu sesión terminó. Vuelve a iniciar sesión.' };
  if (httpStatus === 403) return { tone: 'error', title: 'No se envió.', text: 'Solo un administrador puede enviar la prueba.' };
  return { tone: 'error', title: 'No se envió.', text: 'Algo falló al enviar la prueba. Inténtalo de nuevo más tarde.' };
}

export default function CorreosVistaPrevia() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [width, setWidth] = useState<WidthKey>('escritorio');
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(API, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as Preview;
        if (alive) setPreview({ subject: body.subject, html: body.html });
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sendTest = useCallback(async () => {
    setSending(true);
    setOutcome(null);
    try {
      const response = await fetch(API, { method: 'POST', credentials: 'same-origin' });
      const body = await response.json().catch(() => null);
      setOutcome(describeSend(response.status, body));
    } catch {
      setOutcome(describeSend(0, null));
    } finally {
      setSending(false);
    }
  }, []);

  const frameWidth = WIDTHS[width].px;

  return (
    <MainLayout
      currentPage="admin"
      pageTitle="Vista previa de correos"
      breadcrumbs={[{ label: 'Administración' }, { label: 'Correos' }, { label: 'Vista previa' }]}
    >
      <div data-testid="correos-vista-previa" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Correos"
          title="Vista previa del correo"
          description="Así se ve un correo de ejemplo con la marca de la Fundación. Puedes enviarte una prueba a tu propia dirección."
          actions={
            <Button variant="primary" loading={sending} onClick={sendTest} data-testid="correos-enviar-prueba">
              Enviarme una prueba
            </Button>
          }
        />

        {outcome ? (
          <Notice tone={outcome.tone} title={outcome.title} className="mt-4" data-testid="correos-resultado">
            {outcome.text}
          </Notice>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Ancho de la vista previa">
          {(Object.keys(WIDTHS) as WidthKey[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={width === key ? 'default' : 'quiet'}
              aria-pressed={width === key}
              onClick={() => setWidth(key)}
              data-testid={`correos-ancho-${key}`}
            >
              {WIDTHS[key].label}
            </Button>
          ))}
          <span className="text-sm text-gray-600">{frameWidth} px</span>
        </div>

        {preview ? (
          <p className="mt-4 text-sm text-gray-700">
            <span className="font-semibold">Asunto:</span> {preview.subject}
          </p>
        ) : null}

        <div className="mt-3 overflow-x-auto">
          {loadError ? (
            <Notice tone="error" title="No se pudo mostrar el correo.">
              Vuelve a cargar la página en un momento.
            </Notice>
          ) : preview ? (
            <iframe
              title="Correo de ejemplo"
              srcDoc={preview.html}
              sandbox=""
              data-testid="correos-marco"
              className="border border-gray-200 bg-white nuevo:border-brand_primary/[0.24]"
              style={{ width: `${frameWidth}px`, maxWidth: '100%', height: '900px' }}
            />
          ) : (
            <LoadingBlock label="Cargando el correo de ejemplo" />
          )}
        </div>
      </div>
    </MainLayout>
  );
}
