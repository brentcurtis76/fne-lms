import { useSupabaseClient } from '@supabase/auth-helpers-react';
/**
 * Meeting Documentation Modal - Simplified 3-Step Form
 * Streamlined meeting documentation with essential information only
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import TipTapEditor from '../../src/components/TipTapEditor';
import {
  emptyDoc,
  plainTextFromDoc,
  docOrFromText,
} from '../../lib/tiptap/helpers';

import {
  XIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  CalendarIcon,
  UserIcon,
  DocumentTextIcon,
  MenuIcon,
  CheckCircleIcon,
  PaperClipIcon,
  DocumentIcon,
} from '@heroicons/react/outline';
import {
  MeetingDocumentationInput,
  MeetingFormStep,
  TaskPriority,
  MeetingStatus,
  AssignmentUser,
  priorityLabels,
  meetingStatusLabels,
  WorkSessionEntry,
  ExistingAttachment,
} from '../../types/meetings';
import {
  getMeetingDetails,
  updateMeeting
} from '../../utils/meetingUtils';
import { fetchCommunityMembers } from '../../lib/community/fetchCommunityMembers';
import type { CommunityMember } from '../../lib/community/fetchCommunityMembers';
import { uploadFile } from '../../utils/storage';
import { FinalizeMeetingDialog } from './FinalizeMeetingDialog';
import { WorkSessionBanner } from './WorkSessionBanner';
import { AttachmentRow } from './AttachmentRow';
import { MeetingModalFooter } from './MeetingModalFooter';
import {
  deriveMeetingDocs,
  applyMeetingDiffs,
  insertMeetingRow,
  syncMeetingPeople,
  readMeetingPeople,
  removeDeletedAttachments,
  uploadSelectedAttachments,
  PROTECTED_ATTENDEE_ROLES,
  type MeetingItemIds,
  type MeetingPeople,
} from './persistMeeting';
import {
  validateMeetingItems,
  describeSaveError,
  saveFailureSummary,
  type SaveProblem,
  type SaveItemField,
} from '../../lib/meetings/meeting-save';
import { toDatetimeLocalValue, datetimeLocalToIso } from '../../lib/meetings/meeting-time';
import { MEETING_STATUS } from '../../lib/utils/meeting-policy';
import { profileName } from '../../lib/utils/profile-name';
import {
  AUTOSAVE_DEBOUNCE_MS,
  SAVED_TICK_INTERVAL_MS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  ALLOWED_ATTACHMENT_MIME_TYPES,
} from '../../lib/meetings/constants';

type MeetingAgreementInput = MeetingDocumentationInput['agreements'][number];
type MeetingCommitmentInput = MeetingDocumentationInput['commitments'][number];
type MeetingTaskInput = MeetingDocumentationInput['tasks'][number];

// SM-H8: stable identity for form items (agreements, commitments, tasks), so
// ids returned by a save land on the item that was saved even if the list
// changed while the save was running.
let itemKeyCounter = 0;
const nextItemKey = () => `item-${++itemKeyCounter}`;

const PROTECTED_ROLE_LABELS: Record<string, string> = {
  facilitator: 'facilitador/a',
  secretary: 'secretario/a',
  co_editor: 'co-editor/a',
};

/**
 * Load state of the community candidate list. `availableUsers.length === 0`
 * alone cannot tell an empty community from a pending or failed load, and the
 * historical-assignee labels may only call someone "outside the community"
 * after a SUCCESSFUL load.
 */
type MembersLoadState = 'idle' | 'loading' | 'success' | 'error';

const MEMBERS_LOAD_ERROR_TOAST_ID = 'meeting-members-load-error';
const MEMBERS_LOAD_ERROR_MESSAGE =
  'No se pudieron cargar los miembros de la comunidad. Intenta nuevamente.';

/**
 * Map endpoint members to the picker's `AssignmentUser` shape. `role_type` is
 * the member's first role exactly as the endpoint orders them (most significant
 * first); a member the endpoint returns without roles keeps an empty role rather
 * than being promoted to one they do not hold. Ordering is the endpoint's
 * deterministic name-then-email sort, so it is not re-sorted here.
 */
function toAssignmentUsers(members: CommunityMember[]): AssignmentUser[] {
  return members.map((member) => ({
    id: member.id,
    first_name: member.first_name ?? '',
    last_name: member.last_name ?? '',
    email: member.email ?? '',
    avatar_url: member.avatar_url ?? undefined,
    role_type: member.user_roles?.[0]?.role_type ?? '',
  }));
}

interface MeetingDocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Growth community the workspace belongs to; scopes every member picker. */
  communityId: string;
  userId: string;
  onSuccess: () => void;
  /**
   * Called after "Guardar borrador" succeeds. The modal stays open; the parent
   * only refreshes its list. Falls back to `onSuccess` when not given.
   */
  onDraftSaved?: () => void;
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
  communityId,
  userId,
  onSuccess,
  onDraftSaved,
  className = '',
  meetingId,
  mode = 'create'
}) => {
  const supabase = useSupabaseClient();
  const [currentStep, setCurrentStep] = useState(MeetingFormStep.INFORMATION);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AssignmentUser[]>([]);
  const [membersLoadState, setMembersLoadState] = useState<MembersLoadState>('idle');
  const [loadingMeeting, setLoadingMeeting] = useState(false);

  // Draft / autosave state. `currentMeetingId` becomes populated either because
  // we were opened in edit mode or because the user just saved a new draft.
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(meetingId ?? null);
  const [workSessionId, setWorkSessionId] = useState<string | null>(null);
  // Optimistic-concurrency version; DB default is 0 for freshly-inserted rows.
  // Edit mode overwrites this from the loaded meeting; create mode overwrites
  // after the first save returns the authoritative DB value.
  const [meetingVersion, setMeetingVersion] = useState<number>(0);
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
  // Guards against duplicate end-session network calls when both handleClose
  // and the unmount cleanup fire for the same session.
  const workSessionEndedRef = useRef<boolean>(false);

  // Work-session timeline (other editors working on this draft).
  const [workSessions, setWorkSessions] = useState<WorkSessionEntry[]>([]);

  // Form data state
  const [formData, setFormData] = useState<MeetingDocumentationInput>({
    meeting_info: {
      title: '',
      meeting_date: '',
      duration_minutes: 60,
      location: '',
      attendee_ids: [],
      reader_ids: []
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
  // SM-H8: participants (user id → attendee role) and added readers as last
  // read from / written to the database, so a save only sends the difference.
  const peopleBaselineRef = useRef<MeetingPeople>({ participants: new Map(), readerIds: new Set() });
  // Attendees whose role this form does not manage (shown, not untickable).
  const [protectedAttendees, setProtectedAttendees] = useState<Map<string, string>>(new Map());
  // The stored meeting instant and how it was shown; an unchanged field saves
  // the stored instant back as-is (a wall time in the repeated DST hour has
  // two instants, so converting it back could move the meeting).
  const loadedMeetingDateRef = useRef<{ local: string; iso: string } | null>(null);
  // One save at a time across "Guardar borrador", submit and "Finalizar".
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // SM-H8: problems from the last save attempt. `showItemChecks` turns on the
  // live per-item messages after the first blocked save.
  const [saveProblems, setSaveProblems] = useState<SaveProblem[]>([]);
  const [showItemChecks, setShowItemChecks] = useState(false);
  // Scroll container of the step body; reset to the top on every step change
  // so step 3 opens at "Documentos", not where step 2 was scrolled to.
  const stepBodyRef = useRef<HTMLDivElement | null>(null);

  // Existing attachments loaded from the database (edit mode)
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<ExistingAttachment[]>([]);

  // Document upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  useEffect(() => {
    if (isOpen) {
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

  // Candidate list shared by Asistentes, Compromisos and Tareas. The ONLY
  // source is the access-controlled members endpoint for the exact community
  // the parent workspace passed in. It fails closed: any failure leaves the
  // list empty, flips the state to `error` and shows one toast — never a
  // browser-side `profiles` / `user_roles` / `community_workspaces` query.
  // The controller aborts the in-flight request on close/unmount and the
  // `active` flag guarantees a late settlement can neither touch state nor
  // toast. A community switch is not coordinated here on purpose: the parent
  // clears its workspace and unmounts this modal, which runs this cleanup.
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    let active = true;

    setAvailableUsers([]);
    setMembersLoadState('loading');

    fetchCommunityMembers(communityId, { signal: controller.signal })
      .then((members) => {
        if (!active) return;
        setAvailableUsers(toAssignmentUsers(members));
        setMembersLoadState('success');
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        console.error('Error loading community members:', error);
        setAvailableUsers([]);
        setMembersLoadState('error');
        toast.error(MEMBERS_LOAD_ERROR_MESSAGE, { id: MEMBERS_LOAD_ERROR_TOAST_ID });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen, communityId]);

  // Tick the "Guardado hace Ns" relative label so it stays fresh while the
  // modal is open. Cheap — just bumps a counter every 10s.
  useEffect(() => {
    if (!isOpen || !lastSavedAt) return;
    const interval = setInterval(() => setSavedTick((t) => t + 1), SAVED_TICK_INTERVAL_MS);
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
      if (workSessionEndedRef.current) return;
      workSessionEndedRef.current = true;
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

  const loadMeetingData = async () => {
    if (!meetingId) return;
    
    try {
      setLoadingMeeting(true);
      const meetingDetails = await getMeetingDetails(meetingId);
      
      if (meetingDetails) {
        // Extract attendee IDs from the attendees array
        const attendeeIds = meetingDetails.attendees?.map(attendee => attendee.user_id) || [];
        const participantRoles = new Map<string, string | null>(
          (meetingDetails.attendees || []).map((attendee) => [attendee.user_id, attendee.role ?? null])
        );
        const { data: grantRows } = await supabase
          .from('meeting_read_grants')
          .select('user_id')
          .eq('meeting_id', meetingId);
        const readerIds = (grantRows || []).map((row: { user_id: string }) => row.user_id);
        peopleBaselineRef.current = { participants: participantRoles, readerIds: new Set(readerIds) };
        setProtectedAttendees(
          new Map(
            Array.from(participantRoles.entries())
              .filter(([, role]) => PROTECTED_ATTENDEE_ROLES.has(role ?? ''))
              .map(([id, role]) => [id, role as string])
          )
        );
        const meetingDateLocal = toDatetimeLocalValue(meetingDetails.meeting_date);
        loadedMeetingDateRef.current = { local: meetingDateLocal, iso: new Date(meetingDetails.meeting_date).toISOString() };

        const loadedAgreements = (meetingDetails.agreements || []).map(a => ({
          id: a.id,
          client_key: nextItemKey(),
          agreement_text: a.agreement_text || '',
          agreement_doc: docOrFromText(a.agreement_doc, a.agreement_text),
          category: a.category,
        }));
        const loadedCommitments = (meetingDetails.commitments || []).map(c => ({
          id: c.id,
          client_key: nextItemKey(),
          commitment_text: c.commitment_text || '',
          commitment_doc: docOrFromText(c.commitment_doc, c.commitment_text),
          assigned_to: c.assigned_to,
          due_date: c.due_date || '',
        }));
        const loadedTasks = (meetingDetails.tasks || []).map(t => ({
          id: t.id,
          client_key: nextItemKey(),
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
            meeting_date: meetingDateLocal,
            duration_minutes: meetingDetails.duration_minutes,
            location: meetingDetails.location || '',
            attendee_ids: attendeeIds,
            reader_ids: readerIds
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
        setMeetingVersion((meetingDetails as any).version ?? 0);
        if ((meetingDetails as any).updated_at) {
          setLastSavedAt(new Date((meetingDetails as any).updated_at));
        }

        // Timeline banner source: active work sessions for this meeting.
        if (meetingDetails.status === MEETING_STATUS.BORRADOR) {
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
        .select('id, user_id, started_at, last_heartbeat_at')
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
          last_heartbeat_at: s.last_heartbeat_at ?? null,
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
        workSessionEndedRef.current = false;
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

  useEffect(() => {
    if (stepBodyRef.current) stepBodyRef.current.scrollTop = 0;
  }, [currentStep]);

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
        setSavingIndicator('error');
        // Both codes mean "the server already considers the draft closed —
        // reload unconditionally." They differ only in the UX copy. The
        // server exposes the sentinel via `body.code`; `body.error` holds
        // the Spanish user-facing message and MUST NOT be branched on.
        if (
          body?.code === 'meeting_finalized_concurrently' ||
          body?.code === 'meeting_not_draft'
        ) {
          if (typeof window !== 'undefined') {
            const msg =
              body.code === 'meeting_finalized_concurrently'
                ? 'Esta reunión fue finalizada mientras editabas. Recargando…'
                : 'Esta reunión ya no está en borrador. Recargando…';
            window.alert(msg);
          }
          await loadMeetingData();
          return;
        }
        const who = body?.updated_by_name ? ` por ${body.updated_by_name}` : '';
        const shouldReload = typeof window !== 'undefined' && window.confirm(
          `Esta reunión fue modificada${who} mientras editabas. ` +
            '¿Recargar para ver los últimos cambios? Se perderán los cambios locales no guardados.'
        );
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
        workSessionEndedRef.current = false;
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
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [currentMeetingId, runAutosave]);

  const handleClose = () => {
    if (isSubmitting || isSavingDraft || saveInFlightRef.current) return;

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
        attendee_ids: [],
        reader_ids: []
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
    peopleBaselineRef.current = { participants: new Map(), readerIds: new Set() };
    setProtectedAttendees(new Map());
    loadedMeetingDateRef.current = null;
    setSaveProblems([]);
    setShowItemChecks(false);
    setExistingAttachments([]);
    setAttachmentsToDelete([]);
    setSelectedFiles([]);
    setCurrentMeetingId(meetingId ?? null);
    setWorkSessionId(null);
    setMeetingVersion(0);
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
  // Shared persistence path used by both "Guardar borrador" (no validation,
  // forces status='borrador') and the final submit (step validation, keeps
  // the form's current status). Keeps agreement/commitment/task diff upserts
  // and attachment add/remove in one place so a draft save from step 1 or 2
  // cannot drop step-3 content.
  const persistMeetingData = async ({
    status,
    runValidations,
  }: {
    status?: MeetingStatus;
    runValidations: boolean;
  }): Promise<{ success: boolean; meetingId?: string; version?: number }> => {
    if (runValidations && !validateStep(currentStep)) {
      toast.error('Por favor completa los campos requeridos');
      return { success: false };
    }
    const loadedDate = loadedMeetingDateRef.current;
    const meetingDateIso =
      loadedDate && formData.meeting_info.meeting_date === loadedDate.local
        ? loadedDate.iso
        : datetimeLocalToIso(formData.meeting_info.meeting_date);
    if (!formData.meeting_info.title || !meetingDateIso) {
      toast.error('Título y fecha son requeridos');
      return { success: false };
    }

    // SM-H8: block the save while an item is incomplete (owner rule: text,
    // a participant as assignee and a due date) instead of letting the
    // database reject it out of sight.
    const itemProblems = validateMeetingItems(formData);
    if (itemProblems.length > 0) {
      setShowItemChecks(true);
      setSaveProblems([]);
      setCurrentStep(MeetingFormStep.AGREEMENTS);
      toast.error(saveFailureSummary(itemProblems));
      return { success: false };
    }

    const effectiveStatus: MeetingStatus = status ?? formData.summary_info.status;
    const docs = deriveMeetingDocs(formData);
    // Which form item each saved row belongs to, as the form was when the save started.
    const savedKeys = {
      agreements: formData.agreements.map((item) => item.client_key),
      commitments: formData.commitments.map((item) => item.client_key),
      tasks: formData.tasks.map((item) => item.client_key),
    };
    const problems: SaveProblem[] = [];
    let createdVersion: number | undefined;

    let targetMeetingId = currentMeetingId;
    if (targetMeetingId) {
      const updateResult = await updateMeeting(targetMeetingId, {
        title: formData.meeting_info.title,
        meeting_date: meetingDateIso,
        duration_minutes: formData.meeting_info.duration_minutes,
        location: formData.meeting_info.location,
        summary: docs.summaryText,
        summary_doc: docs.summaryDoc,
        notes: docs.notesText,
        notes_doc: docs.notesDoc,
        status: effectiveStatus,
      });
      if (!updateResult.success) {
        problems.push(describeSaveError(updateResult.error, 'meeting'));
      }
    } else {
      const row = await insertMeetingRow(supabase, {
        workspaceId,
        userId,
        title: formData.meeting_info.title,
        meetingDate: meetingDateIso,
        durationMinutes: formData.meeting_info.duration_minutes,
        location: formData.meeting_info.location,
        summary: docs.summaryText,
        summaryDoc: docs.summaryDoc,
        notes: docs.notesText,
        notesDoc: docs.notesDoc,
        status: effectiveStatus,
      });
      if (row.meetingId) {
        // From here on a retry UPDATES this meeting; it never creates a second one.
        targetMeetingId = row.meetingId;
        createdVersion = row.version ?? 0;
        setCurrentMeetingId(row.meetingId);
        setMeetingVersion(createdVersion);
      } else if (row.problem) {
        problems.push(row.problem);
      }
    }

    if (!targetMeetingId || problems.length > 0) {
      setSaveProblems(problems);
      toast.error(saveFailureSummary(problems) || 'No se pudo guardar la reunión.');
      return { success: false, meetingId: targetMeetingId ?? undefined };
    }
    const savedMeetingId = targetMeetingId;

    // Participants and readers: diff against what is stored NOW (a retry
    // after a partial failure neither re-inserts nor forgets a removal), and
    // never write when the stored state cannot be read.
    const before = await readMeetingPeople(supabase, savedMeetingId);
    if (before.people) {
      problems.push(
        ...(await syncMeetingPeople(supabase, savedMeetingId, {
          actorId: userId,
          participantIds: formData.meeting_info.attendee_ids,
          readerIds: formData.meeting_info.reader_ids ?? [],
          baseline: peopleBaselineRef.current,
          current: before.people,
        })),
      );
      const after = await readMeetingPeople(supabase, savedMeetingId);
      if (after.people) {
        // What the form now shows is the baseline for the next save; people
        // someone else added meanwhile stay out of it (they are not removed).
        const formPeople = new Set([...formData.meeting_info.attendee_ids, ...(formData.meeting_info.reader_ids ?? [])]);
        peopleBaselineRef.current = {
          participants: new Map(Array.from(after.people.participants.entries()).filter(([id]) => formPeople.has(id))),
          readerIds: new Set(Array.from(after.people.readerIds).filter((id) => formPeople.has(id))),
        };
      } else if (after.problem) {
        problems.push(after.problem);
      }
    } else if (before.problem) {
      problems.push(before.problem);
    }

    const items = await applyMeetingDiffs(supabase, savedMeetingId, docs, {
      agreements: originalAgreementIdsRef.current,
      commitments: originalCommitmentIdsRef.current,
      tasks: originalTaskIdsRef.current,
    });
    problems.push(...items.problems);
    adoptSavedItemIds(items.ids, items.problems, savedKeys);

    const pendingRemovals = attachmentsToDelete;
    const removal = await removeDeletedAttachments(supabase, pendingRemovals);
    problems.push(...removal.problems);
    setAttachmentsToDelete((prev) =>
      prev.filter((attachment) => !pendingRemovals.includes(attachment) || removal.remaining.includes(attachment))
    );

    const upload = await uploadSelectedAttachments(supabase, uploadFile, {
      meetingId: savedMeetingId,
      workspaceId,
      userId,
      files: selectedFiles,
    });
    problems.push(...upload.problems);
    if (upload.uploaded.length > 0) {
      setSelectedFiles((prev) => prev.filter((file) => !upload.uploaded.includes(file)));
    }

    setSaveProblems(problems);
    if (problems.length > 0) {
      toast.error(saveFailureSummary(problems));
      return { success: false, meetingId: savedMeetingId, version: createdVersion };
    }

    return { success: true, meetingId: savedMeetingId, version: createdVersion };
  };

  // Put the ids of the rows a save wrote onto the items they belong to (by
  // client_key, not position, so removals/reorders during the save are safe).
  // Every written id joins the originals, so a row whose item was removed while
  // the save ran is deleted by the next save; removed rows stay in the
  // originals when their delete failed, so a retry deletes them again.
  const adoptSavedItemIds = (
    ids: MeetingItemIds,
    itemProblems: SaveProblem[],
    savedKeys: { agreements: Array<string | undefined>; commitments: Array<string | undefined>; tasks: Array<string | undefined> },
  ) => {
    const failedDelete = (kind: SaveProblem['kind']) =>
      itemProblems.some((problem) => problem.kind === kind && problem.index === undefined);
    const nextOriginals = (previous: Set<string>, saved: Array<string | undefined>, kind: SaveProblem['kind']) => {
      const next = new Set(saved.filter((id): id is string => !!id));
      if (failedDelete(kind)) previous.forEach((id) => next.add(id));
      return next;
    };
    originalAgreementIdsRef.current = nextOriginals(originalAgreementIdsRef.current, ids.agreements, 'agreement');
    originalCommitmentIdsRef.current = nextOriginals(originalCommitmentIdsRef.current, ids.commitments, 'commitment');
    originalTaskIdsRef.current = nextOriginals(originalTaskIdsRef.current, ids.tasks, 'task');
    const byKey = (keys: Array<string | undefined>, saved: Array<string | undefined>) => {
      const map = new Map<string, string>();
      keys.forEach((key, i) => {
        if (key && saved[i]) map.set(key, saved[i] as string);
      });
      return map;
    };
    const agreementIds = byKey(savedKeys.agreements, ids.agreements);
    const commitmentIds = byKey(savedKeys.commitments, ids.commitments);
    const taskIds = byKey(savedKeys.tasks, ids.tasks);
    setFormData((prev) => ({
      ...prev,
      agreements: prev.agreements.map((item) => ({ ...item, id: (item.client_key && agreementIds.get(item.client_key)) || item.id })),
      commitments: prev.commitments.map((item) => ({ ...item, id: (item.client_key && commitmentIds.get(item.client_key)) || item.id })),
      tasks: prev.tasks.map((item) => ({ ...item, id: (item.client_key && taskIds.get(item.client_key)) || item.id })),
    }));
  };

  const handleSaveDraft = async () => {
    if (isSavingDraft || isSubmitting || saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    setIsSavingDraft(true);
    try {
      const { success, meetingId: savedId, version: savedVersion } = await persistMeetingData({
        status: MEETING_STATUS.BORRADOR,
        runValidations: false,
      });
      if (!success || !mountedRef.current) return;

      // First-save-from-create transitioned us from no-id → id; spin up the
      // work-session so subsequent autosaves have a session to heartbeat on.
      // Seed the version state with the authoritative value returned from the
      // create call; the DB default is 0, not 1, so hardcoding 1 here would
      // cause the very next autosave to 409 with "updated by another user".
      if (savedId && !workSessionId) {
        if (!currentMeetingId) setMeetingVersion(savedVersion ?? 0);
        await startWorkSession(savedId);
        await loadWorkSessions(savedId);
      }

      updateSummaryInfo('status', MEETING_STATUS.BORRADOR);
      setLastSavedAt(new Date());
      setSavingIndicator('idle');
      toast.success('Borrador guardado');
      (onDraftSaved ?? onSuccess)();
    } catch (err) {
      console.error('Error saving draft:', err);
      toast.error('Error inesperado al guardar el borrador');
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) setIsSavingDraft(false);
    }
  };

  // Edit mode "Finalizar reunión": everything in the form is saved first;
  // the dialog opens only when every write succeeded (SM-H8).
  const handleOpenFinalize = async () => {
    if (isSavingDraft || isSubmitting || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSavingDraft(true);
    try {
      const { success } = await persistMeetingData({ runValidations: false });
      if (success && mountedRef.current) {
        setLastSavedAt(new Date());
        setFinalizeOpen(true);
      }
    } catch (err) {
      console.error('Error saving before finalize:', err);
      toast.error('No se pudo guardar la reunión antes de finalizarla.');
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) setIsSavingDraft(false);
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
    if (isSubmitting || isSavingDraft || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSubmitting(true);
    setUploadingFiles(true);
    let saved = false;
    try {
      const { success } = await persistMeetingData({ runValidations: true });
      saved = success;
    } catch (error) {
      console.error('Error submitting meeting:', error);
      toast.error(`Error inesperado al ${mode === 'edit' ? 'actualizar' : 'crear'} la reunión`);
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) {
        setIsSubmitting(false);
        setUploadingFiles(false);
      }
    }
    if (saved && mountedRef.current) {
      toast.success(mode === 'edit' ? 'Reunión actualizada correctamente' : 'Reunión documentada correctamente');
      onSuccess();
      onClose();
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
        { client_key: nextItemKey(), agreement_text: '', category: '' }
      ]
    }));
  };

  const updateAgreement = <K extends keyof MeetingAgreementInput>(
    index: number,
    field: K,
    value: MeetingAgreementInput[K]
  ) => {
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
        { client_key: nextItemKey(), commitment_text: '', commitment_doc: emptyDoc(), assigned_to: '', due_date: '' }
      ]
    }));
  };

  const updateCommitment = <K extends keyof MeetingCommitmentInput>(
    index: number,
    field: K,
    value: MeetingCommitmentInput[K]
  ) => {
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
          client_key: nextItemKey(),
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

  const updateTask = <K extends keyof MeetingTaskInput>(
    index: number,
    field: K,
    value: MeetingTaskInput[K]
  ) => {
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
      if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type)) {
        toast.error(`Tipo de archivo no permitido: ${file.name}`);
        return false;
      }

      // Validate file size against the module-level cap so the toast copy
      // and the numeric limit cannot drift apart.
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`Archivo demasiado grande: ${file.name}. Máximo ${MAX_ATTACHMENT_LABEL}.`);
        return false;
      }

      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ---- Community-scoped picker helpers --------------------------------------

  const isCandidate = (id: string) => availableUsers.some((user) => user.id === id);

  // Saved commitments/tasks may reference someone who is not (or is no longer)
  // a member. Preserve that id with a record-local, disabled option so an
  // unchanged save keeps it and an explicit reassignment can replace it. The
  // label stays neutral until the members request has SUCCEEDED; only then do
  // we say the person is outside the community. Returns null when the assignee
  // is empty or a current candidate, i.e. no synthetic option is needed.
  // SM-H8: compromisos and tareas may only go to the meeting's participants.
  const participantIdSet = new Set(formData.meeting_info.attendee_ids);
  const participantOptions = availableUsers.filter((user) => participantIdSet.has(user.id));

  // Any saved assignee who is not a selectable option (a participant who is
  // also a current member) keeps a record-local, disabled option.
  const historicalAssigneeLabel = (assignedTo: string): string | null => {
    if (!assignedTo || participantOptions.some((user) => user.id === assignedTo)) return null;
    const member = availableUsers.find((user) => user.id === assignedTo);
    if (member) return `${profileName(member, 'Usuario sin nombre')} (no es participante)`;
    if (membersLoadState === 'success') return 'Usuario fuera de la comunidad';
    if (membersLoadState === 'error') return 'No se pudo verificar la membresía';
    return 'Verificando membresía…';
  };

  const renderHistoricalAssigneeOption = (assignedTo: string) => {
    const label = historicalAssigneeLabel(assignedTo);
    if (!label) return null;
    return (
      <option value={assignedTo} disabled data-testid="meeting-historical-assignee">
        {label}
      </option>
    );
  };

  // Saved attendees absent from the candidate list render as read-only
  // historical rows once the load has succeeded. They are never added to
  // `availableUsers`, so they cannot be picked for any other record.
  const historicalAttendeeIds =
    membersLoadState === 'success'
      ? formData.meeting_info.attendee_ids.filter((id) => !isCandidate(id))
      : [];

  // Nothing can be chosen until the request settles.
  const assigneePickerDisabled = membersLoadState === 'idle' || membersLoadState === 'loading';

  // Live per-item checks (after the first blocked save) plus what the last
  // save attempt reported for each item.
  const liveItemProblems = showItemChecks ? validateMeetingItems(formData) : [];
  const renderItemMessages = (kind: SaveProblem['kind'], index: number, field?: SaveItemField) => {
    const messages = [...liveItemProblems, ...saveProblems].filter(
      (problem) => problem.kind === kind && problem.index === index && (field === undefined || problem.field === field)
    );
    if (messages.length === 0) return null;
    return (
      <ul className="mt-2 space-y-1" data-testid={`meeting-${kind}-${index}-errors`}>
        {messages.map((problem, i) => (
          <li key={i} className="text-sm text-red-600">{problem.message}</li>
        ))}
      </ul>
    );
  };
  const meetingLevelProblems = saveProblems.filter((problem) => problem.index === undefined);
  const renderNoParticipantsHint = (scope: string) =>
    membersLoadState === 'success' && participantOptions.length === 0 ? (
      <p className="text-sm text-amber-800" data-testid={`meeting-no-participants-${scope}`}>
        Marca primero a los participantes en el paso 1 (Información): solo a ellos se les puede asignar.
      </p>
    ) : null;

  // Owner decision 5: unticking a participant who still has compromisos or
  // tareas shows a warning here; the save stays blocked until they are
  // reassigned (validateMeetingItems).
  const assigneesNotParticipating = Array.from(
    new Set(
      [...formData.commitments, ...formData.tasks]
        .map((item) => item.assigned_to)
        .filter((id): id is string => !!id && !participantIdSet.has(id))
    )
  ).map((id) => {
    const member = availableUsers.find((user) => user.id === id);
    return {
      id,
      name: member ? profileName(member, 'Usuario sin nombre') : 'Una persona',
      commitments: formData.commitments.filter((c) => c.assigned_to === id).length,
      tasks: formData.tasks.filter((t) => t.assigned_to === id).length,
    };
  });

  // People an editor adds as readers: community members who are not participants.
  const readerCandidates = availableUsers.filter((user) => !participantIdSet.has(user.id));
  const readerIds = formData.meeting_info.reader_ids ?? [];

  const renderMembersStatus = (scope: string) => {
    if (membersLoadState === 'idle' || membersLoadState === 'loading') {
      return (
        <p className="text-sm text-gray-500" data-testid={`meeting-members-status-${scope}`} data-state="loading">
          Cargando miembros de la comunidad…
        </p>
      );
    }
    if (membersLoadState === 'error') {
      return (
        <p className="text-sm text-red-600" data-testid={`meeting-members-status-${scope}`} data-state="error">
          No se pudieron cargar los miembros de la comunidad.
        </p>
      );
    }
    if (availableUsers.length === 0) {
      return (
        <p className="text-sm text-gray-500" data-testid={`meeting-members-status-${scope}`} data-state="empty">
          Esta comunidad aún no tiene miembros asignados.
        </p>
      );
    }
    return null;
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
              <h2 className="text-xl font-semibold text-brand_primary">
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
          {formData.summary_info.status === MEETING_STATUS.BORRADOR && (
            <WorkSessionBanner sessions={workSessions} />
          )}

          {/* Progress Steps */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    currentStep >= step.id 
                      ? 'bg-brand_accent text-brand_primary' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {currentStep > step.id ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className={`ml-2 text-sm font-medium ${
                    currentStep >= step.id ? 'text-brand_primary' : 'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                  {index < STEPS.length - 1 && (
                    <div className={`mx-4 h-px w-12 ${
                      currentStep > step.id ? 'bg-brand_accent' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div ref={stepBodyRef} className="p-6 max-h-96 overflow-y-auto" data-testid="meeting-step-body">
            {loadingMeeting ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand_accent"></div>
              </div>
            ) : (
              <>
                {meetingLevelProblems.length > 0 && (
                  <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3" data-testid="meeting-save-problems">
                    <p className="text-sm font-medium text-red-800">No se guardó todo:</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-red-700">
                      {meetingLevelProblems.map((problem, i) => (
                        <li key={i}>{problem.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  />
                </div>

                {/* Attendees */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Asistentes
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-3">
                    {renderMembersStatus('attendees')}
                    {availableUsers.map(user => (
                      <label key={user.id} className="flex items-center">
                        <input
                          type="checkbox"
                          data-testid={`meeting-attendee-${user.id}`}
                          checked={formData.meeting_info.attendee_ids.includes(user.id)}
                          // A facilitator, secretary or co-editor row is not managed
                          // here; it stays a participant (SM-H8).
                          disabled={protectedAttendees.has(user.id)}
                          onChange={(e) => {
                            const attendeeIds = e.target.checked
                              ? [...formData.meeting_info.attendee_ids, user.id]
                              : formData.meeting_info.attendee_ids.filter(id => id !== user.id);
                            updateMeetingInfo('attendee_ids', attendeeIds);
                          }}
                          className="h-4 w-4 text-brand_accent focus:ring-brand_accent border-gray-300 rounded disabled:opacity-60"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          {profileName(user, 'Usuario sin nombre')}
                          {protectedAttendees.has(user.id) && (
                            <span className="ml-1 text-xs text-gray-500">
                              ({PROTECTED_ROLE_LABELS[protectedAttendees.get(user.id) as string]})
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                    {historicalAttendeeIds.map(attendeeId => (
                      <label
                        key={`historical-${attendeeId}`}
                        className="flex items-center text-gray-500"
                        data-testid={`meeting-attendee-historical-${attendeeId}`}
                      >
                        <input
                          type="checkbox"
                          checked
                          disabled
                          readOnly
                          className="h-4 w-4 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm">Usuario fuera de la comunidad</span>
                      </label>
                    ))}
                  </div>
                  {assigneesNotParticipating.length > 0 && (
                    <div
                      className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                      data-testid="meeting-assignee-not-participant-warning"
                    >
                      {assigneesNotParticipating.map((person) => (
                        <p key={person.id}>
                          {person.name} ya no es participante, pero tiene
                          {person.commitments > 0 && ` ${person.commitments} compromiso${person.commitments === 1 ? '' : 's'}`}
                          {person.commitments > 0 && person.tasks > 0 && ' y'}
                          {person.tasks > 0 && ` ${person.tasks} tarea${person.tasks === 1 ? '' : 's'}`} asignad{person.commitments + person.tasks === 1 ? 'o' : 'os'}.
                          Vuelve a marcarla o reasigna en el paso 3 antes de guardar.
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* People added as readers (SM-H8) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Otras personas con acceso
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Por ejemplo, alguien que no pudo asistir. Podrán ver los acuerdos, compromisos, tareas y documentos de esta reunión.
                  </p>
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-3" data-testid="meeting-readers">
                    {renderMembersStatus('readers')}
                    {membersLoadState === 'success' && availableUsers.length > 0 && readerCandidates.length === 0 && (
                      <p className="text-sm text-gray-500">Todos los miembros de la comunidad son participantes.</p>
                    )}
                    {readerCandidates.map(user => (
                      <label key={user.id} className="flex items-center">
                        <input
                          type="checkbox"
                          data-testid={`meeting-reader-${user.id}`}
                          checked={readerIds.includes(user.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...readerIds, user.id]
                              : readerIds.filter(id => id !== user.id);
                            updateMeetingInfo('reader_ids', next);
                          }}
                          className="h-4 w-4 text-brand_accent focus:ring-brand_accent border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          {profileName(user, 'Usuario sin nombre')}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
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
                        <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-brand_accent hover:text-brand_accent/80 focus-within:outline-none">
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
                        PDF, Word, Excel, PowerPoint, o imágenes hasta {MAX_ATTACHMENT_LABEL}
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
                          <AttachmentRow
                            key={attachment.id}
                            filename={attachment.filename}
                            fileType={attachment.file_type}
                            // Preserve the pre-extraction "0 Bytes" rendering for
                            // legacy rows with a null file_size column. The new
                            // helper returns '' for null so the UI label would
                            // otherwise vanish.
                            fileSize={attachment.file_size ?? 0}
                            variant="existing"
                            onRemove={() => {
                              setExistingAttachments(prev => prev.filter(a => a.id !== attachment.id));
                              setAttachmentsToDelete(prev => [...prev, attachment]);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedFiles.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Archivos seleccionados ({selectedFiles.length})</h4>
                      <div className="space-y-2">
                        {selectedFiles.map((file, index) => (
                          <AttachmentRow
                            key={index}
                            filename={file.name}
                            fileType={file.type}
                            fileSize={file.size}
                            variant="selected"
                            onRemove={() => removeFile(index)}
                          />
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
                      className="inline-flex items-center px-3 py-2 bg-brand_accent text-brand_primary text-sm rounded-lg hover:bg-brand_accent/90 transition-colors duration-200"
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
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-brand_accent text-brand_primary text-sm font-bold rounded-full">
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
                          {renderItemMessages('agreement', index)}
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
                      className="inline-flex items-center px-3 py-2 bg-brand_accent text-brand_primary text-sm rounded-lg hover:bg-brand_accent/90 transition-colors duration-200"
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
                      {renderMembersStatus('commitments')}
                      {renderNoParticipantsHint('commitments')}
                      {formData.commitments.map((commitment, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-brand_accent text-brand_primary text-sm font-bold rounded-full">
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
                              onChange={(json) => {
                                updateCommitment(index, 'commitment_doc', json as any);
                                updateCommitment(index, 'commitment_text', plainTextFromDoc(json));
                              }}
                              minHeight={80}
                              placeholder="Describe el compromiso…"
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <select
                                value={commitment.assigned_to}
                                onChange={(e) => updateCommitment(index, 'assigned_to', e.target.value)}
                                disabled={assigneePickerDisabled}
                                data-testid={`meeting-commitment-assignee-${index}`}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent disabled:bg-gray-100"
                              >
                                <option value="">Asignar a…</option>
                                {renderHistoricalAssigneeOption(commitment.assigned_to)}
                                {participantOptions.map(user => (
                                  <option key={user.id} value={user.id}>
                                    {profileName(user, 'Usuario sin nombre')}
                                  </option>
                                ))}
                              </select>
                              
                              <input
                                type="date"
                                value={commitment.due_date}
                                onChange={(e) => updateCommitment(index, 'due_date', e.target.value)}
                                aria-label="Fecha límite del compromiso"
                                data-testid={`meeting-commitment-due-${index}`}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                              />
                            </div>
                            {renderItemMessages('commitment', index)}
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
                      className="inline-flex items-center px-3 py-2 bg-brand_accent text-brand_primary text-sm rounded-lg hover:bg-brand_accent/90 transition-colors duration-200"
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
                      {renderMembersStatus('tasks')}
                      {renderNoParticipantsHint('tasks')}
                      {formData.tasks.map((task, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-green-500 text-white text-sm font-bold rounded-full">
                              T{index + 1}
                            </span>
                            <button
                              onClick={() => removeTask(index)}
                              data-testid={`meeting-task-remove-${index}`}
                              aria-label="Eliminar tarea"
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
                              data-testid={`meeting-task-title-${index}`}
                              placeholder="Título de la tarea..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                            />
                            
                            <TipTapEditor
                              initialContent={task.task_description_doc ?? emptyDoc()}
                              onChange={(json) => {
                                updateTask(index, 'task_description_doc', json);
                                updateTask(index, 'task_description', plainTextFromDoc(json));
                              }}
                              minHeight={80}
                              placeholder="Describe la tarea…"
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <select
                                value={task.assigned_to}
                                onChange={(e) => updateTask(index, 'assigned_to', e.target.value)}
                                disabled={assigneePickerDisabled}
                                data-testid={`meeting-task-assignee-${index}`}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent disabled:bg-gray-100"
                              >
                                <option value="">Asignar a…</option>
                                {renderHistoricalAssigneeOption(task.assigned_to)}
                                {participantOptions.map(user => (
                                  <option key={user.id} value={user.id}>
                                    {profileName(user, 'Usuario sin nombre')}
                                  </option>
                                ))}
                              </select>
                              
                              <input
                                type="date"
                                value={task.due_date}
                                onChange={(e) => updateTask(index, 'due_date', e.target.value)}
                                aria-label="Fecha límite de la tarea"
                                data-testid={`meeting-task-due-${index}`}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                              />
                              
                              <select
                                value={task.priority}
                                onChange={(e) => updateTask(index, 'priority', e.target.value as TaskPriority)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
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
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                              />
                              
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={task.estimated_hours || ''}
                                onChange={(e) => updateTask(index, 'estimated_hours', e.target.value ? parseFloat(e.target.value) : undefined)}
                                placeholder="Horas estimadas"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                              />
                            </div>
                            {renderItemMessages('task', index)}
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
          <MeetingModalFooter
            currentStep={currentStep}
            isSubmitting={isSubmitting}
            isSavingDraft={isSavingDraft}
            uploadingFiles={uploadingFiles}
            selectedFileCount={selectedFiles.length}
            mode={mode}
            meetingStatus={formData.summary_info.status}
            meetingId={meetingId}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onSubmit={handleSubmit}
            onClose={handleClose}
            onSaveDraft={handleSaveDraft}
            onOpenFinalize={handleOpenFinalize}
          />

        </div>
      </div>

      {mode === 'edit' && meetingId && (
        <FinalizeMeetingDialog
          open={finalizeOpen}
          onOpenChange={setFinalizeOpen}
          meetingId={meetingId!}
          meetingTitle={formData.meeting_info.title}
          onFinalized={() => { handleClose(); }}
        />
      )}
    </div>
  );
};

export default MeetingDocumentationModal;