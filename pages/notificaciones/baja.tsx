import { useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';

/**
 * Confirmation page of a notification email's unsubscribe link (N3-05).
 * Public: the signed token in `t` is the only authorization, and only the API
 * route can read it. Opening or reloading the page changes nothing: it asks the
 * route what the link is for, and only the button sends the one-click POST.
 */
const API = '/api/notifications/unsubscribe';

interface Props {
  token: string | null;
}

type Failure = 'stale' | 'expired' | 'invalid' | 'error';
type View =
  | { state: 'loading' | Failure }
  | { state: 'confirm' | 'sending' | 'failed'; digest: boolean; categories: Array<{ id: string; label: string }> }
  | { state: 'done'; unchanged: string[] };

export const getServerSideProps: GetServerSideProps<Props> = async ({ query, res }) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex');
  return { props: { token: typeof query.t === 'string' && query.t.length <= 700 ? query.t : null } };
};

const MESSAGES: Record<Failure, { title: string; body: string }> = {
  stale: {
    title: 'Este enlace ya no está vigente',
    body: 'Cambiaste tus preferencias de notificaciones después de recibir este correo, así que no hicimos ningún cambio.',
  },
  expired: {
    title: 'Este enlace venció',
    body: 'No hicimos ningún cambio. Usa el enlace de un correo más reciente para dejar de recibir estas notificaciones.',
  },
  invalid: {
    title: 'Este enlace no es válido',
    body: 'No hicimos ningún cambio. Revisa que hayas abierto el enlace completo desde el correo que recibiste.',
  },
  error: {
    title: 'No pudimos procesar tu solicitud',
    body: 'No hicimos ningún cambio. Inténtalo de nuevo en unos minutos.',
  },
};

/** What a refusal of the route means for the reader. */
function failureOf(status: number): Failure {
  if (status === 409) return 'stale';
  if (status === 410) return 'expired';
  if (status === 400) return 'invalid';
  return 'error';
}

// No cookie is sent and no referrer leaves: the token is the only authorization.
const REQUEST: RequestInit = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };

export default function NotificationUnsubscribePage({ token }: Props) {
  const [view, setView] = useState<View>({ state: token ? 'loading' : 'invalid' });
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = view.state === 'done' || view.state === 'stale' || view.state === 'failed';

  // A read: what the link is for. Nothing changes here.
  useEffect(() => {
    if (!token) return;
    let current = true;
    fetch(`${API}?info=1&t=${encodeURIComponent(token)}`, REQUEST)
      .then(async (response) => {
        if (!current) return;
        if (response.status !== 200) return setView({ state: failureOf(response.status) });
        const data = (await response.json()) as { digest: boolean; categories: Array<{ id: string; label: string }> };
        setView({ state: 'confirm', digest: data.digest, categories: data.categories });
      })
      .catch(() => current && setView({ state: 'error' }));
    return () => {
      current = false;
    };
  }, [token]);

  // After an answer the heading takes focus, so a keyboard or screen-reader user hears the outcome.
  useEffect(() => {
    if (answered) heading.current?.focus();
  }, [answered]);

  async function confirm() {
    if (!token || (view.state !== 'confirm' && view.state !== 'failed')) return;
    const { digest, categories } = view;
    setView({ state: 'sending', digest, categories });
    try {
      const response = await fetch(`${API}?t=${encodeURIComponent(token)}`, {
        ...REQUEST,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      });
      if (response.status === 200) {
        const data = (await response.json()) as { categories?: Array<{ category: string; outcome: string }> };
        const stale = new Set((data.categories ?? []).filter((entry) => entry.outcome === 'stale').map((entry) => entry.category));
        setView({ state: 'done', unchanged: categories.filter((category) => stale.has(category.id)).map((category) => category.label) });
      } else if (failureOf(response.status) === 'error') {
        setView({ state: 'failed', digest, categories });
      } else {
        setView({ state: failureOf(response.status) });
      }
    } catch {
      setView({ state: 'failed', digest, categories });
    }
  }

  const failure = view.state === 'failed' ? MESSAGES.error : view.state in MESSAGES ? MESSAGES[view.state as Failure] : null;

  return (
    <>
      <Head>
        <title>Dejar de recibir correos · Genera</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-10 space-y-5">
          <p className="text-sm font-semibold text-amber-600">Genera · Notificaciones por correo</p>

          {view.state === 'loading' ? (
            <p role="status" data-testid="unsubscribe-loading" className="text-slate-600">
              Verificando el enlace…
            </p>
          ) : failure ? (
            <div role="alert" data-testid="unsubscribe-error" className="space-y-3">
              <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold text-slate-900 focus:outline-none">
                {failure.title}
              </h1>
              <p className="text-slate-600">{failure.body}</p>
              {view.state === 'failed' && (
                <button
                  type="button"
                  onClick={confirm}
                  data-testid="unsubscribe-retry"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                >
                  Intentar de nuevo
                </button>
              )}
            </div>
          ) : view.state === 'done' ? (
            <div role="status" data-testid="unsubscribe-done" className="space-y-3">
              <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold text-slate-900 focus:outline-none">
                Listo: ya no recibirás estos correos
              </h1>
              <p className="text-slate-600">
                Seguirás viendo estas notificaciones dentro de Genera y recibiendo los avisos obligatorios.
              </p>
              {view.unchanged.length > 0 && (
                <p className="text-slate-600" data-testid="unsubscribe-unchanged">
                  No cambiamos {view.unchanged.join(', ')}: modificaste esa preferencia después de recibir este correo.
                </p>
              )}
            </div>
          ) : (
            (view.state === 'confirm' || view.state === 'sending') && (
              <div className="space-y-4">
                <h1 className="text-2xl font-semibold text-slate-900">
                  {view.digest ? '¿Quieres dejar de recibir el resumen diario por correo?' : '¿Quieres dejar de recibir estos correos?'}
                </h1>
                <p className="text-slate-600">Dejaremos de enviarte por correo las notificaciones de:</p>
                <ul className="list-disc pl-6 text-slate-900 font-medium" data-testid="unsubscribe-categories">
                  {view.categories.map((category) => (
                    <li key={category.id}>{category.label}</li>
                  ))}
                </ul>
                <p className="text-slate-600">
                  Seguirás viéndolas dentro de Genera y recibiendo los avisos obligatorios. Todavía no hemos cambiado nada.
                </p>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={view.state === 'sending'}
                  data-testid="unsubscribe-confirm"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                >
                  {view.state === 'sending' ? 'Procesando…' : 'Sí, dejar de recibir estos correos'}
                </button>
              </div>
            )
          )}
        </div>
      </main>
    </>
  );
}
