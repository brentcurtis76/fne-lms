import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { Calendar, MapPin, Clock, Filter as FilterIcon, X, Link2, Users } from 'lucide-react';
import { SessionStatus } from '../../../lib/types/consultor-sessions.types';
import { format, parseISO, differenceInDays, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { getStatusBadge, formatTime, getModalityIcon } from '../../../lib/utils/session-ui-helpers';

interface SessionListItem {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  modality: string;
  status: SessionStatus;
  school_id: number;
  schools: { name: string } | null;
  growth_communities: { name: string } | null;
  session_facilitators: { user_id: string }[];
  recurrence_group_id: string | null;
  session_number: number | null;
}

const ConsultorSessionsPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isConsultorOrAdmin, setIsConsultorOrAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Filter state
  const [filters, setFilters] = useState({
    school_id: router.query.school_id as string || '',
    status: router.query.status as string || '',
    date_from: router.query.date_from as string || '',
    date_to: router.query.date_to as string || '',
  });

  // Reset page when filters change
  const prevFiltersRef = useRef(filters);
  useEffect(() => {
    if (JSON.stringify(prevFiltersRef.current) !== JSON.stringify(filters)) {
      setPage(1);
      prevFiltersRef.current = filters;
    }
  }, [filters]);

  // Cached school list for filter dropdown (populated on initial unfiltered load)
  const [allSchools, setAllSchools] = useState<{id: number; name: string}[]>([]);

  useEffect(() => {
    if (router.isReady) {
      initializeAuth();
    }
  }, [router.isReady]);

  useEffect(() => {
    if (user && isConsultorOrAdmin) {
      fetchSessions();
    }
  }, [user, isConsultorOrAdmin, filters, page]);

  // Update URL when filters change (skip initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const query: any = {};
    if (filters.school_id) query.school_id = filters.school_id;
    if (filters.status) query.status = filters.status;
    if (filters.date_from) query.date_from = filters.date_from;
    if (filters.date_to) query.date_to = filters.date_to;

    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }, [filters]);

  const initializeAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const userRole = await getUserPrimaryRole(session.user.id);
      const allowed = userRole === 'consultor' || userRole === 'admin';
      setIsConsultorOrAdmin(allowed);

      if (!allowed) {
        router.push('/dashboard');
        return;
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) return;

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (filters.school_id) params.append('school_id', filters.school_id);
      if (filters.status) params.append('status', filters.status);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);

      const response = await fetch(`/api/sessions?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar sesiones');
      }

      const result = await response.json();
      const newSessions = result.data?.sessions || [];
      if (page === 1) {
        setSessions(newSessions);
      } else {
        setSessions((prev) => [...prev, ...newSessions]);
      }
      setTotalSessions(result.data?.total || 0);

      // Cache school list on initial unfiltered load
      if (page === 1 && !filters.school_id && !filters.status && !filters.date_from && !filters.date_to) {
        const schoolMap = new Map<number, string>();
        newSessions.forEach((s: SessionListItem) => {
          if (s.school_id && s.schools?.name) schoolMap.set(s.school_id, s.schools.name);
        });
        setAllSchools(Array.from(schoolMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (error: any) {
      console.error('Error fetching sessions:', error);
      toast.error(error.message || 'Error al cargar sesiones');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleClearFilters = () => {
    setFilters({
      school_id: '',
      status: '',
      date_from: '',
      date_to: '',
    });
    setPage(1);
  };

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  const getNextSessionCountdown = (): string => {
    const now = new Date();
    const upcoming = sessions
      .filter((s) => ['programada', 'en_progreso'].includes(s.status))
      .filter((s) => {
        const sessionDateTime = new Date(`${s.session_date}T${s.start_time}`);
        return sessionDateTime >= now;
      })
      .sort((a, b) => {
        const dateA = new Date(`${a.session_date}T${a.start_time}`);
        const dateB = new Date(`${b.session_date}T${b.start_time}`);
        return dateA.getTime() - dateB.getTime();
      });

    if (upcoming.length === 0) return 'Sin sesiones próximas';

    const next = upcoming[0];
    const sessionDateTime = new Date(`${next.session_date}T${next.start_time}`);
    const diffDays = differenceInDays(sessionDateTime, now);
    const diffHours = differenceInHours(sessionDateTime, now);

    if (diffDays === 0) {
      if (diffHours === 0) return 'Hoy';
      return `Hoy a las ${formatTime(next.start_time)}`;
    }
    if (diffDays === 1) return 'Mañana';
    return `En ${diffDays} días`;
  };

  const pendingReportsCount = sessions.filter((s) => s.status === 'pendiente_informe').length;

  // Split sessions into "my sessions" and "other sessions"
  const mySessions = sessions.filter((s) =>
    s.session_facilitators.some((f) => f.user_id === user?.id)
  );
  const otherSessions = sessions.filter(
    (s) => !s.session_facilitators.some((f) => f.user_id === user?.id)
  );

  // Group sessions by date
  const groupByDate = (sessionList: SessionListItem[]) => {
    const groups: Record<string, SessionListItem[]> = {};
    sessionList.forEach((s) => {
      if (!groups[s.session_date]) {
        groups[s.session_date] = [];
      }
      groups[s.session_date].push(s);
    });
    return groups;
  };

  const mySessionsByDate = groupByDate(mySessions);
  const otherSessionsByDate = groupByDate(otherSessions);

  const sortedMyDates = Object.keys(mySessionsByDate).sort().reverse();
  const sortedOtherDates = Object.keys(otherSessionsByDate).sort().reverse();

  const renderSessionCard = (session: SessionListItem, dimmed: boolean = false) => {
    const badge = getStatusBadge(session.status);

    return (
      <div
        key={session.id}
        onClick={() => router.push(`/consultor/sessions/${session.id}`)}
        aria-label={`Ver detalles de ${session.title}`}
        className={`p-4 bg-white border rounded-lg cursor-pointer transition-all ${
          dimmed
            ? 'border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-300'
            : 'border-gray-300 hover:border-brand_accent hover:shadow-sm'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 truncate">{session.title}</h3>
              {session.recurrence_group_id && session.session_number && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Link2 className="w-3 h-3" />
                  <span>#{session.session_number}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>
                  {formatTime(session.start_time)} - {formatTime(session.end_time)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {getModalityIcon(session.modality)}
                <span className="capitalize">{session.modality}</span>
              </div>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          {session.schools && <div className="flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0" /> {session.schools.name}</div>}
          {session.growth_communities && <div className="flex items-center gap-1"><Users className="w-3 h-3 flex-shrink-0" /> {session.growth_communities.name}</div>}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <MainLayout user={user} onLogout={handleLogout}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Cargando...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout user={user} onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ResponsiveFunctionalPageHeader
          icon={<Calendar className="h-6 w-6" />}
          title="Mis Sesiones"
          subtitle="Vista de sesiones de consultoría asignadas"
        />

        {/* Quick stats header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Total Sesiones</div>
            <div className="text-2xl font-bold text-gray-900">{totalSessions}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Informes Pendientes</div>
            <div className="text-2xl font-bold text-orange-600">{pendingReportsCount}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Próxima Sesión</div>
            <div className="text-2xl font-bold text-gray-900">{getNextSessionCountdown()}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FilterIcon className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Filtros</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por colegio</label>
              <select
                value={filters.school_id}
                onChange={(e) => setFilters({ ...filters, school_id: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {allSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por estado</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="pendiente_aprobacion">Pendiente Aprobación</option>
                <option value="programada">Programada</option>
                <option value="en_progreso">En Progreso</option>
                <option value="pendiente_informe">Pendiente Informe</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha desde</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha hasta</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              onClick={handleClearFilters}
              className="text-sm text-brand_accent hover:text-brand_accent_hover flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Limpiar filtros
            </button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* My Sessions */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Mis Sesiones</h2>
            {mySessions.length === 0 ? (
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center text-gray-600">
                No está asignado como facilitador en ninguna sesión
              </div>
            ) : (
              <div className="space-y-4">
                {sortedMyDates.map((date) => (
                  <div key={date}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      {format(parseISO(date), 'EEEE, dd MMMM yyyy', { locale: es })}
                    </h3>
                    <div className="space-y-3">
                      {mySessionsByDate[date].map((session) => renderSessionCard(session, false))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Other Sessions */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Otras Sesiones en Mis Colegios</h2>
            {otherSessions.length === 0 ? (
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center text-gray-600">
                No hay otras sesiones en sus colegios asignados
              </div>
            ) : (
              <div className="space-y-4">
                {sortedOtherDates.map((date) => (
                  <div key={date}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      {format(parseISO(date), 'EEEE, dd MMMM yyyy', { locale: es })}
                    </h3>
                    <div className="space-y-3">
                      {otherSessionsByDate[date].map((session) => renderSessionCard(session, true))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Load More */}
        {sessions.length < totalSessions && (
          <div className="mt-6 text-center">
            <button
              onClick={handleLoadMore}
              className="px-6 py-2 bg-brand_accent text-brand_primary font-semibold rounded-lg hover:bg-brand_accent_hover"
            >
              Cargar más
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ConsultorSessionsPage;
