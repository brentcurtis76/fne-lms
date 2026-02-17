import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface EditRequestWithDetails {
  id: string;
  session_id: string;
  requested_by: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  consultor_sessions: {
    title: string;
    session_date: string;
  } | null;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const SessionApprovalsPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [editRequests, setEditRequests] = useState<EditRequestWithDetails[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchEditRequests();
    }
  }, [user, isAdmin, statusFilter]);

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

  const fetchEditRequests = async () => {
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/edit-requests?status=${statusFilter}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar solicitudes de cambio');
      }

      const result = await response.json();
      setEditRequests(result.data?.edit_requests || []);
    } catch (error: unknown) {
      console.error('Error fetching edit requests:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al cargar solicitudes de cambio';
      toast.error(errorMessage);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleApprove = async (requestId: string) => {
    if (actionInProgress) return;

    setActionInProgress(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/edit-requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
          review_notes: reviewNotes[requestId] || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al aprobar solicitud');
      }

      toast.success('Solicitud aprobada correctamente');
      setReviewNotes((prev) => {
        const updated = { ...prev };
        delete updated[requestId];
        return updated;
      });
      await fetchEditRequests();
    } catch (error: unknown) {
      console.error('Error approving request:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al aprobar solicitud';
      toast.error(errorMessage);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReject = async (requestId: string) => {
    if (actionInProgress) return;

    const notes = reviewNotes[requestId];
    if (!notes || !notes.trim()) {
      toast.error('Por favor ingrese una razón para el rechazo');
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

      const response = await fetch(`/api/sessions/edit-requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reject',
          review_notes: notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al rechazar solicitud');
      }

      toast.success('Solicitud rechazada correctamente');
      setReviewNotes((prev) => {
        const updated = { ...prev };
        delete updated[requestId];
        return updated;
      });
      await fetchEditRequests();
    } catch (error: unknown) {
      console.error('Error rejecting request:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al rechazar solicitud';
      toast.error(errorMessage);
    } finally {
      setActionInProgress(false);
    }
  };

  const formatFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      session_date: 'Fecha',
      start_time: 'Hora de inicio',
      end_time: 'Hora de término',
      modality: 'Modalidad',
      growth_community_id: 'Comunidad de crecimiento',
      school_id: 'Escuela',
      status: 'Estado',
    };
    return labels[field] || field;
  };

  /**
   * Normalize `changes` to a plain object with { old, new } entries.
   * Handles double-encoded JSON strings and guards invalid shapes.
   */
  const normalizeChangesPayload = (
    raw: unknown
  ): Record<string, { old: unknown; new: unknown }> => {
    let parsed = raw;

    // Unwrap up to 2 levels of string encoding
    for (let i = 0; i < 2 && typeof parsed === 'string'; i++) {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return {};
      }
    }

    // Must be a non-null object (not array)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    // Validate each key has { old, new } shape
    const result: Record<string, { old: unknown; new: unknown }> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'old' in value &&
        'new' in value
      ) {
        result[key] = value as { old: unknown; new: unknown };
      }
    }

    return result;
  };

  const formatValue = (field: string, value: unknown): string => {
    if (value === null || value === undefined) return 'No definido';

    if (field === 'session_date') {
      try {
        return format(parseISO(value as string), 'dd MMMM yyyy', { locale: es });
      } catch {
        return value as string;
      }
    }

    if (field === 'modality') {
      const modalityLabels: Record<string, string> = {
        presencial: 'Presencial',
        online: 'En línea',
        hibrida: 'Híbrida',
      };
      return modalityLabels[value as string] || (value as string);
    }

    return value as string;
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
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Aprobaciones de Sesiones</h1>
          <p className="text-gray-600 mt-2">
            Revise y apruebe o rechace solicitudes de cambio de sesiones de consultores
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            {[
              { id: 'pending', label: 'Pendientes', icon: Clock },
              { id: 'approved', label: 'Aprobadas', icon: CheckCircle },
              { id: 'rejected', label: 'Rechazadas', icon: XCircle },
              { id: 'all', label: 'Todas', icon: Calendar },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as StatusFilter)}
                  className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 ${
                    statusFilter === tab.id
                      ? 'border-brand_accent text-brand_accent'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Edit Requests List */}
        {editRequests.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">
              {statusFilter === 'pending'
                ? 'No hay solicitudes pendientes'
                : statusFilter === 'approved'
                ? 'No hay solicitudes aprobadas'
                : statusFilter === 'rejected'
                ? 'No hay solicitudes rechazadas'
                : 'No hay solicitudes de cambio'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {editRequests.map((request) => (
              <div key={request.id} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {request.consultor_sessions?.title || 'Sesión sin título'}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                      <span>
                        Fecha de sesión:{' '}
                        {request.consultor_sessions?.session_date
                          ? format(parseISO(request.consultor_sessions.session_date), 'dd MMM yyyy', {
                              locale: es,
                            })
                          : 'N/A'}
                      </span>
                      <span>•</span>
                      <span>
                        Solicitado por:{' '}
                        {request.profiles
                          ? `${request.profiles.first_name} ${request.profiles.last_name}`
                          : 'Usuario desconocido'}
                      </span>
                      <span>•</span>
                      <span>{format(parseISO(request.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}</span>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      request.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : request.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {request.status === 'pending'
                      ? 'Pendiente'
                      : request.status === 'approved'
                      ? 'Aprobada'
                      : 'Rechazada'}
                  </span>
                </div>

                {/* Changes */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Cambios propuestos:</h4>
                  <div className="space-y-2">
                    {(() => {
                      const parsedChanges = normalizeChangesPayload(request.changes);

                      if (Object.keys(parsedChanges).length === 0) {
                        return <p className="text-sm text-amber-700">Formato de cambios inválido</p>;
                      }

                      return Object.keys(parsedChanges).map((field) => {
                        const change = parsedChanges[field];
                        return (
                          <div key={field} className="text-sm">
                            <div className="font-medium text-gray-700">{formatFieldLabel(field)}:</div>
                            <div className="flex items-center gap-2 ml-4">
                              <span className="line-through text-red-600">{formatValue(field, change.old)}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-green-600 font-medium">{formatValue(field, change.new)}</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Reason */}
                {request.reason && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">Razón:</h4>
                    <p className="text-sm text-gray-700">{request.reason}</p>
                  </div>
                )}

                {/* Review Notes Input (only for pending) */}
                {request.status === 'pending' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notas (opcional para aprobar, requerido para rechazar)
                    </label>
                    <textarea
                      value={reviewNotes[request.id] || ''}
                      onChange={(e) =>
                        setReviewNotes((prev) => ({ ...prev, [request.id]: e.target.value }))
                      }
                      rows={2}
                      placeholder="Ingrese notas para el consultor..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent resize-none"
                    />
                  </div>
                )}

                {/* Actions (only for pending) */}
                {request.status === 'pending' && (
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => handleReject(request.id)}
                      disabled={actionInProgress}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleApprove(request.id)}
                      disabled={actionInProgress}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Aprobar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default SessionApprovalsPage;
