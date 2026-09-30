/**
 * What a console line keeps of an error: its database error code, nothing else.
 * A message, detail or hint can carry ids, answers or feedback.
 */
const loggableError = (error) => {
  const code = error?.code;
  return typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? { code } : {};
};

/**
 * Asks /api/quiz-reviews/notify-pending for the reviewers' bells of a saved
 * submission; the server derives the reviewers. The quiz stays submitted
 * whatever happens here, and a repeat creates only the bells still missing.
 */
const requestPendingReviewNotification = async (supabase, submissionId) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('Quiz review notification skipped: no auth session');
      return;
    }
    const response = await fetch('/api/quiz-reviews/notify-pending', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ submission_id: submissionId })
    });
    if (!response.ok) {
      console.error('Quiz review notification rejected with status', response.status);
    }
  } catch {
    console.error('Quiz review notification request failed');
  }
};

/**
 * Submit a quiz with auto-grading for MC/TF questions
 */
export const submitQuiz = async (supabase, lessonId, blockId, studentId, courseId, answers, quizData, timeSpent = null) => {
  try {
    const { data, error } = await supabase.rpc('submit_quiz', {
      p_lesson_id: lessonId,
      p_block_id: blockId,
      p_student_id: studentId,
      p_course_id: courseId,
      p_answers: answers,
      p_quiz_data: quizData,
      p_time_spent: timeSpent
    });

    if (error) throw error;

    // Get the full submission data
    const { data: submission, error: fetchError } = await supabase
      .from('quiz_submissions')
      .select('*')
      .eq('id', data)
      .single();

    if (fetchError) throw fetchError;

    // If there are open-ended questions, notify the submission's reviewers
    if (submission.manual_gradable_points > 0) {
      await requestPendingReviewNotification(supabase, submission.id);
    }

    return { data: submission, error: null };
  } catch (error) {
    console.error('Error submitting quiz:', loggableError(error));
    return { data: null, error };
  }
};

/**
 * Get quiz submission by ID
 */
export const getQuizSubmission = async (supabase, submissionId) => {
  try {
    const { data, error } = await supabase
      .from('quiz_submissions')
      .select(`
        *,
        student:profiles!student_id(id, name, email),
        grader:profiles!graded_by(id, name),
        course:courses!course_id(id, title),
        lesson:lessons!lesson_id(id, title)
      `)
      .eq('id', submissionId)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching quiz submission:', loggableError(error));
    return { data: null, error };
  }
};

/**
 * Get student's quiz submissions for a lesson
 */
export const getStudentQuizSubmissions = async (supabase, studentId, lessonId, blockId = null) => {
  try {
    let query = supabase
      .from('quiz_submissions')
      .select(`
        *,
        grader:profiles!graded_by(id, name)
      `)
      .eq('student_id', studentId)
      .eq('lesson_id', lessonId)
      .order('submitted_at', { ascending: false });

    if (blockId) {
      query = query.eq('block_id', blockId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching student quiz submissions:', loggableError(error));
    return { data: null, error };
  }
};

/**
 * Get pending quiz reviews for a consultant
 * Consultants only see quizzes from users they are assigned to via consultant_assignments
 * Admins see all pending quizzes
 */
export const getPendingQuizReviews = async (supabase, userId = null, userRole = null) => {
  try {
    console.log('[getPendingQuizReviews] Called with userRole:', userRole);

    // First get all pending reviews
    const { data: allReviews, error: reviewsError } = await supabase
      .from('pending_quiz_reviews')
      .select('*')
      .order('submitted_at', { ascending: true });

    console.log('[getPendingQuizReviews] All reviews count:', allReviews?.length);

    if (reviewsError) throw reviewsError;

    // If admin, return all reviews
    if (userRole === 'admin') {
      console.log('[getPendingQuizReviews] User is admin, returning all reviews');
      return { data: allReviews, error: null };
    }

    // For consultors, filter by their assigned users
    if (userRole === 'consultor' && userId) {
      console.log('[getPendingQuizReviews] User is consultor, filtering by assignments');
      // Get consultant's assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('consultant_assignments')
        .select('student_id, school_id, generation_id, community_id, assignment_data')
        .eq('consultant_id', userId)
        .eq('is_active', true);

      if (assignmentsError) {
        console.error('Error fetching consultant assignments:', loggableError(assignmentsError));
        return { data: allReviews, error: null }; // Fallback to all if error
      }

      console.log('[getPendingQuizReviews] Assignments found:', assignments?.length);

      if (!assignments || assignments.length === 0) {
        console.log('[getPendingQuizReviews] No assignments, returning empty array');
        return { data: [], error: null }; // No assignments = no quizzes to review
      }

      // Build list of allowed student IDs based on assignment scopes
      const allowedStudentIds = new Set();

      for (const assignment of assignments) {
        const scope = assignment.assignment_data?.assignment_scope || 'individual';
        console.log('[getPendingQuizReviews] Processing assignment scope:', scope);

        if (scope === 'individual' && assignment.student_id) {
          // Direct student assignment
          allowedStudentIds.add(assignment.student_id);
        } else if (scope === 'school' && assignment.school_id) {
          // Get all users in the school
          const { data: schoolUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('school_id', assignment.school_id)
            .eq('is_active', true);
          console.log('[getPendingQuizReviews] Users in school:', schoolUsers?.length);
          if (schoolUsers) {
            schoolUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        } else if (scope === 'generation' && assignment.generation_id) {
          // Get all users in the generation
          const { data: genUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('generation_id', assignment.generation_id)
            .eq('is_active', true);
          if (genUsers) {
            genUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        } else if (scope === 'community' && assignment.community_id) {
          // Get all users in the community
          const { data: communityUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('community_id', assignment.community_id)
            .eq('is_active', true);
          if (communityUsers) {
            communityUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        }
      }

      console.log('[getPendingQuizReviews] Allowed student IDs:', allowedStudentIds.size);

      // Filter reviews to only include those from assigned students
      const filteredReviews = allReviews.filter(review =>
        allowedStudentIds.has(review.student_id)
      );

      console.log('[getPendingQuizReviews] Filtered reviews:', filteredReviews.length);
      return { data: filteredReviews, error: null };
    }

    // For equipo_directivo or other roles, return all for now
    return { data: allReviews, error: null };
  } catch (error) {
    console.error('Error fetching pending quiz reviews:', loggableError(error));
    return { data: null, error };
  }
};

/**
 * Submit quiz review with feedback
 */
export const submitQuizReview = async (supabase, submissionId, gradedBy, reviewStatus, generalFeedback, questionFeedback) => {
  try {
    const { data, error } = await supabase.rpc('grade_quiz_feedback', {
      p_submission_id: submissionId,
      p_graded_by: gradedBy,
      p_review_status: reviewStatus,
      p_general_feedback: generalFeedback,
      p_question_feedback: questionFeedback
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error submitting quiz review:', loggableError(error));
    return { data: null, error };
  }
};

/**
 * Get quiz statistics for a specific quiz block
 */
export const getQuizStatistics = async (supabase, lessonId, blockId) => {
  try {
    const { data, error } = await supabase
      .from('quiz_submissions')
      .select('review_status')
      .eq('lesson_id', lessonId)
      .eq('block_id', blockId);

    if (error) throw error;

    // Calculate statistics
    const stats = {
      total_submissions: data.length,
      pending_reviews: data.filter(s => s.review_status === 'pending').length,
      passed: data.filter(s => s.review_status === 'pass').length,
      needs_review: data.filter(s => s.review_status === 'needs_review').length
    };

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error fetching quiz statistics:', loggableError(error));
    return { data: null, error };
  }
};