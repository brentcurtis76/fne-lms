import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { getUserPrimaryRole } from '../utils/roleUtils';
import { ReportSummary } from '../lib/services/audio-transcription';
import {
  SessionWithRelations,
  SessionStatus,
  SessionAttendee,
  SessionReport,
  AttendanceUpdatePayload,
} from '../lib/types/consultor-sessions.types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TabId } from '../components/sessions/SessionDetail.types';

/**
 * Everything the consultor's session page knows and decides: its state, the access check and its
 * redirects, the session and audio calls, every write (attendance, report, materials, finalize,
 * edit request) with its toasts, sign-out, and the decisions its markup makes.
 * Moved out of `pages/consultor/sessions/[id].tsx` unchanged (redesign 6S, release SA): the same
 * hooks in the same order, the same effect with the same dependency list.
 */
export function useSessionDetail() {
  const router = useRouter();
  const { id } = router.query;
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConsultorOrAdmin, setIsConsultorOrAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<'forbidden' | 'not_found' | null>(null);

  // Data state
  const [session, setSession] = useState<SessionWithRelations | null>(null);
  const [sessionUpdatedAt, setSessionUpdatedAt] = useState<string | null>(null);
  const [conflictVisible, setConflictVisible] = useState(false);
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
    if (!router.isReady || !id) return;

    let cancelled = false;

    const loadSessionPage = async () => {
      try {
        // Step 1: verify session and load user/role
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();

        if (!authSession?.user || !authSession.access_token) {
          router.push('/login');
          return;
        }

        if (cancelled) return;
        setUser(authSession.user);

        const role = await getUserPrimaryRole(authSession.user.id);
        if (cancelled) return;
        setUserRole(role);
        const allowed = role === 'consultor' || role === 'admin' || role === 'lider_comunidad';
        setIsConsultorOrAdmin(allowed);

        if (!allowed) {
          router.push('/dashboard');
          return;
        }

        // Step 2: fetch session with the verified fresh token
        await fetchSessionData(authSession.access_token, authSession.user.id, cancelled);
      } catch (error) {
        console.error('Auth/fetch initialization error:', error);
        if (!cancelled) router.push('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSessionPage();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, id]);

  const fetchSessionData = async (
    accessToken: string,
    authUserId: string,
    cancelled: boolean
  ) => {
    const response = await fetch(`/api/sessions/${id}?include=activity_log`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (cancelled) return;

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (response.status === 403) {
      setFetchError('forbidden');
      return;
    }

    if (response.status === 404) {
      setFetchError('not_found');
      return;
    }

    if (!response.ok) {
      throw new Error('Error al cargar sesión');
    }

    const result = await response.json();
    const sessionData = result.data?.session;
    if (!sessionData) {
      setFetchError('not_found');
      return;
    }
    setFetchError(null);
    setSession(sessionData);
    setSessionUpdatedAt(sessionData.updated_at ?? null);
    setConflictVisible(false);

    // Check if current user is a facilitator
    const isFac = sessionData.facilitators.some(
      (f: { user_id: string }) => f.user_id === authUserId
    );
    setIsFacilitator(isFac);

    // Initialize attendance data
    const attendees = sessionData.attendees || [];
    setAttendanceData(
      attendees.map((a: SessionAttendee) => ({
        user_id: a.user_id,
        attended: a.attended ?? false,
        arrival_status: a.arrival_status ?? null,
        notes: a.notes ?? null,
      }))
    );

    // Check for existing report by current user
    const reports = sessionData.reports || [];
    const userReport = reports.find(
      (r: SessionReport) => r.author_id === authUserId && r.report_type === 'session_report'
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
  };

  const fetchSession = async () => {
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        router.push('/login');
        return;
      }

      await fetchSessionData(authSession.access_token, authSession.user.id, false);
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

  const handleAttendanceChange = (userId: string, field: keyof AttendanceUpdatePayload, value: string | boolean | null) => {
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
        body: JSON.stringify({ attendees: attendanceData, if_updated_at: sessionUpdatedAt }),
      });

      if (response.status === 409) {
        setConflictVisible(true);
        toast.error('Otra persona editó esta sesión. Recarga para ver los últimos cambios.');
        return;
      }

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
          if_updated_at: sessionUpdatedAt,
        }),
      });

      if (response.status === 409) {
        setConflictVisible(true);
        toast.error('Otra persona editó esta sesión. Recarga para ver los últimos cambios.');
        return;
      }

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

  // Admins can edit even if not facilitator; lider_comunidad is always read-only
  const canEdit = isFacilitator || userRole === 'admin';

  return {
    user,
    userRole,
    loading,
    fetchError,
    session,
    conflictVisible,
    activeTab,
    setActiveTab,
    isFacilitator,
    attendanceData,
    savingAttendance,
    reportContent,
    setReportContent,
    reportVisibility,
    setReportVisibility,
    editingReport,
    setEditingReport,
    savingReport,
    existingReport,
    reportTranscript,
    signedAudioUrl,
    uploadingMaterial,
    fileInputRef,
    showFinalizeModal,
    setShowFinalizeModal,
    finalizing,
    showEditRequestModal,
    setShowEditRequestModal,
    submittingEditRequest,
    fetchSession,
    handleAudioReportCreated,
    handleLogout,
    getStatusHelperText,
    handleAttendanceChange,
    handleMarkAllPresent,
    handleSaveAttendance,
    handleSaveReport,
    handleUploadMaterial,
    handleDeleteMaterial,
    handleFinalize,
    canFinalizeSession,
    handleSubmitEditRequest,
    hasPendingEditRequest,
    formatFileSize,
    canEdit,
  };
}

export type SessionDetail = ReturnType<typeof useSessionDetail>;
