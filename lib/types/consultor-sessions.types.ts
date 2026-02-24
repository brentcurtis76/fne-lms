/**
 * Type definitions for Consultor Sessions feature
 * Mirrors the deployed schema from 20260212000000_create_consultor_sessions_schema.sql
 */

// ============================================================
// UNION TYPES (string literal unions, NOT enums)
// ============================================================

export type SessionStatus =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'programada'
  | 'en_progreso'
  | 'pendiente_informe'
  | 'completada'
  | 'cancelada';

export type SessionModality = 'presencial' | 'online' | 'hibrida';

export type MeetingProvider = 'zoom' | 'google_meet' | 'teams' | 'otro';

export type FacilitatorRole = 'consultor_externo' | 'equipo_interno';

export type SessionNotificationType =
  | 'session_created'
  | 'session_reminder_1w'
  | 'session_reminder_2d'
  | 'session_reminder_30m'
  | 'session_reminder_24h'
  | 'session_reminder_1h'
  | 'session_rescheduled'
  | 'session_cancelled'
  | 'materials_uploaded'
  | 'report_shared'
  | 'edit_request_pending'
  | 'edit_request_resolved'
  | 'report_overdue';

export type NotificationChannel = 'in_app' | 'email';

export type NotificationStatus = 'scheduled' | 'sent' | 'failed' | 'cancelled';

export type ReportVisibility = 'facilitators_only' | 'all_participants';

/** Alias for materials and communications that share the same visibility options */
export type ContentVisibility = ReportVisibility;

export type ReportType = 'session_report' | 'planning_notes';

export type ArrivalStatus = 'on_time' | 'late' | 'left_early';

export type EditRequestStatus = 'pending' | 'approved' | 'rejected';

export type ActivityAction =
  | 'created'
  | 'viewed'
  | 'edited'
  | 'status_changed'
  | 'materials_uploaded'
  | 'materials_deleted'
  | 'report_filed'
  | 'report_updated'
  | 'attendance_recorded'
  | 'attendance_updated'
  | 'communication_added'
  | 'edit_requested'
  | 'edit_approved'
  | 'edit_rejected'
  | 'edit_approval_blocked'
  | 'facilitators_updated'
  | 'cancelled'
  | 'finalized';

export type ProgramStatus = 'active' | 'completed' | 'suspended' | 'cancelled';

// ============================================================
// ROW INTERFACES (all 11 tables)
// ============================================================

/**
 * ConsultorSession - Core session table
 * CRITICAL: school_id is number (INTEGER), not string (UUID)
 * scheduled_duration_minutes is a generated column (read-only)
 */
export interface ConsultorSession {
  id: string;
  school_id: number; // INTEGER - matches schools.id
  growth_community_id: string;
  program_enrollment_id: string | null;
  title: string;
  description: string | null;
  objectives: string | null;
  session_date: string; // DATE
  start_time: string; // TIME
  end_time: string; // TIME
  scheduled_duration_minutes: number; // GENERATED COLUMN - read-only
  actual_duration_minutes: number | null;
  modality: SessionModality;
  meeting_link: string | null;
  meeting_provider: MeetingProvider | null;
  location: string | null;
  status: SessionStatus;
  recurrence_rule: string | null;
  recurrence_group_id: string | null;
  session_number: number | null;
  meeting_summary: string | null;
  meeting_transcript: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  // Hour tracking fields (Phase 2) — nullable for backward compatibility with legacy sessions
  hour_type_key: string | null;
  contrato_id: string | null; // UUID
  cancelled_notice_hours: number | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

/**
 * SessionFacilitator - Tracks consultants/staff assigned to sessions
 */
export interface SessionFacilitator {
  id: string;
  session_id: string;
  user_id: string;
  facilitator_role: FacilitatorRole;
  is_lead: boolean;
  created_at: string;
}

/**
 * SessionAttendee - Tracks expected and actual attendance
 */
export interface SessionAttendee {
  id: string;
  session_id: string;
  user_id: string;
  expected: boolean;
  attended: boolean | null;
  marked_by: string | null;
  marked_at: string | null;
  arrival_status: ArrivalStatus | null;
  notes: string | null;
  created_at: string;
}

/**
 * SessionReport - Post-session reports and planning notes
 */
export interface SessionReport {
  id: string;
  session_id: string;
  author_id: string;
  content: string;
  audio_url: string | null;
  transcript: string | null;
  visibility: ReportVisibility;
  report_type: ReportType;
  created_at: string;
  updated_at: string;
}

/**
 * SessionMaterial - Materials uploaded for sessions
 */
export interface SessionMaterial {
  id: string;
  session_id: string;
  uploaded_by: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  description: string | null;
  visibility: ContentVisibility;
  created_at: string;
}

/**
 * SessionCommunication - Session-specific communications
 */
export interface SessionCommunication {
  id: string;
  session_id: string;
  author_id: string;
  content: string;
  visibility: ContentVisibility;
  created_at: string;
  updated_at: string;
}

/**
 * SessionEditRequest - Consultant requests for structural edits
 */
export interface SessionEditRequest {
  id: string;
  session_id: string;
  requested_by: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  reason: string | null;
  status: EditRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

/**
 * SessionEditRequestInsert - Type for creating new edit requests
 */
export type SessionEditRequestInsert = Omit<
  SessionEditRequest,
  'id' | 'created_at' | 'reviewed_by' | 'reviewed_at' | 'review_notes' | 'status'
>;

/**
 * SessionNotification - Scheduled notifications
 */
export interface SessionNotification {
  id: string;
  session_id: string;
  user_id: string;
  notification_type: SessionNotificationType;
  channel: NotificationChannel;
  scheduled_for: string;
  sent_at: string | null;
  status: NotificationStatus;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

/**
 * SessionActivityLog - Audit trail for all session actions
 */
export interface SessionActivityLog {
  id: string;
  session_id: string;
  user_id: string;
  action: ActivityAction;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * ProgramEnrollment - Contracted programs per school per academic year
 * CRITICAL: school_id is number (INTEGER), not string (UUID)
 */
export interface ProgramEnrollment {
  id: string;
  school_id: number; // INTEGER - matches schools.id
  program_type: string;
  program_year: number;
  academic_year: string;
  start_date: string;
  end_date: string;
  contracted_hours: number;
  status: ProgramStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * ProgramHoursLedger - Tracks program hours consumed per session
 */
export interface ProgramHoursLedger {
  id: string;
  program_enrollment_id: string;
  session_id: string;
  hours_consumed: number;
  recorded_at: string;
  recorded_by: string;
  notes: string | null;
}

// ============================================================
// INSERT TYPES (for API use)
// ============================================================

/**
 * ConsultorSessionInsert - Type for creating new sessions
 * Omits auto-generated fields and approval/lifecycle timestamps
 */
export type ConsultorSessionInsert = Omit<
  ConsultorSession,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'scheduled_duration_minutes'
  | 'approved_by'
  | 'approved_at'
  | 'finalized_by'
  | 'finalized_at'
  | 'cancelled_by'
  | 'cancelled_at'
  | 'is_active'
  | 'cancelled_notice_hours'
  | 'hour_type_key'
  | 'contrato_id'
> & {
  description?: string | null;
  objectives?: string | null;
  meeting_link?: string | null;
  meeting_provider?: MeetingProvider | null;
  location?: string | null;
  recurrence_rule?: string | null;
  recurrence_group_id?: string | null;
  session_number?: number | null;
  meeting_summary?: string | null;
  meeting_transcript?: string | null;
  program_enrollment_id?: string | null;
  cancellation_reason?: string | null;
  // Hour tracking fields — optional for backward compatibility with legacy sessions
  hour_type_key?: string | null;
  contrato_id?: string | null;
};

/**
 * SessionFacilitatorInsert - Type for assigning facilitators
 */
export type SessionFacilitatorInsert = Omit<SessionFacilitator, 'id' | 'created_at'>;

/**
 * SessionActivityLogInsert - Type for activity log entries
 */
export type SessionActivityLogInsert = Omit<SessionActivityLog, 'id' | 'created_at'>;

/**
 * SessionAttendeeInsert - Type for creating new attendee records
 */
export type SessionAttendeeInsert = Omit<SessionAttendee, 'id' | 'created_at'>;

/**
 * SessionReportInsert - Type for creating new session reports
 */
export type SessionReportInsert = Omit<SessionReport, 'id' | 'created_at' | 'updated_at'>;

/**
 * SessionMaterialInsert - Type for creating new session materials
 */
export type SessionMaterialInsert = Omit<SessionMaterial, 'id' | 'created_at'>;

/**
 * AttendanceUpdatePayload - Type for bulk attendance updates
 */
export interface AttendanceUpdatePayload {
  user_id: string;
  attended: boolean;
  arrival_status?: ArrivalStatus;
  notes?: string;
}

// ============================================================
// COMPOSITE RESPONSE TYPES
// ============================================================

/**
 * SessionWithRelations - Full session data with all relations
 */
export interface SessionWithRelations extends ConsultorSession {
  facilitators: (SessionFacilitator & { profiles?: { id: string; first_name: string; last_name: string; email: string } })[];
  attendees: (SessionAttendee & { profiles?: { first_name: string; last_name: string; email: string } })[];
  reports: SessionReport[];
  materials: SessionMaterial[];
  communications: SessionCommunication[];
  activity_log?: (SessionActivityLog & { profiles?: { first_name: string; last_name: string } })[];
  edit_requests?: (SessionEditRequest & { profiles?: { first_name: string; last_name: string } })[];
  schools?: { name: string };
  growth_communities?: { name: string };
}

/**
 * SessionListItem - Subset of session fields for list views
 */
export interface SessionListItem {
  id: string;
  school_id: number;
  growth_community_id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  scheduled_duration_minutes: number;
  modality: SessionModality;
  status: SessionStatus;
  created_at: string;
  facilitators: SessionFacilitator[];
  school_name: string;
  growth_community_name: string;
  lead_facilitator_name: string;
}

// ============================================================
// FIELD CLASSIFICATION CONSTANTS
// ============================================================

/**
 * Structural fields that consultants CANNOT modify without admin approval
 */
export const STRUCTURAL_FIELDS = [
  'session_date',
  'start_time',
  'end_time',
  'growth_community_id',
  'school_id',
  'modality',
  'status',
] as const;

/**
 * Non-structural fields that consultants CAN modify directly
 */
export const NON_STRUCTURAL_FIELDS = [
  'title',
  'description',
  'objectives',
  'meeting_link',
  'meeting_provider',
  'location',
  'meeting_summary',
  'meeting_transcript',
] as const;

// ============================================================
// RECURRENCE TYPES
// ============================================================

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface RecurrencePattern {
  frequency: RecurrenceFrequency;
  count?: number;       // Required for weekly/biweekly/monthly (2-52)
  dates?: string[];     // Required for custom (YYYY-MM-DD format)
}

/**
 * SessionListItemWithSeries - List item extended with series information
 */
export interface SessionListItemWithSeries extends SessionListItem {
  recurrence_group_id: string | null;
  session_number: number | null;
  total_in_series?: number;
}
