-- Fix notification_type_id constraint issue
-- Either make it nullable or provide default values

-- Option 1: Make notification_type_id nullable (recommended for Phase 3)
ALTER TABLE user_notifications 
ALTER COLUMN notification_type_id DROP NOT NULL;

-- Option 2: Create default notification types if they don't exist
INSERT INTO notification_types (id, name, description, category, importance, is_active) 
VALUES 
    ('general-type', 'General', 'General notification', 'general', 'normal', true),
    ('assignment-type', 'Assignment', 'Assignment notification', 'tareas', 'normal', true),
    ('message-type', 'Message', 'Message notification', 'mensajes', 'high', true),
    ('course-type', 'Course', 'Course notification', 'cursos', 'normal', true),
    ('system-type', 'System', 'System notification', 'sistema', 'low', true)
ON CONFLICT (id) DO NOTHING;

-- Verify the fix
SELECT constraint_name, column_name, is_nullable 
FROM information_schema.key_column_usage k
JOIN information_schema.columns c ON k.column_name = c.column_name
WHERE k.table_name = 'user_notifications' 
AND c.table_name = 'user_notifications'
AND k.column_name = 'notification_type_id';