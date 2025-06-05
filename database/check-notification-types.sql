-- ============================================
-- Check Current Notification Types
-- ============================================
-- Run this first to see what notification types exist

SELECT 
    id, 
    name, 
    category, 
    created_at
FROM notification_types 
ORDER BY category, name;

-- Count by category
SELECT 
    category, 
    COUNT(*) as count
FROM notification_types 
GROUP BY category 
ORDER BY category;