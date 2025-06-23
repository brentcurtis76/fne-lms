-- ===============================================
-- Comprehensive Feedback System Verification
-- ===============================================
-- This script checks all components of the feedback system
-- Run in Supabase SQL Editor to verify setup
-- ===============================================

-- SECTION 1: Check if core tables exist
SELECT 'CHECKING CORE TABLES' as check_type;

-- Check platform_feedback table
SELECT 
  'platform_feedback' as table_name,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_feedback' AND table_schema = 'public')
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- Check feedback_activity table  
SELECT 
  'feedback_activity' as table_name,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feedback_activity' AND table_schema = 'public')
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- SECTION 2: Check if enums exist
SELECT 'CHECKING ENUMS' as check_type;

SELECT 
  'feedback_type' as enum_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_type')
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

SELECT 
  'feedback_status' as enum_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_status')
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- SECTION 3: Check RLS policies
SELECT 'CHECKING RLS POLICIES' as check_type;

-- Count policies for platform_feedback
SELECT 
  'platform_feedback' as table_name,
  COUNT(*) as policy_count,
  CASE WHEN COUNT(*) >= 4 THEN '✅ SUFFICIENT' ELSE '❌ MISSING POLICIES' END as status
FROM pg_policies 
WHERE tablename = 'platform_feedback' AND schemaname = 'public';

-- Count policies for feedback_activity
SELECT 
  'feedback_activity' as table_name,
  COUNT(*) as policy_count,
  CASE WHEN COUNT(*) >= 2 THEN '✅ SUFFICIENT' ELSE '❌ MISSING POLICIES' END as status
FROM pg_policies 
WHERE tablename = 'feedback_activity' AND schemaname = 'public';

-- List all feedback-related policies
SELECT 
  tablename,
  policyname,
  cmd as permission,
  CASE 
    WHEN cmd = 'SELECT' THEN '📖'
    WHEN cmd = 'INSERT' THEN '➕'
    WHEN cmd = 'UPDATE' THEN '✏️'
    WHEN cmd = 'DELETE' THEN '🗑️'
    ELSE '❓'
  END as icon
FROM pg_policies 
WHERE tablename IN ('platform_feedback', 'feedback_activity') 
  AND schemaname = 'public'
ORDER BY tablename, cmd;

-- SECTION 4: Check storage bucket
SELECT 'CHECKING STORAGE BUCKET' as check_type;

-- Check if feedback-screenshots bucket exists
SELECT 
  'feedback-screenshots' as bucket_name,
  CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'feedback-screenshots')
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- Get bucket details if it exists
SELECT 
  id as bucket_id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets 
WHERE id = 'feedback-screenshots';

-- SECTION 5: Check storage policies
SELECT 'CHECKING STORAGE POLICIES' as check_type;

-- Count storage policies for feedback bucket
SELECT 
  'feedback-screenshots storage' as component,
  COUNT(*) as policy_count,
  CASE WHEN COUNT(*) >= 4 THEN '✅ SUFFICIENT' ELSE '❌ MISSING POLICIES' END as status
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%feedback%';

-- List storage policies
SELECT 
  policyname,
  cmd as permission,
  CASE 
    WHEN cmd = 'SELECT' THEN '📖'
    WHEN cmd = 'INSERT' THEN '➕'
    WHEN cmd = 'UPDATE' THEN '✏️'
    WHEN cmd = 'DELETE' THEN '🗑️'
    ELSE '❓'
  END as icon
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%feedback%'
ORDER BY cmd;

-- SECTION 6: Check functions and triggers
SELECT 'CHECKING FUNCTIONS AND TRIGGERS' as check_type;

-- Check feedback-related functions
SELECT 
  routine_name as function_name,
  routine_type,
  '✅ EXISTS' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_name LIKE '%feedback%' OR routine_name LIKE '%notification%')
ORDER BY routine_name;

-- Check triggers on platform_feedback table
SELECT 
  trigger_name,
  event_manipulation,
  '✅ EXISTS' as status
FROM information_schema.triggers
WHERE event_object_table = 'platform_feedback'
  AND event_object_schema = 'public'
ORDER BY trigger_name;

-- SECTION 7: Check notification system integration
SELECT 'CHECKING NOTIFICATION INTEGRATION' as check_type;

-- Check if new_feedback trigger exists in notification_triggers table
SELECT 
  'new_feedback trigger' as component,
  CASE WHEN EXISTS (SELECT 1 FROM notification_triggers WHERE event_type = 'new_feedback')
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- Check if notification template exists
SELECT 
  'new_feedback template' as component,
  CASE WHEN EXISTS (
    SELECT 1 FROM notification_templates nt
    JOIN notification_triggers ntr ON nt.trigger_id = ntr.trigger_id
    WHERE ntr.event_type = 'new_feedback'
  )
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- SECTION 8: Test data access (if any records exist)
SELECT 'CHECKING DATA ACCESS' as check_type;

-- Count existing feedback records
SELECT 
  'Total feedback records' as metric,
  COUNT(*) as count
FROM platform_feedback;

-- Count by status
SELECT 
  status,
  COUNT(*) as count
FROM platform_feedback
GROUP BY status
ORDER BY status;

-- Count by type
SELECT 
  type,
  COUNT(*) as count
FROM platform_feedback
GROUP BY type
ORDER BY type;

-- SECTION 9: Summary
SELECT 'VERIFICATION SUMMARY' as check_type;

-- Create a summary view
WITH component_checks AS (
  SELECT 'platform_feedback table' as component, 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_feedback' AND table_schema = 'public')
      THEN 1 ELSE 0 END as exists_flag
  UNION ALL
  SELECT 'feedback_activity table', 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feedback_activity' AND table_schema = 'public')
      THEN 1 ELSE 0 END
  UNION ALL
  SELECT 'feedback-screenshots bucket', 
    CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'feedback-screenshots')
      THEN 1 ELSE 0 END
  UNION ALL
  SELECT 'feedback_type enum', 
    CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_type')
      THEN 1 ELSE 0 END
  UNION ALL
  SELECT 'feedback_status enum', 
    CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_status')
      THEN 1 ELSE 0 END
  UNION ALL
  SELECT 'notification integration', 
    CASE WHEN EXISTS (SELECT 1 FROM notification_triggers WHERE event_type = 'new_feedback')
      THEN 1 ELSE 0 END
)
SELECT 
  component,
  CASE WHEN exists_flag = 1 THEN '✅ OK' ELSE '❌ MISSING' END as status
FROM component_checks
ORDER BY exists_flag DESC, component;

-- Final count
SELECT 
  'TOTAL MISSING COMPONENTS' as summary,
  (6 - (
    (CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_feedback' AND table_schema = 'public') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feedback_activity' AND table_schema = 'public') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'feedback-screenshots') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_type') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_status') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM notification_triggers WHERE event_type = 'new_feedback') THEN 1 ELSE 0 END)
  )) as missing_count;