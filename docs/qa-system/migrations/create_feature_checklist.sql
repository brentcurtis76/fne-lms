-- Migration: Create QA Feature Checklist Table
-- Created: 2026-01-16
-- Purpose: Track which features have QA scenarios vs. which are untested

-- Create the feature checklist table
CREATE TABLE IF NOT EXISTS qa_feature_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name TEXT NOT NULL,
  feature_area TEXT NOT NULL, -- matches existing feature_area enum in qa_scenarios
  description TEXT,
  route_pattern TEXT, -- e.g., '/admin/users/*'
  is_critical BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_qa_feature_checklist_area ON qa_feature_checklist(feature_area);
CREATE INDEX IF NOT EXISTS idx_qa_feature_checklist_critical ON qa_feature_checklist(is_critical) WHERE is_critical = true;

-- Enable RLS
ALTER TABLE qa_feature_checklist ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage feature checklist"
  ON qa_feature_checklist
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );

-- Policy: QA testers can view the checklist
CREATE POLICY "QA testers can view feature checklist"
  ON qa_feature_checklist
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND can_run_qa_tests = true
    )
  );

-- Add comment for documentation
COMMENT ON TABLE qa_feature_checklist IS 'Tracks features that should have QA test scenarios for coverage analysis';
COMMENT ON COLUMN qa_feature_checklist.feature_area IS 'Must match feature_area values in qa_scenarios table';
COMMENT ON COLUMN qa_feature_checklist.route_pattern IS 'URL pattern for the feature, supports wildcards';
COMMENT ON COLUMN qa_feature_checklist.is_critical IS 'Critical features are highlighted in coverage reports';

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_qa_feature_checklist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS trg_update_feature_checklist_timestamp ON qa_feature_checklist;
CREATE TRIGGER trg_update_feature_checklist_timestamp
  BEFORE UPDATE ON qa_feature_checklist
  FOR EACH ROW
  EXECUTE FUNCTION update_qa_feature_checklist_timestamp();

-- Seed initial features based on existing feature areas
-- These are common features that should be tested
INSERT INTO qa_feature_checklist (feature_name, feature_area, description, route_pattern, is_critical) VALUES
  ('Login de usuario', 'authentication', 'Verificar que usuarios pueden iniciar sesión correctamente', '/login', true),
  ('Logout de usuario', 'authentication', 'Verificar que usuarios pueden cerrar sesión', '/logout', true),
  ('Recuperación de contraseña', 'authentication', 'Proceso de recuperación de contraseña', '/forgot-password', true),
  ('Lista de usuarios', 'user_management', 'Visualización de lista de usuarios en admin', '/admin/user-management', true),
  ('Crear usuario', 'user_management', 'Creación de nuevos usuarios', '/admin/user-management', true),
  ('Editar usuario', 'user_management', 'Edición de datos de usuario existente', '/admin/user-management', false),
  ('Asignar roles', 'role_assignment', 'Asignación de roles a usuarios', '/admin/user-management', true),
  ('Lista de colegios', 'school_management', 'Visualización de colegios', '/admin/colegios', false),
  ('Crear colegio', 'school_management', 'Creación de nuevos colegios', '/admin/colegios', false),
  ('Constructor de cursos', 'course_builder', 'Crear y editar estructura de cursos', '/admin/courses/*', true),
  ('Añadir módulos', 'course_builder', 'Agregar módulos a un curso', '/admin/courses/*', true),
  ('Añadir lecciones', 'course_builder', 'Agregar lecciones a módulos', '/admin/courses/*', true),
  ('Asignar cursos', 'course_enrollment', 'Asignar cursos a usuarios/grupos', '/admin/courses/*', true),
  ('Ver progreso de curso', 'course_management', 'Ver progreso de estudiantes en cursos', '/admin/reporting', false),
  ('Constructor de evaluaciones', 'assessment_builder', 'Crear evaluaciones y quizzes', '/admin/assessment-builder/*', true),
  ('Evaluación de transformación', 'transformation_assessment', 'Completar evaluación de transformación', '/evaluacion-transformacion/*', true),
  ('Enviar quiz', 'quiz_submission', 'Estudiante envía respuestas de quiz', '/mi-aprendizaje/*', true),
  ('Panel de reportes', 'reporting', 'Visualización de reportes y estadísticas', '/admin/reporting', false),
  ('Gestión de redes', 'network_management', 'Administrar redes de colegios', '/admin/networks', false),
  ('Espacio de comunidad', 'community_workspace', 'Funcionalidad de workspace colaborativo', '/workspace/*', false),
  ('Grupos de trabajo', 'collaborative_space', 'Crear y gestionar grupos de trabajo', '/workspace/*', false),
  ('Navegación sidebar', 'navigation', 'Menú de navegación funciona correctamente', '/*', true),
  ('Dashboard docente', 'docente_experience', 'Panel principal del docente', '/dashboard', true),
  ('Mi aprendizaje', 'docente_experience', 'Vista de cursos asignados al docente', '/mi-aprendizaje', true)
ON CONFLICT DO NOTHING;
