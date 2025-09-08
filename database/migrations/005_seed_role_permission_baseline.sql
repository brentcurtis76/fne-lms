-- Phase 2: Seed baseline permissions from current TypeScript matrix
-- This migration populates the baseline table with the default permissions
-- Using ON CONFLICT to make it idempotent (can be re-run safely)

-- Admin role - full permissions
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('admin', 'view_dashboard', true, '{"category": "navigation"}'),
  ('admin', 'manage_users', true, '{"category": "user_management"}'),
  ('admin', 'manage_courses', true, '{"category": "course_management"}'),
  ('admin', 'manage_roles', true, '{"category": "role_management"}'),
  ('admin', 'view_reports', true, '{"category": "reporting"}'),
  ('admin', 'manage_content', true, '{"category": "content_management"}'),
  ('admin', 'manage_generations', true, '{"category": "organization"}'),
  ('admin', 'manage_networks', true, '{"category": "organization"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Docente role
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('docente', 'view_dashboard', true, '{"category": "navigation"}'),
  ('docente', 'manage_users', false, '{"category": "user_management"}'),
  ('docente', 'manage_courses', false, '{"category": "course_management"}'),
  ('docente', 'manage_roles', false, '{"category": "role_management"}'),
  ('docente', 'view_reports', true, '{"category": "reporting"}'),
  ('docente', 'manage_content', true, '{"category": "content_management"}'),
  ('docente', 'manage_generations', false, '{"category": "organization"}'),
  ('docente', 'manage_networks', false, '{"category": "organization"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Estudiante role
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('estudiante', 'view_dashboard', true, '{"category": "navigation"}'),
  ('estudiante', 'manage_users', false, '{"category": "user_management"}'),
  ('estudiante', 'manage_courses', false, '{"category": "course_management"}'),
  ('estudiante', 'manage_roles', false, '{"category": "role_management"}'),
  ('estudiante', 'view_reports', false, '{"category": "reporting"}'),
  ('estudiante', 'manage_content', false, '{"category": "content_management"}'),
  ('estudiante', 'manage_generations', false, '{"category": "organization"}'),
  ('estudiante', 'manage_networks', false, '{"category": "organization"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Consultor role
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('consultor', 'view_dashboard', true, '{"category": "navigation"}'),
  ('consultor', 'manage_users', false, '{"category": "user_management"}'),
  ('consultor', 'manage_courses', false, '{"category": "course_management"}'),
  ('consultor', 'manage_roles', false, '{"category": "role_management"}'),
  ('consultor', 'view_reports', true, '{"category": "reporting"}'),
  ('consultor', 'manage_content', false, '{"category": "content_management"}'),
  ('consultor', 'manage_generations', false, '{"category": "organization"}'),
  ('consultor', 'manage_networks', false, '{"category": "organization", "note": "networks managed via generations permission"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Community Manager role
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('community_manager', 'view_dashboard', true, '{"category": "navigation"}'),
  ('community_manager', 'manage_users', false, '{"category": "user_management"}'),
  ('community_manager', 'manage_courses', false, '{"category": "course_management"}'),
  ('community_manager', 'manage_roles', false, '{"category": "role_management"}'),
  ('community_manager', 'view_reports', true, '{"category": "reporting"}'),
  ('community_manager', 'manage_content', true, '{"category": "content_management"}'),
  ('community_manager', 'manage_generations', false, '{"category": "organization"}'),
  ('community_manager', 'manage_networks', false, '{"category": "organization"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Supervisor de Red role
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('supervisor_de_red', 'view_dashboard', true, '{"category": "navigation"}'),
  ('supervisor_de_red', 'manage_users', false, '{"category": "user_management"}'),
  ('supervisor_de_red', 'manage_courses', false, '{"category": "course_management"}'),
  ('supervisor_de_red', 'manage_roles', false, '{"category": "role_management"}'),
  ('supervisor_de_red', 'view_reports', true, '{"category": "reporting"}'),
  ('supervisor_de_red', 'manage_content', false, '{"category": "content_management"}'),
  ('supervisor_de_red', 'manage_generations', false, '{"category": "organization"}'),
  ('supervisor_de_red', 'manage_networks', true, '{"category": "organization"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Additional roles that might exist in the system
-- Equipo Directivo role (if exists)
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('equipo_directivo', 'view_dashboard', true, '{"category": "navigation"}'),
  ('equipo_directivo', 'manage_users', false, '{"category": "user_management"}'),
  ('equipo_directivo', 'manage_courses', false, '{"category": "course_management"}'),
  ('equipo_directivo', 'manage_roles', false, '{"category": "role_management"}'),
  ('equipo_directivo', 'view_reports', true, '{"category": "reporting"}'),
  ('equipo_directivo', 'manage_content', false, '{"category": "content_management"}'),
  ('equipo_directivo', 'manage_generations', false, '{"category": "organization"}'),
  ('equipo_directivo', 'manage_networks', false, '{"category": "organization"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Lider Generacion role (if exists)
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('lider_generacion', 'view_dashboard', true, '{"category": "navigation"}'),
  ('lider_generacion', 'manage_users', false, '{"category": "user_management"}'),
  ('lider_generacion', 'manage_courses', false, '{"category": "course_management"}'),
  ('lider_generacion', 'manage_roles', false, '{"category": "role_management"}'),
  ('lider_generacion', 'view_reports', true, '{"category": "reporting"}'),
  ('lider_generacion', 'manage_content', false, '{"category": "content_management"}'),
  ('lider_generacion', 'manage_generations', false, '{"category": "organization"}'),
  ('lider_generacion', 'manage_networks', false, '{"category": "organization"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Lider Comunidad role (if exists)
INSERT INTO role_permission_baseline (role_type, permission_key, granted, metadata)
VALUES 
  ('lider_comunidad', 'view_dashboard', true, '{"category": "navigation"}'),
  ('lider_comunidad', 'manage_users', false, '{"category": "user_management"}'),
  ('lider_comunidad', 'manage_courses', false, '{"category": "course_management"}'),
  ('lider_comunidad', 'manage_roles', false, '{"category": "role_management"}'),
  ('lider_comunidad', 'view_reports', true, '{"category": "reporting"}'),
  ('lider_comunidad', 'manage_content', false, '{"category": "content_management"}'),
  ('lider_comunidad', 'manage_generations', false, '{"category": "organization"}'),
  ('lider_comunidad', 'manage_networks', false, '{"category": "organization"}')
ON CONFLICT (role_type, permission_key) 
DO UPDATE SET granted = EXCLUDED.granted, metadata = EXCLUDED.metadata;

-- Verify the seed was successful
DO $$
DECLARE
  baseline_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO baseline_count FROM role_permission_baseline;
  RAISE NOTICE 'Seeded % baseline permission entries', baseline_count;
END $$;