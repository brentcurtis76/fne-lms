-- Grant Community Managers access to pasantias_quotes and related tables

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Quote management by admins and consultors" ON public.pasantias_quotes;
DROP POLICY IF EXISTS "Quote groups management by admins and consultors" ON public.pasantias_quote_groups;

-- Create new policy for pasantias_quotes that includes community_managers
CREATE POLICY "Quote management by admins consultors and community managers" ON public.pasantias_quotes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role_type IN ('admin', 'consultor', 'community_manager')
            AND is_active = true
        )
    );

-- Create new policy for pasantias_quote_groups that includes community_managers
CREATE POLICY "Quote groups management by admins consultors and community managers" ON public.pasantias_quote_groups
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role_type IN ('admin', 'consultor', 'community_manager')
            AND is_active = true
        )
    );

-- Ensure public can still view quotes by ID for sharing
DROP POLICY IF EXISTS "Quotes are viewable by ID" ON public.pasantias_quotes;
CREATE POLICY "Quotes are viewable by ID" ON public.pasantias_quotes
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Quote groups are viewable by ID" ON public.pasantias_quote_groups;
CREATE POLICY "Quote groups are viewable by ID" ON public.pasantias_quote_groups
    FOR SELECT USING (true);