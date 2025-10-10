#!/usr/bin/env node

/**
 * Demonstrate that course progress updates once lesson blocks are completed.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const userId = '6758ac37-69f5-4ca5-bbfd-9e4bfb674648'; // Maritza
const courseId = '9f8f859e-e3fe-4bfb-93f1-712c59c45371';

async function getEnrollmentSnapshot(label) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('course_id, progress_percentage, lessons_completed, total_lessons, is_completed, completed_at, updated_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) {
    console.error(`❌ Failed to fetch enrollment (${label}):`, error.message);
    return null;
  }

  console.log(`📊 Enrollment (${label}):`, data);
  return data;
}

async function completeAllBlocks() {
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id')
    .eq('course_id', courseId);

  if (lessonsError) {
    throw new Error(`Could not fetch lessons: ${lessonsError.message}`);
  }

  const lessonIds = (lessons || []).map(l => l.id);
  if (lessonIds.length === 0) {
    console.log('⚠️  No lessons found for course');
    return;
  }

  const { data: blocks, error: blocksError } = await supabase
    .from('blocks')
    .select('id, lesson_id')
    .in('lesson_id', lessonIds);

  if (blocksError) {
    throw new Error(`Could not fetch blocks: ${blocksError.message}`);
  }

  const now = new Date().toISOString();

  if (!blocks || blocks.length === 0) {
    console.log('⚠️  No blocks to complete.');
    return;
  }

  let completedCount = 0;
  for (const block of blocks) {
    await supabase
      .from('lesson_progress')
      .delete()
      .eq('user_id', userId)
      .eq('lesson_id', block.lesson_id)
      .eq('block_id', block.id);

    const { error: insertError } = await supabase
      .from('lesson_progress')
      .insert({
        user_id: userId,
        lesson_id: block.lesson_id,
        block_id: block.id,
        completed_at: now,
        time_spent: 300,
        completion_data: {}
      });

    if (insertError) {
      throw new Error(`Failed to mark block ${block.id} complete: ${insertError.message}`);
    }

    completedCount += 1;
  }

  console.log(`✅ Marked ${completedCount} blocks as completed.`);
}

async function main() {
  await getEnrollmentSnapshot('before');
  await completeAllBlocks();
  // Allow trigger to run by refetching after a brief delay
  await new Promise(resolve => setTimeout(resolve, 500));
  await getEnrollmentSnapshot('after');
}

main().catch(error => {
  console.error('❌ Proof script failed:', error);
  process.exit(1);
});
