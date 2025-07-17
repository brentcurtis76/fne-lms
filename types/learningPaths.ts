// Learning Paths type definitions

export interface LearningPath {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LearningPathWithDetails extends LearningPath {
  created_by_name?: string;
  course_count?: number;
}

export interface LearningPathCourse {
  id: string;
  path_id: string;
  course_id: string;
  sequence: number;
  created_at: string;
}

export interface CourseInPath {
  course_id: string;
  course_title: string;
  course_description: string;
  sequence: number;
}

export interface LearningPathWithCourses extends LearningPath {
  courses: CourseInPath[];
}

export interface LearningPathAssignment {
  id: string;
  path_id: string;
  user_id?: string;
  group_id?: string;
  assigned_by: string;
  assigned_at: string;
}

export interface LearningPathAssignmentWithDetails extends LearningPathAssignment {
  user?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  group?: {
    id: string;
    name: string;
  };
  assignee?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export interface UserLearningPath {
  path_id: string;
  path_name: string;
  path_description: string;
  assigned_at: string;
  assignment_type: 'direct' | 'group';
  course_count?: number;
}

// API Request/Response types

export interface CreateLearningPathRequest {
  name: string;
  description: string;
  courseIds: string[];
}

export interface UpdateLearningPathRequest {
  name: string;
  description: string;
  courseIds: string[];
}

export interface AssignLearningPathRequest {
  pathId: string;
  userId?: string;
  groupId?: string;
}

export interface BatchAssignLearningPathRequest {
  pathId: string;
  userIds?: string[];
  groupIds?: string[];
}

export interface RemoveAssignmentRequest {
  assignmentId: string;
}

// API Response types

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface AssignmentResponse {
  success: boolean;
  assignment: LearningPathAssignment;
  message: string;
}

export interface BatchAssignmentResponse {
  success: boolean;
  pathName?: string;
  assignments_created: number;
  assignments_skipped: number;
  assignment_ids: string[];
  message: string;
}