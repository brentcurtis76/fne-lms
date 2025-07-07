/**
 * Send notification for quiz review
 */
const sendQuizReviewNotification = async (supabase, submission) => {
  try {
    // Get course consultants
    const { data: consultants } = await supabase
      .from('course_assignments')
      .select('teacher_id')
      .eq('course_id', submission.course_id);

    if (!consultants || consultants.length === 0) return;

    // Create notifications for each consultant
    const notifications = consultants.map(consultant => ({
      user_id: consultant.teacher_id,
      type: 'quiz_review_pending',
      title: 'Quiz pendiente de revisión',
      message: `Hay un quiz con preguntas abiertas que requiere tu revisión`,
      data: {
        submission_id: submission.id,
        course_id: submission.course_id,
        lesson_id: submission.lesson_id,
        student_id: submission.student_id
      }
    }));

    const { error } = await supabase
      .from('notifications')
      .insert(notifications);

    if (error) console.error('Error creating notifications:', error);
  } catch (error) {
    console.error('Error sending quiz review notification:', error);
  }
};

/**
 * Send notification when quiz is reviewed
 */
const sendQuizReviewedNotification = async (supabase, submission, reviewStatus) => {
  try {
    const message = reviewStatus === 'pass' 
      ? 'Tu quiz ha sido revisado y aprobado. ¡Buen trabajo!'
      : 'Tu quiz ha sido revisado. Por favor revisa la retroalimentación del instructor.';
      
    const notification = {
      user_id: submission.student_id,
      type: 'quiz_reviewed',
      title: 'Quiz revisado',
      message: message,
      data: {
        submission_id: submission.id,
        course_id: submission.course_id,
        lesson_id: submission.lesson_id,
        review_status: reviewStatus
      }
    };

    const { error } = await supabase
      .from('notifications')
      .insert(notification);

    if (error) console.error('Error creating notification:', error);
  } catch (error) {
    console.error('Error sending quiz reviewed notification:', error);
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

    // If there are open-ended questions, send notification to consultants
    if (submission.manual_gradable_points > 0) {
      await sendQuizReviewNotification(supabase, submission);
    }

    return { data: submission, error: null };
  } catch (error) {
    console.error('Error submitting quiz:', error);
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
    console.error('Error fetching quiz submission:', error);
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
    console.error('Error fetching student quiz submissions:', error);
    return { data: null, error };
  }
};

/**
 * Get pending quiz reviews for a consultant
 */
export const getPendingQuizReviews = async (supabase, consultantId = null) => {
  try {
    let query = supabase
      .from('pending_quiz_reviews')
      .select('*')
      .order('submitted_at', { ascending: true });

    const { data, error } = await query;

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching pending quiz reviews:', error);
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
    console.error('Error submitting quiz review:', error);
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
    console.error('Error fetching quiz statistics:', error);
    return { data: null, error };
  }
};