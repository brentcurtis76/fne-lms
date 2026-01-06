// Assignment types for Genera

export type AssignmentType = 'task' | 'quiz' | 'project' | 'essay' | 'presentation' | 'group';

export type AssignmentFor = 'individual' | 'group';

export type AssignmentStatus = 'draft' | 'published' | 'archived';

export type SubmissionStatus = 'draft' | 'submitted' | 'graded' | 'returned';

export type GroupMemberRole = 'leader' | 'member';

export interface Assignment {
  id: string;
  title: string;
  description?: string;
  course_id?: string;
  lesson_id?: string;
  created_by: string;
  due_date?: string;
  points: number;
  assignment_type: AssignmentType;
  assignment_for: AssignmentFor;
  instructions?: string;
  resources: AssignmentResource[];
  is_published: boolean;
  allow_late_submission: boolean;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  // Group assignment specific fields
  assigned_to_community_id?: string;
  max_group_size?: number;
  min_group_size?: number;
  allow_self_grouping?: boolean;
  require_all_members_submit?: boolean;
  // Joined data
  course?: {
    id: string;
    title: string;
  };
  lesson?: {
    id: string;
    title: string;
  };
  creator?: {
    id: string;
    name: string;
    email: string;
  };
  community?: {
    id: string;
    name: string;
  };
  submission_count?: number;
  graded_count?: number;
}

export interface AssignmentResource {
  id: string;
  title: string;
  url: string;
  type: 'link' | 'file' | 'video';
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  content?: string;
  attachment_urls: string[];
  status: SubmissionStatus;
  submitted_at?: string;
  graded_at?: string;
  graded_by?: string;
  score?: number;
  feedback?: string;
  attempt_number: number;
  is_late: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  assignment?: Assignment;
  student?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
  };
  grader?: {
    id: string;
    name: string;
  };
}

export interface AssignmentFilters {
  course_id?: string;
  assignment_type?: AssignmentType;
  status?: AssignmentStatus;
  created_by?: string;
  search?: string;
}

export interface SubmissionFilters {
  assignment_id?: string;
  student_id?: string;
  status?: SubmissionStatus;
  is_late?: boolean;
}

export interface AssignmentStats {
  total_assignments: number;
  published_assignments: number;
  pending_submissions: number;
  graded_submissions: number;
  average_score: number;
  on_time_rate: number;
}

// Group assignment specific types
export interface GroupAssignmentMember {
  id: string;
  assignment_id: string;
  community_id: string;
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  joined_at: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
  };
}

export interface GroupAssignmentSubmission {
  id: string;
  assignment_id: string;
  group_id: string;
  community_id: string;
  submitted_by: string;
  submission_content?: string;
  file_urls?: string[];
  status: SubmissionStatus;
  score?: number;
  feedback?: string;
  graded_by?: string;
  graded_at?: string;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  submitter?: {
    id: string;
    name: string;
    email: string;
  };
  grader?: {
    id: string;
    name: string;
  };
  group_members?: GroupAssignmentMember[];
}

export interface GroupAssignmentDiscussion {
  id: string;
  assignment_id: string;
  group_id: string;
  thread_id: string;
  created_at: string;
}

export interface GroupAssignmentWithStats extends Assignment {
  group_count?: number;
  total_members?: number;
  submission_count?: number;
  graded_count?: number;
}