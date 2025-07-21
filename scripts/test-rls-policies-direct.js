const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create Supabase admin client with service role key
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

async function testRLSPolicies() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  console.log(`Testing RLS policies for user: ${userId}`);
  console.log('=========================================\n');

  try {
    // Execute the RLS test query
    const { data, error } = await supabaseAdmin.rpc('execute_sql', {
      query: `
        -- Start a transaction
        BEGIN;
        
        -- Impersonate the user by setting the 'sub' (subject) claim in the JWT.
        SELECT set_config('request.jwt.claims', '{"sub": "${userId}", "role": "authenticated"}', true);
        
        -- Now, run the query that the dashboard would run.
        -- This will be subject to the RLS policies for the impersonated user.
        SELECT id, title, created_by, is_published FROM courses;
      `
    });

    if (error) {
      // If RPC doesn't exist, try direct query approach
      console.log('RPC method not available, trying direct query approach...\n');
      
      // First, let's get user info
      const { data: userData, error: userError } = await supabaseAdmin
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', userId)
        .single();

      if (userData) {
        console.log('User info:');
        console.log(`- Email: ${userData.email}`);
        console.log(`- Name: ${userData.first_name} ${userData.last_name}`);
      }

      // Get user roles
      const { data: rolesData, error: rolesError } = await supabaseAdmin
        .from('user_roles')
        .select('role_type, school_id, generation_id, community_id')
        .eq('user_id', userId);

      if (rolesData) {
        console.log('\nUser roles:');
        rolesData.forEach(role => {
          console.log(`- ${role.role_type} (School: ${role.school_id || 'N/A'}, Generation: ${role.generation_id || 'N/A'}, Community: ${role.community_id || 'N/A'})`);
        });
      }

      // Test what courses the user should see based on their roles
      console.log('\n\nTesting course visibility...');
      
      // Get all courses (admin view)
      const { data: allCourses, error: coursesError } = await supabaseAdmin
        .from('courses')
        .select('id, title, created_by, is_published')
        .order('created_at', { ascending: false });

      if (allCourses) {
        console.log(`\nTotal courses in database: ${allCourses.length}`);
        
        // Check which courses this user created
        const userCourses = allCourses.filter(course => course.created_by === userId);
        console.log(`\nCourses created by this user: ${userCourses.length}`);
        userCourses.forEach(course => {
          console.log(`- ${course.title} (ID: ${course.id})`);
        });

        // Check which courses are published (should be visible to all)
        const publishedCourses = allCourses.filter(course => course.is_published);
        console.log(`\nPublished courses (visible to all): ${publishedCourses.length}`);
        publishedCourses.forEach(course => {
          console.log(`- ${course.title} (ID: ${course.id})`);
        });
      }

      // Now let's simulate what the user would see
      console.log('\n\nSimulating user query (what they SHOULD see):');
      console.log('Based on RLS policies, user should see:');
      console.log('1. All published courses');
      console.log('2. Their own courses (created_by = user_id)');
      console.log('3. If admin: all courses');

      // Check if user is admin
      const isAdmin = rolesData && rolesData.some(role => role.role_type === 'admin');
      console.log(`\nIs user admin? ${isAdmin ? 'YES' : 'NO'}`);

      if (isAdmin) {
        console.log('\nAs admin, user should see ALL courses');
      } else {
        const visibleCourses = allCourses.filter(course => 
          course.is_published || course.created_by === userId
        );
        console.log(`\nAs non-admin, user should see ${visibleCourses.length} courses`);
      }

    } else {
      console.log('Query result:', data);
    }

  } catch (err) {
    console.error('Error testing RLS policies:', err);
  }
}

// Run the test
testRLSPolicies();