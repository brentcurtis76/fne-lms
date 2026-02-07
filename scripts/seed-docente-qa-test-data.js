/**
 * Seed test data for docente.qa@fne.cl
 *
 * Run with: node scripts/seed-docente-qa-test-data.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedDocenteQATestData() {
  console.log('=== Starting seed for docente.qa@fne.cl ===\n');

  // 1. Find the docente.qa user
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('email', 'docente.qa@fne.cl')
    .single();

  if (profileError || !profile) {
    console.error('User docente.qa@fne.cl not found:', profileError);
    process.exit(1);
  }

  console.log(`Found user: ${profile.first_name} ${profile.last_name} (${profile.id})`);
  const userId = profile.id;

  // 2. Get the user's school and current roles
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, role_type, school_id, community_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (rolesError) {
    console.error('Error fetching user roles:', rolesError);
    process.exit(1);
  }

  console.log('User roles:', userRoles);
  const schoolId = userRoles?.[0]?.school_id;
  const roleId = userRoles?.[0]?.id;

  // 3. Find a published course
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, title, status')
    .eq('status', 'published')
    .limit(10);

  if (coursesError) {
    console.error('Error fetching courses:', coursesError);
    process.exit(1);
  }

  let targetCourse = courses?.[0];

  if (!targetCourse) {
    console.error('No published courses available');
    process.exit(1);
  }

  console.log('Available courses:');
  courses?.forEach(c => {
    console.log(`  - ${c.title} (${c.id})`);
  });

  console.log(`\nUsing course: "${targetCourse.title}" (${targetCourse.id})`);

  // 4. Check if already enrolled
  const { data: existingEnrollment } = await supabase
    .from('course_enrollments')
    .select('id, status, progress_percentage')
    .eq('user_id', userId)
    .eq('course_id', targetCourse.id)
    .single();

  if (existingEnrollment) {
    console.log(`Already enrolled (status: ${existingEnrollment.status}, progress: ${existingEnrollment.progress_percentage}%)`);

    // Reset progress to 0 for testing
    const { error: updateError } = await supabase
      .from('course_enrollments')
      .update({
        progress_percentage: 0,
        lessons_completed: 0,
        is_completed: false,
        status: 'active'
      })
      .eq('id', existingEnrollment.id);

    if (updateError) {
      console.error('Error resetting enrollment:', updateError);
    } else {
      console.log('Reset enrollment progress to 0%');
    }
  } else {
    // Create enrollment
    const { data: enrollment, error: enrollError } = await supabase
      .from('course_enrollments')
      .insert({
        user_id: userId,
        course_id: targetCourse.id,
        status: 'active',
        enrolled_at: new Date().toISOString(),
        progress_percentage: 0,
        lessons_completed: 0,
        is_completed: false
      })
      .select()
      .single();

    if (enrollError) {
      console.error('Error creating enrollment:', enrollError);
    } else {
      console.log('Created enrollment:', enrollment.id);
    }
  }

  // 5. Find or create an assignment
  console.log('\n--- Checking for assignments ---');

  // First get modules for the course
  const { data: modules } = await supabase
    .from('modules')
    .select('id, title')
    .eq('course_id', targetCourse.id);

  console.log(`Found ${modules?.length || 0} modules in course`);

  // Then get lessons from those modules
  let lessons = [];
  if (modules && modules.length > 0) {
    const moduleIds = modules.map(m => m.id);
    const { data: lessonData } = await supabase
      .from('lessons')
      .select('id, title, module_id')
      .in('module_id', moduleIds)
      .limit(10);
    lessons = lessonData || [];
  }

  if (!lessons || lessons.length === 0) {
    console.log('No lessons found in this course');
  } else {
    console.log(`Found ${lessons.length} lessons in course`);

    // Check for existing assignments
    const { data: assignments } = await supabase
      .from('lesson_assignments')
      .select('id, title, lesson_id, due_date, type')
      .in('lesson_id', lessons.map(l => l.id));

    if (assignments && assignments.length > 0) {
      console.log('Existing assignments:');
      assignments.forEach(a => {
        console.log(`  - ${a.title} (${a.id}) - Due: ${a.due_date || 'No date'}`);
      });

      // Update due dates to future if needed
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      for (const assignment of assignments) {
        if (!assignment.due_date || new Date(assignment.due_date) < new Date()) {
          const { error: updateErr } = await supabase
            .from('lesson_assignments')
            .update({ due_date: futureDate.toISOString() })
            .eq('id', assignment.id);

          if (!updateErr) {
            console.log(`  Updated due date for "${assignment.title}" to ${futureDate.toISOString()}`);
          }
        }
      }
    } else {
      // Check lesson_assignments columns first
      console.log('No existing assignments. Checking schema...');

      // Try to create with minimal fields
      const firstLesson = lessons[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const { data: newAssignment, error: assignErr } = await supabase
        .from('lesson_assignments')
        .insert({
          lesson_id: firstLesson.id,
          title: 'Tarea de Prueba QA',
          description: 'Esta es una tarea de prueba para el usuario docente.qa@fne.cl. Por favor completa la actividad según las instrucciones.',
          due_date: futureDate.toISOString(),
          created_by: userId  // Required field
        })
        .select()
        .single();

      if (assignErr) {
        console.error('Error creating assignment:', assignErr);
        console.log('Assignment creation skipped - may need manual setup');
      } else {
        console.log(`Created assignment: "${newAssignment.title}" (${newAssignment.id})`);
      }
    }
  }

  // 6. Community membership (optional)
  console.log('\n--- Checking community membership ---');

  if (schoolId) {
    const { data: communities } = await supabase
      .from('growth_communities')
      .select('id, name')
      .eq('school_id', schoolId)
      .limit(1);

    if (communities && communities.length > 0) {
      const community = communities[0];
      console.log(`Found community: "${community.name}" (${community.id})`);

      // Update user_roles to add community_id
      if (roleId) {
        const { error: updateErr } = await supabase
          .from('user_roles')
          .update({ community_id: community.id })
          .eq('id', roleId);

        if (updateErr) {
          console.error('Error updating community membership:', updateErr);
        } else {
          console.log('Added user to community');
        }
      }
    } else {
      console.log('No community found for school');
    }
  } else {
    console.log('User has no school assigned');
  }

  // 7. Summary
  console.log('\n=== SEED COMPLETE ===');
  console.log(`User: ${profile.email} (${userId})`);
  console.log(`Course: ${targetCourse.title}`);
  console.log(`School ID: ${schoolId || 'None'}`);

  // Final verification
  console.log('\n--- Verification ---');
  const { data: finalEnrollments } = await supabase
    .from('course_enrollments')
    .select(`
      id,
      status,
      progress,
      course:courses(title)
    `)
    .eq('user_id', userId);

  console.log('Current enrollments:');
  finalEnrollments?.forEach(e => {
    console.log(`  - ${e.course?.title}: ${e.status}, ${e.progress}% progress`);
  });
}

seedDocenteQATestData()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
