const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Community Manager Access Migration');
console.log('===================================\n');
console.log('This migration grants Community Managers access to Propuestas Pasantías.\n');

console.log('⚠️  MANUAL STEPS REQUIRED:');
console.log('\nPlease run the following SQL in your Supabase SQL editor:');
console.log('https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new\n');

console.log(`-- Grant Community Managers access to pasantias_quotes and related tables

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
`);

console.log('\n✅ After running this SQL:');
console.log('   - Community Managers will see "Propuestas Pasantías" in their sidebar');
console.log('   - They will be able to create, view, edit, and manage quotes');
console.log('   - All API endpoints will accept community_manager role');