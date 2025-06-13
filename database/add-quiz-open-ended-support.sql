-- Migration: Add support for open-ended questions in quizzes
-- This migration adds fields to track quiz submissions with open-ended questions
-- that require manual grading by consultants

-- First, let's create a table to store quiz submissions
CREATE TABLE IF NOT EXISTS quiz_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL, -- The quiz block ID within the lesson
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  
  -- Scoring fields
  auto_graded_score INTEGER DEFAULT 0, -- Points from MC/TF questions
  manual_graded_score INTEGER DEFAULT 0, -- Points from open-ended questions
  total_possible_points INTEGER NOT NULL,
  auto_gradable_points INTEGER NOT NULL, -- Points that can be auto-graded
  manual_gradable_points INTEGER NOT NULL, -- Points that need manual grading
  
  -- Status tracking
  grading_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (grading_status IN ('completed', 'pending_review')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  graded_at TIMESTAMP WITH TIME ZONE,
  graded_by UUID REFERENCES profiles(id),
  
  -- Response data
  answers JSONB NOT NULL, -- All answers including open-ended responses
  open_responses JSONB, -- Just the open-ended responses for easy access
  grading_feedback JSONB, -- Feedback per question from consultant
  
  -- Metadata
  time_spent INTEGER, -- Time in seconds
  attempt_number INTEGER DEFAULT 1,
  
  UNIQUE(lesson_id, block_id, student_id, attempt_number)
);

-- Create indexes for performance
CREATE INDEX idx_quiz_submissions_student ON quiz_submissions(student_id);
CREATE INDEX idx_quiz_submissions_course ON quiz_submissions(course_id);
CREATE INDEX idx_quiz_submissions_grading_status ON quiz_submissions(grading_status);
CREATE INDEX idx_quiz_submissions_graded_by ON quiz_submissions(graded_by);

-- Add RLS policies
ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;

-- Students can view their own submissions
CREATE POLICY "Students can view own quiz submissions" ON quiz_submissions
  FOR SELECT
  USING (auth.uid() = student_id);

-- Students can insert their own submissions
CREATE POLICY "Students can submit quizzes" ON quiz_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Teachers can view submissions for courses they teach
CREATE POLICY "Teachers can view quiz submissions for their courses" ON quiz_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM course_assignments ca
      WHERE ca.course_id = quiz_submissions.course_id
      AND ca.teacher_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Teachers can update submissions (for grading)
CREATE POLICY "Teachers can grade quiz submissions" ON quiz_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM course_assignments ca
      WHERE ca.course_id = quiz_submissions.course_id
      AND ca.teacher_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create a view for pending reviews
CREATE OR REPLACE VIEW pending_quiz_reviews AS
SELECT 
  qs.*,
  s.name as student_name,
  s.email as student_email,
  c.title as course_title,
  l.title as lesson_title,
  COUNT(*) OVER (PARTITION BY qs.graded_by) as reviewer_workload
FROM quiz_submissions qs
JOIN profiles s ON qs.student_id = s.id
JOIN courses c ON qs.course_id = c.id
JOIN lessons l ON qs.lesson_id = l.id
WHERE qs.grading_status = 'pending_review'
  AND qs.manual_gradable_points > 0;

-- Grant access to the view
GRANT SELECT ON pending_quiz_reviews TO authenticated;

-- Function to calculate final quiz score
CREATE OR REPLACE FUNCTION calculate_quiz_score(submission_id UUID)
RETURNS TABLE (
  final_score INTEGER,
  percentage DECIMAL,
  is_fully_graded BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    qs.auto_graded_score + qs.manual_graded_score as final_score,
    CASE 
      WHEN qs.total_possible_points > 0 
      THEN ((qs.auto_graded_score + qs.manual_graded_score)::DECIMAL / qs.total_possible_points::DECIMAL) * 100
      ELSE 0
    END as percentage,
    CASE 
      WHEN qs.manual_gradable_points = 0 THEN true
      WHEN qs.grading_status = 'completed' THEN true
      ELSE false
    END as is_fully_graded
  FROM quiz_submissions qs
  WHERE qs.id = submission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to submit quiz with auto-grading
CREATE OR REPLACE FUNCTION submit_quiz(
  p_lesson_id UUID,
  p_block_id TEXT,
  p_student_id UUID,
  p_course_id UUID,
  p_answers JSONB,
  p_quiz_data JSONB, -- The quiz block data with correct answers
  p_time_spent INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_submission_id UUID;
  v_auto_score INTEGER := 0;
  v_total_points INTEGER := 0;
  v_auto_points INTEGER := 0;
  v_manual_points INTEGER := 0;
  v_open_responses JSONB := '[]'::jsonb;
  v_question JSONB;
  v_answer JSONB;
  v_correct_answer TEXT;
BEGIN
  -- Calculate scores
  FOR v_question IN SELECT * FROM jsonb_array_elements(p_quiz_data->'questions')
  LOOP
    v_total_points := v_total_points + (v_question->>'points')::INTEGER;
    
    -- Get the student's answer for this question
    v_answer := p_answers->(v_question->>'id');
    
    IF v_question->>'type' = 'open-ended' THEN
      -- Track manual points and collect open responses
      v_manual_points := v_manual_points + (v_question->>'points')::INTEGER;
      v_open_responses := v_open_responses || jsonb_build_object(
        'question_id', v_question->>'id',
        'question', v_question->>'question',
        'response', v_answer->>'text',
        'points', (v_question->>'points')::INTEGER,
        'expectedAnswer', v_question->>'expectedAnswer',
        'gradingGuidelines', v_question->>'gradingGuidelines'
      );
    ELSE
      -- Auto-gradable question
      v_auto_points := v_auto_points + (v_question->>'points')::INTEGER;
      
      -- Check if answer is correct
      IF v_question->>'type' = 'multiple-choice' THEN
        -- Find the correct option
        SELECT o->>'id' INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') o
        WHERE (o->>'isCorrect')::boolean = true
        LIMIT 1;
        
        IF v_answer->>'selectedOption' = v_correct_answer THEN
          v_auto_score := v_auto_score + (v_question->>'points')::INTEGER;
        END IF;
      ELSIF v_question->>'type' = 'true-false' THEN
        -- Similar logic for true/false
        SELECT o->>'id' INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') o
        WHERE (o->>'isCorrect')::boolean = true
        LIMIT 1;
        
        IF v_answer->>'selectedOption' = v_correct_answer THEN
          v_auto_score := v_auto_score + (v_question->>'points')::INTEGER;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  -- Insert the submission
  INSERT INTO quiz_submissions (
    lesson_id,
    block_id,
    student_id,
    course_id,
    auto_graded_score,
    manual_graded_score,
    total_possible_points,
    auto_gradable_points,
    manual_gradable_points,
    grading_status,
    answers,
    open_responses,
    time_spent
  ) VALUES (
    p_lesson_id,
    p_block_id,
    p_student_id,
    p_course_id,
    v_auto_score,
    0, -- Manual score starts at 0
    v_total_points,
    v_auto_points,
    v_manual_points,
    CASE WHEN v_manual_points > 0 THEN 'pending_review' ELSE 'completed' END,
    p_answers,
    CASE WHEN v_manual_points > 0 THEN v_open_responses ELSE NULL END,
    p_time_spent
  )
  RETURNING id INTO v_submission_id;
  
  -- If there are open-ended questions, create a notification for the teacher
  IF v_manual_points > 0 THEN
    -- This will be handled by the application layer to send notification
    -- We'll return the submission ID so the app can handle it
    NULL;
  END IF;
  
  RETURN v_submission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to grade open-ended responses
CREATE OR REPLACE FUNCTION grade_quiz_open_responses(
  p_submission_id UUID,
  p_graded_by UUID,
  p_grading_data JSONB -- Array of {question_id, score, feedback}
)
RETURNS BOOLEAN AS $$
DECLARE
  v_total_manual_score INTEGER := 0;
  v_grade JSONB;
BEGIN
  -- Calculate total manual score
  FOR v_grade IN SELECT * FROM jsonb_array_elements(p_grading_data)
  LOOP
    v_total_manual_score := v_total_manual_score + (v_grade->>'score')::INTEGER;
  END LOOP;
  
  -- Update the submission
  UPDATE quiz_submissions
  SET 
    manual_graded_score = v_total_manual_score,
    grading_status = 'completed',
    graded_at = CURRENT_TIMESTAMP,
    graded_by = p_graded_by,
    grading_feedback = p_grading_data
  WHERE id = p_submission_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION submit_quiz TO authenticated;
GRANT EXECUTE ON FUNCTION grade_quiz_open_responses TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_quiz_score TO authenticated;