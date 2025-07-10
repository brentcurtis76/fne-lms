-- Fix Notification System Constraints
-- This script resolves foreign key constraint issues and schema mismatches
-- Date: 2025-01-10

-- 1. Make notification_type_id nullable to prevent foreign key errors
ALTER TABLE user_notifications 
ALTER COLUMN notification_type_id DROP NOT NULL;

-- 2. Insert default notification types if they don't exist
INSERT INTO notification_types (id, name, description, category, importance, is_active) 
VALUES 
    ('general', 'Notificación General', 'Notificación general del sistema', 'general', 'normal', true),
    ('assignment', 'Tarea', 'Notificación de tareas y asignaciones', 'tareas', 'normal', true),
    ('message', 'Mensaje', 'Notificación de mensajes', 'mensajes', 'high', true),
    ('feedback', 'Retroalimentación', 'Notificación de feedback', 'feedback', 'normal', true),
    ('system', 'Sistema', 'Notificación del sistema', 'sistema', 'low', true),
    ('course', 'Curso', 'Notificación de cursos', 'cursos', 'normal', true),
    ('quiz', 'Evaluación', 'Notificación de evaluaciones', 'evaluaciones', 'normal', true),
    ('group_assignment', 'Tarea Grupal', 'Notificación de tareas grupales', 'tareas', 'normal', true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true;

-- 3. Update any NULL notification_type_id to 'general'
UPDATE user_notifications 
SET notification_type_id = 'general'
WHERE notification_type_id IS NULL;

-- 4. Add missing columns to user_notifications if they don't exist
DO $$
BEGIN
    -- Add category column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_notifications' 
                   AND column_name = 'category') THEN
        ALTER TABLE user_notifications ADD COLUMN category VARCHAR(50);
    END IF;
    
    -- Add importance column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'user_notifications' 
                   AND column_name = 'importance') THEN
        ALTER TABLE user_notifications ADD COLUMN importance VARCHAR(20) DEFAULT 'normal';
    END IF;
END $$;

-- 5. Update category based on notification_type_id
UPDATE user_notifications un
SET category = nt.category
FROM notification_types nt
WHERE un.notification_type_id = nt.id
AND un.category IS NULL;

-- 6. Create index for better performance if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_user_notifications_type_id 
ON user_notifications(notification_type_id);

-- 7. Verify the fix
SELECT 
    'Notification Types' as check_type,
    COUNT(*) as count,
    'Should be at least 8' as expected
FROM notification_types
UNION ALL
SELECT 
    'User Notifications with NULL type',
    COUNT(*),
    'Should be 0'
FROM user_notifications
WHERE notification_type_id IS NULL
UNION ALL
SELECT 
    'Total User Notifications',
    COUNT(*),
    'Information only'
FROM user_notifications;