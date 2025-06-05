-- =============================================
-- INSERT DEFAULT NOTIFICATION TYPES
-- =============================================
-- This script inserts the specific default notification types
-- requested for the FNE LMS notification system.
-- =============================================

-- Insert the default notification types
INSERT INTO notification_types (id, name, description, category, default_enabled) VALUES
('course_assigned', 'Curso Asignado', 'Notificación cuando se asigna un nuevo curso', 'courses', true),
('message_received', 'Mensaje Recibido', 'Notificación cuando recibes un mensaje directo', 'messaging', true),
('message_mentioned', 'Mencionado en Mensaje', 'Notificación cuando te mencionan en un mensaje', 'messaging', true),
('post_mentioned', 'Mencionado en Publicación', 'Notificación cuando te mencionan en una publicación', 'social', true),
('assignment_assigned', 'Tarea Asignada', 'Notificación cuando te asignan una nueva tarea', 'assignments', true),
('feedback_received', 'Retroalimentación Recibida', 'Notificación cuando recibes feedback de un instructor', 'feedback', true)

-- Use ON CONFLICT to handle duplicates gracefully
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_enabled = EXCLUDED.default_enabled;

-- Verify the insertion
SELECT 
  id,
  name,
  description,
  category,
  default_enabled,
  created_at
FROM notification_types 
WHERE id IN (
  'course_assigned',
  'message_received', 
  'message_mentioned',
  'post_mentioned',
  'assignment_assigned',
  'feedback_received'
)
ORDER BY category, id;