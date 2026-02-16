import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import EditRequestModal from '../../../components/sessions/EditRequestModal';
import AudioReportUploader from '../../../components/sessions/AudioReportUploader';
import AudioPlayer from '../../../components/sessions/AudioPlayer';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { ReportSummary } from '../../../lib/services/audio-transcription';
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
  Upload,
  Trash2,
  Check,
  X,
  Save,
  CheckCircle,
  Edit,
  CalendarPlus,
} from 'lucide-react';
import {
  SessionWithRelations,
  SessionStatus,
  SessionAttendee,
  SessionReport,
  SessionMaterial,
  AttendanceUpdatePayload,
  SessionEditRequest,
} from '../../../lib/types/consultor-sessions.types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getStatusBadge, formatTime, getModalityIcon } from '../../../lib/utils/session-ui-helpers';
import { formatSessionTimeForConsultant } from '../../../lib/utils/session-timezone';

type TabId = 'details' | 'planning' | 'materials' | 'report' | 'communications' | 'activity';

const SessionDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isConsultorOrAdmin, setIsConsultorOrAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [session, setSession] = useState<SessionWithRelations | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [isFacilitator, setIsFacilitator] = useState(false);

  // Attendance state
  const [attendanceData, setAttendanceData] = useState<AttendanceUpdatePayload[]>([]);
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Report state
  const [reportContent, setReportContent] = useState('');
  const [reportVisibility, setReportVisibility] = useState<'facilitators_only' | 'all_participants'>('facilitators_only');
  const [editingReport, setEditingReport] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [existingReport, setExistingReport] = useState<SessionReport | null>(null);
  const [reportTranscript, setReportTranscript] = useState<string | null>(null);
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);

  // Materials state
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Finalize state
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Edit request state
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [submittingEditRequest, setSubmittingEditRequest] = useState(false);

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
      const allowed = !!userRole; // Any authenticated user with a role — API handles access control
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
        (f: { user_id: string }) => f.user_id === authSession.user.id
      );
      setIsFacilitator(isFac);

      // Initialize attendance data
      const attendees = sessionData.attendees || [];
      setAttendanceData(
        attendees.map((a: SessionAttendee) => ({
          user_id: a.user_id,
          attended: a.attended ?? false,
          arrival_status: a.arrival_status || undefined,
          notes: a.notes || undefined,
        }))
      );

      // Check for existing report by current user
      const reports = sessionData.reports || [];
      const userReport = reports.find(
        (r: SessionReport) => r.author_id === authSession.user.id && r.report_type === 'session_report'
      );
      if (userReport) {
        setExistingReport(userReport);
        setReportContent(userReport.content);
        setReportVisibility(userReport.visibility);

        // If report has audio, fetch the signed URL and transcript
        if (userReport.audio_url) {
          fetchReportAudioDetails(sessionData.id, userReport.id);
        }
      }
    } catch (error: unknown) {
      console.error('Error fetching session:', error);
      toast.error(error instanceof Error ? error.message : 'Error al cargar sesión');
    }
  };

  const fetchReportAudioDetails = async (sessionId: string, reportId: string) => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) return;

      const response = await fetch(`/api/sessions/${sessionId}/reports/${reportId}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Error fetching report audio details');
        return;
      }

      const result = await response.json();
      if (result.data?.signedAudioUrl) {
        setSignedAudioUrl(result.data.signedAudioUrl);
      }
      if (result.data?.report?.transcript) {
        setReportTranscript(result.data.report.transcript);
      }
    } catch (error) {
      console.error('Error fetching report audio details:', error);
    }
  };

  const handleAudioReportCreated = (report: SessionReport, transcript: string, summary: ReportSummary) => {
    setExistingReport(report);
    setReportContent(report.content);
    setReportVisibility(report.visibility);
    setReportTranscript(transcript);
    setEditingReport(true); // Allow user to edit AI-generated summary before final save

    // Refresh session to get the new report
    if (session) {
      fetchSession();
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

  const handleAttendanceChange = (userId: string, field: keyof AttendanceUpdatePayload, value: string | boolean | undefined) => {
    setAttendanceData((prev) =>
      prev.map((a) => (a.user_id === userId ? { ...a, [field]: value } : a))
    );
  };

  const handleMarkAllPresent = () => {
    setAttendanceData((prev) =>
      prev.map((a) => ({ ...a, attended: true, arrival_status: 'on_time' }))
    );
  };

  const handleSaveAttendance = async () => {
    if (!session) return;

    setSavingAttendance(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${id}/attendees`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attendees: attendanceData }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al guardar asistencia');
      }

      toast.success('Asistencia guardada correctamente');
      await fetchSession();
    } catch (error: unknown) {
      console.error('Error saving attendance:', error);
      toast.error(error instanceof Error ? error.message : 'Error al guardar asistencia');
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleSaveReport = async () => {
    if (!session || !reportContent.trim()) {
      toast.error('El contenido del informe es requerido');
      return;
    }

    setSavingReport(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const isUpdate = !!existingReport;
      const url = isUpdate
        ? `/api/sessions/${id}/reports/${existingReport!.id}`
        : `/api/sessions/${id}/reports`;
      const method = isUpdate ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: reportContent.trim(),
          visibility: reportVisibility,
          report_type: 'session_report',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al guardar informe');
      }

      toast.success(isUpdate ? 'Informe actualizado correctamente' : 'Informe creado correctamente');
      setEditingReport(false);
      await fetchSession();
    } catch (error: unknown) {
      console.error('Error saving report:', error);
      toast.error(error instanceof Error ? error.message : 'Error al guardar informe');
    } finally {
      setSavingReport(false);
    }
  };

  const handleUploadMaterial = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !session) {
      return;
    }

    const file = event.target.files[0];

    // Validate file size (25 MB)
    if (file.size > 25 * 1024 * 1024) {
      toast.error('El archivo excede el tamaño máximo de 25 MB');
      return;
    }

    setUploadingMaterial(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('visibility', 'all_participants');

      const response = await fetch(`/api/sessions/${id}/materials`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al subir material');
      }

      toast.success('Material subido correctamente');
      await fetchSession();
    } catch (error: unknown) {
      console.error('Error uploading material:', error);
      toast.error(error instanceof Error ? error.message : 'Error al subir material');
    } finally {
      setUploadingMaterial(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteMaterial = async (materialId: string, fileName: string) => {
    if (!confirm(`¿Está seguro que desea eliminar "${fileName}"?`)) {
      return;
    }

    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${id}/materials/${materialId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al eliminar material');
      }

      toast.success('Material eliminado correctamente');
      await fetchSession();
    } catch (error: unknown) {
      console.error('Error deleting material:', error);
      toast.error(error instanceof Error ? error.message : 'Error al eliminar material');
    }
  };

  const handleFinalize = async () => {
    if (!session) return;

    setFinalizing(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${id}/finalize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al finalizar sesión');
      }

      toast.success('Sesión finalizada correctamente');
      setShowFinalizeModal(false);
      await fetchSession();
    } catch (error: unknown) {
      console.error('Error finalizing session:', error);
      toast.error(error instanceof Error ? error.message : 'Error al finalizar sesión');
    } finally {
      setFinalizing(false);
    }
  };

  const canFinalizeSession = (): { can: boolean; reasons: string[] } => {
    if (!session) return { can: false, reasons: ['Sesión no cargada'] };

    const reasons: string[] = [];

    if (session.status !== 'pendiente_informe') {
      reasons.push('La sesión debe estar en estado "Pendiente de Informe"');
    }

    const sessionReports = (session.reports || []).filter(
      (r) => r.report_type === 'session_report'
    );
    if (sessionReports.length === 0) {
      reasons.push('Falta informe de sesión');
    }

    const attendees = session.attendees || [];
    const unmarkedCount = attendees.filter((a) => a.attended === null).length;
    if (unmarkedCount > 0) {
      reasons.push(`Hay ${unmarkedCount} asistente(s) sin marcar`);
    }

    return { can: reasons.length === 0, reasons };
  };

  const handleSubmitEditRequest = async (
    changes: Record<string, { old: unknown; new: unknown }>,
    reason: string
  ) => {
    if (!session) return;

    setSubmittingEditRequest(true);
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const response = await fetch(`/api/sessions/${id}/edit-requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ changes, reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al crear solicitud de cambio');
      }

      toast.success('Solicitud de cambio enviada correctamente');
      setShowEditRequestModal(false);
      await fetchSession();
    } catch (error: unknown) {
      console.error('Error submitting edit request:', error);
      toast.error(error instanceof Error ? error.message : 'Error al crear solicitud de cambio');
    } finally {
      setSubmittingEditRequest(false);
    }
  };

  const hasPendingEditRequest = (): boolean => {
    if (!session?.edit_requests || !user) return false;
    return session.edit_requests.some(
      (req) => req.status === 'pending' && req.requested_by === user.id
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderTabContent = () => {
    if (!session) return null;

    const isReadOnly = session.status === 'completada' || session.status === 'cancelada';

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

            {/* Attendance Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">
                  Asistencia ({session.attendees.length})
                </h3>
                {!isReadOnly && isFacilitator && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={handleMarkAllPresent}
                      className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                    >
                      Marcar todos presentes
                    </button>
                    <button
                      onClick={handleSaveAttendance}
                      disabled={savingAttendance}
                      className="px-4 py-1 text-sm bg-brand_accent hover:bg-brand_accent_hover text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Save className="w-4 h-4" />
                      {savingAttendance ? 'Guardando...' : 'Guardar asistencia'}
                    </button>
                  </div>
                )}
              </div>

              {/* Summary stats */}
              <div className="mb-4 flex gap-4 text-sm">
                <span className="text-green-700">
                  <CheckCircle className="w-4 h-4 inline mr-1" />
                  Presentes: {session.attendees.filter((a) => a.attended === true).length}
                </span>
                <span className="text-red-700">
                  <X className="w-4 h-4 inline mr-1" />
                  Ausentes: {session.attendees.filter((a) => a.attended === false).length}
                </span>
                <span className="text-gray-700">
                  Sin marcar: {session.attendees.filter((a) => a.attended === null).length}
                </span>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Nombre</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Esperado</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Asistió</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Estado de llegada</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {session.attendees.map((attendee, index) => {
                      const attData = attendanceData.find((a) => a.user_id === attendee.user_id);
                      const profile = (attendee as SessionAttendee & { profiles?: { first_name: string; last_name: string; email: string } }).profiles;
                      const fullName = profile
                        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                        : 'Usuario desconocido';

                      return (
                        <tr
                          key={attendee.id}
                          className={
                            attendee.attended === null
                              ? 'bg-yellow-50'
                              : ''
                          }
                        >
                          <td className="px-4 py-2 text-sm text-gray-900">{fullName}</td>
                          <td className="px-4 py-2 text-center">
                            {attendee.expected ? (
                              <Check className="w-4 h-4 text-green-600 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-gray-400 mx-auto" />
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {isReadOnly || !isFacilitator ? (
                              attendee.attended === true ? (
                                <Check className="w-4 h-4 text-green-600 mx-auto" />
                              ) : attendee.attended === false ? (
                                <X className="w-4 h-4 text-red-600 mx-auto" />
                              ) : (
                                <span className="text-gray-400">—</span>
                              )
                            ) : (
                              <input
                                type="checkbox"
                                checked={attData?.attended || false}
                                onChange={(e) =>
                                  handleAttendanceChange(attendee.user_id, 'attended', e.target.checked)
                                }
                                className="w-4 h-4"
                              />
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isReadOnly || !isFacilitator ? (
                              <span className="text-sm text-gray-600 capitalize">
                                {attendee.arrival_status?.replace(/_/g, ' ') || '—'}
                              </span>
                            ) : (
                              <select
                                value={attData?.arrival_status || ''}
                                onChange={(e) =>
                                  handleAttendanceChange(
                                    attendee.user_id,
                                    'arrival_status',
                                    e.target.value || undefined
                                  )
                                }
                                className="text-sm border border-gray-300 rounded px-2 py-1"
                              >
                                <option value="">—</option>
                                <option value="on_time">A tiempo</option>
                                <option value="late">Tarde</option>
                                <option value="left_early">Salió temprano</option>
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isReadOnly || !isFacilitator ? (
                              <span className="text-sm text-gray-600">{attendee.notes || '—'}</span>
                            ) : (
                              <input
                                type="text"
                                value={attData?.notes || ''}
                                onChange={(e) =>
                                  handleAttendanceChange(attendee.user_id, 'notes', e.target.value || undefined)
                                }
                                placeholder="Notas opcionales"
                                className="text-sm border border-gray-300 rounded px-2 py-1 w-full"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <ul className="md:hidden space-y-3" role="list" aria-label="Lista de asistencia">
                {session.attendees.map((attendee) => {
                  const attData = attendanceData.find((a) => a.user_id === attendee.user_id);
                  const profile = (attendee as SessionAttendee & { profiles?: { first_name: string; last_name: string; email: string } }).profiles;
                  const fullName = profile
                    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                    : 'Usuario desconocido';

                  return (
                    <li
                      key={attendee.id}
                      className={`p-4 border rounded-lg ${attendee.attended === null ? 'bg-yellow-50 border-yellow-200' : 'border-gray-200'}`}
                    >
                      {/* Name + Expected Badge */}
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">{fullName}</h4>
                        {attendee.expected ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Esperado</span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">No esperado</span>
                        )}
                      </div>

                      {/* Attended Checkbox */}
                      <div className="flex items-center gap-2 mb-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 min-h-[44px]">
                          {isReadOnly || !isFacilitator ? (
                            attendee.attended === true ? (
                              <Check className="w-5 h-5 text-green-600" />
                            ) : attendee.attended === false ? (
                              <X className="w-5 h-5 text-red-600" />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )
                          ) : (
                            <input
                              type="checkbox"
                              checked={attData?.attended || false}
                              onChange={(e) =>
                                handleAttendanceChange(attendee.user_id, 'attended', e.target.checked)
                              }
                              className="w-5 h-5"
                            />
                          )}
                          <span>Asistió</span>
                        </label>
                      </div>

                      {/* Arrival Status Dropdown */}
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Estado de llegada</label>
                        {isReadOnly || !isFacilitator ? (
                          <span className="text-sm text-gray-600 capitalize">
                            {attendee.arrival_status?.replace(/_/g, ' ') || '—'}
                          </span>
                        ) : (
                          <select
                            value={attData?.arrival_status || ''}
                            onChange={(e) =>
                              handleAttendanceChange(
                                attendee.user_id,
                                'arrival_status',
                                e.target.value || undefined
                              )
                            }
                            className="w-full text-sm border border-gray-300 rounded px-3 py-2 min-h-[44px]"
                          >
                            <option value="">—</option>
                            <option value="on_time">A tiempo</option>
                            <option value="late">Tarde</option>
                            <option value="left_early">Salió temprano</option>
                          </select>
                        )}
                      </div>

                      {/* Notes Input */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                        {isReadOnly || !isFacilitator ? (
                          <span className="text-sm text-gray-600">{attendee.notes || '—'}</span>
                        ) : (
                          <input
                            type="text"
                            value={attData?.notes || ''}
                            onChange={(e) =>
                              handleAttendanceChange(attendee.user_id, 'notes', e.target.value || undefined)
                            }
                            placeholder="Notas opcionales"
                            className="w-full text-sm border border-gray-300 rounded px-3 py-2 min-h-[44px]"
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
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
        const materials = session.materials || [];
        return (
          <div className="space-y-4">
            {!isReadOnly && isFacilitator && (
              <div className="flex justify-end">
                <label className="px-4 py-2 bg-brand_accent hover:bg-brand_accent_hover text-white rounded cursor-pointer flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  {uploadingMaterial ? 'Subiendo...' : 'Subir material'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleUploadMaterial}
                    disabled={uploadingMaterial}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {materials.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Paperclip className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No hay materiales subidos</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Archivo</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Tipo</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Tamaño</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Subido por</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Fecha</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {materials.map((material: SessionMaterial & { profiles?: { first_name: string; last_name: string; email: string }; download_url?: string }) => {
                      const profile = material.profiles;
                      const uploaderName = profile
                        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                        : 'Usuario desconocido';

                      return (
                        <tr key={material.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{material.file_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{material.file_type}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{formatFileSize(material.file_size)}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">{uploaderName}</td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {format(parseISO(material.created_at), 'dd MMM yyyy', { locale: es })}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {material.download_url && (
                                <a
                                  href={material.download_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand_accent hover:text-brand_accent_hover"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              {!isReadOnly &&
                                (material.uploaded_by === user?.id || isFacilitator) && (
                                  <button
                                    onClick={() => handleDeleteMaterial(material.id, material.file_name)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case 'report':
        if (!isFacilitator && !existingReport) {
          return (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>Solo los facilitadores pueden crear informes</p>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {/* Audio uploader - show when no existing report and not read-only */}
            {!isReadOnly && isFacilitator && !existingReport && !editingReport && session && (
              <AudioReportUploader
                sessionId={session.id}
                onReportCreated={handleAudioReportCreated}
                disabled={session.status === 'completada' || session.status === 'cancelada'}
              />
            )}

            {!isReadOnly && isFacilitator && !existingReport && !editingReport && (
              <button
                onClick={() => setEditingReport(true)}
                className="px-4 py-2 bg-brand_accent hover:bg-brand_accent_hover text-white rounded"
              >
                Crear Informe
              </button>
            )}

            {!isReadOnly && isFacilitator && existingReport && !editingReport && (
              <button
                onClick={() => setEditingReport(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
              >
                Editar Informe
              </button>
            )}

            {editingReport && isFacilitator && !isReadOnly ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contenido del informe</label>
                  <textarea
                    value={reportContent}
                    onChange={(e) => setReportContent(e.target.value)}
                    rows={10}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    placeholder="Escriba el informe de la sesión..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Visibilidad</label>
                  <select
                    value={reportVisibility}
                    onChange={(e) => setReportVisibility(e.target.value as 'facilitators_only' | 'all_participants')}
                    className="border border-gray-300 rounded px-3 py-2"
                  >
                    <option value="facilitators_only">Solo facilitadores</option>
                    <option value="all_participants">Todos los participantes</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveReport}
                    disabled={savingReport || !reportContent.trim()}
                    className="px-4 py-2 bg-brand_accent hover:bg-brand_accent_hover text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingReport ? 'Guardando...' : existingReport ? 'Actualizar' : 'Crear'}
                  </button>
                  {editingReport && (
                    <button
                      onClick={() => {
                        setEditingReport(false);
                        if (existingReport) {
                          setReportContent(existingReport.content);
                          setReportVisibility(existingReport.visibility);
                        }
                      }}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ) : existingReport ? (
              <div className="space-y-4">
                {/* Audio player - show if report has audio */}
                {signedAudioUrl && (
                  <AudioPlayer
                    audioUrl={signedAudioUrl}
                    transcript={reportTranscript || undefined}
                  />
                )}

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {format(parseISO(existingReport.created_at), 'dd MMM yyyy HH:mm', { locale: es })}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          existingReport.visibility === 'all_participants'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {existingReport.visibility === 'all_participants'
                          ? 'Todos los participantes'
                          : 'Solo facilitadores'}
                      </span>
                    </div>
                  </div>
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                    {existingReport.content}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No hay informe creado</p>
              </div>
            )}
          </div>
        );

      case 'communications':
        return (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>Comunicaciones disponibles próximamente</p>
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

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'details', label: 'Detalles', icon: ClipboardList },
    ...(isFacilitator ? [{ id: 'planning' as TabId, label: 'Planificación', icon: PenLine }] : []),
    { id: 'materials', label: 'Materiales', icon: Paperclip },
    { id: 'report', label: 'Informe', icon: FileText },
    { id: 'communications', label: 'Comunicaciones', icon: MessageSquare },
    { id: 'activity', label: 'Actividad', icon: Activity },
  ];

  const finalizeCheck = canFinalizeSession();

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

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {/* Add to Calendar Button - for exportable statuses */}
              {(['programada', 'en_progreso', 'pendiente_informe'] as string[]).includes(session.status) && (
                <a
                  href={`/api/sessions/${session.id}/ical`}
                  download
                  className="px-4 py-2 rounded flex items-center gap-2 text-brand_accent border border-brand_accent hover:bg-brand_accent_light transition-colors"
                >
                  <CalendarPlus className="w-5 h-5" />
                  Agregar al Calendario
                </a>
              )}

              {/* Edit Request Button */}
              {isFacilitator && (session.status !== 'completada' && session.status !== 'cancelada') && (
                <div className="relative group">
                  <button
                    onClick={() => setShowEditRequestModal(true)}
                    disabled={hasPendingEditRequest()}
                    className={`px-4 py-2 rounded flex items-center gap-2 ${
                      hasPendingEditRequest()
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-brand_accent hover:bg-brand_accent_hover text-white'
                    }`}
                  >
                    <Edit className="w-5 h-5" />
                    Solicitar Cambios
                  </button>
                  {hasPendingEditRequest() && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      Ya existe una solicitud de cambio pendiente para esta sesión.
                    </div>
                  )}
                </div>
              )}

              {/* Finalize Button */}
              {isFacilitator && session.status === 'pendiente_informe' && (
                <div className="relative group">
                  <button
                    onClick={() => setShowFinalizeModal(true)}
                    disabled={!finalizeCheck.can}
                    className={`px-4 py-2 rounded flex items-center gap-2 ${
                      finalizeCheck.can
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <CheckCircle className="w-5 h-5" />
                    Finalizar Sesión
                  </button>
                  {!finalizeCheck.can && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="font-semibold mb-1">Condiciones faltantes:</div>
                      <ul className="list-disc list-inside">
                        {finalizeCheck.reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-2 text-gray-700">
              <Calendar className="w-5 h-5" />
              <span>{format(parseISO(session.session_date), 'EEEE, dd MMMM yyyy', { locale: es })}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Clock className="w-5 h-5" />
              <div className="flex flex-col gap-1">
                <span>
                  {formatTime(session.start_time)} - {formatTime(session.end_time)}
                  <span className="text-xs text-gray-500 ml-1">(hora Chile)</span>
                </span>
                <span className="text-xs text-gray-500">
                  {formatSessionTimeForConsultant(session.session_date, session.start_time)} - {formatSessionTimeForConsultant(session.session_date, session.end_time)}
                </span>
              </div>
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
            <div className="flex items-center gap-2 text-gray-700 md:col-span-2">
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

        {/* Edit Request History */}
        {session.edit_requests && session.edit_requests.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Historial de Solicitudes de Cambio</h3>
            <div className="space-y-3">
              {session.edit_requests.map((request: SessionEditRequest) => {
                const statusBadge =
                  request.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : request.status === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800';
                const statusLabel =
                  request.status === 'pending'
                    ? 'Pendiente'
                    : request.status === 'approved'
                    ? 'Aprobada'
                    : 'Rechazada';

                return (
                  <div key={request.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge}`}>
                          {statusLabel}
                        </span>
                        <span className="text-sm text-gray-500">
                          {format(parseISO(request.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm space-y-1">
                      {Object.keys(request.changes).map((field) => {
                        const change = request.changes[field];
                        const fieldLabel =
                          field === 'session_date'
                            ? 'Fecha'
                            : field === 'start_time'
                            ? 'Hora inicio'
                            : field === 'end_time'
                            ? 'Hora término'
                            : field === 'modality'
                            ? 'Modalidad'
                            : field;
                        return (
                          <div key={field} className="text-gray-700">
                            <span className="font-medium">{fieldLabel}:</span>{' '}
                            <span className="line-through text-red-600">{String(change.old)}</span> →{' '}
                            <span className="text-green-600">{String(change.new)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {request.reason && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">Razón:</span> {request.reason}
                      </div>
                    )}
                    {request.review_notes && request.status !== 'pending' && (
                      <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        <span className="font-medium">Nota del revisor:</span> {request.review_notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="border-b border-gray-200">
            <div className="flex overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 sm:px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 whitespace-nowrap ${
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

        {/* Finalize Modal */}
        {showFinalizeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Finalizar Sesión</h3>
              <p className="text-gray-700 mb-6">
                ¿Está seguro que desea finalizar esta sesión? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowFinalizeModal(false)}
                  disabled={finalizing}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {finalizing ? 'Finalizando...' : 'Finalizar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Request Modal */}
        {showEditRequestModal && session && (
          <EditRequestModal
            session={session}
            onClose={() => setShowEditRequestModal(false)}
            onSubmit={handleSubmitEditRequest}
            submitting={submittingEditRequest}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default SessionDetailPage;
