const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://sxlogxqzmarhqsblxmtj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function verifyFix() {
    console.log('=== VERIFYING LEARNING PATH ENROLLMENT FIX ===\n');

    let totalAssignments = 0;
    let fullyEnrolled = 0;
    let partiallyEnrolled = 0;
    let notEnrolled = 0;
    let issues = [];

    // Get all assignments
    const { data: assignments, error: assignError } = await supabase
        .from('learning_path_assignments')
        .select('id, path_id, user_id, group_id');

    if (assignError) {
        console.error('❌ Error fetching assignments:', assignError);
        throw assignError;
    }

    totalAssignments = assignments.length;
    console.log(`Checking ${totalAssignments} assignments...\n`);

    for (const assignment of assignments) {
        // Get courses in path
        const { data: pathCourses } = await supabase
            .from('learning_path_courses')
            .select('course_id')
            .eq('learning_path_id', assignment.path_id);

        if (!pathCourses || pathCourses.length === 0) continue;

        let targetUsers = [];

        if (assignment.user_id) {
            targetUsers = [assignment.user_id];
        } else if (assignment.group_id) {
            const { data: members } = await supabase
                .from('user_roles')
                .select('user_id')
                .eq('community_id', assignment.group_id)
                .eq('is_active', true);

            targetUsers = [...new Set(members.map(m => m.user_id))];
        }

        // Check enrollment for each user
        for (const userId of targetUsers) {
            const { data: enrollments } = await supabase
                .from('course_enrollments')
                .select('id')
                .eq('user_id', userId)
                .in('course_id', pathCourses.map(pc => pc.course_id));

            const enrollmentRate = enrollments.length / pathCourses.length;

            if (enrollmentRate === 1) {
                fullyEnrolled++;
            } else if (enrollmentRate > 0) {
                partiallyEnrolled++;
                issues.push({
                    assignment_id: assignment.id,
                    user_id: userId,
                    expected: pathCourses.length,
                    actual: enrollments.length,
                    rate: Math.round(enrollmentRate * 100)
                });
            } else {
                notEnrolled++;
                issues.push({
                    assignment_id: assignment.id,
                    user_id: userId,
                    expected: pathCourses.length,
                    actual: 0,
                    rate: 0
                });
            }
        }
    }

    // Check specific user: tom@nuevaeducacion.org
    console.log('=== SPECIFIC USER CHECK: tom@nuevaeducacion.org ===\n');

    const { data: tomProfile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', 'tom@nuevaeducacion.org')
        .single();

    if (tomProfile) {
        const tomUserId = tomProfile.id;

        // Get tom's learning path assignments
        const { data: tomAssignments } = await supabase
            .from('learning_path_assignments')
            .select('path_id, learning_paths(name)')
            .eq('user_id', tomUserId);

        console.log(`Tom has ${tomAssignments.length} learning path assignment(s):\n`);

        for (const assignment of tomAssignments) {
            const pathName = assignment.learning_paths.name;

            // Get courses in path
            const { data: pathCourses } = await supabase
                .from('learning_path_courses')
                .select('course_id, courses(title)')
                .eq('learning_path_id', assignment.path_id)
                .order('sequence_order');

            // Get tom's enrollments
            const { data: tomEnrollments } = await supabase
                .from('course_enrollments')
                .select('course_id')
                .eq('user_id', tomUserId)
                .in('course_id', pathCourses.map(pc => pc.course_id));

            const enrolledCourseIds = new Set(tomEnrollments.map(e => e.course_id));

            console.log(`Path: "${pathName}"`);
            console.log(`  Total courses: ${pathCourses.length}`);
            console.log(`  Enrolled courses: ${tomEnrollments.length}`);

            pathCourses.forEach((pc, i) => {
                const status = enrolledCourseIds.has(pc.course_id) ? '✅' : '❌';
                console.log(`    ${status} ${i + 1}. ${pc.courses.title}`);
            });

            if (tomEnrollments.length === pathCourses.length) {
                console.log(`  ✅ TOM IS FULLY ENROLLED\n`);
            } else {
                console.log(`  ❌ TOM IS NOT FULLY ENROLLED (${tomEnrollments.length}/${pathCourses.length})\n`);
            }
        }

        // Check if tom can access the first course
        const courseId = 'c5fee76b-b0d5-4d44-874b-b7788ade4258';
        const { data: tomCourseEnrollment } = await supabase
            .from('course_enrollments')
            .select('id, enrollment_type')
            .eq('user_id', tomUserId)
            .eq('course_id', courseId)
            .maybeSingle();

        console.log(`Test Course Access (ID: ${courseId}):`);
        if (tomCourseEnrollment) {
            console.log(`  ✅ Tom is enrolled (type: ${tomCourseEnrollment.enrollment_type})`);
        } else {
            console.log(`  ❌ Tom is NOT enrolled - ISSUE REMAINS`);
        }
    } else {
        console.log('⚠️  Tom user not found');
    }

    // Overall summary
    console.log('\n=== OVERALL SUMMARY ===\n');
    console.log(`Total user-path combinations: ${fullyEnrolled + partiallyEnrolled + notEnrolled}`);
    console.log(`✅ Fully enrolled (100%): ${fullyEnrolled}`);
    console.log(`⚠️  Partially enrolled: ${partiallyEnrolled}`);
    console.log(`❌ Not enrolled (0%): ${notEnrolled}`);

    const successRate = ((fullyEnrolled / (fullyEnrolled + partiallyEnrolled + notEnrolled)) * 100).toFixed(1);
    console.log(`\nSuccess rate: ${successRate}%`);

    if (issues.length > 0) {
        console.log(`\n⚠️  ${issues.length} ISSUES FOUND:\n`);
        issues.slice(0, 10).forEach((issue, i) => {
            console.log(`${i + 1}. Assignment ${issue.assignment_id.substring(0, 8)}...`);
            console.log(`   User: ${issue.user_id.substring(0, 8)}...`);
            console.log(`   Enrollment: ${issue.actual}/${issue.expected} (${issue.rate}%)`);
        });

        if (issues.length > 10) {
            console.log(`\n   ... and ${issues.length - 10} more issues`);
        }

        return false;
    } else {
        console.log('\n✅ ALL CHECKS PASSED!');
        return true;
    }
}

verifyFix()
    .then(success => {
        if (success) {
            console.log('\n✅ Verification complete - fix successful!');
            process.exit(0);
        } else {
            console.log('\n⚠️  Verification complete - issues found');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('\n❌ FATAL ERROR:', error);
        process.exit(1);
    });
