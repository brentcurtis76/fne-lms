import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import {
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Users,
  ClipboardList,
  PenLine,
  Paperclip,
  FileText,
  MessageSquare,
  Activity,
  Link2,
  AlertCircle,
} from 'lucide-react';
import { SessionWithRelations, SessionStatus } from '../../../lib/types/consultor-sessions.types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getStatusBadge, formatTime, getModalityIcon } from '../../../lib/utils/session-ui-helpers';

type TabId = 'details' | 'planning' | 'materials' | 'report' | 'communications' | 'activity';

const SessionDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isConsultorOrAdmin, setIsConsultorOrAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [session, setSession] = useState<SessionWithRelations | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [isFacilitator, setIsFacilitator] = useState(false);

  useEffect(() => {
    if (router.isReady) {
      initializeAuth();
    }
  }, [router.isReady]);

  useEffect(() => {
    if (user && isConsultorOrAdmin && id) {
      fetchSession();
    }
  }, [user, isConsultorOrAdmin, id]);

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

  const fetchSession = async () => {
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${id}?include=activity_log`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar sesión');
      }

      const result = await response.json();
      const sessionData = result.data?.session;
      if (!sessionData) {
        toast.error('Sesión no encontrada');
        return;
      }
      setSession(sessionData);

      // Check if current user is a facilitator
      const isFac = sessionData.facilitators.some(
        (f: any) => f.user_id === authSession.user.id
      );
      setIsFacilitator(isFac);
    } catch (error: any) {
      console.error('Error fetching session:', error);
      toast.error(error.message || 'Error al cargar sesión');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getStatusHelperText = (status: SessionStatus): string => {
    const texts: Record<SessionStatus, string> = {
      borrador: 'Esta sesión está en borrador. El administrador debe aprobarla.',
      pendiente_aprobacion: 'Esta sesión está pendiente de aprobación por el administrador.',
      programada: session
        ? `Sesión programada para ${format(parseISO(session.session_date), 'dd MMMM yyyy', { locale: es })}.`
        : 'Sesión programada.',
      en_progreso: 'Sesión en curso.',
      pendiente_informe: 'Sesión finalizada. Debe completar el informe y la asistencia.',
      completada: 'Sesión completada.',
      cancelada: session?.cancellation_reason
        ? `Esta sesión fue cancelada. Razón: ${session.cancellation_reason}`
        : 'Esta sesión fue cancelada.',
    };

    return texts[status] || '';
  };

  const renderTabContent = () => {
    if (!session) return null;

    switch (activeTab) {
      case 'details':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Descripción</h3>
              <div className="prose prose-sm max-w-none text-gray-700">
                {session.description || 'Sin descripción'}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Objetivos</h3>
              <div className="prose prose-sm max-w-none text-gray-700">
                {session.objectives || 'Sin objetivos definidos'}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Facilitadores</h3>
              <div className="space-y-2">
                {session.facilitators.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">
                      {f.profiles?.first_name} {f.profiles?.last_name}
                    </span>
                    {f.is_lead && (
                      <span className="px-2 py-0.5 bg-brand_accent_light text-brand_primary text-xs rounded font-medium">
                        Líder
                      </span>
                    )}
                    <span className="text-gray-500 capitalize">
                      ({f.facilitator_role.replace(/_/g, ' ')})
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Asistentes ({session.attendees.length})
              </h3>
              <div className="text-sm text-gray-600">
                Vista previa de asistencia — no editable en esta versión.
              </div>
            </div>
          </div>
        );

      case 'planning':
        if (!isFacilitator) return null;
        return (
          <div className="text-center py-12 text-gray-500">
            <PenLine className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>Notas de planificación disponibles próximamente</p>
          </div>
        );

      case 'materials':
        return (
          <div className="text-center py-12 text-gray-500">
            <Paperclip className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>Carga de materiales disponible próximamente</p>
          </div>
        );

      case 'report':
        return (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>Informe de sesión disponible próximamente</p>
          </div>
        );

      case 'communications':
        return (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>Comunicaciones disponible próximamente</p>
          </div>
        );

      case 'activity':
        return (
          <div className="space-y-4">
            {session.activity_log && session.activity_log.length > 0 ? (
              session.activity_log.map((log) => (
                <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-gray-200">
                  <Activity className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {log.profiles?.first_name} {log.profiles?.last_name}
                    </div>
                    <div className="text-sm text-gray-600 capitalize">
                      {log.action.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {format(parseISO(log.created_at), 'dd MMM yyyy HH:mm', { locale: es })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-gray-500">
                No hay actividad registrada
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
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

  if (!session) {
    return (
      <MainLayout user={user} onLogout={handleLogout}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Sesión no encontrada</div>
        </div>
      </MainLayout>
    );
  }

  const badge = getStatusBadge(session.status);
  const helperText = getStatusHelperText(session.status);

  const tabs: { id: TabId; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'details', label: 'Detalles', icon: ClipboardList },
    ...(isFacilitator ? [{ id: 'planning' as TabId, label: 'Planificación', icon: PenLine }] : []),
    { id: 'materials', label: 'Materiales', icon: Paperclip },
    { id: 'report', label: 'Informe', icon: FileText },
    { id: 'communications', label: 'Comunicaciones', icon: MessageSquare },
    { id: 'activity', label: 'Actividad', icon: Activity },
  ];

  return (
    <MainLayout user={user} onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isFacilitator && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              Está viendo esta sesión en modo lectura. No está asignado como facilitador.
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{session.title}</h1>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.className}`}>
                  {badge.label}
                </span>
                {session.recurrence_group_id && session.session_number && (
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Link2 className="w-4 h-4" />
                    <span>Sesión {session.session_number}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-2 text-gray-700">
              <Calendar className="w-5 h-5" />
              <span>{format(parseISO(session.session_date), 'EEEE, dd MMMM yyyy', { locale: es })}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Clock className="w-5 h-5" />
              <span>
                {formatTime(session.start_time)} - {formatTime(session.end_time)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              {getModalityIcon(session.modality, 'w-5 h-5')}
              <span className="capitalize">{session.modality}</span>
              {session.meeting_link && (
                <a
                  href={session.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-brand_accent hover:text-brand_accent_hover flex items-center gap-1"
                >
                  <ExternalLink className="w-4 h-4" />
                  Enlace
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              {session.schools && <><MapPin className="w-5 h-5" /> <span>{session.schools.name}</span></>}
            </div>
            <div className="flex items-center gap-2 text-gray-700 col-span-2">
              {session.growth_communities && <><Users className="w-5 h-5" /> <span>{session.growth_communities.name}</span></>}
            </div>
          </div>

          {/* Status helper text */}
          {helperText && (
            <div
              className={`mt-4 p-3 rounded-lg ${
                session.status === 'pendiente_informe'
                  ? 'bg-orange-50 border border-orange-200 text-orange-800'
                  : 'bg-gray-50 border border-gray-200 text-gray-800'
              }`}
            >
              {helperText}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="border-b border-gray-200">
            <div className="flex overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 whitespace-nowrap ${
                      activeTab === tab.id
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
          <div className="p-6">{renderTabContent()}</div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SessionDetailPage;
