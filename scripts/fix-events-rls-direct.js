const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function fixEventsRLS() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      db: {
        schema: 'public'
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  console.log('Fixing events table RLS policies...\n');
  
  try {
    // Since we can't execute raw SQL directly, we need to use Supabase Dashboard
    // or connect via psql. For now, let's document the issue and provide instructions
    
    console.log('MANUAL FIX REQUIRED:');
    console.log('===================');
    console.log('\nThe events table has an RLS policy issue that prevents public access.');
    console.log('The policy references a non-existent function auth_is_superadmin().');
    console.log('\nTo fix this, run the following SQL in Supabase Dashboard SQL Editor:\n');
    
    const fixSQL = `
-- Fix public access to events table
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Public can view published events" ON public.events;
DROP POLICY IF EXISTS "Authorized roles can manage events" ON public.events;

-- Create new policy for public viewing (no authentication required)
CREATE POLICY "Public can view published events" ON public.events
    FOR SELECT
    USING (is_published = true);

-- Create separate policy for authenticated users to manage events  
CREATE POLICY "Authorized roles can manage events" ON public.events
    FOR ALL
    TO authenticated
    USING (
        auth.uid() IN (
            SELECT user_id FROM public.user_roles 
            WHERE is_active = true 
            AND role_type IN ('admin', 'community_manager')
        )
    )
    WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM public.user_roles 
            WHERE is_active = true 
            AND role_type IN ('admin', 'community_manager')
        )
    );
`;
    
    console.log(fixSQL);
    
    console.log('\nSteps to apply:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to SQL Editor');
    console.log('4. Paste and run the SQL above');
    console.log('5. Test the /api/public/events endpoint again');
    
    // Test current status
    console.log('\n--- Current Status Test ---');
    const anonSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    const { data, error } = await anonSupabase
      .from('events')
      .select('id')
      .eq('is_published', true)
      .limit(1);
      
    if (error) {
      console.log('❌ Public access BLOCKED:', error.message);
    } else {
      console.log('✅ Public access WORKING');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

fixEventsRLS();