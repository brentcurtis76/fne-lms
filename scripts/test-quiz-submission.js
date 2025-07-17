#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

async function testQuizSubmission() {
  try {
    console.log('🧪 Testing quiz submission functionality...\n');

    // Create a client as a test student
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // First, get a test student user
    const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
      email: 'student@test.com', // Replace with actual test student email
      password: 'testpassword123' // Replace with actual test password
    });

    if (authError || !user) {
      console.log('❌ Could not authenticate as test student. Using service role for testing...');
      
      // Use service role to test the function directly
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Get a test student, course, and lesson
      const { data: testData } = await adminSupabase
        .from('user_roles')
        .select(`
          user_id,
          profiles!inner(id, email),
          student_assignments!inner(
            course_id,
            courses!inner(id, title)
          )
        `)
        .eq('role_type', 'docente')
        .limit(1)
        .single();

      if (!testData) {
        console.log('❌ No test data available');
        return;
      }

      // Get a lesson from the course
      const { data: lesson } = await adminSupabase
        .from('lessons')
        .select('id, title, module_id')
        .eq('modules.course_id', testData.student_assignments[0].course_id)
        .limit(1)
        .single();

      console.log('📝 Test data:', {
        student: testData.profiles.email,
        course: testData.student_assignments[0].courses.title,
        lesson: lesson?.title || 'No lesson found'
      });

      // Test the submit_quiz function
      console.log('\n🚀 Testing submit_quiz function...');
      
      const testAnswers = {
        'q1': { selectedOption: 'opt1', timeSpent: 30 },
        'q2': { text: 'This is an open-ended answer', timeSpent: 120 }
      };

      const testQuizData = {
        questions: [
          {
            id: 'q1',
            type: 'multiple-choice',
            question: 'Test Question 1',
            points: 10,
            options: [
              { id: 'opt1', text: 'Option 1', isCorrect: true },
              { id: 'opt2', text: 'Option 2', isCorrect: false }
            ]
          },
          {
            id: 'q2',
            type: 'open-ended',
            question: 'Test Question 2',
            points: 20,
            expectedAnswer: 'Expected answer here',
            gradingGuidelines: 'Grading guidelines here'
          }
        ]
      };

      const { data: submissionId, error: submitError } = await adminSupabase.rpc('submit_quiz', {
        p_lesson_id: lesson?.id || '00000000-0000-0000-0000-000000000000',
        p_block_id: 'test-block-1',
        p_student_id: testData.user_id,
        p_course_id: testData.student_assignments[0].course_id,
        p_answers: testAnswers,
        p_quiz_data: testQuizData,
        p_time_spent: 150
      });

      if (submitError) {
        console.error('❌ Error submitting quiz:', submitError);
        console.error('Error details:', JSON.stringify(submitError, null, 2));
      } else {
        console.log('✅ Quiz submitted successfully! Submission ID:', submissionId);
        
        // Verify the submission was created
        const { data: submission, error: fetchError } = await adminSupabase
          .from('quiz_submissions')
          .select('*')
          .eq('id', submissionId)
          .single();

        if (submission) {
          console.log('\n📊 Submission details:');
          console.log('- Auto-graded score:', submission.auto_graded_score);
          console.log('- Status:', submission.grading_status);
          console.log('- Has open responses:', submission.open_responses ? 'Yes' : 'No');
        }
      }

    } else {
      console.log('✅ Authenticated as:', user.email);
      // Test with authenticated user...
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testQuizSubmission();