-- Santa Marta Instance ID Verification Query
-- Run this in Supabase SQL Editor with service role

-- Check for mismatched instance_id values
SELECT 
    'Mismatched instance_id rows' as check_type,
    COUNT(*) as count
FROM auth.users u
WHERE u.instance_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM auth.instances i 
    WHERE i.id = u.instance_id
);

-- Also check total users with instance_id set
SELECT 
    'Total users with instance_id' as check_type,
    COUNT(*) as count
FROM auth.users
WHERE instance_id IS NOT NULL;

-- Check if auth.instances table exists and has data
SELECT 
    'Total instances in auth.instances' as check_type,
    COUNT(*) as count
FROM auth.instances;