import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserCourseAssignment(userEmail: string, courseTitle: string) {
  console.log(`\nChecking assignment for: ${userEmail}`);
  console.log(`Course: "${courseTitle}"\n`);

  // 1. Find the user - try profiles first
  let { data: users, error: userError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .ilike('email', userEmail);

  if (userError) {
    console.error('Error finding user in profiles:', userError.message);
  }

  // If not found in profiles, try auth.users via admin API
  if (!users || users.length === 0) {
    console.log('User not in profiles table, checking auth.users...');
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Error listing auth users:', authError.message);
      return;
    }

    const authUser = authData.users.find(u =>
      u.email?.toLowerCase() === userEmail.toLowerCase()
    );

    if (authUser) {
      users = [{
        id: authUser.id,
        email: authUser.email,
        first_name: authUser.user_metadata?.first_name || 'Unknown',
        last_name: authUser.user_metadata?.last_name || ''
      }];
    }
  }

  if (!users || users.length === 0) {
    console.log('❌ User not found with email:', userEmail);

    // Show similar emails to help debug
    console.log('\nSearching for similar emails containing "caballero"...');
    const { data: similarProfiles } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .ilike('email', '%caballero%');

    if (similarProfiles && similarProfiles.length > 0) {
      console.log('Similar users found:');
      similarProfiles.forEach(p => console.log(`  - ${p.email} (${p.first_name} ${p.last_name})`));
    }

    const { data: authData } = await supabase.auth.admin.listUsers();
    const similarAuth = authData?.users.filter(u =>
      u.email?.toLowerCase().includes('caballero')
    );
    if (similarAuth && similarAuth.length > 0) {
      console.log('Similar auth.users:');
      similarAuth.forEach(u => console.log(`  - ${u.email}`));
    }

    return;
  }

  const user = users[0];
  console.log(`✅ User found: ${user.first_name} ${user.last_name} (${user.id})\n`);

  // 2. Find the course
  const { data: courses, error: courseError } = await supabase
    .from('courses')
    .select('id, title')
    .ilike('title', `%${courseTitle}%`);

  if (courseError) {
    console.error('Error finding course:', courseError.message);
    return;
  }

  if (!courses || courses.length === 0) {
    console.log('❌ Course not found with title containing:', courseTitle);
    return;
  }

  console.log(`Found ${courses.length} matching course(s):`);
  courses.forEach((c) => console.log(`  - "${c.title}" (${c.id})`));
  console.log('');

  // 3. Check course_enrollments for each matching course
  for (const course of courses) {
    console.log(`\n--- Checking enrollment for "${course.title}" ---`);

    const { data: enrollment, error: enrollError } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .single();

    if (enrollError && enrollError.code !== 'PGRST116') {
      console.error('Error checking enrollment:', enrollError.message);
    } else if (enrollment) {
      console.log('✅ ENROLLED in course_enrollments:');
      console.log(`   Status: ${enrollment.status}`);
      console.log(`   Enrollment Type: ${enrollment.enrollment_type}`);
      console.log(`   Progress: ${enrollment.progress_percentage || 0}%`);
      console.log(`   Enrolled At: ${enrollment.enrolled_at}`);
    } else {
      console.log('❌ NOT in course_enrollments');
    }

    // 4. Check learning_path_assignments
    const { data: lpAssignments, error: lpError } = await supabase
      .from('learning_path_courses')
      .select(`
        learning_path_id,
        learning_paths!inner (
          id,
          name,
          learning_path_assignments!inner (
            id,
            user_id,
            group_id,
            assigned_at
          )
        )
      `)
      .eq('course_id', course.id);

    if (lpError) {
      console.log('Error checking learning paths:', lpError.message);
    } else if (lpAssignments && lpAssignments.length > 0) {
      let foundInLP = false;
      for (const lpc of lpAssignments) {
        const lp = lpc.learning_paths as any;
        if (lp && lp.learning_path_assignments) {
          for (const assignment of lp.learning_path_assignments) {
            if (assignment.user_id === user.id) {
              foundInLP = true;
              console.log(`✅ Assigned via Learning Path: "${lp.name}"`);
              console.log(`   Assignment ID: ${assignment.id}`);
              console.log(`   Assigned At: ${assignment.assigned_at}`);
            }
          }
        }
      }
      if (!foundInLP) {
        console.log('❌ NOT assigned via any learning path (directly)');
      }
    } else {
      console.log('ℹ️  Course is not part of any learning paths');
    }
  }
}

// Run the check
const email = process.argv[2] || 'mery.caballero@cmwt.cl';
const courseTitle = process.argv[3] || 'Repensar ¿Qué es el plan personal?';

checkUserCourseAssignment(email, courseTitle);
