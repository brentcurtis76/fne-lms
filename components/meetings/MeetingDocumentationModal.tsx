import { useSupabaseClient } from '@supabase/auth-helpers-react';
/**
 * Meeting Documentation Modal - Simplified 3-Step Form
 * Streamlined meeting documentation with essential information only
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { es } from 'date-fns/locale';
import TipTapEditor from '../../src/components/TipTapEditor';
import {
  emptyDoc,
  plainTextFromDoc,
  docOrFromText,
} from '../../lib/tiptap/helpers';

import {
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  CalendarIcon,
  ClockIcon,
  LocationMarkerIcon,
  UserIcon,
  DocumentTextIcon,
  MenuIcon,
  CheckCircleIcon,
  PaperClipIcon,
  DocumentIcon,
  UploadIcon
} from '@heroicons/react/outline';
import {
  MeetingDocumentationInput,
  MeetingFormStep,
  TaskPriority,
  MeetingStatus,
  AssignmentUser,
  priorityLabels,
  meetingStatusLabels
} from '../../types/meetings';
import { 
  createMeetingWithDocumentation,
  getCommunityMembersForAssignment,
  sendTaskAssignmentNotifications,
  getMeetingDetails,
  updateMeeting
} from '../../utils/meetingUtils';
import { uploadFile } from '../../utils/storage';

interface MeetingDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  userId: string;
  onSuccess: () => void;
  className?: string;
  meetingId?: string;
  mode?: 'create' | 'edit';
}

const STEPS = [
  {
    id: MeetingFormStep.INFORMATION,
    title: 'Información',
    description: 'Datos básicos de la reunión',
    icon: CalendarIcon
  },
  {
    id: MeetingFormStep.SUMMARY,
    title: 'Resumen',
    description: 'Resumen y notas de la reunión',
    icon: DocumentTextIcon
  },
  {
    id: MeetingFormStep.AGREEMENTS,
    title: 'Acuerdos y Compromisos',
    description: 'Acuerdos, compromisos y tareas',
    icon: CheckCircleIcon
  }
];

const MeetingDocumentationModal: React.FC<MeetingDocumentationModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  userId,
  onSuccess,
  className = '',
  meetingId,
  mode = 'create'
}) => {
  const supabase = useSupabaseClient();
  const [currentStep, setCurrentStep] = useState(MeetingFormStep.INFORMATION);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AssignmentUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingMeeting, setLoadingMeeting] = useState(false);

  // Draft / autosave state. `currentMeetingId` becomes populated either because
  // we were opened in edit mode or because the user just saved a new draft.
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(meetingId ?? null);
  const [workSessionId, setWorkSessionId] = useState<string | null>(null);
  const [meetingVersion, setMeetingVersion] = useState<number>(1);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savingIndicator, setSavingIndicator] = useState<'idle' | 'saving' | 'error'>('idle');
  const [savedTick, setSavedTick] = useState(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInFlightRef = useRef<boolean>(false);
  // Holds the latest startWorkSession so our open-effect can call it without
  // listing the useCallback in its deps (the useCallback is declared later).
  const startWorkSessionRef = useRef<((id: string) => Promise<void>) | null>(null);
  // Mirror workSessionId + currentMeetingId into refs so the unmount cleanup
  // can read their final value without re-subscribing every time they change.
  const workSessionIdRef = useRef<string | null>(null);
  const currentMeetingIdRef = useRef<string | null>(meetingId ?? null);

  // Work-session timeline (other editors working on this draft).
  interface WorkSessionEntry {
    id: string;
    user_id: string;
    started_at: string;
    first_name: string | null;
    last_name: string | null;
  }
  const [workSessions, setWorkSessions] = useState<WorkSessionEntry[]>([]);

  // Form data state
  const [formData, setFormData] = useState<MeetingDocumentationInput>({
    meeting_info: {
      title: '',
      meeting_date: '',
      duration_minutes: 60,
      location: '',
      attendee_ids: []
    },
    summary_info: {
      summary: '',
      summary_doc: emptyDoc(),
      notes: '',
      notes_doc: emptyDoc(),
      status: 'completada'
    },
    agreements: [],
    commitments: [],
    tasks: []
  });

  // Track original row IDs loaded in edit mode so we can diff on save
  const originalAgreementIdsRef = useRef<Set<string>>(new Set());
  const originalCommitmentIdsRef = useRef<Set<string>>(new Set());
  const originalTaskIdsRef = useRef<Set<string>>(new Set());

  // Existing attachments loaded from the database (edit mode)
  interface ExistingAttachment {
    id: string;
    filename: string;
    file_path: string;
    file_size: number;
    file_type: string;
  }
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<ExistingAttachment[]>([]);

  // Document upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCommunityMembers();
      if (mode === 'edit' && meetingId) {
        setCurrentMeetingId(meetingId);
        loadMeetingData();
        // startWorkSession is a stable useCallback([]) defined below — safe to
        // invoke inside this effect without adding it to the deps array.
        startWorkSessionRef.current?.(meetingId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceId, mode, meetingId]);

  // Tick the "Guardado hace Ns" relative label so it stays fresh while the
  // modal is open. Cheap — just bumps a counter every 10s.
  useEffect(() => {
    if (!isOpen || !lastSavedAt) return;
    const interval = setInterval(() => setSavedTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, [isOpen, lastSavedAt]);

  // Flush any pending autosave timer when the modal unmounts/closes.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // Keep refs in sync so the unmount/unload handlers always see the latest ids.
  useEffect(() => {
    workSessionIdRef.current = workSessionId;
  }, [workSessionId]);
  useEffect(() => {
    currentMeetingIdRef.current = currentMeetingId;
  }, [currentMeetingId]);

  // Close an open work-session. On page unload we prefer sendBeacon because
  // fetch may be cancelled; otherwise a keepalive fetch is fine.
  const endWorkSession = useCallback(
    (mId: string, sId: string, unloading: boolean) => {
      const url = `/api/meetings/${mId}/work-session/${sId}/end`;
      if (unloading && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
          return;
        } catch {
          // fall through to fetch
        }
      }
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch((err) => {
        console.error('Error ending work session:', err);
      });
    },
    []
  );

  // Catch tab close / hard navigation: fire sendBeacon before the browser tears down.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      const mId = currentMeetingIdRef.current;
      const sId = workSessionIdRef.current;
      if (mId && sId) endWorkSession(mId, sId, true);
    };
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', handler);
    };
  }, [endWorkSession]);

  // Unmount via client-side navigation: no unload event fires, so close the
  // session directly from the cleanup function.
  useEffect(() => {
    return () => {
      const mId = currentMeetingIdRef.current;
      const sId = workSessionIdRef.current;
      if (mId && sId) endWorkSession(mId, sId, false);
    };
  }, [endWorkSession]);

  const loadCommunityMembers = async () => {
    try {
      setLoadingUsers(true);
      
      // Get workspace details first
      const { data: workspace, error: wsError } = await supabase
        .from('community_workspaces')
        .select('community_id')
        .eq('id', workspaceId)
        .single();

      if (wsError || !workspace) {
        // If workspace table doesn't exist, just get all users from profiles
        const { data: allUsers, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .order('first_name', { ascending: true });

        if (!usersError && allUsers) {
          const formattedUsers: AssignmentUser[] = allUsers.map(user => ({
            id: user.id,
            first_name: user.first_name || 'Usuario',
            last_name: user.last_name || '',
            email: user.email || '',
            avatar_url: user.avatar_url,
            role_type: 'docente'
          }));
          setAvailableUsers(formattedUsers);
        }
        return;
      }

      // Get community members
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('community_id', workspace.community_id)
        .eq('is_active', true);

      if (rolesError || !userRoles || userRoles.length === 0) {
        // Fallback to all users if no community members found
        const { data: allUsers, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .order('first_name', { ascending: true });

        if (!usersError && allUsers) {
          const formattedUsers: AssignmentUser[] = allUsers.map(user => ({
            id: user.id,
            first_name: user.first_name || 'Usuario',
            last_name: user.last_name || '',
            email: user.email || '',
            avatar_url: user.avatar_url,
            role_type: 'docente'
          }));
          setAvailableUsers(formattedUsers);
        }
        return;
      }

      // Get user details for community members
      const userIds = userRoles.map(role => role.user_id);
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .in('id', userIds)
        .order('first_name', { ascending: true });

      if (!usersError && users) {
        const formattedUsers: AssignmentUser[] = users.map(user => ({
          id: user.id,
          first_name: user.first_name || 'Usuario',
          last_name: user.last_name || '',
          email: user.email || '',
          avatar_url: user.avatar_url,
          role_type: 'docente'
        }));
        setAvailableUsers(formattedUsers);
      }
      
    } catch (error) {
      console.error('Error loading community members:', error);
      // Fallback to loading all users if there's an error
      try {
        const { data: allUsers, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .order('first_name', { ascending: true });

        if (!usersError && allUsers) {
          const formattedUsers: AssignmentUser[] = allUsers.map(user => ({
            id: user.id,
            first_name: user.first_name || 'Usuario',
            last_name: user.last_name || '',
            email: user.email || '',
            avatar_url: user.avatar_url,
            role_type: 'docente'
          }));
          setAvailableUsers(formattedUsers);
        }
      } catch (fallbackError) {
        console.error('Error loading fallback users:', fallbackError);
        toast.error('Error al cargar miembros de la comunidad');
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadMeetingData = async () => {
    if (!meetingId) return;
    
    try {
      setLoadingMeeting(true);
      const meetingDetails = await getMeetingDetails(meetingId);
      
      if (meetingDetails) {
        // Extract attendee IDs from the attendees array
        const attendeeIds = meetingDetails.attendees?.map(attendee => attendee.user_id) || [];

        const loadedAgreements = (meetingDetails.agreements || []).map(a => ({
          id: a.id,
          agreement_text: a.agreement_text || '',
          agreement_doc: docOrFromText(a.agreement_doc, a.agreement_text),
          category: a.category,
        }));
        const loadedCommitments = (meetingDetails.commitments || []).map(c => ({
          id: c.id,
          commitment_text: c.commitment_text || '',
          commitment_doc: docOrFromText(c.commitment_doc, c.commitment_text),
          assigned_to: c.assigned_to,
          due_date: c.due_date || '',
        }));
        const loadedTasks = (meetingDetails.tasks || []).map(t => ({
          id: t.id,
          task_title: t.task_title,
          task_description: t.task_description || '',
          task_description_doc: docOrFromText(t.task_description_doc, t.task_description),
          assigned_to: t.assigned_to,
          due_date: t.due_date || '',
          priority: t.priority,
          category: t.category,
          estimated_hours: t.estimated_hours,
        }));

        originalAgreementIdsRef.current = new Set(loadedAgreements.map(a => a.id).filter((id): id is string => !!id));
        originalCommitmentIdsRef.current = new Set(loadedCommitments.map(c => c.id).filter((id): id is string => !!id));
        originalTaskIdsRef.current = new Set(loadedTasks.map(t => t.id).filter((id): id is string => !!id));

        // Populate form with existing data
        setFormData({
          meeting_info: {
            title: meetingDetails.title,
            meeting_date: new Date(meetingDetails.meeting_date).toISOString().slice(0, 16), // Format for datetime-local input
            duration_minutes: meetingDetails.duration_minutes,
            location: meetingDetails.location || '',
            attendee_ids: attendeeIds
          },
          summary_info: {
            summary: meetingDetails.summary || '',
            summary_doc: docOrFromText(meetingDetails.summary_doc, meetingDetails.summary),
            notes: meetingDetails.notes || '',
            notes_doc: docOrFromText(meetingDetails.notes_doc, meetingDetails.notes),
            status: meetingDetails.status
          },
          agreements: loadedAgreements,
          commitments: loadedCommitments,
          tasks: loadedTasks,
        });

        // Load existing attachments so they render alongside any new uploads
        const { data: attachments } = await supabase
          .from('meeting_attachments')
          .select('id, filename, file_path, file_size, file_type')
          .eq('meeting_id', meetingId);

        if (attachments) {
          setExistingAttachments(attachments as ExistingAttachment[]);
        }

        // Capture the authoritative version so optimistic-concurrency
        // autosaves start from the right baseline.
        setMeetingVersion((meetingDetails as any).version ?? 1);
        if ((meetingDetails as any).updated_at) {
          setLastSavedAt(new Date((meetingDetails as any).updated_at));
        }

        // Timeline banner source: active work sessions for this meeting.
        if (meetingDetails.status === 'borrador') {
          await loadWorkSessions(meetingId);
        }
      }
    } catch (error) {
      console.error('Error loading meeting data:', error);
      toast.error('Error al cargar los datos de la reunión');
    } finally {
      setLoadingMeeting(false);
    }
  };

  // Load active work-sessions plus the attached profile names for the
  // draft-mode timeline banner. Best-effort — silently no-ops on failure.
  const loadWorkSessions = async (id: string) => {
    try {
      const { data: sessions } = await supabase
        .from('meeting_work_sessions')
        .select('id, user_id, started_at')
        .eq('meeting_id', id)
        .is('ended_at', null)
        .order('started_at', { ascending: true });

      if (!sessions || sessions.length === 0) {
        setWorkSessions([]);
        return;
      }

      const userIds = Array.from(new Set(sessions.map((s: any) => s.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds);

      const profileMap = new Map<string, { first_name: string | null; last_name: string | null }>();
      (profiles || []).forEach((p: any) => {
        profileMap.set(p.id, { first_name: p.first_name, last_name: p.last_name });
      });

      setWorkSessions(
        sessions.map((s: any) => ({
          id: s.id,
          user_id: s.user_id,
          started_at: s.started_at,
          first_name: profileMap.get(s.user_id)?.first_name ?? null,
          last_name: profileMap.get(s.user_id)?.last_name ?? null,
        }))
      );
    } catch (err) {
      console.error('Error loading meeting work sessions:', err);
    }
  };

  // Opens a new work-session row for the current user on the given meeting.
  // Used both when the modal opens on an existing draft and right after a
  // brand-new draft has been persisted.
  const startWorkSession = useCallback(async (id: string): Promise<void> => {
    try {
      const res = await fetch(`/api/meetings/${id}/work-session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: `modal-${Date.now()}` }),
      });
      if (!res.ok) {
        console.error('Failed to start work session:', await res.text());
        return;
      }
      const payload = await res.json();
      const sessionId = payload?.data?.id ?? payload?.id;
      if (sessionId) {
        setWorkSessionId(sessionId);
      }
    } catch (err) {
      console.error('Error starting work session:', err);
    }
  }, []);

  // Keep the ref pointing at the latest memoized callback so the open-effect
  // can invoke it without taking a dependency on the declaration itself.
  useEffect(() => {
    startWorkSessionRef.current = startWorkSession;
  }, [startWorkSession]);

  // Best-effort autosave — skips when we have no meetingId yet (user hasn't
  // clicked "Guardar borrador" from the create flow) or when another autosave
  // is already in flight. 409 conflicts prompt a reload.
  const runAutosave = useCallback(async () => {
    const id = currentMeetingId;
    if (!id || autosaveInFlightRef.current) return;
    autosaveInFlightRef.current = true;
    setSavingIndicator('saving');
    try {
      const res = await fetch(`/api/meetings/${id}/autosave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary_doc: formData.summary_info.summary_doc ?? emptyDoc(),
          notes_doc: formData.summary_info.notes_doc ?? emptyDoc(),
          version: meetingVersion,
          work_session_id: workSessionId ?? undefined,
        }),
      });

      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        const who = body?.updated_by_name ? ` por ${body.updated_by_name}` : '';
        const shouldReload = typeof window !== 'undefined' && window.confirm(
          `Esta reunión fue modificada${who} mientras editabas. ` +
            '¿Recargar para ver los últimos cambios? Se perderán los cambios locales no guardados.'
        );
        setSavingIndicator('error');
        if (shouldReload) {
          await loadMeetingData();
        }
        return;
      }

      if (!res.ok) {
        console.error('Autosave failed:', await res.text());
        setSavingIndicator('error');
        return;
      }

      const payload = await res.json();
      const next = payload?.data ?? payload;
      if (typeof next?.version === 'number') {
        setMeetingVersion(next.version);
      }
      if (next?.work_session_id) {
        setWorkSessionId(next.work_session_id);
      }
      const stamp = next?.updated_at ? new Date(next.updated_at) : new Date();
      setLastSavedAt(stamp);
      setSavingIndicator('idle');
    } catch (err) {
      console.error('Autosave error:', err);
      setSavingIndicator('error');
    } finally {
      autosaveInFlightRef.current = false;
    }
  }, [currentMeetingId, formData.summary_info.summary_doc, formData.summary_info.notes_doc, meetingVersion, workSessionId]);

  const scheduleAutosave = useCallback(() => {
    if (!currentMeetingId) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void runAutosave();
    }, 2000);
  }, [currentMeetingId, runAutosave]);

  const handleClose = () => {
    if (isSubmitting) return;

    // End any open work-session before we clear it from state.
    if (currentMeetingId && workSessionId) {
      endWorkSession(currentMeetingId, workSessionId, false);
    }

    // Reset form
    setCurrentStep(MeetingFormStep.INFORMATION);
    setFormData({
      meeting_info: {
        title: '',
        meeting_date: '',
        duration_minutes: 60,
        location: '',
        attendee_ids: []
      },
      summary_info: {
        summary: '',
        summary_doc: emptyDoc(),
        notes: '',
        notes_doc: emptyDoc(),
        status: 'completada'
      },
      agreements: [],
      commitments: [],
      tasks: []
    });
    originalAgreementIdsRef.current = new Set();
    originalCommitmentIdsRef.current = new Set();
    originalTaskIdsRef.current = new Set();
    setExistingAttachments([]);
    setAttachmentsToDelete([]);
    setSelectedFiles([]);
    setCurrentMeetingId(meetingId ?? null);
    setWorkSessionId(null);
    setMeetingVersion(1);
    setLastSavedAt(null);
    setSavingIndicator('idle');
    setWorkSessions([]);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    onClose();
  };

  // "Guardar borrador" — persists the current form state with status='borrador'
  // and bypasses the summary-required validation from validateStep. On the
  // create path this produces a meetingId which lets subsequent autosaves and
  // the work-session presence banner come online.
  const handleSaveDraft = async () => {
    if (isSavingDraft || isSubmitting) return;
    if (!formData.meeting_info.title || !formData.meeting_info.meeting_date) {
      toast.error('Título y fecha son requeridos para guardar un borrador');
      return;
    }

    setIsSavingDraft(true);

    const summaryDoc = formData.summary_info.summary_doc ?? emptyDoc();
    const notesDoc = formData.summary_info.notes_doc ?? emptyDoc();
    const summaryText = plainTextFromDoc(summaryDoc);
    const notesText = plainTextFromDoc(notesDoc);

    try {
      if (currentMeetingId) {
        const result = await updateMeeting(currentMeetingId, {
          title: formData.meeting_info.title,
          meeting_date: formData.meeting_info.meeting_date,
          duration_minutes: formData.meeting_info.duration_minutes,
          location: formData.meeting_info.location,
          summary: summaryText,
          summary_doc: summaryDoc,
          notes: notesText,
          notes_doc: notesDoc,
          status: 'borrador',
        });
        if (!result.success) {
          toast.error('No se pudo guardar el borrador');
          return;
        }
      } else {
        const result = await createMeetingWithDocumentation(workspaceId, userId, {
          ...formData,
          summary_info: {
            ...formData.summary_info,
            summary: summaryText,
            summary_doc: summaryDoc,
            notes: notesText,
            notes_doc: notesDoc,
            status: 'borrador',
          },
          agreements: [],
          commitments: [],
          tasks: [],
        });
        if (!result.success || !result.meetingId) {
          toast.error(result.error || 'No se pudo guardar el borrador');
          return;
        }
        setCurrentMeetingId(result.meetingId);
        setMeetingVersion(1);
        await startWorkSession(result.meetingId);
        await loadWorkSessions(result.meetingId);
      }

      updateSummaryInfo('status', 'borrador');
      setLastSavedAt(new Date());
      setSavingIndicator('idle');
      toast.success('Borrador guardado');
      onSuccess();
    } catch (err) {
      console.error('Error saving draft:', err);
      toast.error('Error inesperado al guardar el borrador');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const validateStep = (step: MeetingFormStep): boolean => {
    switch (step) {
      case MeetingFormStep.INFORMATION:
        return !!(formData.meeting_info.title && formData.meeting_info.meeting_date);
      case MeetingFormStep.SUMMARY:
        return plainTextFromDoc(formData.summary_info.summary_doc).trim().length > 0;
      case MeetingFormStep.AGREEMENTS:
        return true; // Agreements, commitments and tasks are optional
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }

    if (currentStep < MeetingFormStep.AGREEMENTS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > MeetingFormStep.INFORMATION) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }

    setIsSubmitting(true);
    setUploadingFiles(true);

    // Derive plaintext from the latest TipTap JSON before persisting.
    const summaryDoc = formData.summary_info.summary_doc ?? emptyDoc();
    const notesDoc = formData.summary_info.notes_doc ?? emptyDoc();
    const summaryText = plainTextFromDoc(summaryDoc);
    const notesText = plainTextFromDoc(notesDoc);

    const agreementsForPersist = formData.agreements.map((a) => {
      const doc = a.agreement_doc ?? emptyDoc();
      return {
        id: a.id,
        agreement_text: plainTextFromDoc(doc) || a.agreement_text || '',
        agreement_doc: doc,
        category: a.category,
      };
    });
    const commitmentsForPersist = formData.commitments.map((c) => {
      const doc = c.commitment_doc ?? emptyDoc();
      return {
        id: c.id,
        commitment_text: plainTextFromDoc(doc) || c.commitment_text || '',
        commitment_doc: doc,
        assigned_to: c.assigned_to,
        due_date: c.due_date,
      };
    });
    const tasksForPersist = formData.tasks.map((t) => {
      const doc = t.task_description_doc ?? emptyDoc();
      return {
        id: t.id,
        task_title: t.task_title,
        task_description: plainTextFromDoc(doc) || t.task_description || '',
        task_description_doc: doc,
        assigned_to: t.assigned_to,
        due_date: t.due_date,
        priority: t.priority,
        category: t.category,
        estimated_hours: t.estimated_hours,
      };
    });

    try {
      let result: { success: boolean; meetingId?: string; error?: string };

      // We take the update path whenever a meeting row already exists — either
      // because we opened in edit mode or because the user clicked
      // "Guardar borrador" earlier in this session.
      const targetMeetingId = currentMeetingId;
      if (targetMeetingId) {
        const meetingId = targetMeetingId; // re-bind so existing code reads unchanged
        // Update existing meeting
        const updateResult = await updateMeeting(meetingId, {
          title: formData.meeting_info.title,
          meeting_date: formData.meeting_info.meeting_date,
          duration_minutes: formData.meeting_info.duration_minutes,
          location: formData.meeting_info.location,
          summary: summaryText,
          summary_doc: summaryDoc,
          notes: notesText,
          notes_doc: notesDoc,
          status: formData.summary_info.status
        });

        if (updateResult.success) {
          // Upsert agreements/commitments/tasks.
          // - Rows with an existing id are UPDATEd in place so completion state is preserved.
          // - Rows without an id are INSERTed.
          // - Rows whose ids were loaded initially but removed from state are DELETEd explicitly.
          const currentAgreementIds = new Set(agreementsForPersist.map(a => a.id).filter((id): id is string => !!id));
          const currentCommitmentIds = new Set(commitmentsForPersist.map(c => c.id).filter((id): id is string => !!id));
          const currentTaskIds = new Set(tasksForPersist.map(t => t.id).filter((id): id is string => !!id));

          const agreementIdsToDelete = Array.from(originalAgreementIdsRef.current).filter(id => !currentAgreementIds.has(id));
          const commitmentIdsToDelete = Array.from(originalCommitmentIdsRef.current).filter(id => !currentCommitmentIds.has(id));
          const taskIdsToDelete = Array.from(originalTaskIdsRef.current).filter(id => !currentTaskIds.has(id));

          if (agreementIdsToDelete.length > 0) {
            await supabase.from('meeting_agreements').delete().in('id', agreementIdsToDelete);
          }
          if (commitmentIdsToDelete.length > 0) {
            await supabase.from('meeting_commitments').delete().in('id', commitmentIdsToDelete);
          }
          if (taskIdsToDelete.length > 0) {
            await supabase.from('meeting_tasks').delete().in('id', taskIdsToDelete);
          }

          // Agreements
          const agreementsToInsert = agreementsForPersist
            .map((a, index) => ({ ...a, order_index: index }))
            .filter(a => !a.id);
          const agreementsToUpdate = agreementsForPersist
            .map((a, index) => ({ ...a, order_index: index }))
            .filter(a => !!a.id);

          if (agreementsToInsert.length > 0) {
            await supabase.from('meeting_agreements').insert(
              agreementsToInsert.map(a => ({
                meeting_id: meetingId,
                agreement_text: a.agreement_text,
                agreement_doc: a.agreement_doc,
                category: a.category,
                order_index: a.order_index,
              }))
            );
          }
          for (const a of agreementsToUpdate) {
            await supabase.from('meeting_agreements').update({
              agreement_text: a.agreement_text,
              agreement_doc: a.agreement_doc,
              category: a.category,
              order_index: a.order_index,
            }).eq('id', a.id!);
          }

          // Commitments
          const commitmentsToInsert = commitmentsForPersist.filter(c => !c.id);
          const commitmentsToUpdate = commitmentsForPersist.filter(c => !!c.id);

          if (commitmentsToInsert.length > 0) {
            await supabase.from('meeting_commitments').insert(
              commitmentsToInsert.map(c => ({
                meeting_id: meetingId,
                commitment_text: c.commitment_text,
                commitment_doc: c.commitment_doc,
                assigned_to: c.assigned_to,
                due_date: c.due_date,
              }))
            );
          }
          for (const c of commitmentsToUpdate) {
            await supabase.from('meeting_commitments').update({
              commitment_text: c.commitment_text,
              commitment_doc: c.commitment_doc,
              assigned_to: c.assigned_to,
              due_date: c.due_date,
            }).eq('id', c.id!);
          }

          // Tasks
          const tasksToInsert = tasksForPersist.filter(t => !t.id);
          const tasksToUpdate = tasksForPersist.filter(t => !!t.id);

          if (tasksToInsert.length > 0) {
            await supabase.from('meeting_tasks').insert(
              tasksToInsert.map(t => ({
                meeting_id: meetingId,
                task_title: t.task_title,
                task_description: t.task_description,
                task_description_doc: t.task_description_doc,
                assigned_to: t.assigned_to,
                due_date: t.due_date,
                priority: t.priority,
                category: t.category,
                estimated_hours: t.estimated_hours,
              }))
            );
          }
          for (const t of tasksToUpdate) {
            await supabase.from('meeting_tasks').update({
              task_title: t.task_title,
              task_description: t.task_description,
              task_description_doc: t.task_description_doc,
              assigned_to: t.assigned_to,
              due_date: t.due_date,
              priority: t.priority,
              category: t.category,
              estimated_hours: t.estimated_hours,
            }).eq('id', t.id!);
          }

          // Remove attachments the user explicitly marked for deletion.
          if (attachmentsToDelete.length > 0) {
            const paths = attachmentsToDelete.map(a => a.file_path);
            try {
              await supabase.storage.from('meeting-documents').remove(paths);
            } catch (storageErr) {
              console.error('Error removing attachment storage files:', storageErr);
            }
            await supabase
              .from('meeting_attachments')
              .delete()
              .in('id', attachmentsToDelete.map(a => a.id));
          }

          result = { success: true, meetingId };
        } else {
          result = updateResult;
        }
      } else {
        // Create new meeting — pass the fully derived plaintext + doc pair.
        result = await createMeetingWithDocumentation(workspaceId, userId, {
          ...formData,
          summary_info: {
            ...formData.summary_info,
            summary: summaryText,
            summary_doc: summaryDoc,
            notes: notesText,
            notes_doc: notesDoc,
          },
          agreements: agreementsForPersist.map(({ id: _id, ...rest }) => rest),
          commitments: commitmentsForPersist.map(({ id: _id, ...rest }) => rest),
          tasks: tasksForPersist.map(({ id: _id, ...rest }) => rest),
        });
      }
      
      if (result.success && result.meetingId) {
        // Upload documents if any
        if (selectedFiles.length > 0) {
          try {
            // Create meeting-documents bucket if it doesn't exist
            const bucketName = 'meeting-documents';
            
            for (const file of selectedFiles) {
              // Generate unique file path
              const timestamp = Date.now();
              const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
              const filePath = `${workspaceId}/${result.meetingId}/${timestamp}-${sanitizedName}`;
              
              // Upload file
              const { url, error } = await uploadFile(file, filePath, bucketName);
              
              if (error) {
                console.error('Error uploading file:', file.name, error);
                toast.error(`Error al subir ${file.name}`);
                continue;
              }

              // Save file reference to database
              const { error: dbError } = await supabase
                .from('meeting_attachments')
                .insert({
                  meeting_id: result.meetingId,
                  filename: file.name,
                  file_path: filePath,
                  file_size: file.size,
                  file_type: file.type,
                  uploaded_by: userId
                });

              if (dbError) {
                console.error('Error saving file reference:', dbError);
                // Continue with other files even if one fails
              }
            }
          } catch (uploadError) {
            console.error('Error during file upload:', uploadError);
            toast.error('Algunos archivos no se pudieron subir');
          }
        }

        // Send notifications for assigned tasks/commitments
        const assignedUserIds = [
          ...formData.commitments.map(c => c.assigned_to),
          ...formData.tasks.map(t => t.assigned_to)
        ].filter((id, index, arr) => arr.indexOf(id) === index); // Remove duplicates

        if (assignedUserIds.length > 0) {
          await sendTaskAssignmentNotifications(result.meetingId, assignedUserIds);
        }

        toast.success(mode === 'edit' ? 'Reunión actualizada correctamente' : 'Reunión documentada correctamente');
        onSuccess();
        handleClose();
      } else {
        toast.error(result.error || `Error al ${mode === 'edit' ? 'actualizar' : 'crear'} la reunión`);
      }
    } catch (error) {
      console.error('Error submitting meeting:', error);
      toast.error(`Error inesperado al ${mode === 'edit' ? 'actualizar' : 'crear'} la reunión`);
    } finally {
      setIsSubmitting(false);
      setUploadingFiles(false);
    }
  };

  // Helper functions for form updates
  const updateMeetingInfo = (field: keyof typeof formData.meeting_info, value: any) => {
    setFormData(prev => ({
      ...prev,
      meeting_info: {
        ...prev.meeting_info,
        [field]: value
      }
    }));
  };

  const updateSummaryInfo = (field: keyof typeof formData.summary_info, value: any) => {
    setFormData(prev => ({
      ...prev,
      summary_info: {
        ...prev.summary_info,
        [field]: value
      }
    }));
  };

  const addAgreement = () => {
    setFormData(prev => ({
      ...prev,
      agreements: [
        ...prev.agreements,
        { agreement_text: '', category: '' }
      ]
    }));
  };

  const updateAgreement = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      agreements: prev.agreements.map((agreement, i) => 
        i === index ? { ...agreement, [field]: value } : agreement
      )
    }));
  };

  const removeAgreement = (index: number) => {
    setFormData(prev => ({
      ...prev,
      agreements: prev.agreements.filter((_, i) => i !== index)
    }));
  };

  const addCommitment = () => {
    setFormData(prev => ({
      ...prev,
      commitments: [
        ...prev.commitments,
        { commitment_text: '', commitment_doc: emptyDoc(), assigned_to: '', due_date: '' }
      ]
    }));
  };

  const updateCommitment = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      commitments: prev.commitments.map((commitment, i) => 
        i === index ? { ...commitment, [field]: value } : commitment
      )
    }));
  };

  const removeCommitment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      commitments: prev.commitments.filter((_, i) => i !== index)
    }));
  };

  const addTask = () => {
    setFormData(prev => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        {
          task_title: '',
          task_description: '',
          task_description_doc: emptyDoc(),
          assigned_to: '',
          due_date: '',
          priority: 'media',
          category: '',
          estimated_hours: undefined
        }
      ]
    }));
  };

  const updateTask = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      tasks: prev.tasks.map((task, i) => 
        i === index ? { ...task, [field]: value } : task
      )
    }));
  };

  const removeTask = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== index)
    }));
  };

  // Document upload functions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg',
        'image/png',
        'image/gif'
      ];

      if (!allowedTypes.includes(file.type)) {
        toast.error(`Tipo de archivo no permitido: ${file.name}`);
        return false;
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`Archivo demasiado grande: ${file.name}. Máximo 10MB.`);
        return false;
      }

      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
    return '📎';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={handleClose} />
        
        <div className={`relative w-full max-w-4xl bg-white rounded-lg shadow-xl ${className}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-[#0a0a0a]">
                {mode === 'edit' ? 'Editar Reunión' : 'Documentar Reunión'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {STEPS[currentStep].title}: {STEPS[currentStep].description}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {/* Save status indicator — only meaningful once a meetingId exists */}
              {currentMeetingId && (
                <div className="text-xs text-gray-500" aria-live="polite" data-tick={savedTick}>
                  {savingIndicator === 'saving' && <span>Guardando…</span>}
                  {savingIndicator === 'error' && (
                    <span className="text-red-600">Error al guardar</span>
                  )}
                  {savingIndicator === 'idle' && lastSavedAt && (
                    <span>
                      Guardado hace{' '}
                      {formatDistanceToNowStrict(lastSavedAt, { locale: es, addSuffix: false })}
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Draft timeline banner — who started / is working on this draft */}
          {formData.summary_info.status === 'borrador' && workSessions.length > 0 && (
            <div className="px-6 py-3 bg-yellow-50 border-b border-yellow-200 text-sm text-yellow-900">
              {(() => {
                const first = workSessions[0];
                const name = `${first.first_name || ''} ${first.last_name || ''}`.trim() || 'Alguien';
                const startedLabel = format(new Date(first.started_at), "d 'de' MMM, HH:mm", { locale: es });
                const others = workSessions.length - 1;
                return (
                  <span>
                    Iniciado por <strong>{name}</strong> el {startedLabel}
                    {others > 0 && (
                      <> · {others} editor{others !== 1 ? 'es' : ''} adicional{others !== 1 ? 'es' : ''}</>
                    )}
                  </span>
                );
              })()}
            </div>
          )}

          {/* Progress Steps */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    currentStep >= step.id 
                      ? 'bg-[#fbbf24] text-[#0a0a0a]' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {currentStep > step.id ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className={`ml-2 text-sm font-medium ${
                    currentStep >= step.id ? 'text-[#0a0a0a]' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                  {index < STEPS.length - 1 && (
                    <div className={`mx-4 h-px w-12 ${
                      currentStep > step.id ? 'bg-[#fbbf24]' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-96 overflow-y-auto">
            {loadingMeeting ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#fbbf24]"></div>
              </div>
            ) : (
              <>
                {/* Step 1: Information */}
                {currentStep === MeetingFormStep.INFORMATION && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título de la Reunión *
                  </label>
                  <input
                    type="text"
                    value={formData.meeting_info.title}
                    onChange={(e) => updateMeetingInfo('title', e.target.value)}
                    placeholder="Ej: Reunión de planificación semanal"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha y Hora *
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.meeting_info.meeting_date}
                      onChange={(e) => updateMeetingInfo('meeting_date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duración (minutos)
                    </label>
                    <input
                      type="number"
                      min="15"
                      max="480"
                      value={formData.meeting_info.duration_minutes}
                      onChange={(e) => updateMeetingInfo('duration_minutes', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ubicación
                  </label>
                  <input
                    type="text"
                    value={formData.meeting_info.location}
                    onChange={(e) => updateMeetingInfo('location', e.target.value)}
                    placeholder="Ej: Sala de reuniones, Zoom, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  />
                </div>

                {/* Attendees */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Asistentes
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-3">
                    {availableUsers.map(user => (
                      <label key={user.id} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.meeting_info.attendee_ids.includes(user.id)}
                          onChange={(e) => {
                            const attendeeIds = e.target.checked
                              ? [...formData.meeting_info.attendee_ids, user.id]
                              : formData.meeting_info.attendee_ids.filter(id => id !== user.id);
                            updateMeetingInfo('attendee_ids', attendeeIds);
                          }}
                          className="h-4 w-4 text-[#fbbf24] focus:ring-[#fbbf24] border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          {user.first_name} {user.last_name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Summary */}
            {currentStep === MeetingFormStep.SUMMARY && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estado de la Reunión
                  </label>
                  <select
                    value={formData.summary_info.status}
                    onChange={(e) => updateSummaryInfo('status', e.target.value as MeetingStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                  >
                    {Object.entries(meetingStatusLabels).map(([status, label]) => (
                      <option key={status} value={status}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Resumen de la Reunión *
                  </label>
                  <TipTapEditor
                    initialContent={formData.summary_info.summary_doc ?? emptyDoc()}
                    onChange={(json) => {
                      updateSummaryInfo('summary_doc', json);
                      scheduleAutosave();
                    }}
                    expandable
                    minHeight={200}
                    placeholder="Resumen de la reunión…"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Puedes incluir enlaces en el resumen. Los enlaces se mostrarán como texto clickeable.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notas Adicionales
                  </label>
                  <TipTapEditor
                    initialContent={formData.summary_info.notes_doc ?? emptyDoc()}
                    onChange={(json) => {
                      updateSummaryInfo('notes_doc', json);
                      scheduleAutosave();
                    }}
                    expandable
                    minHeight={200}
                    placeholder="Notas adicionales, observaciones…"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Agreements, Commitments and Tasks */}
            {currentStep === MeetingFormStep.AGREEMENTS && (
              <div className="space-y-8">
                {/* Documents Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Documentos
                    </h3>
                  </div>

                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                    <div className="text-center">
                      <DocumentIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <div className="text-sm text-gray-600">
                        <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-[#fbbf24] hover:text-[#fbbf24]/80 focus-within:outline-none">
                          <span>Seleccionar archivos</span>
                          <input
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            className="sr-only"
                            multiple
                            onChange={handleFileSelect}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif"
                          />
                        </label>
                        <span className="pl-1">o arrastrar y soltar</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        PDF, Word, Excel, PowerPoint, o imágenes hasta 10MB
                      </p>
                    </div>
                  </div>

                  {existingAttachments.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">
                        Archivos existentes ({existingAttachments.length})
                      </h4>
                      <div className="space-y-2">
                        {existingAttachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg"
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <span className="text-3xl flex-shrink-0">{getFileIcon(attachment.file_type || '')}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{attachment.filename}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(attachment.file_size || 0)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setExistingAttachments(prev => prev.filter(a => a.id !== attachment.id));
                                setAttachmentsToDelete(prev => [...prev, attachment]);
                              }}
                              className="ml-4 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar archivo"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedFiles.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Archivos seleccionados ({selectedFiles.length})</h4>
                      <div className="space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <span className="text-3xl flex-shrink-0">{getFileIcon(file.type)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeFile(index)}
                              className="ml-4 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar archivo"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Agreements Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Acuerdos
                    </h3>
                    <button
                      onClick={addAgreement}
                      className="inline-flex items-center px-3 py-2 bg-[#fbbf24] text-[#0a0a0a] text-sm rounded-lg hover:bg-[#fbbf24]/90 transition-colors duration-200"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Agregar Acuerdo
                    </button>
                  </div>

                  {formData.agreements.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <p className="text-sm">No se han agregado acuerdos.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.agreements.map((agreement, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-[#fbbf24] text-[#0a0a0a] text-sm font-bold rounded-full">
                              {index + 1}
                            </span>
                            <button
                              onClick={() => removeAgreement(index)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>

                          <TipTapEditor
                            initialContent={agreement.agreement_doc ?? emptyDoc()}
                            onChange={(json) => {
                              const text = plainTextFromDoc(json);
                              setFormData(prev => ({
                                ...prev,
                                agreements: prev.agreements.map((a, i) =>
                                  i === index
                                    ? { ...a, agreement_doc: json as any, agreement_text: text }
                                    : a
                                ),
                              }));
                            }}
                            minHeight={80}
                            placeholder="Describe el acuerdo…"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Commitments Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Compromisos
                    </h3>
                    <button
                      onClick={addCommitment}
                      className="inline-flex items-center px-3 py-2 bg-[#fbbf24] text-[#0a0a0a] text-sm rounded-lg hover:bg-[#fbbf24]/90 transition-colors duration-200"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Agregar Compromiso
                    </button>
                  </div>

                  {formData.commitments.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <MenuIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p>No se han agregado compromisos.</p>
                      <p className="text-sm">Los compromisos son opcionales.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.commitments.map((commitment, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-[#fbbf24] text-[#0a0a0a] text-sm font-bold rounded-full">
                              {index + 1}
                            </span>
                            <button
                              onClick={() => removeCommitment(index)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            <TipTapEditor
                              initialContent={commitment.commitment_doc ?? emptyDoc()}
                              onChange={(json) => updateCommitment(index, 'commitment_doc', json as any)}
                              minHeight={80}
                              placeholder="Describe el compromiso…"
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <select
                                value={commitment.assigned_to}
                                onChange={(e) => updateCommitment(index, 'assigned_to', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              >
                                <option value="">Asignar a...</option>
                                {availableUsers.map(user => (
                                  <option key={user.id} value={user.id}>
                                    {user.first_name} {user.last_name}
                                  </option>
                                ))}
                              </select>
                              
                              <input
                                type="date"
                                value={commitment.due_date}
                                onChange={(e) => updateCommitment(index, 'due_date', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tasks Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Tareas
                    </h3>
                    <button
                      onClick={addTask}
                      className="inline-flex items-center px-3 py-2 bg-[#fbbf24] text-[#0a0a0a] text-sm rounded-lg hover:bg-[#fbbf24]/90 transition-colors duration-200"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Agregar Tarea
                    </button>
                  </div>

                  {formData.tasks.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <p className="text-sm">No se han agregado tareas.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.tasks.map((task, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-green-500 text-white text-sm font-bold rounded-full">
                              T{index + 1}
                            </span>
                            <button
                              onClick={() => removeTask(index)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={task.task_title}
                              onChange={(e) => updateTask(index, 'task_title', e.target.value)}
                              placeholder="Título de la tarea..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                            />
                            
                            <TipTapEditor
                              initialContent={task.task_description_doc ?? emptyDoc()}
                              onChange={(json) => updateTask(index, 'task_description_doc', json)}
                              minHeight={80}
                              placeholder="Describe la tarea…"
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <select
                                value={task.assigned_to}
                                onChange={(e) => updateTask(index, 'assigned_to', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              >
                                <option value="">Asignar a...</option>
                                {availableUsers.map(user => (
                                  <option key={user.id} value={user.id}>
                                    {user.first_name} {user.last_name}
                                  </option>
                                ))}
                              </select>
                              
                              <input
                                type="date"
                                value={task.due_date}
                                onChange={(e) => updateTask(index, 'due_date', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              />
                              
                              <select
                                value={task.priority}
                                onChange={(e) => updateTask(index, 'priority', e.target.value as TaskPriority)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              >
                                {Object.entries(priorityLabels).map(([priority, label]) => (
                                  <option key={priority} value={priority}>{label}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={task.category}
                                onChange={(e) => updateTask(index, 'category', e.target.value)}
                                placeholder="Categoría (opcional)"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              />
                              
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={task.estimated_hours || ''}
                                onChange={(e) => updateTask(index, 'estimated_hours', e.target.value ? parseFloat(e.target.value) : undefined)}
                                placeholder="Horas estimadas"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200">
            <button
              onClick={handlePrevious}
              disabled={currentStep === MeetingFormStep.INFORMATION || isSubmitting}
              className="inline-flex items-center px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <ChevronLeftIcon className="h-4 w-4 mr-1" />
              Anterior
            </button>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveDraft}
                disabled={isSubmitting || isSavingDraft}
                className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors duration-200"
                title="Guarda el estado actual como borrador sin validar el resumen"
              >
                {isSavingDraft ? 'Guardando…' : 'Guardar borrador'}
              </button>

              {currentStep < MeetingFormStep.AGREEMENTS ? (
                <button
                  onClick={handleNext}
                  disabled={isSubmitting}
                  className="inline-flex items-center px-4 py-2 bg-[#fbbf24] text-[#0a0a0a] text-sm rounded-lg hover:bg-[#fbbf24]/90 disabled:opacity-50 transition-colors duration-200"
                >
                  Siguiente
                  <ChevronRightIcon className="h-4 w-4 ml-1" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center px-4 py-2 bg-[#0a0a0a] text-white text-sm rounded-lg hover:bg-[#0a0a0a]/90 disabled:opacity-50 transition-colors duration-200"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      {uploadingFiles ? `Subiendo ${selectedFiles.length} archivo${selectedFiles.length !== 1 ? 's' : ''}...` : 'Guardando...'}
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-4 w-4 mr-1" />
                      {mode === 'edit' ? 'Guardar Cambios' : 'Crear Reunión'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingDocumentationModal;