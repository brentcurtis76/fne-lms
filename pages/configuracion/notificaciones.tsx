import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useSessionContext } from '@supabase/auth-helpers-react';
import MainLayout from '../../components/layout/MainLayout';
import { createServiceRoleClient, getForcedPasswordChangeVerdict, getServerSideUser } from '../../lib/api-auth';
import { forcedChangeRedirectPath } from '../../lib/auth/forced-password-change';
import { CATEGORY_LABELS, NOTIFICATION_CATALOG, type Audience, type NotificationCategory } from '../../lib/notifications/catalog';
import { NOTIFICATION_EVENTS } from '../../lib/notificationEvents';
import type { CategoryEmailMode } from '../../lib/notifications/resolve-preference';
import type { EventPreferenceView, PreferencesView } from '../../lib/notifications/preferences-api';

/**
 * The owner's notification email settings (NOTIF plan D7, ledger N4-02), on the
 * owner-only `/api/user/notification-preferences` (N4-01).
 *
 * The server verifies the caller and works out which categories and events can
 * reach them; the browser then reads and saves only through the API. The
 * filtering is presentation: it hides settings that cannot apply, it grants no
 * access and never names another user.
 */

interface ApplicableEvent {
  event_type: string;
  label: string;
}

interface ApplicableCategory {
  category: NotificationCategory;
  events: ApplicableEvent[];
}

interface SettingsProps {
  ownerId: string;
  /** null when the caller's roles could not be read. */
  categories: ApplicableCategory[] | null;
}

interface Scope {
  roles: string[];
  /** An active role in a growth community. */
  community: boolean;
  /** An active consultor role tied to a school. */
  schoolConsultor: boolean;
  /** An active encargado_licitacion role tied to a school. */
  encargadoSchool: boolean;
  /** profiles.can_run_qa_tests. */
  tester: boolean;
}

const has = (scope: Scope, ...types: string[]) => scope.roles.some((role) => types.includes(role));
const anyActiveRole = (scope: Scope) => scope.roles.length > 0;
/** can_access_workspace: an admin, a member of the community, or a consultor of its school. */
const workspaceMember = (scope: Scope) => has(scope, 'admin') || scope.community || scope.schoolConsultor;

/**
 * Whether someone with this scope can be among an audience's recipients
 * (NotificationService.getRecipients, lib/email/notification-access.ts,
 * can_access_workspace, canViewSession). An audience with no recipient rule
 * never makes a setting appear.
 */
const AUDIENCE_APPLIES: Record<Audience, (scope: Scope) => boolean> = {
  // Courses, assignments and consultants are assigned to individual users of any role.
  assigned_users: anyActiveRole,
  student: anyActiveRole,
  group_invitees: anyActiveRole,
  all_active_users: anyActiveRole,
  message_recipient: workspaceMember,
  mentioned_user: workspaceMember,
  meeting_recipients: workspaceMember,
  // Facilitators are consultors or admins; attendees come from the session's community.
  session_participants: (scope) => has(scope, 'admin', 'consultor') || scope.community,
  edit_requester: (scope) => has(scope, 'admin', 'consultor'),
  admins: (scope) => has(scope, 'admin'),
  tester: (scope) => has(scope, 'admin') || scope.tester,
  school_encargados: (scope) => scope.encargadoSchool,
  school_encargados_and_admins: (scope) => scope.encargadoSchool || has(scope, 'admin'),
  // submit-group.ts and groupConsultantAccess deliver only to assigned admins and consultors.
  group_consultants: (scope) => has(scope, 'admin', 'consultor'),
  // notify-pending.ts and quizReviewerAccess also treat an assigned equipo_directivo as a reviewer.
  quiz_reviewers: (scope) => has(scope, 'admin', 'consultor', 'equipo_directivo'),
  unwired: () => false,
};

/** Events whose producer writes the text have no registry title. */
const PRODUCER_EVENT_LABELS: Record<string, string> = {
  group_invitation: 'Invitación a un grupo',
  group_assignment_submitted: 'Entrega de tarea grupal',
  quiz_review_pending: 'Quiz pendiente de revisión',
  quiz_reviewed: 'Quiz revisado',
  data_quality_alert: 'Alerta de calidad de datos',
};

function applicableCategories(scope: Scope): ApplicableCategory[] {
  return (Object.keys(CATEGORY_LABELS) as NotificationCategory[])
    .map((category) => ({
      category,
      events: Object.entries(NOTIFICATION_CATALOG)
        .filter(([, entry]) => entry.category === category && AUDIENCE_APPLIES[entry.audience](scope))
        .map(([eventType]) => ({
          event_type: eventType,
          label: PRODUCER_EVENT_LABELS[eventType] ?? NOTIFICATION_EVENTS[eventType]?.defaultTitle({}) ?? eventType,
        })),
    }))
    .filter((section) => section.events.length > 0);
}

interface RoleRow {
  role_type: string;
  school_id: string | number | null;
  community_id: string | null;
}

export const getServerSideProps: GetServerSideProps<SettingsProps> = async (context) => {
  // The verified user (auth server), never the cookie's stored user.
  const viewer = await getServerSideUser(context);
  if (!viewer) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`, permanent: false } };
  }
  const service = createServiceRoleClient();
  // The middleware's page gate does not list /configuracion, so the forced-password rule is applied here.
  const verdict = await getForcedPasswordChangeVerdict(service, viewer.id);
  if (verdict !== 'allowed') {
    return { redirect: { destination: forcedChangeRedirectPath(verdict), permanent: false } };
  }

  const [roles, profile] = await Promise.all([
    service.from('user_roles').select('role_type, school_id, community_id').eq('user_id', viewer.id).eq('is_active', true),
    service.from('profiles').select('can_run_qa_tests').eq('id', viewer.id).maybeSingle(),
  ]);
  if (roles.error || profile.error) return { props: { ownerId: viewer.id, categories: null } };
  const rows = (roles.data ?? []) as RoleRow[];
  const scope: Scope = {
    roles: rows.map((row) => row.role_type),
    community: rows.some((row) => row.community_id != null),
    schoolConsultor: rows.some((row) => row.role_type === 'consultor' && row.school_id != null),
    encargadoSchool: rows.some((row) => row.role_type === 'encargado_licitacion' && row.school_id != null),
    tester: (profile.data as { can_run_qa_tests?: boolean | null } | null)?.can_run_qa_tests === true,
  };
  return { props: { ownerId: viewer.id, categories: applicableCategories(scope) } };
};

const ROUTE = '/api/user/notification-preferences';
const LOGIN_AGAIN = `/login?next=${encodeURIComponent('/configuracion/notificaciones')}`;
const READ_ERROR = 'No pudimos cargar tus preferencias.';
const SAVE_ERROR = 'No pudimos guardar tus preferencias. Intenta nuevamente.';

const MODE_LABELS: Record<CategoryEmailMode, string> = {
  default: 'Predeterminado',
  immediate: 'Inmediato',
  digest: 'Resumen diario',
  off: 'Desactivado',
};

// A stored digest while the digest is off: kept as is until the user picks another mode, never offered.
const STORED_UNAVAILABLE = 'Opción anterior (se envía de inmediato)';

const DELIVERY_LABELS: Record<EventPreferenceView['delivery'], string> = {
  immediate: 'Se envía de inmediato',
  digest: 'Va en el resumen diario',
  off: 'No se envía',
};

const ADDRESS_NOTICES: Record<PreferencesView['address_suppression'], string> = {
  suppressed:
    'No podemos enviarte correos: tu dirección rechazó mensajes anteriores. Escribe a soporte para revisarla; mientras tanto no recibirás avisos por correo.',
  clear: 'Tu dirección de correo recibe nuestros avisos con normalidad.',
  unavailable: 'No pudimos comprobar si tu dirección de correo recibe nuestros avisos.',
};

type Status = 'loading' | 'ready' | 'error' | 'expired' | 'session_changed';
type Notice = { kind: 'saved' | 'error'; text: string } | null;

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const panel = 'rounded-lg border p-4 text-sm';
const button =
  'rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export default function NotificationSettingsPage({ ownerId, categories }: SettingsProps) {
  const { isLoading: sessionLoading, session, error: sessionError } = useSessionContext();
  const [status, setStatus] = useState<Status>(categories ? 'loading' : 'error');
  const [view, setView] = useState<PreferencesView | null>(null);
  const [draft, setDraft] = useState<Partial<Record<NotificationCategory, CategoryEmailMode>>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // The latest request; an answer to any earlier one is dropped.
  const request = useRef(0);

  const show = (next: PreferencesView) => {
    setView(next);
    setDraft(Object.fromEntries(next.categories.map((c) => [c.category, c.email_mode])));
  };

  const load = useCallback(async () => {
    const id = ++request.current;
    setStatus('loading');
    setNotice(null);
    try {
      const res = await fetch(ROUTE, { credentials: 'same-origin' });
      const body = await readJson(res);
      if (id !== request.current) return;
      if (res.status === 401) return setStatus('expired');
      if (!res.ok || !Array.isArray(body?.categories)) return setStatus('error');
      show(body);
      setStatus('ready');
    } catch {
      if (id === request.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (categories) void load();
  }, [categories, load]);

  // Signed out or signed in as someone else in another tab: drop this owner's settings and any answer still on its way.
  const sessionUserId = session?.user.id;
  useEffect(() => {
    if (sessionLoading || sessionError || sessionUserId === ownerId) return;
    request.current += 1;
    setView(null);
    setSaving(false);
    setNotice(null);
    setStatus('session_changed');
  }, [sessionLoading, sessionError, sessionUserId, ownerId]);

  const shown = (categories ?? []).flatMap((section) => {
    const saved = view?.categories.find((c) => c.category === section.category);
    return saved ? [{ section, saved }] : [];
  });
  const changes = shown
    .filter(({ section, saved }) => draft[section.category] !== saved.email_mode)
    .map(({ section }) => ({ category: section.category, email_mode: draft[section.category] as CategoryEmailMode }));

  const save = async () => {
    if (saving || changes.length === 0) return;
    const id = ++request.current;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(ROUTE, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: changes }),
      });
      const body = await readJson(res);
      if (id !== request.current) return;
      if (res.status === 401) return setStatus('expired');
      if (!res.ok || !Array.isArray(body?.categories)) {
        return setNotice({ kind: 'error', text: typeof body?.error === 'string' ? body.error : SAVE_ERROR });
      }
      show(body);
      setNotice({ kind: 'saved', text: 'Tus preferencias se guardaron.' });
    } catch {
      if (id === request.current) setNotice({ kind: 'error', text: SAVE_ERROR });
    } finally {
      if (id === request.current) setSaving(false);
    }
  };

  let content: React.ReactNode;
  if (status === 'session_changed') {
    content = (
      <div role="alert" data-testid="ns-session-changed" className={`${panel} border-amber-300 bg-amber-50 text-amber-900`}>
        <p>Tu sesión cambió en otra pestaña. Recarga la página para ver tus preferencias.</p>
        <button type="button" data-testid="ns-reload" onClick={() => window.location.reload()} className={`${button} mt-3 bg-brand_primary text-white`}>
          Recargar
        </button>
      </div>
    );
  } else if (status === 'expired') {
    content = (
      <div role="alert" data-testid="ns-expired" className={`${panel} border-amber-300 bg-amber-50 text-amber-900`}>
        <p>Tu sesión terminó.</p>
        <a href={LOGIN_AGAIN} className="mt-2 inline-block font-medium underline">
          Inicia sesión nuevamente
        </a>
      </div>
    );
  } else if (status === 'error') {
    content = (
      <div role="alert" data-testid="ns-error" className={`${panel} border-red-300 bg-red-50 text-red-900`}>
        <p>{READ_ERROR}</p>
        <button
          type="button"
          data-testid="ns-retry"
          onClick={() => (categories ? void load() : window.location.reload())}
          className={`${button} mt-3 bg-brand_primary text-white`}
        >
          Reintentar
        </button>
      </div>
    );
  } else if (status === 'loading' || !view) {
    content = (
      <p role="status" data-testid="ns-loading" className="text-sm text-gray-600">
        Cargando tus preferencias…
      </p>
    );
  } else if (shown.length === 0) {
    content = (
      <p data-testid="ns-empty" className={`${panel} border-gray-200 bg-gray-50 text-gray-700`}>
        Tu cuenta no tiene avisos por correo que configurar.
      </p>
    );
  } else {
    const digest = view.digest.available;
    const mandatory = shown.flatMap(({ section, saved }) =>
      saved.events.filter((e) => e.mandatory && section.events.some((a) => a.event_type === e.event_type))
    );
    const labelOf = (eventType: string) =>
      shown.flatMap(({ section }) => section.events).find((e) => e.event_type === eventType)?.label ?? eventType;
    content = (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p data-testid={`ns-address-${view.address_suppression}`} className={`${panel} mb-4 ${view.address_suppression === 'suppressed' ? 'border-red-300 bg-red-50 text-red-900' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
          {ADDRESS_NOTICES[view.address_suppression]}
        </p>
        <p data-testid="ns-digest-note" className="mb-4 text-sm text-gray-600">
          {digest
            ? 'Resumen diario: los avisos se agrupan en un correo al día. Por ahora no puedes elegir la hora de envío.'
            : 'El resumen diario todavía no está disponible: los avisos que irían en un resumen se envían de inmediato.'}
        </p>
        {mandatory.length > 0 && (
          <div data-testid="ns-mandatory" className={`${panel} mb-4 border-blue-200 bg-blue-50 text-blue-900`}>
            <p className="font-medium">Estos avisos se envían siempre, aunque desactives su categoría:</p>
            <ul className="mt-1 list-disc pl-5">
              {mandatory.map((e) => (
                <li key={e.event_type}>{labelOf(e.event_type)}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-4">
          {shown.map(({ section, saved }) => {
            const selectId = `ns-mode-${section.category}`;
            const value = draft[section.category] ?? saved.email_mode;
            const legacy = saved.events.some((e) => e.legacy_suppressed && section.events.some((a) => a.event_type === e.event_type));
            return (
              <fieldset key={section.category} data-testid={`ns-category-${section.category}`} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label htmlFor={selectId} className="font-medium text-gray-900">
                    {saved.label}
                  </label>
                  <select
                    id={selectId}
                    data-testid={selectId}
                    value={value}
                    disabled={saving}
                    onChange={(event) => {
                      setDraft({ ...draft, [section.category]: event.target.value as CategoryEmailMode });
                      setNotice(null);
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:w-56"
                  >
                    <option value="default">{MODE_LABELS.default}</option>
                    <option value="immediate">{MODE_LABELS.immediate}</option>
                    {digest && <option value="digest">{MODE_LABELS.digest}</option>}
                    {!digest && saved.email_mode === 'digest' && (
                      <option value="digest" disabled>
                        {STORED_UNAVAILABLE}
                      </option>
                    )}
                    <option value="off">{MODE_LABELS.off}</option>
                  </select>
                </div>
                {!digest && saved.email_mode === 'digest' && (
                  <p data-testid={`ns-stored-digest-${section.category}`} className="mt-2 text-xs text-gray-600">
                    Elegiste Resumen diario antes. Mientras no esté disponible, estos avisos se envían de inmediato.
                  </p>
                )}
                {legacy && (
                  <p className="mt-2 text-xs text-gray-600">
                    Con Predeterminado se mantienen apagados los avisos que desactivaste antes.
                  </p>
                )}
                <ul className="mt-3 space-y-1 text-sm text-gray-700">
                  {section.events.map((applicable) => {
                    const event = saved.events.find((e) => e.event_type === applicable.event_type);
                    if (!event) return null;
                    return (
                      <li key={event.event_type} data-testid={`ns-event-${event.event_type}`} className="flex flex-wrap justify-between gap-x-3">
                        <span>{applicable.label}</span>
                        <span className="text-gray-500">
                          {event.mandatory ? 'Se envía siempre' : DELIVERY_LABELS[event.delivery]}
                          {event.reason === 'legacy_suppressed' && (
                            <span data-testid={`ns-legacy-${event.event_type}`}> · desactivado por una preferencia anterior</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="submit" data-testid="ns-save" disabled={saving || changes.length === 0} className={`${button} bg-brand_primary text-white`}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <p role="status" aria-live="polite" className="text-sm">
            {notice ? (
              <span data-testid={notice.kind === 'saved' ? 'ns-saved' : 'ns-save-error'} className={notice.kind === 'saved' ? 'text-green-700' : 'text-red-700'}>
                {notice.text}
              </span>
            ) : changes.length > 0 ? (
              <span data-testid="ns-unsaved" className="text-gray-600">
                Tienes cambios sin guardar.
              </span>
            ) : null}
          </p>
        </div>
      </form>
    );
  }

  return (
    <MainLayout currentPage="configuracion" pageTitle="Notificaciones por correo" breadcrumbs={[{ label: 'Configuración' }, { label: 'Notificaciones' }]}>
      <div data-testid="notification-settings" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-4 text-sm text-gray-700">
          Elige cómo recibir por correo los avisos de cada tema. Los avisos dentro de la plataforma no cambian.
        </p>
        {content}
      </div>
    </MainLayout>
  );
}
