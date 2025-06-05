-- =============================================
-- FNE LMS NOTIFICATION SYSTEM - VERIFICATION QUERIES
-- =============================================
-- Copy and paste these queries into Supabase SQL Editor
-- to verify the notification system database setup.
-- =============================================

-- QUERY 1: Check if notification tables exist
-- Expected Result: 3 rows showing all notification tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('notifications', 'notification_types', 'user_notification_preferences')
ORDER BY table_name;

-- QUERY 2: Check notification_types data
-- Expected Result: 20 rows with all notification types
SELECT 
  id,
  name,
  description,
  category,
  default_enabled,
  created_at
FROM notification_types 
ORDER BY category, name;

-- QUERY 3: Count records in each table
-- Expected Results:
-- notification_types: 20 records
-- notifications: 0 records (empty - normal for new system)
-- user_notification_preferences: 0 records (empty - normal for new system)
SELECT 
  'notification_types' as table_name,
  COUNT(*) as record_count
FROM notification_types
UNION ALL
SELECT 
  'notifications' as table_name,
  COUNT(*) as record_count
FROM notifications
UNION ALL
SELECT 
  'user_notification_preferences' as table_name,
  COUNT(*) as record_count
FROM user_notification_preferences;

-- QUERY 4: Check table structure for notification_types
-- Expected Result: Column details for notification_types table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'notification_types'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- QUERY 5: Check notification types by category
-- Expected Result: Grouped view of notification types
SELECT 
  category,
  COUNT(*) as type_count,
  STRING_AGG(id, ', ' ORDER BY id) as notification_ids
FROM notification_types
GROUP BY category
ORDER BY category;

-- QUERY 6: Check RLS (Row Level Security) status
-- Expected Result: Should show RLS is enabled on all tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('notifications', 'notification_types', 'user_notification_preferences')
AND schemaname = 'public';

-- =============================================
-- EXPECTED RESULTS SUMMARY:
-- =============================================
-- • 3 tables should exist: notifications, notification_types, user_notification_preferences
-- • 20 notification types across 8 categories
-- • Categories: admin (3), assignments (4), courses (3), feedback (1), messaging (2), social (1), system (3), workspace (3)
-- • All tables should have RLS enabled
-- • notification_types should have 20 records
-- • notifications and user_notification_preferences should be empty (normal for new system)
-- =============================================