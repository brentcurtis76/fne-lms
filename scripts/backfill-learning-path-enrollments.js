const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://sxlogxqzmarhqsblxmtj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function backfillEnrollments() {
    console.log('=== BACKFILLING LEARNING PATH ENROLLMENTS ===\n');
    console.log('This script will create course_enrollments for all existing');
    console.log('learning_path_assignments where enrollments are missing.\n');

    // Get all existing assignments
    const { data: assignments, error: assignError } = await supabase
        .from('learning_path_assignments')
        .select('id, path_id, user_id, group_id, assigned_by, assigned_at');

    if (assignError) {
        console.error('❌ Error fetching assignments:', assignError);
        throw assignError;
    }

    console.log(`Found ${assignments.length} total assignments\n`);

    let userAssignments = 0;
    let groupAssignments = 0;
    let totalEnrollmentsCreated = 0;
    let totalEnrollmentsSkipped = 0;
    let totalErrors = 0;

    for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];
        console.log(`[${i + 1}/${assignments.length}] Processing assignment ${assignment.id.substring(0, 8)}...`);

        // Get courses in this path
        const { data: pathCourses, error: coursesError } = await supabase
            .from('learning_path_courses')
            .select('course_id')
            .eq('learning_path_id', assignment.path_id)
            .order('sequence_order');

        if (coursesError) {
            console.error('  ❌ Error fetching courses:', coursesError.message);
            totalErrors++;
            continue;
        }

        if (!pathCourses || pathCourses.length === 0) {
            console.log('  ⚠️  No courses in path, skipping');
            continue;
        }

        let targetUsers = [];

        if (assignment.user_id) {
            // Direct user assignment
            targetUsers = [assignment.user_id];
            userAssignments++;
        } else if (assignment.group_id) {
            // Group assignment - get active members
            const { data: members, error: membersError } = await supabase
                .from('user_roles')
                .select('user_id')
                .eq('community_id', assignment.group_id)
                .eq('is_active', true);

            if (membersError) {
                console.error('  ❌ Error fetching group members:', membersError.message);
                totalErrors++;
                continue;
            }

            targetUsers = [...new Set(members.map(m => m.user_id))];
            groupAssignments++;
        }

        console.log(`  Users: ${targetUsers.length}, Courses: ${pathCourses.length}`);

        let enrollmentsCreated = 0;
        let enrollmentsSkipped = 0;

        // Create enrollments for each user-course combination
        for (const userId of targetUsers) {
            for (const course of pathCourses) {
                // Check if enrollment already exists
                const { data: existingEnrollment, error: checkError } = await supabase
                    .from('course_enrollments')
                    .select('id')
                    .eq('course_id', course.course_id)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (checkError) {
                    console.error(`  ❌ Error checking enrollment:`, checkError.message);
                    totalErrors++;
                    continue;
                }

                if (existingEnrollment) {
                    enrollmentsSkipped++;
                    continue;
                }

                // Create enrollment
                const { error: enrollError } = await supabase
                    .from('course_enrollments')
                    .insert({
                        course_id: course.course_id,
                        user_id: userId,
                        enrollment_type: 'assigned',
                        enrolled_by: assignment.assigned_by,
                        enrolled_at: assignment.assigned_at,
                        status: 'active'
                    });

                if (enrollError) {
                    console.error(`  ❌ Error creating enrollment:`, enrollError.message);
                    totalErrors++;
                } else {
                    enrollmentsCreated++;
                }
            }
        }

        totalEnrollmentsCreated += enrollmentsCreated;
        totalEnrollmentsSkipped += enrollmentsSkipped;

        console.log(`  ✅ Created: ${enrollmentsCreated}, Skipped: ${enrollmentsSkipped}\n`);
    }

    console.log('=== BACKFILL COMPLETE ===');
    console.log(`Total assignments processed: ${assignments.length}`);
    console.log(`  - User assignments: ${userAssignments}`);
    console.log(`  - Group assignments: ${groupAssignments}`);
    console.log(`Total enrollments created: ${totalEnrollmentsCreated}`);
    console.log(`Total enrollments skipped (already exist): ${totalEnrollmentsSkipped}`);
    console.log(`Total errors: ${totalErrors}`);

    if (totalErrors > 0) {
        console.log('\n⚠️  Some errors occurred. Review the log above for details.');
    } else {
        console.log('\n✅ Backfill completed successfully with no errors!');
    }
}

backfillEnrollments().catch(error => {
    console.error('\n❌ FATAL ERROR:', error);
    process.exit(1);
});
