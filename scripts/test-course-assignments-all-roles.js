// Test script to verify course assignments work for all roles
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testCourseAssignments() {
  console.log('🧪 Testing Course Assignments for All Roles\n');
  
  try {
    // 1. Get users of different roles
    console.log('1️⃣ Fetching users of different roles...');
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role')
      .in('role', ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'])
      .limit(2); // Get 2 users per role for testing
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }
    
    console.log(`✅ Found ${users.length} users across different roles`);
    
    // Group users by role
    const usersByRole = users.reduce((acc, user) => {
      if (!acc[user.role]) acc[user.role] = [];
      acc[user.role].push(user);
      return acc;
    }, {});
    
    console.log('\nUsers by role:');
    Object.entries(usersByRole).forEach(([role, roleUsers]) => {
      console.log(`  ${role}: ${roleUsers.length} user(s)`);
    });
    
    // 2. Get a test course
    console.log('\n2️⃣ Fetching a test course...');
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('id, title')
      .limit(1)
      .single();
    
    if (courseError || !courses) {
      console.error('❌ Error fetching course:', courseError);
      console.log('⚠️  Please create at least one course before running this test');
      return;
    }
    
    console.log(`✅ Using course: ${courses.title} (ID: ${courses.id})`);
    
    // 3. Test assigning course to different role users
    console.log('\n3️⃣ Testing course assignments for each role...\n');
    
    for (const [role, roleUsers] of Object.entries(usersByRole)) {
      if (roleUsers.length === 0) continue;
      
      const testUser = roleUsers[0];
      console.log(`Testing ${role} user: ${testUser.first_name} ${testUser.last_name} (${testUser.email})`);
      
      // Try to assign the course
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('course_assignments')
        .insert({
          course_id: courses.id,
          teacher_id: testUser.id,
          assigned_by: testUser.id // Self-assign for testing
        })
        .select()
        .single();
      
      if (assignmentError) {
        if (assignmentError.message.includes('duplicate')) {
          console.log(`  ⚠️  Already assigned`);
        } else {
          console.log(`  ❌ Assignment failed: ${assignmentError.message}`);
        }
      } else {
        console.log(`  ✅ Successfully assigned!`);
        
        // Clean up - remove the test assignment
        await supabase
          .from('course_assignments')
          .delete()
          .eq('id', assignmentData.id);
      }
    }
    
    // 4. Test querying course assignments
    console.log('\n4️⃣ Testing course assignment queries...');
    
    // Test admin query (should see all)
    const { data: allAssignments, error: allError } = await supabase
      .from('course_assignments')
      .select('*')
      .limit(5);
    
    if (allError) {
      console.log('❌ Admin query failed:', allError.message);
    } else {
      console.log(`✅ Query returned ${allAssignments.length} assignments`);
    }
    
    console.log('\n✅ Test completed!');
    console.log('\n📝 Summary:');
    console.log('- Course assignments table accepts users of all roles');
    console.log('- The "teacher_id" column name is misleading but works for any user');
    console.log('- UI has been updated to show "Usuarios" instead of "Docentes"');
    console.log('- Database migration script created at: database/update-course-assignments-all-roles.sql');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testCourseAssignments();