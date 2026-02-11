import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import {
  Calendar as CalendarIcon,
  List,
  Grid,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  Link2,
  MoreVertical,
  CheckCircle,
  XCircle,
  Eye,
} from 'lucide-react';
import { SessionStatus } from '../../../lib/types/consultor-sessions.types';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, startOfWeek, endOfWeek, addMonths, addWeeks } from 'date-fns';
import { es } from 'date-fns/locale';

type ViewMode = 'list' | 'month' | 'week';

interface School {
  id: number;
  name: string;
}

interface GrowthCommunity {
  id: string;
  name: string;
}

interface SessionListItem {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  scheduled_duration_minutes: number;
  modality: string;
  status: SessionStatus;
  school_id: number;
  growth_community_id: string;
  recurrence_group_id: string | null;
  session_number: number | null;
  schools: { name: string } | null;
  growth_communities: { name: string } | null;
  session_facilitators: any[];
}

const SessionsPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Data state
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [schools, setSchools] = useState<School[]>([]);
  const [communities, setCommunities] = useState<GrowthCommunity[]>([]);

  // Server-side stats (accurate across all pages)
  const [serverStats, setServerStats] = useState<{ total: number; by_status: Record<string, number> } | null>(null);

  // Filter state (read from URL query)
  const [filters, setFilters] = useState({
    school_id: router.query.school_id as string || '',
    growth_community_id: router.query.growth_community_id as string || '',
    status: router.query.status as string || '',
    date_from: router.query.date_from as string || '',
    date_to: router.query.date_to as string || '',
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Action state
  const [actionInProgress, setActionInProgress] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  useEffect(() => {
    initializeAuth();
  }, [router]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchSchools();
      fetchCommunities();
      fetchStats();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchSessions();
    }
  }, [user, isAdmin, filters, page, viewMode, currentDate]);

  // Update URL when filters change (skip initial mount to avoid redundant history entry)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const query: any = {};
    if (filters.school_id) query.school_id = filters.school_id;
    if (filters.growth_community_id) query.growth_community_id = filters.growth_community_id;
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
      const isAdminUser = userRole === 'admin';
      setIsAdmin(isAdminUser);

      if (!isAdminUser) {
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

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  };

  const fetchCommunities = async () => {
    try {
      const { data, error } = await supabase
        .from('growth_communities')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setCommunities(data || []);
    } catch (error) {
      console.error('Error fetching communities:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) return;

      const response = await fetch('/api/sessions/stats', {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      });

      if (!response.ok) return;

      const result = await response.json();
      setServerStats(result.data);
    } catch (error) {
      console.error('Error fetching session stats:', error);
    }
  };

  const fetchSessions = async () => {
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) return;

      const queryParams = new URLSearchParams();
      queryParams.append('page', page.toString());
      queryParams.append('limit', limit.toString());

      // Apply filters
      if (filters.school_id) queryParams.append('school_id', filters.school_id);
      if (filters.growth_community_id) queryParams.append('growth_community_id', filters.growth_community_id);
      if (filters.status) queryParams.append('status', filters.status);

      // For month/week views, set date range automatically
      if (viewMode === 'month') {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        queryParams.append('date_from', format(start, 'yyyy-MM-dd'));
        queryParams.append('date_to', format(end, 'yyyy-MM-dd'));
      } else if (viewMode === 'week') {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
        const end = endOfWeek(currentDate, { weekStartsOn: 1 });
        queryParams.append('date_from', format(start, 'yyyy-MM-dd'));
        queryParams.append('date_to', format(end, 'yyyy-MM-dd'));
      } else {
        // List view uses custom date filters
        if (filters.date_from) queryParams.append('date_from', filters.date_from);
        if (filters.date_to) queryParams.append('date_to', filters.date_to);
      }

      const response = await fetch(`/api/sessions?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar sesiones');
      }

      const result = await response.json();
      setSessions(result.data.sessions || []);
      setTotalSessions(result.data.total || 0);
    } catch (error: any) {
      console.error('Error fetching sessions:', error);
      toast.error(error.message || 'Error al cargar sesiones');
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page
  };

  const handleViewSession = (sessionId: string) => {
    router.push(`/admin/sessions/${sessionId}`);
  };

  const handleApprove = async (sessionId: string) => {
    setActionInProgress(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${sessionId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al aprobar sesión');
      }

      toast.success('Sesión aprobada exitosamente');
      fetchSessions();
      fetchStats();
    } catch (error: any) {
      console.error('Error approving session:', error);
      toast.error(error.message || 'Error al aprobar sesión');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCancelClick = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setShowCancelModal(true);
  };

  const handleCancelSubmit = async () => {
    if (!selectedSessionId || !cancellationReason.trim()) {
      toast.error('Debe ingresar una razón de cancelación');
      return;
    }

    setActionInProgress(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${selectedSessionId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cancellation_reason: cancellationReason.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al cancelar sesión');
      }

      toast.success('Sesión cancelada exitosamente');
      setShowCancelModal(false);
      setCancellationReason('');
      setSelectedSessionId(null);
      fetchSessions();
      fetchStats();
    } catch (error: any) {
      console.error('Error cancelling session:', error);
      toast.error(error.message || 'Error al cancelar sesión');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getStatusBadge = (status: SessionStatus) => {
    const badges: Record<SessionStatus, { label: string; className: string }> = {
      borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-700' },
      pendiente_aprobacion: { label: 'Pendiente Aprobación', className: 'bg-yellow-100 text-yellow-700' },
      programada: { label: 'Programada', className: 'bg-blue-100 text-blue-700' },
      en_progreso: { label: 'En Progreso', className: 'bg-amber-100 text-amber-700' },
      pendiente_informe: { label: 'Pendiente Informe', className: 'bg-orange-100 text-orange-700' },
      completada: { label: 'Completada', className: 'bg-green-100 text-green-700' },
      cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
    };

    const badge = badges[status] || badges.borrador;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
        {badge.label}
      </span>
    );
  };

  const getStatusColor = (status: SessionStatus): string => {
    const colors: Record<SessionStatus, string> = {
      borrador: '#6B7280',
      pendiente_aprobacion: '#EAB308',
      programada: '#3B82F6',
      en_progreso: '#F59E0B',
      pendiente_informe: '#EA580C',
      completada: '#10B981',
      cancelada: '#EF4444',
    };
    return colors[status] || colors.borrador;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    return timeString.substring(0, 5); // HH:MM
  };

  const formatDateShort = (dateString: string) => {
    const date = parseISO(dateString);
    return format(date, 'dd MMM', { locale: es });
  };

  // Compute series totals from loaded sessions (approximate when sessions span multiple pages)
  const seriesTotals = sessions.reduce((acc, s) => {
    if (s.recurrence_group_id) {
      acc[s.recurrence_group_id] = (acc[s.recurrence_group_id] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const getSeriesInfo = (session: SessionListItem): string | null => {
    if (!session.recurrence_group_id || !session.session_number) return null;
    const total = seriesTotals[session.recurrence_group_id];
    return total ? `${session.session_number}/${total}` : `${session.session_number}`;
  };

  // Stats from server (accurate across all sessions, not just current page)
  const stats = {
    total: serverStats?.total ?? totalSessions,
    programada: serverStats?.by_status?.programada ?? 0,
    pendiente: serverStats?.by_status?.pendiente_informe ?? 0,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a0a0a]"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#0a0a0a] mb-4">Acceso Denegado</h1>
          <p className="text-gray-600">No tiene permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="sessions"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
    >
      <ResponsiveFunctionalPageHeader
        icon={<CalendarIcon />}
        title="Sesiones de Consultoría"
        subtitle="Gestión de sesiones con consultores externos e internos"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Total Sesiones</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Programadas</div>
            <div className="text-2xl font-bold text-blue-600">{stats.programada}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Pendientes</div>
            <div className="text-2xl font-bold text-orange-600">{stats.pendiente}</div>
          </div>
        </div>

        {/* Header with Actions */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            {/* View Mode Tabs */}
            <div className="flex space-x-2">
              <button
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center px-4 py-2 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-brand_primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <List size={18} className="mr-2" />
                Lista
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`inline-flex items-center px-4 py-2 rounded-lg transition-colors ${
                  viewMode === 'month'
                    ? 'bg-brand_primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Grid size={18} className="mr-2" />
                Mes
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`inline-flex items-center px-4 py-2 rounded-lg transition-colors ${
                  viewMode === 'week'
                    ? 'bg-brand_primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <CalendarIcon size={18} className="mr-2" />
                Semana
              </button>
            </div>

            {/* Nueva Sesión Button */}
            <button
              onClick={() => router.push('/admin/sessions/create')}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors"
            >
              <Plus size={20} className="mr-2" />
              Nueva Sesión
            </button>
          </div>

          {/* Filters */}
          <div className="p-4 bg-gray-50 border-b">
            <div className="flex items-center mb-3">
              <Filter size={18} className="text-gray-500 mr-2" />
              <span className="text-sm font-medium text-gray-700">Filtros</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <select
                value={filters.school_id}
                onChange={(e) => handleFilterChange('school_id', e.target.value)}
                className="p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              >
                <option value="">Todos los colegios</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>

              <select
                value={filters.growth_community_id}
                onChange={(e) => handleFilterChange('growth_community_id', e.target.value)}
                className="p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              >
                <option value="">Todas las comunidades</option>
                {communities.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </select>

              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              >
                <option value="">Todos los estados</option>
                <option value="borrador">Borrador</option>
                <option value="pendiente_aprobacion">Pendiente Aprobación</option>
                <option value="programada">Programada</option>
                <option value="en_progreso">En Progreso</option>
                <option value="pendiente_informe">Pendiente Informe</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </select>

              {viewMode === 'list' && (
                <>
                  <input
                    type="date"
                    value={filters.date_from}
                    onChange={(e) => handleFilterChange('date_from', e.target.value)}
                    placeholder="Desde"
                    className="p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />

                  <input
                    type="date"
                    value={filters.date_to}
                    onChange={(e) => handleFilterChange('date_to', e.target.value)}
                    placeholder="Hasta"
                    className="p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />
                </>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="p-4">
            {viewMode === 'list' && <ListView sessions={sessions} />}
            {viewMode === 'month' && <MonthView sessions={sessions} currentDate={currentDate} />}
            {viewMode === 'week' && <WeekView sessions={sessions} currentDate={currentDate} />}
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Cancelar Sesión
            </h2>
            <p className="text-gray-600 mb-4">
              Por favor, ingrese la razón de la cancelación:
            </p>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              placeholder="Razón de cancelación..."
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancellationReason('');
                  setSelectedSessionId(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                disabled={actionInProgress}
              >
                Cerrar
              </button>
              <button
                onClick={handleCancelSubmit}
                disabled={actionInProgress || !cancellationReason.trim()}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                Confirmar Cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );

  // Sub-components for different views
  function ListView({ sessions }: { sessions: SessionListItem[] }) {
    const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

    // Close dropdown on outside click and Escape key
    useEffect(() => {
      if (!dropdownOpen) return;

      const handleClickOutside = () => {
        setDropdownOpen(null);
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setDropdownOpen(null);
      };

      // Delay listener to avoid the opening click from immediately closing
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      document.addEventListener('keydown', handleEscape);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [dropdownOpen]);

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Colegio</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comunidad</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serie</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No se encontraron sesiones
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr
                  key={session.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleViewSession(session.id)}
                >
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {formatDateShort(session.session_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {formatTime(session.start_time)} - {formatTime(session.end_time)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                    {session.title}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {session.schools?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {session.growth_communities?.name || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(session.status)}
                  </td>
                  <td className="px-4 py-3">
                    {session.recurrence_group_id && (
                      <div className="flex items-center text-xs text-blue-600">
                        <Link2 size={14} className="mr-1" />
                        {getSeriesInfo(session)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpen(dropdownOpen === session.id ? null : session.id);
                      }}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <MoreVertical size={18} />
                    </button>
                    {dropdownOpen === session.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewSession(session.id);
                            setDropdownOpen(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                        >
                          <Eye size={16} className="mr-2" />
                          Ver detalle
                        </button>
                        {(session.status === 'borrador' || session.status === 'pendiente_aprobacion') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(session.id);
                              setDropdownOpen(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-gray-100 flex items-center"
                          >
                            <CheckCircle size={16} className="mr-2" />
                            Aprobar
                          </button>
                        )}
                        {session.status !== 'completada' && session.status !== 'cancelada' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelClick(session.id);
                              setDropdownOpen(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-gray-100 flex items-center"
                          >
                            <XCircle size={16} className="mr-2" />
                            Cancelar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  function MonthView({ sessions, currentDate }: { sessions: SessionListItem[]; currentDate: Date }) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const sessionsByDate = sessions.reduce((acc, session) => {
      const date = session.session_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(session);
      return acc;
    }, {} as Record<string, SessionListItem[]>);

    return (
      <div>
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, -1))}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ChevronLeft size={20} />
          </button>
          <h3 className="text-lg font-semibold text-gray-900">
            {format(currentDate, 'MMMM yyyy', { locale: es })}
          </h3>
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Day headers */}
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
              {day}
            </div>
          ))}

          {/* Day cells */}
          {days.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const daySessions = sessionsByDate[dateKey] || [];
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();

            return (
              <div
                key={dateKey}
                className={`min-h-20 border border-gray-200 p-1 ${
                  isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                }`}
              >
                <div className="text-xs text-gray-500 mb-1">{day.getDate()}</div>
                <div className="space-y-1">
                  {daySessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => handleViewSession(session.id)}
                      className="w-full text-left"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getStatusColor(session.status) }}
                        title={session.title}
                      />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function WeekView({ sessions, currentDate }: { sessions: SessionListItem[]; currentDate: Date }) {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const sessionsByDate = sessions.reduce((acc, session) => {
      const date = session.session_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(session);
      return acc;
    }, {} as Record<string, SessionListItem[]>);

    return (
      <div>
        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentDate(addWeeks(currentDate, -1))}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ChevronLeft size={20} />
          </button>
          <h3 className="text-lg font-semibold text-gray-900">
            {format(weekStart, 'dd MMM', { locale: es })} - {format(weekEnd, 'dd MMM yyyy', { locale: es })}
          </h3>
          <button
            onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Week View */}
        <div className="space-y-6">
          {weekDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const daySessions = sessionsByDate[dateKey] || [];

            return (
              <div key={dateKey}>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  {format(day, 'EEEE, dd MMMM', { locale: es })}
                </h4>
                {daySessions.length === 0 ? (
                  <p className="text-sm text-gray-500 pl-4">No hay sesiones programadas</p>
                ) : (
                  <div className="space-y-2">
                    {daySessions.map((session) => (
                      <div
                        key={session.id}
                        onClick={() => handleViewSession(session.id)}
                        className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-900">{session.title}</span>
                              {session.recurrence_group_id && (
                                <span className="flex items-center text-xs text-blue-600">
                                  <Link2 size={14} className="mr-1" />
                                  {getSeriesInfo(session)}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {formatTime(session.start_time)} - {formatTime(session.end_time)} | {session.schools?.name}
                            </div>
                          </div>
                          <div>{getStatusBadge(session.status)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
};

export default SessionsPage;
