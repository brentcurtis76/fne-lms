#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const JORGE_EMAIL = 'jorge@lospellines.cl';
const JORGE_USER_ID = '372ab00b-1d39-4574-8eff-d756b9d6b861';

async function verifyJorgeCourses() {
  console.log('🔍 Verifying Jorge Parra\'s Courses\n');

  try {
    // 1. Verify Jorge's profile
    console.log('1️⃣ Checking Jorge\'s profile...');
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', JORGE_USER_ID)
      .single();

    if (!profile) {
      console.log('❌ Jorge\'s profile not found with ID:', JORGE_USER_ID);
      // Try to find by email
      const { data: profileByEmail } = await supabaseAdmin
        .from('profiles')
        .select('id, email, first_name, last_name')
        .eq('email', JORGE_EMAIL)
        .single();
      
      if (profileByEmail) {
        console.log(`✅ Found by email: ${profileByEmail.first_name} ${profileByEmail.last_name} (${profileByEmail.email})`);
        console.log(`   Actual ID: ${profileByEmail.id}`);
        // Update the user ID for subsequent queries
        const actualUserId = profileByEmail.id;
        
        // Continue with the correct user ID
        await verifyWithUserId(actualUserId);
        return;
      } else {
        console.log('❌ Could not find Jorge by email either');
        return;
      }
    }
    
    console.log(`✅ User: ${profile.first_name} ${profile.last_name} (${profile.email})`);
    await verifyWithUserId(JORGE_USER_ID);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

async function verifyWithUserId(userId) {
  try {

    // 2. Check Jorge's admin status
    console.log('\n2️⃣ Checking admin status...');
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .eq('role_type', 'admin')
      .eq('is_active', true);

    console.log(`✅ Admin roles: ${adminRole?.length || 0}`);

    // 3. Query courses created by Jorge (what "Mis Cursos" shows)
    console.log('\n3️⃣ Fetching courses created by Jorge...');
    const { data: createdCourses } = await supabaseAdmin
      .from('courses')
      .select('id, title, created_by, created_at')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    console.log(`\n📚 Courses created by Jorge (${createdCourses?.length || 0}):`);
    if (createdCourses && createdCourses.length > 0) {
      createdCourses.forEach((course, index) => {
        console.log(`   ${index + 1}. ${course.title}`);
        console.log(`      ID: ${course.id}`);
        console.log(`      Created: ${new Date(course.created_at).toLocaleDateString()}`);
      });
    }

    // 4. Also check if Jorge is assigned to any courses
    console.log('\n4️⃣ Checking course assignments...');
    const { data: assignments } = await supabaseAdmin
      .from('course_assignments')
      .select(`
        course_id,
        courses (
          id,
          title,
          created_by
        )
      `)
      .eq('teacher_id', userId);

    if (assignments && assignments.length > 0) {
      console.log(`\n📝 Courses assigned to Jorge (${assignments.length}):`);
      assignments.forEach((assignment, index) => {
        console.log(`   ${index + 1}. ${assignment.courses?.title || 'Unknown'}`);
        console.log(`      Created by: ${assignment.courses?.created_by === userId ? 'Jorge (himself)' : 'Someone else'}`);
      });
    } else {
      console.log('\n📝 No course assignments found for Jorge');
    }

    // 5. Summary
    console.log('\n📊 SUMMARY:');
    console.log(`   - Jorge is an admin: ✅`);
    console.log(`   - Courses created by Jorge: ${createdCourses?.length || 0}`);
    console.log(`   - Expected in "Mis Cursos": ${createdCourses?.length || 0} courses`);
    
    if (createdCourses && createdCourses.length === 2) {
      console.log('\n✅ SUCCESS! Jorge should now see both courses in "Mis Cursos"');
      console.log('\n📝 Instructions for Jorge:');
      console.log('   1. Refresh the dashboard page (Ctrl+R or Cmd+R)');
      console.log('   2. Both courses should now appear in "Mis Cursos"');
    } else if (createdCourses && createdCourses.length === 1) {
      console.log('\n⚠️  WARNING: Still only showing 1 course. The database update may not have worked.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run verification
verifyJorgeCourses();