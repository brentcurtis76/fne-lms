import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Calendar, Clock, ArrowRight, MapPin, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import DashboardCard from './DashboardCard';
import { supabase } from '../../../lib/supabase';
import { getStatusBadge, formatTime, getModalityIcon } from '../../../lib/utils/session-ui-helpers';
import { SessionStatus } from '../../../lib/types/consultor-sessions.types';

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

const UpcomingSessionsCard: React.FC = () => {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toISOString());

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        throw new Error('No hay sesión de autenticación');
      }

      const response = await fetch(
        '/api/sessions?status=programada,en_progreso,pendiente_informe&limit=5',
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
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      console.error('Error fetching upcoming sessions:', err);
      setError(err.message || 'Error al cargar sesiones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRefresh = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleSessionClick = (sessionId: string) => {
    router.push(`/consultor/sessions/${sessionId}`);
  };

  const handleViewAll = () => {
    router.push('/consultor/sessions');
  };

  const isEmpty = !loading && sessions.length === 0;

  const mainContent = (
    <div className="h-full flex flex-col">
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-sm">No tiene sesiones próximas programadas</p>
          </div>
        </div>
      ) : (
        <>
          <ul role="list" aria-label="Lista de próximas sesiones" className="flex-1 overflow-y-auto space-y-3 mb-4">
            {sessions.map((session) => {
              const badge = getStatusBadge(session.status);
              const isPendingReport = session.status === 'pendiente_informe';

              return (
                <li
                  key={session.id}
                  onClick={() => handleSessionClick(session.id)}
                  aria-label={`Ver detalles de ${session.title}`}
                  className="p-3 bg-white border border-gray-200 rounded-lg hover:border-brand_accent hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 truncate text-sm">
                          {session.title}
                        </h4>
                        {session.recurrence_group_id && session.session_number && (
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            #{session.session_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {format(parseISO(session.session_date), 'EEE dd MMM', { locale: es })}
                        </span>
                        <Clock className="w-3 h-3 ml-1" />
                        <span>
                          {formatTime(session.start_time)} - {formatTime(session.end_time)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {getModalityIcon(session.modality)}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    {session.schools && (
                      <div className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" /> {session.schools.name}</div>
                    )}
                    {session.growth_communities && (
                      <div className="flex items-center gap-1 truncate"><Users className="w-3 h-3 flex-shrink-0" /> {session.growth_communities.name}</div>
                    )}
                  </div>
                  {isPendingReport && (
                    <div className="mt-2 text-xs text-orange-600 font-medium">
                      ⚠️ Informe pendiente
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="pt-3 border-t border-gray-100">
            <button
              onClick={handleViewAll}
              className="w-full text-sm text-brand_accent hover:text-brand_accent_hover font-medium flex items-center justify-center gap-1"
            >
              Ver todas las sesiones
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <DashboardCard
      id="upcoming-sessions"
      type="upcoming-sessions"
      title="Próximas Sesiones"
      subtitle="Sesiones programadas y en progreso"
      size="large"
      priority="high"
      loading={loading}
      error={error || undefined}
      isEmpty={isEmpty}
      onRefresh={handleRefresh}
      lastUpdated={lastUpdated}
      ariaLabel="Tarjeta de próximas sesiones de consultoría"
    >
      {mainContent}
    </DashboardCard>
  );
};

export default UpcomingSessionsCard;
