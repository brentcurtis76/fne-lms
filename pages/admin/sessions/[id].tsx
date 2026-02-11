import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { Calendar, CheckCircle, XCircle } from 'lucide-react';
import { SessionWithRelations, SessionStatus } from '../../../lib/types/consultor-sessions.types';

const SessionDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [session, setSession] = useState<SessionWithRelations | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);

  useEffect(() => {
    initializeAuth();
  }, [router]);

  useEffect(() => {
    if (user && isAdmin && id) {
      fetchSession();
    }
  }, [user, isAdmin, id]);

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
    } catch (error: any) {
      console.error('Error fetching session:', error);
      toast.error(error.message || 'Error al cargar sesión');
    }
  };

  const handleApprove = async () => {
    if (!session) return;

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
    } catch (error: any) {
      console.error('Error approving session:', error);
      toast.error(error.message || 'Error al aprobar sesión');
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
    const badges: Record<
      SessionStatus,
      { label: string; className: string }
    > = {
      borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-800' },
      pendiente_aprobacion: { label: 'Pendiente Aprobación', className: 'bg-yellow-100 text-yellow-800' },
      programada: { label: 'Programada', className: 'bg-blue-100 text-blue-800' },
      en_progreso: { label: 'En Progreso', className: 'bg-amber-100 text-amber-800' },
      pendiente_informe: { label: 'Pendiente Informe', className: 'bg-orange-100 text-orange-800' },
      completada: { label: 'Completada', className: 'bg-green-100 text-green-800' },
      cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
    };

    const badge = badges[status] || badges.borrador;
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
          {/* Status and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-6 border-b space-y-3 sm:space-y-0">
            <div>{getStatusBadge(session.status)}</div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
              {(session.status === 'borrador' || session.status === 'pendiente_aprobacion') && (
                <button
                  onClick={handleApprove}
                  disabled={actionInProgress}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={20} className="mr-2" />
                  Aprobar
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
                {formatTime(session.start_time)} - {formatTime(session.end_time)} ({session.scheduled_duration_minutes} min)
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
                  className="text-blue-600 hover:underline"
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

          {/* Facilitators */}
          {session.facilitators.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Facilitadores</h3>
              <div className="space-y-2">
                {session.facilitators.map((facilitator: any) => {
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
                          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            Principal
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500 capitalize">
                        {facilitator.facilitator_role.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
    </MainLayout>
  );
};

export default SessionDetailPage;
