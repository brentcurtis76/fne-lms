-- Add the new course_assigned notification trigger
INSERT INTO notification_triggers (event_type, notification_template, category, trigger_condition) VALUES
('course_assigned', '{
  "title_template": "Nuevo curso asignado",
  "description_template": "Se te ha asignado el curso ''{course_name}''",
  "url_template": "/student/course/{course_id}",
  "importance": "normal"
}', 'cursos', '{"enabled": true, "immediate": true}')
ON CONFLICT (event_type) DO UPDATE
SET 
    notification_template = EXCLUDED.notification_template,
    category = EXCLUDED.category,
    trigger_condition = EXCLUDED.trigger_condition,
    updated_at = NOW();

-- Verify the trigger was created
SELECT * FROM notification_triggers WHERE event_type = 'course_assigned';