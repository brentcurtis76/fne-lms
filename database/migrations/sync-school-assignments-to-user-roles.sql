-- =====================================================================
-- Migration: Sync School Assignments from profiles to user_roles
-- =====================================================================
-- Purpose: Assign school_id to user_roles for users who have school in
--          profiles but NULL in user_roles
--
-- Affected Users: 106 users across 3 schools
--   - Liceo Nacional de Llolleo: 47 users
--   - Santa Marta de Valdivia: 38 users
--   - Institución Sweet: 21 users
--
-- Safety:
--   - Wrapped in transaction with rollback capability
--   - Only updates NULL values (preserves existing data)
--   - No data deletion or overwriting
--
-- IMPORTANT: Create database backup before running!
-- =====================================================================

BEGIN;

-- Step 1: Log what we're about to change (for verification)
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO affected_count
    FROM user_roles ur
    INNER JOIN profiles p ON ur.user_id = p.id
    WHERE ur.school_id IS NULL
      AND p.school_id IS NOT NULL
      AND ur.is_active = true;

    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE 'MIGRATION: Sync School Assignments to user_roles';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE 'Users to be updated: %', affected_count;
    RAISE NOTICE '';
END $$;

-- Step 2: Update user_roles.school_id from profiles.school_id
-- SAFETY: Only updates for schools where profiles data is verified correct
-- Schools included: Liceo Nacional de Llolleo (17), Santa Marta de Valdivia (3), Institución Sweet (11)
-- Schools excluded: Any others (may have incorrect historical data)
UPDATE user_roles ur
SET school_id = p.school_id
FROM profiles p
WHERE ur.user_id = p.id
  AND ur.school_id IS NULL
  AND p.school_id IS NOT NULL
  AND ur.is_active = true
  AND p.school_id IN (17, 3, 11); -- Only verified schools

-- Step 3: Verify the update
DO $$
DECLARE
    updated_count INTEGER;
    liceo_count INTEGER;
    valdivia_count INTEGER;
    sweet_count INTEGER;
BEGIN
    -- Count total updated
    SELECT COUNT(*) INTO updated_count
    FROM user_roles ur
    INNER JOIN profiles p ON ur.user_id = p.id
    WHERE ur.school_id = p.school_id
      AND ur.is_active = true
      AND p.school_id IS NOT NULL;

    -- Count by school
    SELECT COUNT(*) INTO liceo_count
    FROM user_roles ur
    WHERE ur.school_id = 17 AND ur.is_active = true; -- Liceo Nacional de Llolleo

    SELECT COUNT(*) INTO valdivia_count
    FROM user_roles ur
    WHERE ur.school_id = 3 AND ur.is_active = true; -- Santa Marta de Valdivia

    SELECT COUNT(*) INTO sweet_count
    FROM user_roles ur
    WHERE ur.school_id = 11 AND ur.is_active = true; -- Institución Sweet

    RAISE NOTICE '';
    RAISE NOTICE '✅ VERIFICATION:';
    RAISE NOTICE '─────────────────────────────────────────────────';
    RAISE NOTICE 'Liceo Nacional de Llolleo: % users', liceo_count;
    RAISE NOTICE 'Santa Marta de Valdivia: % users', valdivia_count;
    RAISE NOTICE 'Institución Sweet: % users', sweet_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Expected: 106 users total';
    RAISE NOTICE 'Actual: % users with school assigned', updated_count;
    RAISE NOTICE '';
END $$;

-- Step 4: Final safety check
-- Ensure no NULL overwrites happened (should be 0)
DO $$
DECLARE
    null_check INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_check
    FROM user_roles ur
    INNER JOIN profiles p ON ur.user_id = p.id
    WHERE ur.school_id IS NULL
      AND p.school_id IS NOT NULL
      AND ur.is_active = true;

    IF null_check > 0 THEN
        RAISE EXCEPTION 'ROLLBACK: % users still have NULL school_id', null_check;
    END IF;

    RAISE NOTICE '🔒 SAFETY CHECK PASSED:';
    RAISE NOTICE 'All users with school in profiles now have school in user_roles';
    RAISE NOTICE '';
END $$;

-- Step 5: Success confirmation
DO $$
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION SUCCESSFUL';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Review the changes above';
    RAISE NOTICE '2. If everything looks correct, type: COMMIT;';
    RAISE NOTICE '3. If something is wrong, type: ROLLBACK;';
    RAISE NOTICE '';
    RAISE NOTICE 'Current state: Transaction is OPEN and uncommitted';
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;

-- DO NOT AUTO-COMMIT
-- User must manually review and type COMMIT; or ROLLBACK;
