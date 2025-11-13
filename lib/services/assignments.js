import { 
  Assignment, 
  AssignmentSubmission, 
  AssignmentFilters,
  SubmissionFilters,
  AssignmentStats 
} from '../../types/assignments';

// Assignment CRUD operations
export const assignmentService = {
  // Create a new assignment
  async create(supabase, assignment) {
    const { data, error } = await supabase
      .from('lesson_assignments')
      .insert({
        ...assignment,
        assignment_for: assignment.assignment_for || 'individual'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get all assignments with filters
  async getAll(supabase, filters = {}) {
    console.log('[AssignmentService] Getting all assignments with filters:', filters);
    
    let query = supabase
      .from('lesson_assignments')
      .select(`
        *,
        courses (
          id,
          title
        ),
        lessons (
          id,
          title
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.course_id) {
      query = query.eq('course_id', filters.course_id);
    }
    if (filters.assignment_type) {
      query = query.eq('assignment_type', filters.assignment_type);
    }
    if (filters.status === 'published') {
      query = query.eq('is_published', true);
    } else if (filters.status === 'draft') {
      query = query.eq('is_published', false);
    }
    if (filters.created_by) {
      query = query.eq('created_by', filters.created_by);
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    
    console.log('[AssignmentService] Query result:', { data, error });
    
    if (error) {
      console.error('[AssignmentService] Error in getAll assignments:', error);
      throw error;
    }
    return data || [];
  },

  // Get assignments for students (only from enrolled courses)
  async getStudentAssignments(supabase, studentId) {
    console.log('[AssignmentService] Getting assignments for student:', studentId);

    // First get student's enrolled courses (active only)
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('course_enrollments')
      .select('course_id')
      .eq('user_id', studentId)
      .eq('status', 'active');

    if (enrollmentsError) throw enrollmentsError;
    
    if (!enrollments || enrollments.length === 0) {
      console.log('[AssignmentService] Student has no enrolled courses');
      return [];
    }

    const courseIds = enrollments.map(e => e.course_id);
    
    // Get published assignments from enrolled courses with course and lesson info
    const { data: assignments, error: assignmentsError } = await supabase
      .from('lesson_assignments')
      .select(`
        *,
        courses!inner (
          id,
          title
        ),
        lessons (
          id,
          title
        ),
        assignment_type,
        group_assignments
      `)
      .in('course_id', courseIds)
      .eq('is_published', true)
      .order('due_date', { ascending: true });

    console.log('[AssignmentService] Assignments query result:', { assignments, error: assignmentsError });
    
    if (assignmentsError) throw assignmentsError;

    // Then get submissions for this student
    const { data: submissions, error: submissionsError } = await supabase
      .from('lesson_assignment_submissions')
      .select(`
        id,
        assignment_id,
        status,
        score,
        submitted_at,
        is_late
      `)
      .eq('student_id', studentId);

    if (submissionsError) throw submissionsError;

    // Map submissions by assignment_id for easy lookup
    const submissionMap = {};
    if (submissions) {
      submissions.forEach(sub => {
        submissionMap[sub.assignment_id] = sub;
      });
    }

    // Add submissions to assignments and process group assignments
    const assignmentsWithSubmissions = assignments?.map(assignment => {
      // Add individual submissions
      const baseAssignment = {
        ...assignment,
        submissions: submissionMap[assignment.id] ? [submissionMap[assignment.id]] : []
      };
      
      // If it's a group assignment, find the student's group
      if (assignment.assignment_type === 'group' && assignment.group_assignments) {
        const studentGroup = assignment.group_assignments.find(group => 
          group.members.some(member => member.user_id === studentId)
        );
        
        if (studentGroup) {
          baseAssignment.student_group = studentGroup;
          baseAssignment.group_members = studentGroup.members;
          baseAssignment.has_group_submission = !!studentGroup.submission;
        }
      }
      
      return baseAssignment;
    }) || [];

    return assignmentsWithSubmissions;
  },

  // Get single assignment by ID
  async getById(supabase, id) {
    const { data, error } = await supabase
      .from('lesson_assignments')
      .select(`
        *,
        course:courses(id, title),
        lesson:lessons(id, title),
        creator:profiles!created_by(id, name, email)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  // Update assignment
  async update(supabase, id, updates) {
    const { data, error } = await supabase
      .from('lesson_assignments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Delete assignment
  async delete(supabase, id) {
    const { error } = await supabase
      .from('lesson_assignments')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Get assignment statistics
  async getStats(supabase, teacherId = null) {
    let assignmentQuery = supabase
      .from('lesson_assignments')
      .select('id, is_published', { count: 'exact' });

    if (teacherId) {
      assignmentQuery = assignmentQuery.eq('created_by', teacherId);
    }

    const { data: assignments, count: totalAssignments, error: assignmentError } = await assignmentQuery;
    if (assignmentError) throw assignmentError;

    const publishedCount = assignments?.filter(a => a.is_published).length || 0;

    // Get submission stats
    let submissionQuery = supabase
      .from('lesson_assignment_submissions')
      .select('status, score, is_late');

    if (teacherId) {
      submissionQuery = submissionQuery.in('assignment_id', assignments?.map(a => a.id) || []);
    }

    const { data: submissions, error: submissionError } = await submissionQuery;
    if (submissionError) throw submissionError;

    const pendingSubmissions = submissions?.filter(s => s.status === 'submitted').length || 0;
    const gradedSubmissions = submissions?.filter(s => s.status === 'graded').length || 0;
    const scores = submissions?.filter(s => s.score !== null).map(s => s.score) || [];
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const onTimeSubmissions = submissions?.filter(s => !s.is_late).length || 0;
    const onTimeRate = submissions?.length > 0 ? (onTimeSubmissions / submissions.length) * 100 : 0;

    return {
      total_assignments: totalAssignments || 0,
      published_assignments: publishedCount,
      pending_submissions: pendingSubmissions,
      graded_submissions: gradedSubmissions,
      average_score: Math.round(averageScore * 100) / 100,
      on_time_rate: Math.round(onTimeRate * 100) / 100
    };
  }
};

// Submission CRUD operations
export const submissionService = {
  // Create a new submission
  async create(supabase, submission) {
    const { data, error } = await supabase
      .from('lesson_assignment_submissions')
      .insert(submission)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get all submissions with filters
  async getAll(supabase, filters = {}) {
    let query = supabase
      .from('lesson_assignment_submissions')
      .select(`
        *,
        assignment:lesson_assignments(
          id, 
          title, 
          points,
          due_date,
          assignment_type
        ),
        student:profiles!student_id(
          id, 
          name, 
          email,
          avatar_url
        ),
        grader:profiles!graded_by(
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.assignment_id) {
      query = query.eq('assignment_id', filters.assignment_id);
    }
    if (filters.student_id) {
      query = query.eq('student_id', filters.student_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.is_late !== undefined) {
      query = query.eq('is_late', filters.is_late);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Get single submission by ID
  async getById(supabase, id) {
    const { data, error } = await supabase
      .from('lesson_assignment_submissions')
      .select(`
        *,
        assignment:lesson_assignments(*),
        student:profiles!student_id(
          id, 
          name, 
          email,
          avatar_url
        ),
        grader:profiles!graded_by(
          id,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  // Get submission for a specific assignment and student
  async getByAssignmentAndStudent(supabase, assignmentId, studentId) {
    const { data, error } = await supabase
      .from('lesson_assignment_submissions')
      .select('*')
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Update submission
  async update(supabase, id, updates) {
    const { data, error } = await supabase
      .from('lesson_assignment_submissions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Submit assignment (change status from draft to submitted)
  async submit(supabase, id) {
    const { data, error } = await supabase
      .from('lesson_assignment_submissions')
      .update({ 
        status: 'submitted',
        submitted_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Grade submission
  async grade(supabase, id, score, feedback, graderId) {
    const { data, error } = await supabase
      .from('lesson_assignment_submissions')
      .update({
        status: 'graded',
        score,
        feedback,
        graded_by: graderId,
        graded_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Return submission for revision
  async returnForRevision(supabase, id, feedback, graderId) {
    const { data, error } = await supabase
      .from('lesson_assignment_submissions')
      .update({
        status: 'returned',
        feedback,
        graded_by: graderId,
        graded_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

// Utility functions
export const assignmentUtils = {
  // Check if assignment is overdue
  isOverdue(dueDate) {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  },

  // Calculate days until due
  daysUntilDue(dueDate) {
    if (!dueDate) return null;
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  },

  // Format due date display
  formatDueDate(dueDate) {
    if (!dueDate) return 'Sin fecha límite';
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `Vencido hace ${Math.abs(diffDays)} días`;
    } else if (diffDays === 0) {
      return 'Vence hoy';
    } else if (diffDays === 1) {
      return 'Vence mañana';
    } else if (diffDays <= 7) {
      return `Vence en ${diffDays} días`;
    } else {
      return date.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  },

  // Get status color
  getStatusColor(status) {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-yellow-100 text-yellow-800',
      graded: 'bg-green-100 text-green-800',
      returned: 'bg-orange-100 text-orange-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  },

  // Get assignment type label
  getTypeLabel(type) {
    const labels = {
      task: 'Tarea',
      quiz: 'Cuestionario',
      project: 'Proyecto',
      essay: 'Ensayo',
      presentation: 'Presentación'
    };
    return labels[type] || 'Tarea';
  }
};