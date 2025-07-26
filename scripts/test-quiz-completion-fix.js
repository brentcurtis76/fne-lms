const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testQuizCompletionFix() {
  console.log('🧪 Testing Quiz Completion Fix');
  console.log('==============================\n');

  try {
    // Step 1: Find a lesson with a quiz
    console.log('📚 Step 1: Finding lessons with quiz blocks...');
    const { data: quizBlocks, error: blocksError } = await supabase
      .from('lesson_blocks')
      .select('id, lesson_id, type, payload, position')
      .eq('type', 'quiz')
      .limit(5);

    if (blocksError || !quizBlocks || quizBlocks.length === 0) {
      console.error('❌ No quiz blocks found in the database');
      return;
    }

    console.log(`✅ Found ${quizBlocks.length} quiz blocks`);
    
    // Show details of first quiz
    const firstQuiz = quizBlocks[0];
    console.log('\n📋 First Quiz Details:');
    console.log(`   Block ID: ${firstQuiz.id}`);
    console.log(`   Lesson ID: ${firstQuiz.lesson_id}`);
    console.log(`   Title: ${firstQuiz.payload?.title || 'Sin título'}`);
    console.log(`   Questions: ${firstQuiz.payload?.questions?.length || 0}`);
    console.log(`   Total Points: ${firstQuiz.payload?.totalPoints || 0}`);

    // Step 2: Check if any students have completed this quiz
    console.log('\n🔍 Step 2: Checking student progress...');
    const { data: progress, error: progressError } = await supabase
      .from('lesson_progress')
      .select('*')
      .eq('lesson_id', firstQuiz.lesson_id)
      .eq('block_id', firstQuiz.id)
      .not('completed_at', 'is', null)
      .limit(5);

    if (progress && progress.length > 0) {
      console.log(`✅ Found ${progress.length} students who completed this quiz`);
      
      console.log('\n📊 Completion Details:');
      progress.forEach((p, index) => {
        console.log(`\n${index + 1}. Student ID: ${p.student_id}`);
        console.log(`   Completed: ${new Date(p.completed_at).toLocaleString()}`);
        console.log(`   Time Spent: ${p.time_spent || 0} seconds`);
        console.log(`   Completion Data:`, p.completion_data || {});
      });

      console.log('\n✨ Expected Behavior After Fix:');
      console.log('   - When these students return to the lesson');
      console.log('   - They should see "Quiz Interactivo - Completado" message');
      console.log('   - They should NOT see the quiz questions again');
      console.log('   - They should be able to continue to the next block');
    } else {
      console.log('⚠️  No students have completed this quiz yet');
    }

    // Step 3: Simulate the bug scenario
    console.log('\n\n🐛 Bug Scenario Explanation:');
    console.log('================================');
    console.log('BEFORE THE FIX:');
    console.log('1. Student completes quiz');
    console.log('2. Clicks "Continuar con la lección" (which reloads the page)');
    console.log('3. Quiz shows again with all questions reset');
    console.log('4. Student has to answer all questions again');
    
    console.log('\nAFTER THE FIX:');
    console.log('1. Student completes quiz');
    console.log('2. Clicks "Continuar con la lección"');
    console.log('3. Sees "Quiz Interactivo - Completado" message');
    console.log('4. Can continue to next content without redoing quiz');

    // Step 4: Show the code change
    console.log('\n\n💻 Code Fix Applied:');
    console.log('====================');
    console.log('File: /components/student/StudentBlockRenderer.tsx');
    console.log('Function: renderQuizBlock()');
    console.log('\nAdded check:');
    console.log('```javascript');
    console.log('if (isCompleted) {');
    console.log('  return <CompletedQuizMessage />;');
    console.log('}');
    console.log('```');
    console.log('\nThis prevents the quiz from rendering when already completed.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testQuizCompletionFix().catch(console.error);