-- Diagnostic query to check Andrea Lagos' expense report access
-- Run this to verify her permissions before applying the fix

-- 1. Find Andrea's user ID
SELECT
  id,
  email,
  raw_user_meta_data->>'first_name' as first_name,
  raw_user_meta_data->>'last_name' as last_name,
  created_at
FROM auth.users
WHERE email ILIKE '%andrea%lagos%'
   OR email ILIKE '%alagos%'
ORDER BY created_at DESC;

-- 2. Check if Andrea has expense_report_access record
SELECT
  u.email,
  u.raw_user_meta_data->>'first_name' as first_name,
  era.user_id,
  era.can_submit,
  era.notes,
  era.created_at,
  era.updated_at
FROM auth.users u
LEFT JOIN expense_report_access era ON era.user_id = u.id
WHERE u.email ILIKE '%andrea%lagos%'
   OR u.email ILIKE '%alagos%';

-- 3. Check Andrea's profiles record
SELECT
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.created_at
FROM profiles p
WHERE p.email ILIKE '%andrea%lagos%'
   OR p.email ILIKE '%alagos%';

-- 4. If Andrea doesn't have access, grant it
-- (Replace <ANDREA_USER_ID> with her actual UUID from query 1)
-- (Replace <ADMIN_USER_ID> with admin user ID who's granting access)

-- INSERT INTO expense_report_access (user_id, can_submit, granted_by, notes)
-- VALUES
--   ('<ANDREA_USER_ID>', TRUE, '<ADMIN_USER_ID>', 'Expense reports enabled for Andrea Lagos')
-- ON CONFLICT (user_id)
--   DO UPDATE SET
--     can_submit = TRUE,
--     notes = 'Expense reports re-enabled',
--     updated_at = NOW();