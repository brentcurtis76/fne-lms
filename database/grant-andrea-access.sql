-- Grant expense report access to Andrea Lagos
-- This script ensures Andrea has the proper permissions to submit expense reports

-- Step 1: Get admin user ID for granted_by field
DO $$
DECLARE
  v_admin_id UUID;
  v_andrea_id UUID;
  v_andrea_email TEXT;
BEGIN
  -- Find admin user (adjust email if needed)
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE email = 'bcurtis@nuevaeducacion.org'
  LIMIT 1;

  -- Find Andrea's user ID
  SELECT id, email INTO v_andrea_id, v_andrea_email
  FROM auth.users
  WHERE email ILIKE '%andrea%'
    AND email ILIKE '%lagos%'
  LIMIT 1;

  -- Check if we found both users
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin user not found';
  END IF;

  IF v_andrea_id IS NULL THEN
    RAISE EXCEPTION 'Andrea Lagos user not found. Please provide her email address.';
  END IF;

  -- Grant access to Andrea
  INSERT INTO expense_report_access (user_id, can_submit, granted_by, notes)
  VALUES (v_andrea_id, TRUE, v_admin_id, 'Expense reports enabled for Andrea Lagos')
  ON CONFLICT (user_id)
  DO UPDATE SET
    can_submit = TRUE,
    granted_by = v_admin_id,
    notes = 'Expense reports re-enabled - RLS fix applied',
    updated_at = NOW();

  RAISE NOTICE 'Granted expense report access to % (ID: %)', v_andrea_email, v_andrea_id;
END $$;

-- Verify the grant was successful
SELECT
  u.email,
  u.raw_user_meta_data->>'first_name' as first_name,
  u.raw_user_meta_data->>'last_name' as last_name,
  era.can_submit,
  era.notes,
  era.created_at,
  era.updated_at
FROM expense_report_access era
JOIN auth.users u ON u.id = era.user_id
WHERE u.email ILIKE '%andrea%lagos%'
   OR u.email ILIKE '%alagos%';