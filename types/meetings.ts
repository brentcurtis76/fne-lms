/**
 * Meeting System Types for Genera
 * Complete type definitions for the meeting documentation system
 */

// Enums matching database types
export type MeetingStatus = 'borrador' | 'programada' | 'en_progreso' | 'completada' | 'cancelada' | 'pospuesta';
export type TaskStatus = 'pendiente' | 'en_progreso' | 'completado' | 'vencido' | 'cancelado';
export type TaskPriority = 'baja' | 'media' | 'alta' | 'critica';
export type AttendanceStatus = 'invited' | 'confirmed' | 'attended' | 'absent' | 'late';
export type AttendeeRole = 'facilitator' | 'secretary' | 'participant' | 'observer' | 'co_editor';
export type FinalizeAudience = 'community' | 'attended';

// Core meeting interface
export interface CommunityMeeting {
  id: string;
  workspace_id: string;
  title: string;
  description?: string;
  meeting_date: string;
  duration_minutes: number;
  location?: string;
  status: MeetingStatus;
  summary?: string;
  summary_doc?: any;
  notes?: string;
  notes_doc?: any;
  
  // Management
  created_by: string;
  facilitator_id?: string;
  secretary_id?: string;
  
  // Metadata
  is_active: boolean;
  created_at: string;
  updated_at: string;
  started_at?: string;
  version: number;
  updated_by?: string;
  finalized_at?: string | null;
  finalized_by?: string | null;
  finalize_audience?: FinalizeAudience | null;
  
  // Related data (populated via joins)
  workspace?: {
    id: string;
    name: string;
    community?: {
      id: string;
      name: string;
      school?: { name: string };
      generation?: { name: string };
    };
  };
  created_by_profile?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  facilitator?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  secretary?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  
  // Aggregated counts
  agreements_count?: number;
  commitments_count?: number;
  tasks_count?: number;
  attendees_count?: number;
  completed_tasks_count?: number;
  overdue_tasks_count?: number;
}

// Meeting agreement interface
export interface MeetingAgreement {
  id: string;
  meeting_id: string;
  agreement_text: string;
  agreement_doc?: any;
  order_index: number;
  category?: string;
  created_at: string;
  updated_at: string;
}

// Meeting commitment interface
export interface MeetingCommitment {
  id: string;
  meeting_id: string;
  commitment_text: string;
  commitment_doc?: any;
  assigned_to: string;
  due_date?: string;
  status: TaskStatus;
  notes?: string;
  completed_at?: string;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
  
  // Related data
  assigned_to_profile?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string;
  };
  meeting?: {
    id: string;
    title: string;
    meeting_date: string;
  };
}

// Meeting task interface
export interface MeetingTask {
  id: string;
  meeting_id: string;
  task_title: string;
  task_description?: string;
  task_description_doc?: any;
  assigned_to: string;
  due_date?: string;
  priority: TaskPriority;
  status: TaskStatus;
  estimated_hours?: number;
  actual_hours?: number;
  category?: string;
  parent_task_id?: string;
  completed_at?: string;
  progress_percentage: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  
  // Related data
  assigned_to_profile?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string;
  };
  meeting?: {
    id: string;
    title: string;
    meeting_date: string;
  };
  parent_task?: {
    id: string;
    task_title: string;
  };
  subtasks?: MeetingTask[];
}

// Meeting attendee interface
export interface MeetingAttendee {
  id: string;
  meeting_id: string;
  user_id: string;
  attendance_status: AttendanceStatus;
  role: AttendeeRole;
  notes?: string;
  created_at: string;
  updated_at: string;
  
  // Related data
  user_profile?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string;
  };
}

// Collaborative work-session presence for co-editing a meeting draft
export interface MeetingWorkSession {
  id: string;
  meeting_id: string;
  user_id: string;
  started_at: string;
  last_heartbeat_at: string;
  ended_at?: string;
  client_id?: string;

  // Related data
  user_profile?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url?: string;
  };
}

// Complete meeting with all related data
export interface MeetingWithDetails extends CommunityMeeting {
  agreements: MeetingAgreement[];
  commitments: MeetingCommitment[];
  tasks: MeetingTask[];
  attendees: MeetingAttendee[];
  finalized_by_profile?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

// Meeting creation/update input
export interface MeetingInput {
  title: string;
  description?: string;
  meeting_date: string;
  duration_minutes: number;
  location?: string;
  facilitator_id?: string;
  secretary_id?: string;
  attendee_ids?: string[];
}

// Meeting documentation input (for the 4-step form)
export interface MeetingDocumentationInput {
  // Step 1: Basic Information
  meeting_info: {
    title: string;
    meeting_date: string;
    duration_minutes: number;
    location?: string;
    attendee_ids: string[];
  };
  
  // Step 2: Summary and Notes
  summary_info: {
    summary: string;
    summary_doc?: any;
    notes?: string;
    notes_doc?: any;
    status: MeetingStatus;
  };

  // Step 3: Agreements
  agreements: Array<{
    id?: string;
    agreement_text: string;
    agreement_doc?: any;
    category?: string;
  }>;

  // Step 4: Commitments and Tasks
  commitments: Array<{
    id?: string;
    commitment_text: string;
    commitment_doc?: any;
    assigned_to: string;
    due_date?: string;
  }>;

  tasks: Array<{
    id?: string;
    task_title: string;
    task_description?: string;
    task_description_doc?: any;
    assigned_to: string;
    due_date?: string;
    priority: TaskPriority;
    category?: string;
    estimated_hours?: number;
  }>;
}

// Overdue item interface (from helper function)
export interface OverdueItem {
  item_type: 'commitment' | 'task';
  item_id: string;
  title: string;
  due_date: string;
  days_overdue: number;
  assigned_to: string;
  meeting_title: string;
  
  // Related data
  assigned_to_profile?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

// Meeting statistics interface
export interface MeetingStats {
  total_meetings: number;
  upcoming_meetings: number;
  completed_meetings: number;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  total_commitments: number;
  completed_commitments: number;
  overdue_commitments: number;
}

// Filter options for meetings
export interface MeetingFilters {
  dateRange: {
    start?: string;
    end?: string;
  };
  status: MeetingStatus[];
  assignedToMe: boolean;
  createdByMe: boolean;
  search: string;
  priority?: TaskPriority[];
  overdueTasks: boolean;
  // "Mis borradores": restrict to meetings with status='borrador' where the
  // current user is a creator, facilitator, secretary, or co-editor.
  myDrafts?: boolean;
}

// Sort options for meetings
export interface MeetingSortOptions {
  field: 'meeting_date' | 'title' | 'status' | 'created_at';
  direction: 'asc' | 'desc';
}

// User assignment option for task/commitment assignment
export interface AssignmentUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
  role_type: string;
}

// Meeting template interface (for common meeting types)
export interface MeetingTemplate {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  default_agreements: string[];
  default_task_categories: string[];
  suggested_roles: AttendeeRole[];
}

// Form step enum for the multi-step modal
export enum MeetingFormStep {
  INFORMATION = 0,
  SUMMARY = 1,
  AGREEMENTS = 2,
  COMMITMENTS = 3
}

// Status badge colors mapping
export const statusColors: Record<TaskStatus, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  en_progreso: 'bg-blue-100 text-blue-800',
  completado: 'bg-green-100 text-green-800',
  vencido: 'bg-red-100 text-red-800',
  cancelado: 'bg-gray-100 text-gray-800'
};

export const priorityColors: Record<TaskPriority, string> = {
  baja: 'bg-gray-100 text-gray-800',
  media: 'bg-yellow-100 text-yellow-800',
  alta: 'bg-orange-100 text-orange-800',
  critica: 'bg-red-100 text-red-800'
};

export const meetingStatusColors: Record<MeetingStatus, string> = {
  borrador: 'bg-slate-100 text-slate-800',
  programada: 'bg-blue-100 text-blue-800',
  en_progreso: 'bg-yellow-100 text-yellow-800',
  completada: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
  pospuesta: 'bg-gray-100 text-gray-800'
};

// Status labels in Spanish
export const statusLabels: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En Progreso',
  completado: 'Completado',
  vencido: 'Vencido',
  cancelado: 'Cancelado'
};

export const priorityLabels: Record<TaskPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica'
};

export const meetingStatusLabels: Record<MeetingStatus, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  en_progreso: 'En Progreso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  pospuesta: 'Pospuesta'
};

// Row shape returned by `meeting_work_sessions` joined with the editing
// user's profile — powers the draft-timeline banner in the documentation
// modal. Previously inlined inside MeetingDocumentationModal; relocated
// here so component-extracted consumers (e.g. a future WorkSessionBanner
// subcomponent) can share the same contract without re-declaring the
// shape.
export interface WorkSessionEntry {
  id: string;
  user_id: string;
  started_at: string;
  last_heartbeat_at: string | null;
  first_name: string | null;
  last_name: string | null;
}

// Minimum fields the meeting-attachments UI needs when reading existing
// rows from `meeting_attachments`. Relocated from the documentation modal
// for the same reason as WorkSessionEntry — the shape is consumed by the
// modal itself plus any future AttachmentRow subcomponent.
export interface ExistingAttachment {
  id: string;
  filename: string;
  file_path: string;
  file_size: number;
  file_type: string;
}