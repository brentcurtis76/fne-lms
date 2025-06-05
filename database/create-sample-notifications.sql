-- ============================================
-- FNE LMS - Create Sample Notifications for Testing
-- ============================================
-- Run this script to create 8 sample notifications for immediate testing

-- First, get the current user ID (replace with your actual user ID)
-- To find your user ID, run: SELECT id, email FROM auth.users LIMIT 5;

-- For this example, I'll use a placeholder - REPLACE WITH YOUR ACTUAL USER ID
DO $$
DECLARE
    test_user_id UUID;
    notification_type_id VARCHAR;
BEGIN
    -- Get the first user from auth.users (replace this with your actual user ID)
    SELECT id INTO test_user_id FROM auth.users LIMIT 1;
    
    IF test_user_id IS NULL THEN
        RAISE EXCEPTION 'No users found in auth.users table. Please ensure you have a user account.';
    END IF;
    
    RAISE NOTICE 'Creating sample notifications for user: %', test_user_id;

    -- 1. UNREAD - Nueva tarea asignada (2 hours ago)
    SELECT id INTO notification_type_id FROM notification_types WHERE name ILIKE '%tarea%' OR name ILIKE '%asignada%' LIMIT 1;
    IF notification_type_id IS NULL THEN
        SELECT id INTO notification_type_id FROM notification_types WHERE category = 'assignments' LIMIT 1;
    END IF;
    
    INSERT INTO user_notifications (user_id, notification_type_id, title, description, related_url, is_read, created_at)
    VALUES (
        test_user_id,
        COALESCE(notification_type_id, (SELECT id FROM notification_types LIMIT 1)),
        'Nueva tarea asignada',
        'Se te ha asignado la tarea ''Análisis de Mercado'' en el curso de Marketing Digital',
        '/cursos/marketing-digital/tareas/analisis-mercado',
        FALSE,
        NOW() - INTERVAL '2 hours'
    );

    -- 2. UNREAD - Mensaje de instructor (4 hours ago)
    SELECT id INTO notification_type_id FROM notification_types WHERE name ILIKE '%mensaje%' OR category = 'messaging' LIMIT 1;
    
    INSERT INTO user_notifications (user_id, notification_type_id, title, description, related_url, is_read, created_at)
    VALUES (
        test_user_id,
        COALESCE(notification_type_id, (SELECT id FROM notification_types LIMIT 1)),
        'Mensaje de instructor',
        'Carlos Mendoza te ha enviado feedback sobre tu último proyecto',
        '/mensajes/carlos-mendoza',
        FALSE,
        NOW() - INTERVAL '4 hours'
    );

    -- 3. UNREAD - Curso completado (1 day ago)
    SELECT id INTO notification_type_id FROM notification_types WHERE name ILIKE '%curso%' OR category = 'courses' LIMIT 1;
    
    INSERT INTO user_notifications (user_id, notification_type_id, title, description, related_url, is_read, created_at)
    VALUES (
        test_user_id,
        COALESCE(notification_type_id, (SELECT id FROM notification_types LIMIT 1)),
        'Curso completado',
        '¡Felicitaciones! Has completado el módulo ''Fundamentos de SEO''',
        '/cursos/seo-fundamentos/certificado',
        FALSE,
        NOW() - INTERVAL '1 day'
    );

    -- 4. READ - Sistema actualizado (2 days ago)
    SELECT id INTO notification_type_id FROM notification_types WHERE name ILIKE '%sistema%' OR name ILIKE '%actualiz%' OR category = 'system' LIMIT 1;
    
    INSERT INTO user_notifications (user_id, notification_type_id, title, description, related_url, is_read, created_at, read_at)
    VALUES (
        test_user_id,
        COALESCE(notification_type_id, (SELECT id FROM notification_types LIMIT 1)),
        'Sistema actualizado',
        'La plataforma se ha actualizado con nuevas funcionalidades de colaboración',
        '/novedades/actualizacion-v2-1',
        TRUE,
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '1 day'
    );

    -- 5. READ - Consultor asignado (3 days ago)
    SELECT id INTO notification_type_id FROM notification_types WHERE name ILIKE '%consultor%' OR category = 'admin' LIMIT 1;
    
    INSERT INTO user_notifications (user_id, notification_type_id, title, description, related_url, is_read, created_at, read_at)
    VALUES (
        test_user_id,
        COALESCE(notification_type_id, (SELECT id FROM notification_types LIMIT 1)),
        'Consultor asignado',
        'María López ha sido asignada como tu nueva consultora académica',
        '/consultores/maria-lopez',
        TRUE,
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '2 days'
    );

    -- 6. UNREAD - Tarea próxima a vencer (6 hours ago)
    SELECT id INTO notification_type_id FROM notification_types WHERE name ILIKE '%tarea%' OR name ILIKE '%vencer%' OR category = 'assignments' LIMIT 1;
    
    INSERT INTO user_notifications (user_id, notification_type_id, title, description, related_url, is_read, created_at)
    VALUES (
        test_user_id,
        COALESCE(notification_type_id, (SELECT id FROM notification_types LIMIT 1)),
        'Tarea próxima a vencer',
        'Tu tarea ''Plan de Contenidos'' vence mañana a las 23:59',
        '/cursos/content-marketing/tareas/plan-contenidos',
        FALSE,
        NOW() - INTERVAL '6 hours'
    );

    -- 7. READ - Nuevo material disponible (1 week ago)
    SELECT id INTO notification_type_id FROM notification_types WHERE name ILIKE '%material%' OR name ILIKE '%lección%' OR category = 'courses' LIMIT 1;
    
    INSERT INTO user_notifications (user_id, notification_type_id, title, description, related_url, is_read, created_at, read_at)
    VALUES (
        test_user_id,
        COALESCE(notification_type_id, (SELECT id FROM notification_types LIMIT 1)),
        'Nuevo material disponible',
        'Se ha subido material complementario para el módulo de Analytics',
        '/cursos/analytics/material/complementario',
        TRUE,
        NOW() - INTERVAL '1 week',
        NOW() - INTERVAL '5 days'
    );

    -- 8. UNREAD - Usuario aprobado (30 minutes ago)
    SELECT id INTO notification_type_id FROM notification_types WHERE name ILIKE '%usuario%' OR name ILIKE '%aprobado%' OR category = 'admin' LIMIT 1;
    
    INSERT INTO user_notifications (user_id, notification_type_id, title, description, related_url, is_read, created_at)
    VALUES (
        test_user_id,
        COALESCE(notification_type_id, (SELECT id FROM notification_types LIMIT 1)),
        'Usuario aprobado',
        'Tu solicitud de acceso avanzado ha sido aprobada por el administrador',
        '/perfil/permisos',
        FALSE,
        NOW() - INTERVAL '30 minutes'
    );

    RAISE NOTICE 'Successfully created 8 sample notifications!';
    RAISE NOTICE 'Unread notifications: 5 (should show badge "5")';
    RAISE NOTICE 'Read notifications: 3';
    RAISE NOTICE 'User ID used: %', test_user_id;

END $$;