import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const mariaId = "ae54c579-c6c5-43ef-8d9c-2c55dac01c41";
  const courseId = "cfb259f8-5e59-4a2f-a842-a36f2f84ef90"; // Diseñando el primer piloto

  // Check course_enrollments record
  console.log("=== Course Enrollment Record ===");
  const { data: enrollment } = await supabase
    .from("course_enrollments")
    .select("*")
    .eq("user_id", mariaId)
    .eq("course_id", courseId)
    .single();

  console.log("Progress %:", enrollment?.progress_percentage);
  console.log("Lessons completed:", enrollment?.lessons_completed);
  console.log("Total lessons:", enrollment?.total_lessons);
  console.log("Is completed:", enrollment?.is_completed);
  console.log("Enrolled at:", enrollment?.enrolled_at);
  console.log("Updated at:", enrollment?.updated_at);

  // Check lesson_completion_summary
  console.log("\n=== Lesson Completion Summary ===");
  const { data: summaries } = await supabase
    .from("lesson_completion_summary")
    .select("*")
    .eq("user_id", mariaId)
    .eq("course_id", courseId);

  console.log("Summary records:", summaries?.length || 0);
  summaries?.forEach(s => {
    console.log("  Lesson:", s.lesson_id);
    console.log("  Is completed:", s.is_completed);
    console.log("  Progress:", s.progress_percentage + "%");
    console.log("  Blocks:", s.blocks_completed + "/" + s.total_blocks);
  });

  // Check lessons in course
  console.log("\n=== Lessons in Course ===");
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, title, module_id")
    .eq("course_id", courseId);

  console.log("Total lessons:", lessons?.length || 0);
  lessons?.forEach(l => console.log("  - " + l.title + " (ID: " + l.id + ")"));

  // Check blocks in each lesson
  console.log("\n=== Blocks per Lesson ===");
  for (const lesson of lessons || []) {
    const { data: blocks } = await supabase
      .from("blocks")
      .select("id, block_type")
      .eq("lesson_id", lesson.id);
    console.log("  " + lesson.title + ": " + (blocks?.length || 0) + " blocks");
    blocks?.forEach(b => console.log("    - " + b.id + " (" + b.block_type + ")"));
  }

  // Check lesson_progress records
  console.log("\n=== Maria's Lesson Progress Records ===");
  const lessonIds = lessons?.map(l => l.id) || [];
  if (lessonIds.length > 0) {
    const { data: progress } = await supabase
      .from("lesson_progress")
      .select("lesson_id, block_id, completed_at")
      .eq("user_id", mariaId)
      .in("lesson_id", lessonIds);

    console.log("Progress records for this course:", progress?.length || 0);
    progress?.forEach(p => {
      const lesson = lessons?.find(l => l.id === p.lesson_id);
      console.log("  Lesson: " + lesson?.title);
      console.log("  Block: " + p.block_id);
      console.log("  Completed: " + p.completed_at);
    });
  }

  // Also check if progress records reference the right lesson
  console.log("\n=== All Maria's lesson_progress (checking lesson references) ===");
  const { data: allProgress } = await supabase
    .from("lesson_progress")
    .select("lesson_id, block_id, lessons(id, title, course_id)")
    .eq("user_id", mariaId);

  allProgress?.forEach(p => {
    const inCourse = (p.lessons as any)?.course_id === courseId;
    console.log("  Lesson: " + (p.lessons as any)?.title);
    console.log("  Course match: " + (inCourse ? "YES" : "NO - course_id: " + (p.lessons as any)?.course_id));
  });
}

check().catch(console.error);
