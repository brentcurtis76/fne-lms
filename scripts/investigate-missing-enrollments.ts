/**
 * Investigate missing enrollments for learning path users
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function investigate() {
  const courseId = "daecf11a-72eb-4d35-b4f3-5da2a5118a44";
  const pathId = "06201282-9266-438a-970b-470ba1441102";

  // Get all users in the learning path
  const { data: lpUsers } = await supabase
    .from("learning_path_assignments")
    .select("user_id")
    .eq("path_id", pathId);

  const lpUserIds = lpUsers?.map(u => u.user_id) || [];
  console.log("Total users in learning path:", lpUserIds.length);

  // Get users who HAVE enrollment for this course
  const { data: enrolledUsers } = await supabase
    .from("course_enrollments")
    .select("user_id")
    .eq("course_id", courseId)
    .in("user_id", lpUserIds);

  const enrolledUserIds = new Set(enrolledUsers?.map(e => e.user_id) || []);

  // Users WITHOUT enrollment
  const missingEnrollmentUserIds = lpUserIds.filter(id => !enrolledUserIds.has(id));
  console.log("Users missing enrollment:", missingEnrollmentUserIds.length);

  // Get lessons for this course
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, title")
    .eq("course_id", courseId);
  const lessonIds = lessons?.map(l => l.id) || [];
  console.log("Lessons in course:", lessonIds.length);

  // Q1: Check if any missing-enrollment users have lesson_progress
  console.log("\n=== Q1: Users with progress but no enrollment ===");
  if (missingEnrollmentUserIds.length > 0 && lessonIds.length > 0) {
    const { data: progressRecords } = await supabase
      .from("lesson_progress")
      .select("user_id, lesson_id, completed_at")
      .in("user_id", missingEnrollmentUserIds)
      .in("lesson_id", lessonIds);

    const usersWithProgress = new Set(progressRecords?.map(p => p.user_id) || []);
    console.log("Users with lesson progress but no enrollment:", usersWithProgress.size);

    if (usersWithProgress.size > 0) {
      // Get their emails
      const { data: progressUsers } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(usersWithProgress));
      progressUsers?.forEach(u => console.log("  - " + u.email));
    }

    // Q1b: Check quiz submissions
    const { data: quizSubs } = await supabase
      .from("quiz_submissions")
      .select("student_id, lesson_id, submitted_at, auto_graded_score")
      .in("student_id", missingEnrollmentUserIds)
      .eq("course_id", courseId);

    const usersWithQuizzes = new Set(quizSubs?.map(q => q.student_id) || []);
    console.log("Users with quiz submissions but no enrollment:", usersWithQuizzes.size);

    if (usersWithQuizzes.size > 0) {
      const { data: quizUsers } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", Array.from(usersWithQuizzes));
      quizUsers?.forEach(u => console.log("  - " + u.email));
    }
  }

  // Q2: Check if any are from Colegio Metodista William Taylor
  console.log("\n=== Q2: Users from Colegio Metodista William Taylor ===");
  if (missingEnrollmentUserIds.length > 0) {
    const { data: cmwtUsers } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name")
      .in("id", missingEnrollmentUserIds)
      .ilike("email", "%cmwt%");

    console.log("CMWT users missing enrollment:", cmwtUsers?.length || 0);
    cmwtUsers?.slice(0, 10).forEach(u => console.log("  - " + u.email + " (" + u.first_name + " " + u.last_name + ")"));
    if ((cmwtUsers?.length || 0) > 10) console.log("  ... and " + ((cmwtUsers?.length || 0) - 10) + " more");
  }

  // Q3: Check other learning paths for similar issues
  console.log("\n=== Q3: Checking ALL learning paths for missing enrollments ===");
  const { data: allPaths } = await supabase
    .from("learning_paths")
    .select("id, name");

  const pathIssues: {name: string, missing: number, courses: number, users: number}[] = [];

  for (const path of (allPaths || [])) {
    // Get users in this path
    const { data: pathUsers } = await supabase
      .from("learning_path_assignments")
      .select("user_id")
      .eq("path_id", path.id);

    if (!pathUsers || pathUsers.length === 0) continue;

    // Get courses in this path
    const { data: pathCourses } = await supabase
      .from("learning_path_courses")
      .select("course_id")
      .eq("learning_path_id", path.id);

    if (!pathCourses || pathCourses.length === 0) continue;

    const pathUserIds = pathUsers.map(u => u.user_id);
    const pathCourseIds = pathCourses.map(c => c.course_id);

    // Check enrollments for each course
    let totalMissing = 0;
    for (const cid of pathCourseIds) {
      const { data: enrolled } = await supabase
        .from("course_enrollments")
        .select("user_id")
        .eq("course_id", cid)
        .in("user_id", pathUserIds);

      const enrolledSet = new Set(enrolled?.map(e => e.user_id) || []);
      const missing = pathUserIds.filter(uid => !enrolledSet.has(uid)).length;
      totalMissing += missing;
    }

    if (totalMissing > 0) {
      pathIssues.push({
        name: path.name,
        missing: totalMissing,
        courses: pathCourseIds.length,
        users: pathUserIds.length
      });
    }
  }

  // Sort by most missing
  pathIssues.sort((a, b) => b.missing - a.missing);

  console.log("\nLearning paths with missing enrollments:");
  pathIssues.forEach(p => {
    const avgMissingPerCourse = Math.round(p.missing / p.courses);
    console.log(`  ${p.name}:`);
    console.log(`    ${p.missing} total missing (${p.courses} courses, ${p.users} users)`);
    console.log(`    ~${avgMissingPerCourse} users missing per course on average`);
  });

  const totalMissingAll = pathIssues.reduce((sum, p) => sum + p.missing, 0);
  console.log("\nTOTAL missing enrollments across all paths:", totalMissingAll);
}

investigate().catch(console.error);
