-- ============================================
-- FNE LMS - Manual Sample Notifications Insert
-- ============================================
-- STEP 1: Find your user ID first
SELECT id, email FROM auth.users LIMIT 5;

-- STEP 2: Using user ID: 4ae17b21-8977-425c-b05a-ca7cdb8b9df5
-- STEP 3: Run each INSERT statement below

-- Get available notification types to use
SELECT id, name, category FROM notification_types ORDER BY category, name;

-- ============================================
-- SAMPLE NOTIFICATIONS (5 UNREAD, 3 READ)
-- ============================================

-- 1. UNREAD - Nueva tarea asignada (2 hours ago)
INSERT INTO user_notifications (
    user_id, 
    notification_type_id, 
    title, 
    description, 
    related_url, 
    is_read, 
    created_at
) VALUES (
    '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID,
    (SELECT id FROM notification_types LIMIT 1),
    'Nueva tarea asignada',
    'Se te ha asignado la tarea ''Análisis de Mercado'' en el curso de Marketing Digital',
    '/cursos/marketing-digital/tareas/analisis-mercado',
    FALSE,
    NOW() - INTERVAL '2 hours'
);

-- 2. UNREAD - Mensaje de instructor (4 hours ago)
INSERT INTO user_notifications (
    user_id, 
    notification_type_id, 
    title, 
    description, 
    related_url, 
    is_read, 
    created_at
) VALUES (
    '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID,
    (SELECT id FROM notification_types LIMIT 1),
    'Mensaje de instructor',
    'Carlos Mendoza te ha enviado feedback sobre tu último proyecto',
    '/mensajes/carlos-mendoza',
    FALSE,
    NOW() - INTERVAL '4 hours'
);

-- 3. UNREAD - Curso completado (1 day ago)
INSERT INTO user_notifications (
    user_id, 
    notification_type_id, 
    title, 
    description, 
    related_url, 
    is_read, 
    created_at
) VALUES (
    '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID,
    (SELECT id FROM notification_types LIMIT 1),
    'Curso completado',
    '¡Felicitaciones! Has completado el módulo ''Fundamentos de SEO''',
    '/cursos/seo-fundamentos/certificado',
    FALSE,
    NOW() - INTERVAL '1 day'
);

-- 4. UNREAD - Tarea próxima a vencer (6 hours ago)
INSERT INTO user_notifications (
    user_id, 
    notification_type_id, 
    title, 
    description, 
    related_url, 
    is_read, 
    created_at
) VALUES (
    '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID,
    (SELECT id FROM notification_types LIMIT 1),
    'Tarea próxima a vencer',
    'Tu tarea ''Plan de Contenidos'' vence mañana a las 23:59',
    '/cursos/content-marketing/tareas/plan-contenidos',
    FALSE,
    NOW() - INTERVAL '6 hours'
);

-- 5. UNREAD - Usuario aprobado (30 minutes ago)
INSERT INTO user_notifications (
    user_id, 
    notification_type_id, 
    title, 
    description, 
    related_url, 
    is_read, 
    created_at
) VALUES (
    '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID,
    (SELECT id FROM notification_types LIMIT 1),
    'Usuario aprobado',
    'Tu solicitud de acceso avanzado ha sido aprobada por el administrador',
    '/perfil/permisos',
    FALSE,
    NOW() - INTERVAL '30 minutes'
);

-- 6. READ - Sistema actualizado (2 days ago)
INSERT INTO user_notifications (
    user_id, 
    notification_type_id, 
    title, 
    description, 
    related_url, 
    is_read, 
    created_at,
    read_at
) VALUES (
    '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID,
    (SELECT id FROM notification_types LIMIT 1),
    'Sistema actualizado',
    'La plataforma se ha actualizado con nuevas funcionalidades de colaboración',
    '/novedades/actualizacion-v2-1',
    TRUE,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day'
);

-- 7. READ - Consultor asignado (3 days ago)
INSERT INTO user_notifications (
    user_id, 
    notification_type_id, 
    title, 
    description, 
    related_url, 
    is_read, 
    created_at,
    read_at
) VALUES (
    '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID,
    (SELECT id FROM notification_types LIMIT 1),
    'Consultor asignado',
    'María López ha sido asignada como tu nueva consultora académica',
    '/consultores/maria-lopez',
    TRUE,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '2 days'
);

-- 8. READ - Nuevo material disponible (1 week ago)
INSERT INTO user_notifications (
    user_id, 
    notification_type_id, 
    title, 
    description, 
    related_url, 
    is_read, 
    created_at,
    read_at
) VALUES (
    '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID,
    (SELECT id FROM notification_types LIMIT 1),
    'Nuevo material disponible',
    'Se ha subido material complementario para el módulo de Analytics',
    '/cursos/analytics/material/complementario',
    TRUE,
    NOW() - INTERVAL '1 week',
    NOW() - INTERVAL '5 days'
);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check that notifications were created
SELECT 
    title, 
    description, 
    is_read, 
    created_at,
    notification_type_id
FROM user_notifications 
WHERE user_id = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID
ORDER BY created_at DESC;

-- Count unread notifications (should be 5)
SELECT COUNT(*) as unread_count 
FROM user_notifications 
WHERE user_id = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID 
AND is_read = FALSE;

-- Count total notifications (should be 8)
SELECT COUNT(*) as total_count 
FROM user_notifications 
WHERE user_id = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID;