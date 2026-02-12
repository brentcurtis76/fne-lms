import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Calendar, Clock, MapPin, Users, RefreshCw, CalendarX } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, startOfToday, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { CommunityWorkspace, WorkspaceAccess } from '../../utils/workspaceUtils';
import { SessionStatus } from '../../lib/types/consultor-sessions.types';
import { getStatusBadge, formatTime, getModalityIcon } from '../../lib/utils/session-ui-helpers';
import { supabase } from '../../lib/supabase';

interface WorkspaceSessionsTabProps {
  workspace: CommunityWorkspace | null;
  workspaceAccess: WorkspaceAccess | null;
  user: { id: string } | null;
}

interface SessionListItem {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  modality: string;
  status: SessionStatus;
  schools: { name: string } | null;
  growth_communities: { name: string } | null;
  session_facilitators: { user_id: string }[];
  session_number: number | null;
  recurrence_group_id: string | null;
}

const WorkspaceSessionsTab: React.FC<WorkspaceSessionsTabProps> = ({
  workspace,
  workspaceAccess,
  user,
}) => {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!workspace || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        throw new Error('No hay sesión de autenticación');
      }

      const response = await fetch(
        `/api/sessions?growth_community_id=${workspace.community_id}&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Error al cargar sesiones');
      }

      const result = await response.json();
      setSessions(result.data?.sessions || []);
    } catch (err: any) {
      console.error('Error fetching workspace sessions:', err);
      setError(err.message || 'Error al cargar sesiones');
      toast.error(err.message || 'Error al cargar sesiones');
    } finally {
      setLoading(false);
    }
  }, [workspace, user]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRefresh = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Group sessions into upcoming and past
  const today = startOfToday();
  const upcomingSessions = sessions.filter(session => {
    const sessionDate = parseISO(session.session_date);
    const isFuture = isAfter(sessionDate, today) || isSameDay(sessionDate, today);
    const isActiveStatus = !['completada', 'cancelada'].includes(session.status);
    return isFuture && isActiveStatus;
  }).sort((a, b) => a.session_date.localeCompare(b.session_date));

  const pastSessions = sessions.filter(session => {
    const sessionDate = parseISO(session.session_date);
    const isPast = isBefore(sessionDate, today) && !isSameDay(sessionDate, today);
    const isClosedStatus = ['completada', 'cancelada'].includes(session.status);
    return isPast || isClosedStatus;
  }).sort((a, b) => b.session_date.localeCompare(a.session_date));

  // Placeholder when no workspace selected
  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <CalendarX className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-sm">Selecciona una comunidad para ver sus sesiones</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-brand_primary">Sesiones</h2>
          <button disabled className="p-2 text-gray-400 rounded-lg">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-gray-100 rounded-lg p-4 h-32 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-brand_primary">Sesiones</h2>
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-600 hover:text-brand_accent rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Refrescar sesiones"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-sm">No hay sesiones registradas para esta comunidad</p>
          </div>
        </div>
      </div>
    );
  }

  const renderSessionCard = (session: SessionListItem) => {
    const badge = getStatusBadge(session.status);

    return (
      <div
        onClick={() => router.push(`/consultor/sessions/${session.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(`/consultor/sessions/${session.id}`); }}
        aria-label={`Ver detalles de ${session.title}`}
        className="bg-white border border-gray-200 rounded-lg p-4 hover:border-brand_accent hover:shadow-sm transition-all cursor-pointer"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-gray-900 truncate">
                {session.title}
              </h3>
              {session.recurrence_group_id && session.session_number && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">
                  #{session.session_number}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            {getModalityIcon(session.modality)}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span>
              {format(parseISO(session.session_date), "EEEE dd 'de' MMMM yyyy", { locale: es })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span>
              {formatTime(session.start_time)} - {formatTime(session.end_time)}
            </span>
          </div>
          {session.schools && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" />
              <span className="truncate">{session.schools.name}</span>
            </div>
          )}
          {session.growth_communities && (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 flex-shrink-0 text-gray-400" />
              <span className="truncate">{session.growth_communities.name}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-brand_primary">Sesiones</h2>
        <button
          onClick={handleRefresh}
          className="p-2 text-gray-600 hover:text-brand_accent rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Refrescar sesiones"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Upcoming Sessions */}
      {upcomingSessions.length > 0 && (
        <section aria-labelledby="upcoming-sessions-heading">
          <div className="flex items-center gap-2 mb-4">
            <h3 id="upcoming-sessions-heading" className="text-lg font-semibold text-brand_primary">
              Próximas Sesiones
            </h3>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
              {upcomingSessions.length}
            </span>
          </div>
          <ul role="list" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {upcomingSessions.map(session => (
              <li key={session.id}>{renderSessionCard(session)}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Past Sessions */}
      {pastSessions.length > 0 && (
        <section aria-labelledby="past-sessions-heading">
          <div className="flex items-center gap-2 mb-4">
            <h3 id="past-sessions-heading" className="text-lg font-semibold text-brand_primary">
              Sesiones Pasadas
            </h3>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
              {pastSessions.length}
            </span>
          </div>
          <ul role="list" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pastSessions.map(session => (
              <li key={session.id}>{renderSessionCard(session)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default WorkspaceSessionsTab;
