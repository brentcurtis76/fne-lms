const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://sxlogxqzmarhqsblxmtj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function fixTomEnrollment() {
    console.log('=== FIXING TOM ENROLLMENT ONLY ===\n');

    // Get Tom's user ID
    const { data: tomProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', 'tom@nuevaeducacion.org')
        .single();

    if (!tomProfile) {
        console.log('❌ Tom not found');
        return;
    }

    const tomUserId = tomProfile.id;
    console.log(`Tom user ID: ${tomUserId}\n`);

    // Get Tom's learning path assignments
    const { data: assignments } = await supabase
        .from('learning_path_assignments')
        .select('path_id, learning_paths(name), assigned_by, assigned_at')
        .eq('user_id', tomUserId);

    console.log(`Found ${assignments.length} assignment(s)\n`);

    for (const assignment of assignments) {
        console.log(`Path: ${assignment.learning_paths.name}`);

        // Get courses in path
        const { data: courses } = await supabase
            .from('learning_path_courses')
            .select('course_id, courses(title)')
            .eq('learning_path_id', assignment.path_id)
            .order('sequence_order');

        console.log(`  Courses: ${courses.length}`);

        for (const course of courses) {
            // Check if already enrolled
            const { data: existing } = await supabase
                .from('course_enrollments')
                .select('id')
                .eq('user_id', tomUserId)
                .eq('course_id', course.course_id)
                .maybeSingle();

            if (existing) {
                console.log(`    ✅ ${course.courses.title} - already enrolled`);
                continue;
            }

            // Create enrollment
            const { error } = await supabase
                .from('course_enrollments')
                .insert({
                    course_id: course.course_id,
                    user_id: tomUserId,
                    enrollment_type: 'assigned',
                    enrolled_by: assignment.assigned_by,
                    enrolled_at: assignment.assigned_at,
                    status: 'active'
                });

            if (error) {
                console.log(`    ❌ ${course.courses.title} - ERROR: ${error.message}`);
            } else {
                console.log(`    ✅ ${course.courses.title} - enrolled`);
            }
        }

        console.log('');
    }

    console.log('✅ Tom enrollment fix complete!');
}

fixTomEnrollment().catch(console.error);
