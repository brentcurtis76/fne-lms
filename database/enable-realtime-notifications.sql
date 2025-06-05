-- Enable Supabase Realtime for notifications and preferences tables
-- This allows real-time updates when notifications are created or updated

-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable realtime for user notification preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE user_notification_preferences;

-- Verify realtime is enabled
SELECT 
    schemaname,
    tablename 
FROM 
    pg_publication_tables 
WHERE 
    pubname = 'supabase_realtime'
    AND tablename IN ('notifications', 'user_notification_preferences');