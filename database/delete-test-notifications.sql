-- ============================================
-- Delete Test Notifications
-- ============================================
-- Run this in Supabase SQL Editor to remove all test notifications

-- Delete all notifications for your user
DELETE FROM user_notifications 
WHERE user_id = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID;

-- Verify deletion
SELECT COUNT(*) as remaining_notifications 
FROM user_notifications 
WHERE user_id = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'::UUID;