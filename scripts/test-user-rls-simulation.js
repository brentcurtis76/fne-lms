const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function simulateUserQuery() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  console.log(`Simulating RLS for user: ${userId}`);
  console.log('=========================================\n');

  try {
    // First, let's check the RLS policies on the courses table
    const { data: policies, error: policyError } = await supabaseAdmin
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'courses')
      .order('policyname');

    if (policies && policies.length > 0) {
      console.log('RLS Policies on courses table:');
      console.log('-----------------------------');
      policies.forEach(policy => {
        console.log(`\nPolicy: ${policy.policyname}`);
        console.log(`Command: ${policy.cmd}`);
        console.log(`Roles: ${policy.roles}`);
        console.log(`Definition: ${policy.qual || 'N/A'}`);
      });
    }

    // Now let's check what the actual query would return
    console.log('\n\nChecking course data:');
    console.log('--------------------');

    // Get all courses as admin
    const { data: allCourses, error: coursesError } = await supabaseAdmin
      .from('courses')
      .select('id, title, created_by, is_published')
      .order('created_at', { ascending: false });

    if (allCourses) {
      console.log(`Total courses: ${allCourses.length}`);
      
      // Courses created by Brent
      const brentCourses = allCourses.filter(c => c.created_by === userId);
      console.log(`\nCourses created by Brent: ${brentCourses.length}`);
      brentCourses.forEach(c => {
        console.log(`- ${c.title} (Published: ${c.is_published})`);
      });

      // Published courses
      const publishedCourses = allCourses.filter(c => c.is_published);
      console.log(`\nPublished courses: ${publishedCourses.length}`);
      publishedCourses.forEach(c => {
        console.log(`- ${c.title} (Created by: ${c.created_by === userId ? 'Brent' : 'Other'})`);
      });
    }

    // Check if there's a specific issue with the RLS check
    console.log('\n\nChecking RLS function behavior:');
    console.log('-------------------------------');
    
    // Test the admin check that might be in the RLS policy
    let adminCheck, adminError;
    try {
      const result = await supabaseAdmin.rpc('check_if_user_is_admin', {
        user_id: userId
      });
      adminCheck = result.data;
      adminError = result.error;
    } catch (err) {
      console.log('No admin check function found, checking user_roles directly...');
      adminError = err;
    }

    // Direct check of user_roles
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', userId);

    console.log('\nUser roles found:', userRoles);

    // Check if there might be an issue with the auth.uid() function in RLS
    console.log('\n\nPotential RLS issues to investigate:');
    console.log('1. The RLS policy might be checking auth.uid() incorrectly');
    console.log('2. The admin check in RLS might be failing');
    console.log('3. The policy might have a syntax error or logic issue');
    console.log('4. The session user ID might not be properly set in the dashboard');

  } catch (err) {
    console.error('Error:', err);
  }
}

// Run the simulation
simulateUserQuery();