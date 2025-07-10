-- =====================================================================
-- Add Foreign Key Constraint: profiles.id -> auth.users.id
-- =====================================================================
-- This migration ensures data integrity between profiles and auth.users
-- 
-- IMPORTANT: Run the data integrity check BEFORE applying this migration:
--   node scripts/check-user-data-integrity.js
-- 
-- If any orphaned records exist, clean them up first:
--   node scripts/cleanup-orphaned-users.js --execute
-- =====================================================================

BEGIN;

-- Step 1: Verify no orphaned profiles exist
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphaned_count
  FROM profiles p
  LEFT JOIN auth.users u ON p.id = u.id
  WHERE u.id IS NULL;
  
  IF orphaned_count > 0 THEN
    RAISE EXCEPTION 'Cannot add foreign key constraint: % orphaned profile records exist. Run cleanup script first.', orphaned_count;
  END IF;
  
  RAISE NOTICE 'Data integrity check passed: No orphaned profiles found';
END $$;

-- Step 2: Add the foreign key constraint with CASCADE DELETE
-- This ensures that when an auth user is deleted, the profile is also deleted
ALTER TABLE profiles
ADD CONSTRAINT fk_profiles_auth_users
FOREIGN KEY (id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

-- Step 3: Add a helpful comment to the constraint
COMMENT ON CONSTRAINT fk_profiles_auth_users ON profiles IS 
'Ensures profiles can only exist for valid auth users. Deleting an auth user will automatically delete the associated profile.';

-- Step 4: Create a trigger to ensure profiles are created for new auth users
-- This prevents orphaned auth users
CREATE OR REPLACE FUNCTION ensure_profile_exists()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if profile already exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    -- Create a basic profile
    INSERT INTO public.profiles (
      id,
      email,
      name,
      approval_status,
      must_change_password,
      created_at
    ) VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      'pending',
      true,
      NOW()
    );
    
    RAISE NOTICE 'Created profile for auth user %', NEW.email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS ensure_profile_on_user_create ON auth.users;

-- Create the trigger
CREATE TRIGGER ensure_profile_on_user_create
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION ensure_profile_exists();

-- Step 5: Add index for better performance on the foreign key
CREATE INDEX IF NOT EXISTS idx_profiles_id_fk ON profiles(id);

COMMIT;

-- =====================================================================
-- Rollback Instructions (if needed):
-- 
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_auth_users;
-- DROP TRIGGER IF EXISTS ensure_profile_on_user_create ON auth.users;
-- DROP FUNCTION IF EXISTS ensure_profile_exists();
-- =====================================================================