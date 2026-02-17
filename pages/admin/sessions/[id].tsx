import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { Calendar, CheckCircle, XCircle, Link2, ChevronDown, ChevronUp, Eye, CalendarPlus, Play } from 'lucide-react';
import { SessionWithRelations, SessionStatus } from '../../../lib/types/consultor-sessions.types';
import {
  getStatusBadge as getStatusBadgeData,
  getSeriesStatsPillClass,
} from '../../../lib/utils/session-ui-helpers';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface SeriesSessionItem {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: SessionStatus;
  session_number: number | null;
}

const SessionDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [session, setSession] = useState<SessionWithRelations | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);

  // Series state
  const [seriesSessions, setSeriesSessions] = useState<SeriesSessionItem[]>([]);
  const [seriesStats, setSeriesStats] = useState<Record<SessionStatus, number> | null>(null);
  const [seriesTotalSessions, setSeriesTotalSessions] = useState(0);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [showSeriesPanel, setShowSeriesPanel] = useState(false);
  const [showSeriesCancelModal, setShowSeriesCancelModal] = useState(false);
  const [seriesCancellationReason, setSeriesCancellationReason] = useState('');

  // Facilitator editor state
  const [editingFacilitators, setEditingFacilitators] = useState(false);
  const [editFacilitators, setEditFacilitators] = useState<Array<{ user_id: string; facilitator_role: 'consultor_externo' | 'equipo_interno'; is_lead: boolean }>>([]);
  const [availableConsultants, setAvailableConsultants] = useState<Array<{ id: string; first_name: string; last_name: string; email: string }>>([]);
  const [loadingConsultants, setLoadingConsultants] = useState(false);
  const [savingFacilitators, setSavingFacilitators] = useState(false);

  useEffect(() => {
    initializeAuth();
  }, [router]);

  useEffect(() => {
    if (user && isAdmin && id) {
      fetchSession();
      // Reset series state when navigating to a different session
      setSeriesSessions([]);
      setSeriesStats(null);
      setSeriesTotalSessions(0);
      setSeriesLoading(false);
    }
  }, [user, isAdmin, id, router.isReady]);

  // Lazy-load series data when panel is expanded or session changes
  useEffect(() => {
    if (showSeriesPanel && session?.recurrence_group_id && seriesSessions.length === 0 && !seriesLoading) {
      fetchSeriesData(session.recurrence_group_id);
    }
  }, [showSeriesPanel, session]);

  // Focus trap and escape key for cancel modal
  useEffect(() => {
    if (!showCancelModal) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCancelModal(false);
      }
    };

    const modal = document.querySelector('[role="dialog"]');
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    firstElement?.focus();

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
    };
  }, [showCancelModal]);

  // Focus trap and escape key for series cancel modal
  useEffect(() => {
    if (!showSeriesCancelModal) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSeriesCancelModal(false);
      }
    };

    const modal = document.querySelector('[role="dialog"][aria-labelledby="series-cancel-modal-title"]');
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    firstElement?.focus();

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
    };
  }, [showSeriesCancelModal]);

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

  const fetchSession = async () => {
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${id}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar sesión');
      }

      const result = await response.json();
      setSession(result.data.session);
    } catch (error: unknown) {
      console.error('Error fetching session:', error);
      toast.error(error instanceof Error ? error.message : 'Error al cargar sesión');
    }
  };

  const handleApprove = async () => {
    if (!session) return;

    if (!window.confirm('¿Está seguro que desea aprobar esta sesión?')) return;

    setActionInProgress(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${id}/approve`, {
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
      fetchSession();
    } catch (error: unknown) {
      console.error('Error approving session:', error);
      toast.error(error instanceof Error ? error.message : 'Error al aprobar sesión');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleStartSession = async () => {
    if (!session) return;

    if (!window.confirm('¿Está seguro que desea iniciar esta sesión?')) return;

    setActionInProgress(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'en_progreso' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al iniciar sesión');
      }

      toast.success('Sesión iniciada exitosamente');
      fetchSession();
    } catch (error: unknown) {
      console.error('Error starting session:', error);
      toast.error(error instanceof Error ? error.message : 'Error al iniciar sesión');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancellationReason.trim()) {
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

      const response = await fetch(`/api/sessions/${id}/cancel`, {
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
      fetchSession();
    } catch (error: unknown) {
      console.error('Error cancelling session:', error);
      toast.error(error instanceof Error ? error.message : 'Error al cancelar sesión');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const fetchSeriesData = async (groupId: string) => {
    setSeriesLoading(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/series/${groupId}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar serie');
      }

      const result = await response.json();
      setSeriesSessions(result.data.sessions);
      setSeriesStats(result.data.stats);
      setSeriesTotalSessions(result.data.total_sessions);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error fetching series:', error);
        toast.error(error.message || 'Error al cargar serie');
      }
    } finally {
      setSeriesLoading(false);
    }
  };

  const handleSeriesCancelSubmit = async () => {
    if (!seriesCancellationReason.trim()) {
      toast.error('Debe ingresar una razón de cancelación');
      return;
    }

    if (!session?.recurrence_group_id) return;

    setActionInProgress(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/series/${session.recurrence_group_id}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancellation_reason: seriesCancellationReason.trim(),
          scope: 'all_future',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al cancelar serie');
      }

      const result = await response.json();
      const count = result.data.cancelled_count;
      const message = count === 1
        ? '1 sesión cancelada exitosamente'
        : `${count} sesiones canceladas exitosamente`;
      toast.success(message);
      setShowSeriesCancelModal(false);
      setSeriesCancellationReason('');

      // Refetch both session and series data
      await fetchSession();
      if (session.recurrence_group_id) {
        await fetchSeriesData(session.recurrence_group_id);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error cancelling series:', error);
        toast.error(error.message || 'Error al cancelar serie');
      }
    } finally {
      setActionInProgress(false);
    }
  };

  const getStatusBadge = (status: SessionStatus) => {
    const badge = getStatusBadgeData(status);
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.className}`}>
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    // Append T12:00:00 to prevent timezone shift from moving the date backward
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

  const handleStartEditFacilitators = async () => {
    if (!session) return;
    setEditingFacilitators(true);
    setEditFacilitators(
      session.facilitators.map((f) => ({
        user_id: f.user_id,
        facilitator_role: f.facilitator_role,
        is_lead: f.is_lead,
      }))
    );
    setLoadingConsultants(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        setEditingFacilitators(false);
        return;
      }

      const response = await fetch(`/api/admin/consultants?school_id=${session.school_id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar consultores');
      }

      const data = await response.json();
      const consultants = data?.data?.consultants ?? data?.consultants ?? [];
      setAvailableConsultants(consultants);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error loading consultants:', error);
        toast.error(error.message || 'Error al cargar consultores');
      }
    } finally {
      setLoadingConsultants(false);
    }
  };

  const handleCancelEditFacilitators = () => {
    setEditingFacilitators(false);
    setEditFacilitators([]);
    setAvailableConsultants([]);
  };

  const handleAddEditFacilitator = (consultantId: string) => {
    if (!editFacilitators.find((f) => f.user_id === consultantId)) {
      setEditFacilitators([
        ...editFacilitators,
        {
          user_id: consultantId,
          facilitator_role: 'consultor_externo',
          is_lead: false,
        },
      ]);
    }
  };

  const handleRemoveEditFacilitator = (consultantId: string) => {
    setEditFacilitators(editFacilitators.filter((f) => f.user_id !== consultantId));
  };

  const handleToggleEditFacilitatorLead = (consultantId: string) => {
    setEditFacilitators(
      editFacilitators.map((f) =>
        f.user_id === consultantId ? { ...f, is_lead: !f.is_lead } : f
      )
    );
  };

  const handleSaveFacilitators = async () => {
    if (!session || editFacilitators.length === 0) return;

    setSavingFacilitators(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${session.id}/facilitators`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          facilitators: editFacilitators,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al guardar consultores');
      }

      toast.success('Consultores actualizados exitosamente');
      setEditingFacilitators(false);
      setEditFacilitators([]);
      setAvailableConsultants([]);
      await fetchSession();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error saving facilitators:', error);
        toast.error(error.message || 'Error al guardar consultores');
      }
    } finally {
      setSavingFacilitators(false);
    }
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

  if (!session) {
    return (
      <MainLayout
        user={user}
        currentPage="sessions"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <p className="text-center text-gray-600">Cargando sesión...</p>
          </div>
        </div>
      </MainLayout>
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
        icon={<Calendar />}
        title="Detalle de Sesión"
        subtitle={session.title}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          {/* Series Banner */}
          {session.recurrence_group_id && session.session_number && (
            <div className="mb-6">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Link2 size={18} className="text-gray-600" />
                    <span className="text-sm font-medium text-gray-900">
                      Serie de sesiones — Sesión {session.session_number}
                      {seriesTotalSessions > 0 && ` de ${seriesTotalSessions}`}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowSeriesPanel(!showSeriesPanel)}
                    className="flex items-center space-x-1 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                    aria-expanded={showSeriesPanel}
                    aria-label={showSeriesPanel ? "Ocultar sesiones de la serie" : "Ver todas las sesiones de la serie"}
                  >
                    <span>Ver todas las sesiones de la serie</span>
                    {showSeriesPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Collapsible Series Panel */}
              {showSeriesPanel && (
                <div className="mt-4 border border-gray-200 rounded-lg p-4" role="region" aria-label="Sesiones de la serie">
                  {seriesLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
                    </div>
                  ) : (
                    <>
                      {/* Stats Pills */}
                      {seriesStats && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {(Object.entries(seriesStats) as [SessionStatus, number][])
                            .filter(([, count]) => count > 0)
                            .map(([status, count]) => {
                              const badge = getStatusBadgeData(status);
                              const pillClass = getSeriesStatsPillClass(status);
                              const label = status === 'borrador' && count > 1
                                ? 'Borradores'
                                : badge.label + (count > 1 && !badge.label.endsWith('n') ? 's' : '');
                              return (
                                <span key={status} className={`px-3 py-1 ${pillClass} rounded-full text-xs font-medium`}>
                                  {count} {label}
                                </span>
                              );
                            })}
                        </div>
                      )}

                      {/* Session List */}
                      <div className="space-y-2 mb-4">
                        {seriesSessions.length === 0 ? (
                          <p className="text-center text-gray-500 py-4">No se encontraron sesiones en esta serie.</p>
                        ) : (
                          seriesSessions.map((s) => (
                            <div
                              key={s.id}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                s.id === session.id
                                  ? 'bg-yellow-50 border-yellow-300'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-center space-x-3">
                                <span className="text-sm font-medium text-gray-700">
                                  Sesión {s.session_number}
                                </span>
                                {s.id === session.id && (
                                  <span className="px-2 py-0.5 bg-yellow-400 text-gray-900 text-xs rounded">
                                    Actual
                                  </span>
                                )}
                                <span className="text-sm text-gray-600">
                                  {format(new Date(s.session_date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {s.start_time.substring(0, 5)} - {s.end_time.substring(0, 5)}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                {getStatusBadge(s.status)}
                                <button
                                  onClick={() => router.push(`/admin/sessions/${s.id}`)}
                                  className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
                                >
                                  <Eye size={14} />
                                  <span>Ver</span>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Series Actions */}
                      <div className="flex justify-end pt-3 border-t">
                        <button
                          onClick={() => setShowSeriesCancelModal(true)}
                          disabled={actionInProgress}
                          className="inline-flex items-center px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <XCircle size={18} className="mr-2" />
                          Cancelar sesiones futuras
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Status and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-6 border-b space-y-3 sm:space-y-0">
            <div>{getStatusBadge(session.status)}</div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 flex-wrap">
              {/* Add to Calendar Button - for exportable statuses */}
              {(['programada', 'en_progreso', 'pendiente_informe'] as string[]).includes(session.status) && (
                <a
                  href={`/api/sessions/${session.id}/ical`}
                  download
                  className="inline-flex items-center px-4 py-2 text-brand_accent border border-brand_accent hover:bg-brand_accent_light rounded-lg transition-colors"
                >
                  <CalendarPlus size={20} className="mr-2" />
                  Agregar al Calendario
                </a>
              )}

              {/* Export Series Button - if session is part of a series */}
              {session.recurrence_group_id && (
                <a
                  href={`/api/sessions/series/${session.recurrence_group_id}/ical`}
                  download
                  className="inline-flex items-center px-4 py-2 text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <CalendarPlus size={20} className="mr-2" />
                  Exportar Serie
                </a>
              )}

              {(session.status === 'borrador' || session.status === 'pendiente_aprobacion') && (
                <button
                  onClick={handleApprove}
                  disabled={actionInProgress}
                  className="inline-flex items-center px-4 py-2 bg-brand_primary text-white hover:bg-brand_gray_dark rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={20} className="mr-2" />
                  Aprobar
                </button>
              )}

              {session.status === 'programada' && (
                <button
                  onClick={handleStartSession}
                  disabled={actionInProgress}
                  className="inline-flex items-center px-4 py-2 bg-brand_accent text-brand_primary hover:bg-brand_accent_hover rounded-lg transition-colors disabled:opacity-50"
                >
                  <Play size={20} className="mr-2" />
                  Iniciar Sesión
                </button>
              )}

              {session.status !== 'completada' && session.status !== 'cancelada' && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={actionInProgress}
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <XCircle size={20} className="mr-2" />
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Session Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Título</h3>
              <p className="text-lg font-semibold text-gray-900 break-words">{session.title}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Modalidad</h3>
              <p className="text-gray-900 capitalize">{session.modality}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Fecha</h3>
              <p className="text-gray-900">{formatDate(session.session_date)}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Horario</h3>
              <p className="text-gray-900">
                {formatTime(session.start_time)} - {formatTime(session.end_time)}
                <span className="text-xs text-gray-500 ml-1">(hora Chile)</span> ({session.scheduled_duration_minutes} min)
              </p>
            </div>

            {session.location && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Ubicación</h3>
                <p className="text-gray-900">{session.location}</p>
              </div>
            )}

            {session.meeting_link && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Enlace de reunión</h3>
                <a
                  href={session.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand_accent_hover hover:underline"
                >
                  {session.meeting_provider || 'Enlace'}
                </a>
              </div>
            )}

            {session.description && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Descripción</h3>
                <p className="text-gray-900">{session.description}</p>
              </div>
            )}

            {session.objectives && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Objetivos</h3>
                <p className="text-gray-900">{session.objectives}</p>
              </div>
            )}

            {session.cancellation_reason && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Razón de cancelación</h3>
                <p className="text-red-600">{session.cancellation_reason}</p>
              </div>
            )}
          </div>

          {/* Consultores */}
          <div className="mt-6 pt-6 border-t">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Consultores</h3>
              {session.status !== 'completada' && session.status !== 'cancelada' && !editingFacilitators && (
                <button
                  onClick={() => handleStartEditFacilitators()}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Editar consultores
                </button>
              )}
            </div>

            {!editingFacilitators ? (
              session.facilitators.length > 0 ? (
                <div className="space-y-2">
                  {session.facilitators.map((facilitator) => {
                    const profile = facilitator.profiles;
                    const displayName = profile
                      ? `${profile.first_name} ${profile.last_name}`.trim() || profile.email || facilitator.user_id
                      : facilitator.user_id;

                    return (
                      <div
                        key={facilitator.id}
                        className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                      >
                        <div>
                          <span className="font-medium">{displayName}</span>
                          {facilitator.is_lead && (
                            <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                              Consultor principal
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-gray-500 capitalize">
                          {facilitator.facilitator_role.replace(/_/g, ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Sin consultores asignados</p>
              )
            ) : (
              <div className="border rounded-lg p-4 bg-blue-50">
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Consultores actuales</h4>
                    <div className="space-y-2">
                      {editFacilitators.length > 0 ? (
                        editFacilitators.map((facilitator) => {
                          const consultant = availableConsultants.find((c) => c.id === facilitator.user_id);
                          const displayName = consultant
                            ? `${consultant.first_name} ${consultant.last_name}`
                            : facilitator.user_id;

                          return (
                            <div
                              key={facilitator.user_id}
                              className="flex items-center justify-between bg-white p-3 rounded border border-gray-200"
                            >
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{displayName}</div>
                                {consultant && <div className="text-sm text-gray-500">{consultant.email}</div>}
                              </div>
                              <div className="flex items-center space-x-2">
                                <label className="flex items-center text-sm">
                                  <input
                                    type="checkbox"
                                    checked={facilitator.is_lead}
                                    onChange={() => handleToggleEditFacilitatorLead(facilitator.user_id)}
                                    className="mr-1"
                                  />
                                  Consultor principal
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEditFacilitator(facilitator.user_id)}
                                  className="text-red-600 hover:text-red-800 text-sm"
                                >
                                  Quitar
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-gray-500">No hay consultores añadidos</p>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Añadir consultor</h4>
                    {loadingConsultants ? (
                      <div className="flex items-center p-3 bg-white rounded border border-gray-200">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                        <span className="text-sm text-gray-600">Cargando consultores...</span>
                      </div>
                    ) : (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddEditFacilitator(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                        disabled={availableConsultants.length === 0}
                      >
                        <option value="">Seleccionar consultor...</option>
                        {availableConsultants
                          .filter((c) => !editFacilitators.find((f) => f.user_id === c.id))
                          .map((consultant) => (
                            <option key={consultant.id} value={consultant.id}>
                              {consultant.first_name} {consultant.last_name} ({consultant.email})
                            </option>
                          ))}
                      </select>
                    )}
                  </div>

                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => handleCancelEditFacilitators()}
                      className="px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                      disabled={savingFacilitators}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleSaveFacilitators()}
                      className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      disabled={savingFacilitators || editFacilitators.length === 0}
                    >
                      {savingFacilitators ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-modal-title"
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
          >
            <h2 id="cancel-modal-title" className="text-xl font-bold text-gray-900 mb-4">
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
                onClick={() => setShowCancelModal(false)}
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

      {/* Series Cancel Modal */}
      {showSeriesCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="series-cancel-modal-title"
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
          >
            <h2 id="series-cancel-modal-title" className="text-xl font-bold text-gray-900 mb-4">
              Cancelar Sesiones Futuras de la Serie
            </h2>
            <p className="text-gray-600 mb-4">
              Esto cancelará todas las sesiones futuras de esta serie que aún no estén completadas o canceladas.
              Por favor, ingrese la razón de la cancelación:
            </p>
            <textarea
              value={seriesCancellationReason}
              onChange={(e) => setSeriesCancellationReason(e.target.value)}
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              placeholder="Razón de cancelación..."
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => setShowSeriesCancelModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
                disabled={actionInProgress}
              >
                Cerrar
              </button>
              <button
                onClick={handleSeriesCancelSubmit}
                disabled={actionInProgress || !seriesCancellationReason.trim()}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                Confirmar Cancelación de Serie
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default SessionDetailPage;
