import { supabase } from '../supabase';

/**
 * Submit a quiz with auto-grading for MC/TF questions
 */
export const submitQuiz = async (lessonId, blockId, studentId, courseId, answers, quizData, timeSpent = null) => {
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
      await sendQuizReviewNotification(submission);
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
export const getQuizSubmission = async (submissionId) => {
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

    // Calculate final score
    const { data: scoreData } = await supabase.rpc('calculate_quiz_score', {
      submission_id: submissionId
    });

    return { 
      data: {
        ...data,
        final_score: scoreData?.[0]?.final_score || 0,
        percentage: scoreData?.[0]?.percentage || 0,
        is_fully_graded: scoreData?.[0]?.is_fully_graded || false
      }, 
      error: null 
    };
  } catch (error) {
    console.error('Error fetching quiz submission:', error);
    return { data: null, error };
  }
};

/**
 * Get student's quiz submissions for a lesson
 */
export const getStudentQuizSubmissions = async (studentId, lessonId, blockId = null) => {
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

    // Calculate scores for each submission
    const submissionsWithScores = await Promise.all(
      data.map(async (submission) => {
        const { data: scoreData } = await supabase.rpc('calculate_quiz_score', {
          submission_id: submission.id
        });
        
        return {
          ...submission,
          final_score: scoreData?.[0]?.final_score || 0,
          percentage: scoreData?.[0]?.percentage || 0,
          is_fully_graded: scoreData?.[0]?.is_fully_graded || false
        };
      })
    );

    return { data: submissionsWithScores, error: null };
  } catch (error) {
    console.error('Error fetching student quiz submissions:', error);
    return { data: null, error };
  }
};

/**
 * Get pending quiz reviews for a consultant
 */
export const getPendingQuizReviews = async (consultantId = null) => {
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
 * Grade open-ended responses
 */
export const gradeQuizOpenResponses = async (submissionId, gradedBy, gradingData) => {
  try {
    const { data, error } = await supabase.rpc('grade_quiz_open_responses', {
      p_submission_id: submissionId,
      p_graded_by: gradedBy,
      p_grading_data: gradingData
    });

    if (error) throw error;

    // Send notification to student
    const { data: submission } = await getQuizSubmission(submissionId);
    if (submission) {
      await sendQuizGradedNotification(submission);
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error grading quiz responses:', error);
    return { data: null, error };
  }
};

/**
 * Send notification for quiz review
 */
const sendQuizReviewNotification = async (submission) => {
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
 * Send notification when quiz is graded
 */
const sendQuizGradedNotification = async (submission) => {
  try {
    const notification = {
      user_id: submission.student_id,
      type: 'quiz_graded',
      title: 'Quiz calificado',
      message: `Tu quiz ha sido calificado. Puntuación: ${submission.final_score}/${submission.total_possible_points}`,
      data: {
        submission_id: submission.id,
        course_id: submission.course_id,
        lesson_id: submission.lesson_id,
        final_score: submission.final_score,
        percentage: submission.percentage
      }
    };

    const { error } = await supabase
      .from('notifications')
      .insert(notification);

    if (error) console.error('Error creating notification:', error);
  } catch (error) {
    console.error('Error sending quiz graded notification:', error);
  }
};

/**
 * Get quiz statistics for a specific quiz block
 */
export const getQuizStatistics = async (lessonId, blockId) => {
  try {
    const { data, error } = await supabase
      .from('quiz_submissions')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('block_id', blockId);

    if (error) throw error;

    // Calculate statistics
    const stats = {
      total_submissions: data.length,
      pending_reviews: data.filter(s => s.grading_status === 'pending_review').length,
      completed_reviews: data.filter(s => s.grading_status === 'completed').length,
      average_score: 0,
      average_percentage: 0,
      score_distribution: []
    };

    if (data.length > 0) {
      // Calculate averages
      const scores = await Promise.all(
        data.map(async (submission) => {
          const { data: scoreData } = await supabase.rpc('calculate_quiz_score', {
            submission_id: submission.id
          });
          return scoreData?.[0] || { final_score: 0, percentage: 0 };
        })
      );

      stats.average_score = scores.reduce((sum, s) => sum + s.final_score, 0) / scores.length;
      stats.average_percentage = scores.reduce((sum, s) => sum + s.percentage, 0) / scores.length;

      // Score distribution (0-59, 60-69, 70-79, 80-89, 90-100)
      stats.score_distribution = [
        { range: '0-59%', count: scores.filter(s => s.percentage < 60).length },
        { range: '60-69%', count: scores.filter(s => s.percentage >= 60 && s.percentage < 70).length },
        { range: '70-79%', count: scores.filter(s => s.percentage >= 70 && s.percentage < 80).length },
        { range: '80-89%', count: scores.filter(s => s.percentage >= 80 && s.percentage < 90).length },
        { range: '90-100%', count: scores.filter(s => s.percentage >= 90).length }
      ];
    }

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error fetching quiz statistics:', error);
    return { data: null, error };
  }
};