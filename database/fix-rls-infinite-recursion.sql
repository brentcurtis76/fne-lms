-- Fix infinite recursion in RLS policies
-- The issue is that policies are checking the profiles table to verify roles,
-- which creates circular dependencies when trying to read from profiles

-- First, drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Create new admin policies that check auth metadata instead of profiles table
CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id 
        OR 
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = id 
        OR 
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    )
    WITH CHECK (
        auth.uid() = id 
        OR 
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- Also fix the "Simple admin profile access" policy
DROP POLICY IF EXISTS "Simple admin profile access" ON profiles;

CREATE POLICY "Simple admin profile access" ON profiles
    FOR ALL
    TO authenticated
    USING (
        auth.uid() = id 
        OR 
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    )
    WITH CHECK (
        auth.uid() = id 
        OR 
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );

-- Ensure that profile self-access policies exist and are simple
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Test that we can query profiles without recursion
SELECT COUNT(*) FROM profiles LIMIT 1;