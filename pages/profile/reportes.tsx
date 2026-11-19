import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useSessionContext, useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '../../components/layout/MainLayout';
import { createServiceRoleClient, getForcedPasswordChangeVerdict, getServerSideUser } from '../../lib/api-auth';
import { forcedChangeRedirectPath } from '../../lib/auth/forced-password-change';

/**
 * «Mis reportes» (F15e, GES-2.18): the tickets the signed-in person reported
 * through the feedback window, their state, and the replies Soporte wrote for
 * them.
 *
 * Both reads use the person's own browser session, so the database rules
 * decide what is shown: their own tickets, the admins' rows marked for the
 * reporter, and their own comments. Internal notes are never returned to them.
 * System lines (state changes) are not shown. Nothing is written here.
 */

interface ReportsProps {
  ownerId: string;
}

export const getServerSideProps: GetServerSideProps<ReportsProps> = async (context) => {
  // The verified user (auth server), never the cookie's stored user.
  const viewer = await getServerSideUser(context);
  if (!viewer) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`, permanent: false } };
  }
  const service = createServiceRoleClient();
  // The middleware's page gate also covers /profile; the forced-password rule is applied here as well (defence in depth).
  const verdict = await getForcedPasswordChangeVerdict(service, viewer.id);
  if (verdict !== 'allowed') {
    return { redirect: { destination: forcedChangeRedirectPath(verdict), permanent: false } };
  }
  return { props: { ownerId: viewer.id } };
};

interface Ticket {
  id: string;
  title: string | null;
  description: string;
  type: string;
  status: string;
  created_at: string;
}

interface Activity {
  id: string;
  feedback_id: string;
  message: string;
  is_system_message: boolean | null;
  created_by: string;
  created_at: string;
  visible_to_reporter: boolean | null;
}

const TICKET_COLUMNS = 'id, title, description, type, status, created_at';
const ACTIVITY_COLUMNS = 'id, feedback_id, message, is_system_message, created_by, created_at, visible_to_reporter';

// The same words as the admin's Soporte page (pages/admin/feedback.tsx, getStatusBadge).
const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  seen: 'Visto',
  in_progress: 'En Progreso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

// The words of the feedback window (components/feedback/FeedbackModal.tsx); it has no button for 'feedback'.
const TYPE_LABELS: Record<string, string> = {
  bug: 'Problema',
  idea: 'Idea',
  feedback: 'Comentario',
};

const UNKNOWN_STATUS = 'Estado desconocido';
const UNKNOWN_TYPE = 'Reporte';

const READ_ERROR = 'No se pudieron cargar tus reportes. Inténtalo de nuevo.';

// Where a person whose session has ended is sent (the same destination getServerSideProps gives a visitor).
const LOGIN_PATH = `/login?next=${encodeURIComponent('/profile/reportes')}`;

/** DD-MM-YYYY in Chile's time. */
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}-${part('month')}-${part('year')}`;
}

function headingOf(ticket: Ticket): string {
  const title = ticket.title?.trim();
  return title ? title : (ticket.description ?? '').slice(0, 80);
}

type Status = 'loading' | 'ready' | 'error';

const panel = 'rounded-lg border p-4 text-sm';
const button =
  'rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export default function MyReportsPage({ ownerId }: ReportsProps) {
  const supabase = useSupabaseClient();
  const { isLoading: sessionLoading, session } = useSessionContext();
  const router = useRouter();
  // The router is read through a ref so that a new router object does not start a new read.
  const routerRef = useRef(router);
  routerRef.current = router;
  const hasSession = !!session;
  const [status, setStatus] = useState<Status>('loading');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  // The latest request; an answer to any earlier one is dropped.
  const request = useRef(0);

  // Every read, the first one and «Reintentar», goes through this guard: nothing is read
  // while the session is loading, and without a session the person goes to the login.
  const load = useCallback(async () => {
    if (sessionLoading) return;
    if (!hasSession) {
      ++request.current; // an answer still on its way is dropped
      void routerRef.current.replace(LOGIN_PATH);
      return;
    }
    const id = ++request.current;
    setStatus('loading');
    try {
      const ticketsRead = await supabase
        .from('platform_feedback')
        .select(TICKET_COLUMNS)
        .eq('created_by', ownerId)
        .order('created_at', { ascending: false });
      if (id !== request.current) return;
      if (ticketsRead.error) return setStatus('error');
      const own = (ticketsRead.data ?? []) as Ticket[];
      let rows: Activity[] = [];
      if (own.length > 0) {
        const activityRead = await supabase
          .from('feedback_activity')
          .select(ACTIVITY_COLUMNS)
          .in(
            'feedback_id',
            own.map((t) => t.id)
          )
          .order('created_at', { ascending: true });
        if (id !== request.current) return;
        if (activityRead.error) return setStatus('error');
        rows = (activityRead.data ?? []) as Activity[];
      }
      setTickets(own);
      setActivity(rows);
      setStatus('ready');
    } catch {
      if (id === request.current) setStatus('error');
    }
  }, [supabase, ownerId, sessionLoading, hasSession]);

  // load changes when the session's state changes, so this runs again then.
  useEffect(() => {
    void load();
  }, [load]);

  let content: React.ReactNode;
  if (status === 'error') {
    content = (
      <div role="alert" data-testid="reports-error" className={`${panel} border-red-300 bg-red-50 text-red-900`}>
        <p>{READ_ERROR}</p>
        <button type="button" data-testid="reports-retry" onClick={() => void load()} className={`${button} mt-3 bg-brand_primary text-white`}>
          Reintentar
        </button>
      </div>
    );
  } else if (status === 'loading') {
    content = (
      <p role="status" data-testid="reports-loading" className="text-sm text-gray-600">
        Cargando tus reportes…
      </p>
    );
  } else if (tickets.length === 0) {
    content = (
      <p data-testid="reports-empty" className={`${panel} border-gray-200 bg-gray-50 text-gray-700`}>
        Todavía no has reportado ningún problema.
      </p>
    );
  } else {
    content = (
      <ul className="space-y-4">
        {tickets.map((ticket) => {
          const comments = activity.filter(
            (row) =>
              row.feedback_id === ticket.id &&
              row.is_system_message !== true &&
              (row.created_by === ownerId || row.visible_to_reporter === true)
          );
          return (
            <li key={ticket.id} data-testid="report-card" className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <h2 className="font-medium text-gray-900 break-words">{headingOf(ticket)}</h2>
                <span data-testid="report-status" className="self-start whitespace-nowrap rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                  {STATUS_LABELS[ticket.status] ?? UNKNOWN_STATUS}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                <span>{TYPE_LABELS[ticket.type] ?? UNKNOWN_TYPE}</span>
                <span> · </span>
                <span>{formatDate(ticket.created_at)}</span>
              </p>
              {comments.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {comments.map((row) => (
                    <li key={row.id} data-testid="report-comment" className={`${panel} border-gray-200 bg-gray-50 text-gray-700`}>
                      <p className="flex flex-wrap justify-between gap-x-3 text-xs">
                        <span className="font-medium text-gray-900">{row.created_by === ownerId ? 'Tu comentario' : 'Respuesta de Soporte'}</span>
                        <span className="text-gray-500">{formatDate(row.created_at)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words">{row.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <MainLayout currentPage="profile" pageTitle="Mis reportes" breadcrumbs={[{ label: 'Mi Perfil', href: '/profile' }, { label: 'Mis reportes' }]}>
      <div data-testid="my-reports" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {content}
      </div>
    </MainLayout>
  );
}
