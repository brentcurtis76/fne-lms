-- Fix notification types in user_notifications table
-- This migration updates invalid notification_type_id values to match the correct IDs from notification_types table

-- First, let's update the notifications with invalid string IDs to the correct numeric IDs
UPDATE user_notifications
SET notification_type_id = 
  CASE 
    WHEN notification_type_id = 'system_maintenance' THEN 'system_maintenance'
    WHEN notification_type_id = 'user_approved' THEN 'user_approved'
    WHEN notification_type_id = 'course_completed' THEN 'course_completed'
    WHEN notification_type_id = 'assignment_created' THEN 'assignment_created'
    WHEN notification_type_id = 'message_received' THEN 'message_received'
    WHEN notification_type_id = 'feedback_received' THEN 'feedback_received'
    WHEN notification_type_id = 'system_update' THEN 'system_update'
    ELSE notification_type_id
  END
WHERE notification_type_id IN (
  'system_maintenance', 
  'user_approved', 
  'course_completed', 
  'assignment_created', 
  'message_received', 
  'feedback_received', 
  'system_update'
);

-- For NULL notification_type_id, we need to determine the type based on the title/content
-- Let's update common patterns
UPDATE user_notifications
SET notification_type_id = 'assignment_created'
WHERE notification_type_id IS NULL 
  AND title LIKE '%tarea%';

UPDATE user_notifications
SET notification_type_id = 'course_assigned'
WHERE notification_type_id IS NULL 
  AND title LIKE '%curso%';

UPDATE user_notifications
SET notification_type_id = 'message_received'
WHERE notification_type_id IS NULL 
  AND (title LIKE '%mensaje%' OR title LIKE '%comentario%');

UPDATE user_notifications
SET notification_type_id = 'feedback_received'
WHERE notification_type_id IS NULL 
  AND title LIKE '%feedback%';

UPDATE user_notifications
SET notification_type_id = 'consultant_assigned'
WHERE notification_type_id IS NULL 
  AND title LIKE '%consultor%';

UPDATE user_notifications
SET notification_type_id = 'user_approved'
WHERE notification_type_id IS NULL 
  AND title LIKE '%aprobad%';

UPDATE user_notifications
SET notification_type_id = 'system_update'
WHERE notification_type_id IS NULL 
  AND (title LIKE '%actualiza%' OR title LIKE '%sistema%');

-- Set any remaining NULL values to a default type
UPDATE user_notifications
SET notification_type_id = 'system_update'
WHERE notification_type_id IS NULL;

-- Add a constraint to prevent NULL notification_type_id in the future
ALTER TABLE user_notifications
ALTER COLUMN notification_type_id SET NOT NULL;