-- Fix public access to events table
-- The issue: The current policy references auth_is_superadmin() which doesn't exist
-- and the policy checks user_roles table which anonymous users can't access

-- Drop existing policies
DROP POLICY IF EXISTS "Public can view published events" ON public.events;
DROP POLICY IF EXISTS "Authorized roles can manage events" ON public.events;

-- Create new policy for public viewing (no authentication required)
CREATE POLICY "Public can view published events" ON public.events
    FOR SELECT
    TO anon, authenticated
    USING (is_published = true);

-- Create separate policy for authenticated users to manage events
CREATE POLICY "Authorized roles can manage events" ON public.events
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.is_active = true
            AND ur.role_type IN ('admin', 'community_manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.is_active = true
            AND ur.role_type IN ('admin', 'community_manager')
        )
    );

-- Add a comment explaining the fix
COMMENT ON POLICY "Public can view published events" ON public.events IS 
'Allows anonymous and authenticated users to view published events without authentication';

COMMENT ON POLICY "Authorized roles can manage events" ON public.events IS 
'Only admins and community managers can create, update, or delete events';