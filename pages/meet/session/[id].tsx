import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { Calendar, Clock, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { formatTime } from '../../../lib/utils/session-ui-helpers';
import {
  MeetSessionView,
  resolveMeetSessionAccess,
} from '../../../lib/utils/session-meet-access';

/**
 * Meeting interstitial — the single platform surface that reveals a session's
 * legacy manual meeting link.
 *
 * Everything else (API payloads, .ics files, reminder notifications) now points
 * here instead of carrying the raw link, so access is re-checked server-side on
 * every visit rather than being frozen into an artifact that outlives the
 * viewer's permissions.
 *
 * Intentionally light: no layout chrome, no client-side data fetching, no
 * state. School hardware is slow and this page's whole job is one link.
 */

type MeetSessionPageProps = {
  session: MeetSessionView;
};

const MeetSessionPage: React.FC<MeetSessionPageProps> = ({ session }) => {
  const dateLabel = format(parseISO(session.session_date), "EEEE d 'de' MMMM 'de' yyyy", {
    locale: es,
  });

  return (
    <>
      <Head>
        <title>{`${session.title} — Reunión | GENERA`}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reunión</p>
          <h1 className="mt-1 text-xl font-semibold text-brand_primary sm:text-2xl">
            {session.title}
          </h1>

          <dl className="mt-5 space-y-3 text-sm text-gray-700">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <dt className="sr-only">Fecha</dt>
              <dd className="first-letter:uppercase">{dateLabel}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <dt className="sr-only">Horario</dt>
              <dd>
                {formatTime(session.start_time)} - {formatTime(session.end_time)}{' '}
                <span className="text-gray-500">(hora Chile)</span>
              </dd>
            </div>
          </dl>

          {session.meeting_link ? (
            <div className="mt-6">
              <a
                href={session.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="meet-join-link"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand_primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Abrir enlace de reunión
              </a>
              <p className="mt-3 text-xs text-gray-500">
                El enlace abre un servicio de reuniones externo a GENERA, en una pestaña nueva.
              </p>
            </div>
          ) : (
            <div
              data-testid="meet-no-link"
              className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700"
            >
              Esta sesión no tiene enlace de reunión.
            </div>
          )}

          <div className="mt-6 border-t border-gray-100 pt-4">
            <Link
              href="/dashboard"
              data-testid="meet-back-link"
              className="text-sm font-medium text-gray-600 hover:text-brand_primary"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<MeetSessionPageProps> = async (context) => {
  const supabase = createPagesServerClient(context);
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  const access = await resolveMeetSessionAccess({
    sessionId: context.params?.id,
    userId: authSession?.user?.id ?? null,
    service: createServiceRoleClient(),
  });

  if (access.kind === 'unauthenticated') {
    // Plain redirect: `next=` round-tripping (and its open-redirect guard)
    // lands with the middleware work, not here.
    return { redirect: { destination: '/login', permanent: false } };
  }

  if (access.kind === 'not-found') {
    return { notFound: true };
  }

  return { props: { session: access.session } };
};

export default MeetSessionPage;
