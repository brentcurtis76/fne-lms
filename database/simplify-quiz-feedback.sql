-- Simplify quiz submissions to focus on feedback and pass/fail

-- Add new columns for simplified approach
ALTER TABLE quiz_submissions 
ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'pass', 'needs_review')),
ADD COLUMN IF NOT EXISTS general_feedback TEXT;

-- Update existing data to use new approach
UPDATE quiz_submissions 
SET review_status = CASE 
    WHEN grading_status = 'completed' AND ((auto_graded_score + COALESCE(manual_graded_score, 0))::float / NULLIF(total_possible_points, 0)::float) >= 0.7 THEN 'pass'
    WHEN grading_status = 'completed' THEN 'needs_review'
    ELSE 'pending'
END;

-- Update the pending_quiz_reviews view to remove score calculations
CREATE OR REPLACE VIEW pending_quiz_reviews AS
SELECT 
    qs.id,
    qs.lesson_id,
    qs.block_id,
    qs.student_id,
    qs.course_id,
    qs.submitted_at,
    qs.open_responses,
    -- Student info
    p.name as student_name,
    p.email as student_email,
    -- Course info
    c.title as course_title,
    -- Lesson info
    l.title as lesson_title,
    -- Reviewer workload (simplified)
    (SELECT COUNT(*) 
     FROM quiz_submissions qs2 
     WHERE qs2.review_status = 'pending' 
     AND qs2.course_id = qs.course_id) as reviewer_workload
FROM quiz_submissions qs
JOIN profiles p ON p.id = qs.student_id
JOIN courses c ON c.id = qs.course_id
JOIN lessons l ON l.id = qs.lesson_id
WHERE qs.review_status = 'pending'
AND qs.open_responses IS NOT NULL
AND jsonb_array_length(qs.open_responses) > 0
ORDER BY qs.submitted_at ASC;

-- Create a simplified grading function
CREATE OR REPLACE FUNCTION grade_quiz_feedback(
    p_submission_id UUID,
    p_graded_by UUID,
    p_review_status TEXT,
    p_general_feedback TEXT,
    p_question_feedback JSONB
) RETURNS void AS $$
BEGIN
    UPDATE quiz_submissions
    SET 
        review_status = p_review_status,
        general_feedback = p_general_feedback,
        grading_feedback = p_question_feedback,
        graded_by = p_graded_by,
        graded_at = NOW(),
        grading_status = 'completed'
    WHERE id = p_submission_id;
    
    -- Update the submission answers with feedback
    IF p_question_feedback IS NOT NULL THEN
        UPDATE quiz_submissions
        SET open_responses = (
            SELECT jsonb_agg(
                CASE 
                    WHEN (p_question_feedback->>item->>'question_id') IS NOT NULL THEN
                        item || jsonb_build_object('feedback', p_question_feedback->>item->>'question_id')
                    ELSE
                        item
                END
            )
            FROM jsonb_array_elements(open_responses) AS item
        )
        WHERE id = p_submission_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Update quiz statistics view to remove scoring
CREATE OR REPLACE VIEW quiz_statistics AS
SELECT 
    lesson_id,
    block_id,
    COUNT(*) as total_submissions,
    COUNT(*) FILTER (WHERE review_status = 'pending') as pending_reviews,
    COUNT(*) FILTER (WHERE review_status = 'pass') as passed,
    COUNT(*) FILTER (WHERE review_status = 'needs_review') as needs_review
FROM quiz_submissions
GROUP BY lesson_id, block_id;