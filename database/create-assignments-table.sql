-- Create assignments system tables for FNE LMS
-- This creates the tables needed for the individual assignments feature

-- Create assignments table
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  points INTEGER DEFAULT 0,
  assignment_type VARCHAR(50) NOT NULL DEFAULT 'task',
  instructions TEXT,
  resources JSONB DEFAULT '[]',
  is_published BOOLEAN DEFAULT FALSE,
  allow_late_submission BOOLEAN DEFAULT TRUE,
  max_attempts INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create assignment_submissions table
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  attachment_urls JSONB DEFAULT '[]',
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMP WITH TIME ZONE,
  graded_at TIMESTAMP WITH TIME ZONE,
  graded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  score DECIMAL(5,2),
  feedback TEXT,
  attempt_number INTEGER DEFAULT 1,
  is_late BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(assignment_id, student_id, attempt_number)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_lesson ON assignments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON assignments(created_by);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_published ON assignments(is_published);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON assignment_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON assignment_submissions(submitted_at);

-- Create RLS policies for assignments table
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view published assignments
CREATE POLICY "Published assignments are viewable by all authenticated users" 
  ON assignments FOR SELECT 
  USING (is_published = true AND auth.role() = 'authenticated');

-- Policy: Teachers and above can create assignments
CREATE POLICY "Teachers and above can create assignments" 
  ON assignments FOR INSERT 
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'consultor', 'equipo_directivo', 'lider_generacion')
    )
  );

-- Policy: Assignment creators can update their own assignments
CREATE POLICY "Assignment creators can update their own assignments" 
  ON assignments FOR UPDATE 
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Policy: Admins can delete assignments
CREATE POLICY "Admins can delete assignments" 
  ON assignments FOR DELETE 
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Create RLS policies for assignment_submissions table
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Students can view their own submissions
CREATE POLICY "Students can view their own submissions" 
  ON assignment_submissions FOR SELECT 
  USING (student_id = auth.uid());

-- Policy: Teachers can view submissions for their assignments
CREATE POLICY "Teachers can view submissions for their assignments" 
  ON assignment_submissions FOR SELECT 
  USING (
    assignment_id IN (
      SELECT id FROM assignments 
      WHERE created_by = auth.uid()
    )
  );

-- Policy: Students can create and update their own submissions
CREATE POLICY "Students can create their own submissions" 
  ON assignment_submissions FOR INSERT 
  WITH CHECK (
    student_id = auth.uid() 
    AND auth.uid() IN (
      SELECT id FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('lider_comunidad', 'docente')
    )
  );

CREATE POLICY "Students can update their own submissions" 
  ON assignment_submissions FOR UPDATE 
  USING (student_id = auth.uid() AND status IN ('draft', 'submitted'))
  WITH CHECK (student_id = auth.uid());

-- Policy: Teachers can update submissions (for grading)
CREATE POLICY "Teachers can grade submissions" 
  ON assignment_submissions FOR UPDATE 
  USING (
    assignment_id IN (
      SELECT id FROM assignments 
      WHERE created_by = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignment_submissions_updated_at BEFORE UPDATE ON assignment_submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE assignments IS 'Stores individual assignments created by teachers';
COMMENT ON TABLE assignment_submissions IS 'Stores student submissions for assignments';
COMMENT ON COLUMN assignments.assignment_type IS 'Type of assignment: task, quiz, project, etc.';
COMMENT ON COLUMN assignment_submissions.status IS 'Submission status: draft, submitted, graded, returned';