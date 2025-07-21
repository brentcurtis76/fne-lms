-- FNE LMS Initial Test Database Migration
-- This file contains the complete schema setup for a test database
-- Run this file to create all tables, indexes, functions, and RLS policies

-- 1. First, load the complete schema
\i complete-test-schema.sql

-- 2. Then, load the RLS policies and functions
\i test-rls-policies.sql

-- 3. Insert some test data for development

-- Insert test schools
INSERT INTO schools (id, name, city, region, has_generations) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Test School 1', 'Santiago', 'RM', true),
    ('550e8400-e29b-41d4-a716-446655440002', 'Test School 2', 'Valparaíso', 'V', false),
    ('550e8400-e29b-41d4-a716-446655440003', 'Los Pellines', 'Los Pellines', 'VII', true)
ON CONFLICT DO NOTHING;

-- Insert test generation for schools with has_generations=true
INSERT INTO generations (id, name, school_id, start_date, end_date, is_active) VALUES
    ('650e8400-e29b-41d4-a716-446655440001', 'Generation 2025', '550e8400-e29b-41d4-a716-446655440001', '2025-01-01', '2025-12-31', true),
    ('650e8400-e29b-41d4-a716-446655440002', 'Generation 2025', '550e8400-e29b-41d4-a716-446655440003', '2025-01-01', '2025-12-31', true)
ON CONFLICT DO NOTHING;

-- Note: Test users should be created through the application's auth system
-- The following is just a reference for the expected user structure:
-- 
-- Test Admin User:
-- Email: admin@test.com
-- Role: admin
-- 
-- Test Teacher User:
-- Email: teacher@test.com
-- Role: docente
-- School: Test School 1
-- 
-- Test Consultant User:
-- Email: consultant@test.com
-- Role: consultor
-- 
-- Test Network Supervisor:
-- Email: supervisor@test.com
-- Role: supervisor_de_red

-- Create a test network
INSERT INTO redes_de_colegios (id, nombre, descripcion) VALUES
    ('750e8400-e29b-41d4-a716-446655440001', 'Red de Prueba', 'Red de colegios para pruebas')
ON CONFLICT DO NOTHING;

-- Add schools to the test network
INSERT INTO red_escuelas (red_id, school_id) VALUES
    ('750e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001'),
    ('750e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002')
ON CONFLICT DO NOTHING;

-- Create some test courses
INSERT INTO courses (id, title, description, is_published, category) VALUES
    ('850e8400-e29b-41d4-a716-446655440001', 'Introducción a la Educación', 'Curso básico de pedagogía', true, 'Pedagogía'),
    ('850e8400-e29b-41d4-a716-446655440002', 'Matemáticas Básicas', 'Fundamentos de matemáticas', true, 'Matemáticas'),
    ('850e8400-e29b-41d4-a716-446655440003', 'Liderazgo Educativo', 'Desarrollo de habilidades de liderazgo', false, 'Liderazgo')
ON CONFLICT DO NOTHING;

-- Output summary
DO $$
BEGIN
    RAISE NOTICE 'FNE LMS Test Database Migration Complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'Summary:';
    RAISE NOTICE '- All tables created with proper constraints';
    RAISE NOTICE '- RLS policies enabled on all tables';
    RAISE NOTICE '- Essential functions created';
    RAISE NOTICE '- Test data inserted (schools, generations, courses)';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Create test users through Supabase Auth';
    RAISE NOTICE '2. Assign roles using the application admin panel';
    RAISE NOTICE '3. Test all major workflows';
END $$;