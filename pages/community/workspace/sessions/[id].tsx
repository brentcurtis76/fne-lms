import React, { useCallback, useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Video } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import MainLayout from '../../../../components/layout/MainLayout';
import { useAuth } from '../../../../hooks/useAuth';
import { SessionStatus } from '../../../../lib/types/consultor-sessions.types';
import { getStatusBadge, formatTime, getModalityIcon } from '../../../../lib/utils/session-ui-helpers';
import { buildSessionJoinPath, sessionOffersPlatformJoin } from '../../../../lib/utils/session-disclosure';
import { joinIsClosedBySource } from '../../../../lib/utils/meeting-join-policy';
import { getAppBaseUrl } from '../../../../lib/utils/app-url';

/**
 * Read-only session detail for workspace members.
 *
 * Authorization is GET /api/sessions/[id] and nothing else: getServerSideProps
 * reads the caller's session, then asks that API with the caller's own access
 * token, so the page admits exactly whom the API admits. A denied session and
 * a missing one come back as the same 404, and the page renders them
 * identically.
 *
 * Only the basic fields below are serialized into props — never the raw
 * meeting link, transcript or participant e-mails the API may disclose to
 * privileged callers. The meeting is reached through /meet/session/{id}.
 */
interface WorkspaceSessionDetail {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  modality: string;
  status: SessionStatus;
  schoolName: string | null;
  communityName: string | null;
  hasMeeting: boolean;
}

type WorkspaceSessionDetailProps =
  | { state: 'unavailable' }
  | { state: 'error' }
  | { state: 'ready'; session: WorkspaceSessionDetail };

const MODALITY_LABELS: Record<string, string> = {
  presencial: 'Presencial',
  online: 'En línea',
  hibrida: 'Híbrida',
};

const SESSIONS_TAB_PATH = '/community/workspace?section=sessions';

const WorkspaceSessionDetailPage: React.FC<WorkspaceSessionDetailProps> = (props) => {
  const router = useRouter();
  const { user, profile, logout, isAdmin, avatarUrl } = useAuth();
  // Props for the next route arrive only once its server answer is in; until
  // then the current detail is hidden rather than shown under the new URL.
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    const start = () => setNavigating(true);
    const done = () => setNavigating(false);
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
    };
  }, [router.events]);

  // Re-running getServerSideProps for the same URL is the retry.
  const handleRetry = useCallback(() => {
    router.replace(router.asPath);
  }, [router]);

  const renderBody = () => {
    if (navigating) {
      return (
        <div role="status" aria-live="polite" className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="h-6 w-2/3 bg-gray-100 rounded animate-pulse mb-4" aria-hidden="true" />
          <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse mb-2" aria-hidden="true" />
          <div className="h-4 w-1/3 bg-gray-100 rounded animate-pulse" aria-hidden="true" />
          <span className="sr-only">Cargando sesión…</span>
        </div>
      );
    }

    if (props.state === 'unavailable') {
      return (
        <div data-testid="workspace-session-unavailable" className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Sesión no disponible</h1>
          <p className="text-sm text-gray-600">
            Esta sesión no existe o no tienes acceso a ella desde tu comunidad.
          </p>
        </div>
      );
    }

    if (props.state === 'error') {
      return (
        <div data-testid="workspace-session-error" role="alert" className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">No se pudo cargar la sesión</h1>
          <p className="text-sm text-gray-600 mb-4">Revisa tu conexión e inténtalo nuevamente.</p>
          <button
            type="button"
            onClick={handleRetry}
            data-testid="workspace-session-retry"
            className="inline-flex items-center justify-center rounded-lg bg-brand_primary px-4 py-2 text-sm font-medium text-white hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
          >
            Reintentar
          </button>
        </div>
      );
    }

    const { session } = props;
    const badge = getStatusBadge(session.status);
    const showJoin =
      session.hasMeeting && !joinIsClosedBySource({ status: session.status, modality: session.modality });

    return (
      <article data-testid="workspace-session-detail" className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h1 className="text-xl font-semibold text-gray-900 break-words min-w-0">{session.title}</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        <dl className="space-y-3 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Fecha</dt>
            <Calendar className="w-4 h-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
            <dd>{format(parseISO(session.session_date), "EEEE dd 'de' MMMM yyyy", { locale: es })}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Horario</dt>
            <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
            <dd>{formatTime(session.start_time)} - {formatTime(session.end_time)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Modalidad</dt>
            <span className="text-gray-400" aria-hidden="true">{getModalityIcon(session.modality)}</span>
            <dd>{MODALITY_LABELS[session.modality] ?? session.modality}</dd>
          </div>
          {session.schoolName && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Colegio</dt>
              <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <dd className="break-words min-w-0">{session.schoolName}</dd>
            </div>
          )}
          {session.communityName && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Comunidad</dt>
              <Users className="w-4 h-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <dd className="break-words min-w-0">{session.communityName}</dd>
            </div>
          )}
        </dl>

        {showJoin && (
          <div className="mt-5">
            <a
              href={buildSessionJoinPath(session.id)}
              data-testid="workspace-session-detail-join"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand_primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
            >
              <Video className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              Unirse a la reunión
            </a>
          </div>
        )}
      </article>
    );
  };

  return (
    <MainLayout
      user={user}
      currentPage="workspace"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      userRole={profile?.role}
      onLogout={logout}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link
          href={SESSIONS_TAB_PATH}
          data-testid="workspace-session-back"
          className="inline-flex items-center gap-2 mb-4 text-sm font-medium text-brand_primary hover:text-brand_accent focus:outline-none focus:ring-2 focus:ring-brand_accent rounded"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Volver a Sesiones
        </Link>
        {renderBody()}
      </div>
    </MainLayout>
  );
};

export const getServerSideProps: GetServerSideProps<WorkspaceSessionDetailProps> = async (context) => {
  const supabase = createPagesServerClient(context);
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  const toLogin = {
    redirect: {
      destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`,
      permanent: false,
    },
  };

  if (!authSession?.access_token) {
    return toLogin;
  }

  const id = context.params?.id;
  if (typeof id !== 'string') {
    return { props: { state: 'unavailable' } };
  }

  try {
    // The origin comes from configuration (getAppBaseUrl without a request),
    // never from the caller's Host header.
    const response = await fetch(`${getAppBaseUrl()}/api/sessions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${authSession.access_token}` },
    });

    if (response.status === 401) {
      return toLogin;
    }

    // 400 (malformed id) and 404 (absent or denied) are one answer.
    if (response.status === 400 || response.status === 404) {
      return { props: { state: 'unavailable' } };
    }

    if (!response.ok) {
      return { props: { state: 'error' } };
    }

    const raw = (await response.json())?.data?.session;
    if (!raw) {
      return { props: { state: 'unavailable' } };
    }

    return {
      props: {
        state: 'ready',
        session: {
          id,
          title: raw.title,
          session_date: raw.session_date,
          start_time: raw.start_time,
          end_time: raw.end_time,
          modality: raw.modality,
          status: raw.status,
          schoolName: raw.schools?.name ?? null,
          communityName: raw.growth_communities?.name ?? null,
          hasMeeting: sessionOffersPlatformJoin({ has_meeting: raw.has_meeting }),
        },
      },
    };
  } catch (error) {
    console.error(
      'Error loading workspace session detail:',
      error instanceof Error ? error.message : 'unknown error'
    );
    return { props: { state: 'error' } };
  }
};

export default WorkspaceSessionDetailPage;
