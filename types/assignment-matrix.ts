// Assignment Matrix Types

// Source types for the 4-state model
export type AssignmentSource =
  | 'asignacion_directa'  // Has course_assignments row
  | 'ruta'                // Via learning path only
  | 'directa_y_ruta'      // Both sources
  | 'inscripcion_otro';   // Enrollment with no assignment evidence

export interface UserAssignment {
  id: string;
  type: 'course' | 'learning_path';
  contentId: string;
  contentTitle: string;
  contentDescription?: string;
  contentThumbnail?: string;
  assignedBy: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  source: AssignmentSource;
  sourceLPIds: string[];
  sourceLPNames: string[];
  // For courses
  progress?: number;
  lessonsCompleted?: number;
  totalLessons?: number;
  // For LPs
  courseCount?: number;
  coursesCompleted?: number;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export interface UserAssignmentsResponse {
  user: UserInfo;
  assignments: UserAssignment[];
  stats: {
    totalCourses: number;
    totalLPs: number;
    overlappingCourses: number;
  };
}

// User list item for left panel
export interface UserListItem {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  schoolName?: string;
  courseCount: number;
  lpCount: number;
}

// Group types (Phase 2)
export type GroupType = 'school' | 'generation' | 'community';

export interface GroupListItem {
  id: string;
  name: string;
  type: GroupType;
  memberCount: number;
  courseCount: number;
  lpCount: number;
}

// Search results for quick assign
export interface CourseSearchResult {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface LearningPathSearchResult {
  id: string;
  title: string;
  description?: string;
  courseCount: number;
}

// Overlap detection
export interface OverlapInfo {
  hasOverlap: boolean;
  message: string;
  canProceed: boolean; // Always true in Phase 1
  overlappingCourses: string[];
}

// Unassign confirmation
export interface UnassignConfirmData {
  assignmentId: string;
  type: 'course' | 'learning_path';
  contentTitle: string;
  source: AssignmentSource;
  confirmMessage: string;
  // For mixed source
  remainingSource?: string;
}

// Filter state
export interface AssignmentFilters {
  schoolId?: string;
  communityId?: string;
  searchQuery: string;
}

// ============================================
// Phase 3: Content Batch View Types
// ============================================

// Course with assignment statistics
export interface CourseWithStats {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  instructorName: string | null;
  createdAt: string;
  // Assignment stats
  directAssigneeCount: number;
  lpAssigneeCount: number;
  totalAssigneeCount: number;
  learningPathCount: number;
}

// Learning path with assignment statistics
export interface LearningPathWithStats {
  id: string;
  name: string;
  description: string | null;
  courseCount: number;
  createdAt: string;
  // Assignment stats
  directAssigneeCount: number;
  groupAssigneeCount: number;
  totalAssigneeCount: number;
}

// Content stats API response
export interface ContentStatsResponse {
  courses?: CourseWithStats[];
  learningPaths?: LearningPathWithStats[];
  totalCourses?: number;
  totalLearningPaths?: number;
  page: number;
  pageSize: number;
}

// Content batch view filters
export interface ContentBatchFilters {
  contentType: 'courses' | 'learning_paths' | 'all';
  searchQuery: string;
}
