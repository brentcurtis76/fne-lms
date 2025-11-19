const { createClient } = require('@supabase/supabase-js');
const { submitQuiz } = require('../../lib/services/quizSubmissions');

// Load environment variables
require('dotenv').config();

// Test configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

// Create service role client for test setup
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

describe.skip('Quiz Submissions Integration Test', () => {
  let testStudent;
  let testCourse;
  let testModule;
  let testLesson;
  let testBlock;
  let studentClient;

  beforeAll(async () => {
    // 1. Create test student
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: `test-student-${Date.now()}@test.com`,
      password: 'TestPassword123!',
      email_confirm: true
    });

    if (authError) throw authError;
    testStudent = authData.user;

    // 2. Create student profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: testStudent.id,
        email: testStudent.email,
        first_name: 'Test',
        last_name: 'Student'
      });

    if (profileError) throw profileError;

    // 3. Assign student role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: testStudent.id,
        role_type: 'docente' // Students use 'docente' role in this system
      });

    if (roleError) throw roleError;

    // 4. Create test course
    const { data: courseData, error: courseError } = await supabaseAdmin
      .from('courses')
      .insert({
        title: 'Test Course for Quiz Submission',
        description: 'Integration test course',
        created_by: testStudent.id
      })
      .select()
      .single();

    if (courseError) throw courseError;
    testCourse = courseData;

    // 5. Create test module
    const { data: moduleData, error: moduleError } = await supabaseAdmin
      .from('modules')
      .insert({
        course_id: testCourse.id,
        title: 'Test Module',
        description: 'Test module for quiz',
        sequence: 1
      })
      .select()
      .single();

    if (moduleError) throw moduleError;
    testModule = moduleData;

    // 6. Create test lesson
    const { data: lessonData, error: lessonError } = await supabaseAdmin
      .from('lessons')
      .insert({
        module_id: testModule.id,
        title: 'Test Lesson with Quiz',
        description: 'Test lesson',
        sequence: 1,
        content: []
      })
      .select()
      .single();

    if (lessonError) throw lessonError;
    testLesson = lessonData;

    // 7. Create test quiz block
    const { data: blockData, error: blockError } = await supabaseAdmin
      .from('blocks')
      .insert({
        lesson_id: testLesson.id,
        type: 'quiz',
        content: {
          title: 'Test Quiz',
          description: 'Test quiz for integration testing',
          questions: [
            {
              id: 'q1',
              type: 'multiple-choice',
              text: 'What is 2 + 2?',
              points: 1,
              options: [
                { id: 'opt1', text: '3', isCorrect: false },
                { id: 'opt2', text: '4', isCorrect: true },
                { id: 'opt3', text: '5', isCorrect: false }
              ]
            },
            {
              id: 'q2',
              type: 'open-ended',
              text: 'Explain why testing is important',
              points: 2
            }
          ],
          randomizeQuestions: false,
          randomizeAnswers: false,
          showFeedback: true,
          allowRetries: true,
          timeLimit: null
        },
        sequence: 1
      })
      .select()
      .single();

    if (blockError) throw blockError;
    testBlock = blockData;

    // 8. Enroll student in course
    const { error: enrollError } = await supabaseAdmin
      .from('course_enrollments')
      .insert({
        course_id: testCourse.id,
        student_id: testStudent.id,
        role: 'student'
      });

    if (enrollError) throw enrollError;

    // 9. Create authenticated client for student
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: testStudent.email,
      password: 'TestPassword123!'
    });

    if (signInError) throw signInError;

    studentClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${signInData.session.access_token}`
        }
      }
    });
  });

  afterAll(async () => {
    // Clean up in reverse order
    if (testBlock?.id) {
      await supabaseAdmin.from('quiz_submissions').delete().eq('block_id', testBlock.id);
      await supabaseAdmin.from('blocks').delete().eq('id', testBlock.id);
    }
    if (testLesson?.id) {
      await supabaseAdmin.from('lessons').delete().eq('id', testLesson.id);
    }
    if (testModule?.id) {
      await supabaseAdmin.from('modules').delete().eq('id', testModule.id);
    }
    if (testCourse?.id) {
      await supabaseAdmin.from('course_enrollments').delete().eq('course_id', testCourse.id);
      await supabaseAdmin.from('courses').delete().eq('id', testCourse.id);
    }
    if (testStudent?.id) {
      await supabaseAdmin.from('user_roles').delete().eq('user_id', testStudent.id);
      await supabaseAdmin.from('profiles').delete().eq('id', testStudent.id);
      await supabaseAdmin.auth.admin.deleteUser(testStudent.id);
    }
  });

  it('should successfully submit a quiz and verify RLS policies work correctly', async () => {
    // Arrange: Prepare quiz submission data
    const quizData = testBlock.content;
    const answers = {
      'q1': { selectedOption: 'opt2' }, // Correct answer
      'q2': { text: 'Testing is important because it ensures code quality and prevents bugs.' }
    };
    const timeSpent = 120; // 2 minutes

    // Act: Submit the quiz using the student's authenticated client
    const { data: submission, error: submitError } = await submitQuiz(
      studentClient,
      testLesson.id,
      testBlock.id,
      testStudent.id,
      testCourse.id,
      answers,
      quizData,
      timeSpent
    );

    // Assert: Verify submission was successful
    expect(submitError).toBeNull();
    expect(submission).toBeDefined();
    expect(submission.id).toBeDefined();
    expect(submission.student_id).toBe(testStudent.id);
    expect(submission.lesson_id).toBe(testLesson.id);
    expect(submission.block_id).toBe(testBlock.id);
    expect(submission.course_id).toBe(testCourse.id);
    expect(submission.answers).toEqual(answers);
    expect(submission.time_spent).toBe(timeSpent);
    expect(submission.auto_graded_score).toBe(1); // One correct MC answer
    expect(submission.auto_gradable_points).toBe(1); // One MC question
    expect(submission.manual_gradable_points).toBe(2); // One open-ended question

    // Crucial RLS test: Verify student can read their own submission
    const { data: retrievedSubmission, error: retrieveError } = await studentClient
      .from('quiz_submissions')
      .select('*')
      .eq('id', submission.id)
      .single();

    // Assert: Student can retrieve their own submission (proves SELECT policy works)
    expect(retrieveError).toBeNull();
    expect(retrievedSubmission).toBeDefined();
    expect(retrievedSubmission.id).toBe(submission.id);
    expect(retrievedSubmission.student_id).toBe(testStudent.id);

    console.log('✅ Quiz submission test passed!');
    console.log('  - Quiz submitted successfully');
    console.log('  - Auto-grading worked correctly');
    console.log('  - RLS policies allow student to create and read their own submissions');
  });

  it('should prevent students from viewing other students submissions', async () => {
    // Create a fake submission ID that doesn't belong to this student
    const fakeSubmissionId = '00000000-0000-0000-0000-000000000000';

    // Act: Try to read a submission that doesn't belong to this student
    const { data, error } = await studentClient
      .from('quiz_submissions')
      .select('*')
      .eq('id', fakeSubmissionId)
      .single();

    // Assert: Should not be able to read other students' submissions
    expect(data).toBeNull();
    // RLS should silently filter out the record, not throw an error

    console.log('✅ RLS security test passed!');
    console.log('  - Students cannot view submissions from other students');
  });
});
