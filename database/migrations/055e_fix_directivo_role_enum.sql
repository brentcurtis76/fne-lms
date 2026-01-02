-- ============================================================
-- 055e_fix_directivo_role_enum.sql
-- CORRECTIVE MIGRATION: Fix auth_is_school_directivo function
--
-- The function was using 'directivo' but the correct enum value
-- in user_role_type is 'equipo_directivo'
-- ============================================================

-- Fix the auth_is_school_directivo function to use correct enum value
CREATE OR REPLACE FUNCTION auth_is_school_directivo(p_school_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role_type = 'equipo_directivo'  -- Fixed: was 'directivo'
    AND school_id = p_school_id
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Verify the fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed auth_is_school_directivo to use equipo_directivo enum value';
END;
$$;
