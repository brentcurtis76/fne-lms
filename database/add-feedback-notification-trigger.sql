-- Add notification trigger for new feedback submissions
-- This will ensure admins are notified when users submit feedback

-- First, add the new event type to the notification system
INSERT INTO notification_triggers (
  event_type,
  is_active,
  created_at
) VALUES (
  'new_feedback',
  true,
  NOW()
) ON CONFLICT (event_type) DO NOTHING;

-- Create notification template for new feedback
INSERT INTO notification_templates (
  trigger_id,
  title_template,
  description_template,
  url_template,
  category,
  importance,
  created_at
) VALUES (
  (SELECT trigger_id FROM notification_triggers WHERE event_type = 'new_feedback'),
  'Nuevo Feedback: {feedback_type}',
  '{user_name} ha enviado un reporte: {description}',
  '/admin/feedback',
  'system',
  'normal',
  NOW()
) ON CONFLICT DO NOTHING;

-- Update notification service to handle new_feedback event
-- Add case for new_feedback in the getRecipients function
CREATE OR REPLACE FUNCTION handle_feedback_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Get all admin users
  PERFORM 
    user_id
  FROM profiles
  WHERE role = 'admin';
  
  -- The actual notification creation is handled by the application layer
  -- This trigger just ensures the database is ready
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: The actual notification sending is handled in the application code
-- This SQL just sets up the trigger configuration