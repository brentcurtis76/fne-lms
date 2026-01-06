/**
 * Genera Data Seeding - Progress Generator
 * 
 * Generates realistic learning progress data including course completions,
 * time tracking, session data, and performance metrics
 */

const { logProgress, batchInsert, generateRandomDate, randomBetween, randomChoice } = require('../utils/database');

async function generateProgress(supabase, scenarios, generatedData) {
  console.log('📈 Generating learning progress...');
  
  const users = generatedData.users || [];
  const courses = generatedData.courses?.courses || [];
  const enrollments = generatedData.courses?.enrollments || [];
  const assignments = generatedData.courses?.assignments || [];
  
  if (enrollments.length === 0) {
    throw new Error('Course enrollments must be generated first');
  }
  
  const progressData = {
    completions: [],
    timeTracking: [],
    sessions: [],
    assignmentSubmissions: []
  };
  
  try {
    // Step 1: Generate Course Completions
    console.log('\n1. Creating course completions...');
    const completions = [];
    
    for (const enrollment of enrollments) {
      const user = users.find(u => u.id === enrollment.user_id);
      const course = courses.find(c => c.id === enrollment.course_id);
      
      if (!user || !course) continue;
      
      // Determine completion likelihood based on user engagement and course difficulty
      const completionProbability = getCompletionProbability(user, course, enrollment);
      
      if (Math.random() < completionProbability) {
        const completionDate = generateCompletionDate(enrollment.enrolled_at, course.end_date);
        const studyTimeHours = generateStudyTime(course, user.metadata.engagement_level);
        
        const completion = {
          id: `test-completion-${completions.length + 1}`,
          user_id: user.id,
          course_id: course.id,
          completed_at: completionDate,
          final_score: generateFinalScore(user, course),
          time_spent_hours: studyTimeHours,
          completion_percentage: 100,
          certificate_issued: Math.random() > 0.2, // 80% get certificates
          completion_method: randomChoice(['standard', 'accelerated', 'extended']),
          feedback_rating: randomBetween(1, 5),
          metadata: {
            test_data: 'true',
            learning_path: generateLearningPath(),
            strengths: generateStrengths(course.subject),
            areas_for_improvement: generateImprovementAreas(course.subject),
            study_pattern: generateStudyPattern(user.metadata.engagement_level),
            peer_interactions: randomBetween(0, 50),
            resource_usage: generateResourceUsage()
          }
        };
        
        completions.push(completion);
      }
      
      // Progress logging
      if ((completions.length % 100) === 0) {
        logProgress('Course Completions', enrollments.indexOf(enrollment) + 1, enrollments.length);
      }
    }
    
    const completionResults = await batchInsert(supabase, 'course_completions', completions, 150);
    progressData.completions = completionResults;
    
    // Step 2: Generate User Course Time Tracking
    console.log('\n2. Creating time tracking records...');
    const timeRecords = [];
    
    for (const enrollment of enrollments) {
      const user = users.find(u => u.id === enrollment.user_id);
      const course = courses.find(c => c.id === enrollment.course_id);
      const completion = completions.find(c => 
        c.user_id === enrollment.user_id && c.course_id === enrollment.course_id
      );
      
      if (!user || !course) continue;
      
      const isCompleted = !!completion;
      const progressPercentage = isCompleted ? 100 : generateProgressPercentage(user, course);
      const timeSpent = completion?.time_spent_hours || generatePartialStudyTime(course, progressPercentage);
      
      const timeRecord = {
        id: `test-time-${timeRecords.length + 1}`,
        user_id: user.id,
        course_id: course.id,
        total_time_minutes: Math.round(timeSpent * 60),
        completed_lessons: Math.floor((progressPercentage / 100) * course.total_lessons),
        total_lessons: course.total_lessons,
        last_accessed: generateLastAccessDate(enrollment.enrolled_at),
        progress_percentage: progressPercentage,
        average_session_duration: randomBetween(15, 90), // minutes
        total_sessions: randomBetween(5, 50),
        streak_days: generateStreakDays(user.metadata.engagement_level),
        created_at: enrollment.enrolled_at,
        updated_at: new Date().toISOString(),
        metadata: {
          test_data: 'true',
          study_consistency: generateStudyConsistency(user.metadata.engagement_level),
          preferred_study_times: generatePreferredStudyTimes(),
          device_usage: generateDeviceUsage(),
          learning_velocity: calculateLearningVelocity(timeSpent, progressPercentage)
        }
      };
      
      timeRecords.push(timeRecord);
      
      if ((timeRecords.length % 100) === 0) {
        logProgress('Time Tracking', timeRecords.length, enrollments.length);
      }
    }
    
    const timeResults = await batchInsert(supabase, 'user_course_time', timeRecords, 150);
    progressData.timeTracking = timeResults;
    
    // Step 3: Generate User Sessions
    console.log('\n3. Creating user sessions...');
    const sessions = [];
    const totalSessions = Math.min(5000, enrollments.length * 8); // Average 8 sessions per enrollment
    
    for (let i = 0; i < totalSessions; i++) {
      const enrollment = randomChoice(enrollments);
      const user = users.find(u => u.id === enrollment.user_id);
      const course = courses.find(c => c.id === enrollment.course_id);
      
      if (!user || !course) continue;
      
      const sessionDate = generateSessionDate(enrollment.enrolled_at);
      const duration = generateSessionDuration(user.metadata.engagement_level);
      
      const session = {
        id: `test-session-${sessions.length + 1}`,
        user_id: user.id,
        course_id: course.id,
        started_at: sessionDate,
        ended_at: new Date(new Date(sessionDate).getTime() + (duration * 60000)).toISOString(),
        duration_minutes: duration,
        pages_visited: randomBetween(3, 20),
        actions_count: randomBetween(5, 50),
        device_type: randomChoice(['desktop', 'mobile', 'tablet']),
        browser: randomChoice(['Chrome', 'Firefox', 'Safari', 'Edge']),
        ip_address: generateFakeIP(),
        user_agent: 'Mozilla/5.0 (Test Data)',
        referrer: randomChoice(['direct', 'bookmark', 'notification', 'dashboard']),
        exit_page: randomChoice(['lesson', 'assignment', 'discussion', 'resources']),
        metadata: {
          test_data: 'true',
          engagement_score: randomBetween(1, 100),
          bounce_rate: Math.random(),
          interaction_depth: randomChoice(['shallow', 'moderate', 'deep']),
          learning_activities: generateLearningActivities()
        }
      };
      
      sessions.push(session);
      
      if ((sessions.length % 250) === 0) {
        logProgress('User Sessions', sessions.length, totalSessions);
      }
    }
    
    const sessionResults = await batchInsert(supabase, 'user_sessions', sessions, 200);
    progressData.sessions = sessionResults;
    
    // Step 4: Generate Assignment Submissions (if assignments table exists)
    console.log('\n4. Creating assignment submissions...');
    const submissions = [];
    
    for (const assignment of assignments) {
      const course = courses.find(c => c.id === assignment.course_id);
      const courseEnrollments = enrollments.filter(e => e.course_id === assignment.course_id);
      
      // 70-90% of enrolled students submit assignments
      const submissionRate = randomBetween(70, 90) / 100;
      const numSubmissions = Math.floor(courseEnrollments.length * submissionRate);
      
      const selectedEnrollments = courseEnrollments
        .sort(() => 0.5 - Math.random())
        .slice(0, numSubmissions);
      
      for (const enrollment of selectedEnrollments) {
        const user = users.find(u => u.id === enrollment.user_id);
        if (!user) continue;
        
        const submissionDate = generateSubmissionDate(assignment.due_date, user.metadata.engagement_level);
        const score = generateAssignmentScore(user, assignment);
        
        const submission = {
          id: `test-submission-${submissions.length + 1}`,
          assignment_id: assignment.id,
          user_id: user.id,
          submitted_at: submissionDate,
          score: score,
          max_score: assignment.max_score,
          status: score > 0 ? 'graded' : 'submitted',
          submission_text: generateSubmissionContent(assignment, user),
          file_attachments: Math.random() > 0.6 ? generateFileAttachments() : null,
          late_submission: new Date(submissionDate) > new Date(assignment.due_date),
          attempts: randomBetween(1, 3),
          time_spent_minutes: randomBetween(30, 180),
          peer_reviews_given: assignment.peer_review_required ? randomBetween(0, 3) : 0,
          peer_reviews_received: assignment.peer_review_required ? randomBetween(0, 3) : 0,
          feedback_received: Math.random() > 0.3, // 70% get feedback
          metadata: {
            test_data: 'true',
            submission_quality: generateSubmissionQuality(score, assignment.max_score),
            creativity_score: randomBetween(1, 10),
            collaboration_level: assignment.collaboration_allowed ? randomBetween(1, 5) : 1,
            research_depth: randomChoice(['superficial', 'adequate', 'thorough', 'extensive']),
            technical_skills_demonstrated: generateTechnicalSkills(assignment.course_id, courses)
          }
        };
        
        submissions.push(submission);
      }
      
      if ((assignments.indexOf(assignment) % 10) === 0) {
        logProgress('Assignment Submissions', assignments.indexOf(assignment) + 1, assignments.length);
      }
    }
    
    const submissionResults = await batchInsert(supabase, 'assignment_submissions', submissions, 200);
    progressData.assignmentSubmissions = submissionResults;
    
    // Generate summary report
    console.log('\n📊 Learning Progress Summary:');
    console.log(`   • Course Completions: ${completions.length}`);
    console.log(`   • Time Tracking Records: ${timeRecords.length}`);
    console.log(`   • User Sessions: ${sessions.length}`);
    console.log(`   • Assignment Submissions: ${submissions.length}`);
    
    // Completion rate analysis
    const completionRate = Math.round((completions.length / enrollments.length) * 100);
    console.log(`   • Overall Completion Rate: ${completionRate}%`);
    
    // Average study time
    const avgStudyTime = completions.length > 0 ? 
      Math.round(completions.reduce((sum, c) => sum + c.time_spent_hours, 0) / completions.length) : 0;
    console.log(`   • Average Study Time: ${avgStudyTime} hours`);
    
    // Engagement distribution
    const engagementLevels = timeRecords.reduce((acc, record) => {
      const user = users.find(u => u.id === record.user_id);
      const level = user?.metadata.engagement_level || 'unknown';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});
    console.log(`   • Engagement Distribution: ${JSON.stringify(engagementLevels)}`);
    
    return progressData;
  } catch (error) {
    console.error('❌ Progress generation failed:', error.message);
    throw error;
  }
}

// Helper functions for progress generation
function getCompletionProbability(user, course, enrollment) {
  let baseProbability = 0.7; // 70% base completion rate
  
  // Adjust based on user engagement
  const engagementMultipliers = {
    'muy_alto': 1.3,
    'alto': 1.15,
    'medio': 1.0,
    'bajo': 0.7,
    'muy_bajo': 0.4
  };
  
  baseProbability *= engagementMultipliers[user.metadata.engagement_level] || 1.0;
  
  // Adjust based on course difficulty
  baseProbability *= (11 - course.difficulty_score) / 10; // Easier courses have higher completion
  
  // Adjust based on enrollment motivation
  const motivationMultipliers = {
    'alto': 1.2,
    'medio': 1.0,
    'bajo': 0.8
  };
  
  baseProbability *= motivationMultipliers[enrollment.motivation_level] || 1.0;
  
  return Math.min(0.95, Math.max(0.1, baseProbability)); // Cap between 10% and 95%
}

function generateCompletionDate(enrolledAt, courseEndDate) {
  const enrollDate = new Date(enrolledAt);
  const endDate = new Date(courseEndDate);
  const courseDuration = endDate.getTime() - enrollDate.getTime();
  
  // Most completions happen in the last 30% of the course
  const minCompletion = enrollDate.getTime() + (courseDuration * 0.4);
  const maxCompletion = endDate.getTime();
  
  return new Date(minCompletion + Math.random() * (maxCompletion - minCompletion)).toISOString();
}

function generateStudyTime(course, engagementLevel) {
  let baseHours = course.estimated_hours;
  
  const engagementMultipliers = {
    'muy_alto': randomBetween(120, 150) / 100, // 20-50% more time
    'alto': randomBetween(110, 130) / 100,     // 10-30% more time
    'medio': randomBetween(90, 110) / 100,     // ±10%
    'bajo': randomBetween(70, 90) / 100,       // 10-30% less time
    'muy_bajo': randomBetween(50, 80) / 100    // 20-50% less time
  };
  
  return Math.round(baseHours * (engagementMultipliers[engagementLevel] || 1.0));
}

function generateFinalScore(user, course) {
  let baseScore = 75; // Base score of 75%
  
  // Adjust based on engagement
  const engagementBonus = {
    'muy_alto': randomBetween(15, 25),
    'alto': randomBetween(8, 18),
    'medio': randomBetween(-5, 10),
    'bajo': randomBetween(-15, 5),
    'muy_bajo': randomBetween(-25, -5)
  };
  
  baseScore += engagementBonus[user.metadata.engagement_level] || 0;
  
  // Adjust based on course difficulty
  baseScore -= (course.difficulty_score - 5) * 2; // Harder courses = lower scores
  
  // Add some randomness
  baseScore += randomBetween(-10, 10);
  
  return Math.max(60, Math.min(100, baseScore)); // Cap between 60% and 100%
}

function generateProgressPercentage(user, course) {
  const engagementMap = {
    'muy_alto': randomBetween(80, 100),
    'alto': randomBetween(60, 95),
    'medio': randomBetween(40, 80),
    'bajo': randomBetween(20, 60),
    'muy_bajo': randomBetween(5, 40)
  };
  
  return engagementMap[user.metadata.engagement_level] || 50;
}

function generatePartialStudyTime(course, progressPercentage) {
  const estimatedTotalTime = course.estimated_hours;
  const completionRatio = progressPercentage / 100;
  
  // Add some variance - some students are more/less efficient
  const efficiency = randomBetween(80, 120) / 100;
  
  return Math.round(estimatedTotalTime * completionRatio * efficiency);
}

function generateLastAccessDate(enrolledAt) {
  const enrollDate = new Date(enrolledAt);
  const now = new Date();
  const timeSinceEnrollment = now.getTime() - enrollDate.getTime();
  
  // Most students accessed recently (within last 30 days)
  const recentAccess = now.getTime() - (randomBetween(1, 30) * 24 * 60 * 60 * 1000);
  
  return new Date(Math.max(enrollDate.getTime(), recentAccess)).toISOString();
}

function generateStreakDays(engagementLevel) {
  const streakMap = {
    'muy_alto': randomBetween(15, 45),
    'alto': randomBetween(8, 25),
    'medio': randomBetween(3, 15),
    'bajo': randomBetween(1, 8),
    'muy_bajo': randomBetween(0, 3)
  };
  
  return streakMap[engagementLevel] || 5;
}

function generateSessionDate(enrolledAt) {
  const enrollDate = new Date(enrolledAt);
  const now = new Date();
  const timeSinceEnrollment = now.getTime() - enrollDate.getTime();
  
  return new Date(enrollDate.getTime() + Math.random() * timeSinceEnrollment).toISOString();
}

function generateSessionDuration(engagementLevel) {
  const durationMap = {
    'muy_alto': randomBetween(45, 120), // 45min to 2 hours
    'alto': randomBetween(30, 90),      // 30min to 1.5 hours
    'medio': randomBetween(20, 60),     // 20min to 1 hour
    'bajo': randomBetween(10, 30),      // 10min to 30min
    'muy_bajo': randomBetween(5, 20)    // 5min to 20min
  };
  
  return durationMap[engagementLevel] || 30;
}

function generateFakeIP() {
  return `192.168.${randomBetween(1, 255)}.${randomBetween(1, 255)}`;
}

function generateSubmissionDate(dueDate, engagementLevel) {
  const due = new Date(dueDate);
  
  // High engagement users submit early, low engagement users submit late
  const dayOffset = {
    'muy_alto': randomBetween(-7, -1),    // 1 week to 1 day early
    'alto': randomBetween(-3, 0),         // 3 days early to on time
    'medio': randomBetween(-1, 1),        // 1 day early to 1 day late
    'bajo': randomBetween(0, 3),          // On time to 3 days late
    'muy_bajo': randomBetween(1, 7)       // 1 to 7 days late
  };
  
  const offset = (dayOffset[engagementLevel] || 0) * 24 * 60 * 60 * 1000;
  return new Date(due.getTime() + offset).toISOString();
}

function generateAssignmentScore(user, assignment) {
  let baseScore = 75; // Base 75% score
  
  // Adjust based on user engagement
  const engagementAdjustment = {
    'muy_alto': randomBetween(15, 25),
    'alto': randomBetween(8, 18),
    'medio': randomBetween(-5, 10),
    'bajo': randomBetween(-15, 5),
    'muy_bajo': randomBetween(-25, -5)
  };
  
  baseScore += engagementAdjustment[user.metadata.engagement_level] || 0;
  
  // Add randomness
  baseScore += randomBetween(-10, 15);
  
  // Scale to assignment max score
  const percentage = Math.max(0, Math.min(100, baseScore)) / 100;
  return Math.round(assignment.max_score * percentage);
}

// Additional helper functions
function generateLearningPath() {
  return randomChoice(['structured', 'exploratory', 'project_based', 'self_paced']);
}

function generateStrengths(subject) {
  const strengthsMap = {
    'Matemáticas': ['resolución_problemas', 'pensamiento_lógico', 'análisis_numérico'],
    'Lengua y Literatura': ['comprensión_lectora', 'expresión_escrita', 'análisis_crítico'],
    'Historia y Geografía': ['análisis_histórico', 'interpretación', 'síntesis'],
    'Ciencias Naturales': ['observación', 'experimentación', 'análisis_científico'],
    'Tecnología': ['innovación', 'diseño', 'programación'],
    'Arte y Cultura': ['creatividad', 'expresión', 'interpretación_artística']
  };
  
  const options = strengthsMap[subject] || ['análisis', 'síntesis', 'aplicación'];
  return options.slice(0, randomBetween(1, 3));
}

function generateImprovementAreas(subject) {
  const areas = ['gestión_tiempo', 'trabajo_colaborativo', 'presentación_oral', 'investigación'];
  return areas.slice(0, randomBetween(1, 2));
}

function generateStudyPattern(engagementLevel) {
  const patterns = {
    'muy_alto': 'consistent_daily',
    'alto': 'regular_scheduled',
    'medio': 'intermittent',
    'bajo': 'last_minute',
    'muy_bajo': 'sporadic'
  };
  
  return patterns[engagementLevel] || 'standard';
}

function generateResourceUsage() {
  return {
    videos_watched: randomBetween(0, 50),
    documents_read: randomBetween(0, 30),
    forums_visited: randomBetween(0, 20),
    external_resources: randomBetween(0, 15)
  };
}

function generateStudyConsistency(engagementLevel) {
  const consistency = {
    'muy_alto': randomBetween(85, 95),
    'alto': randomBetween(70, 85),
    'medio': randomBetween(50, 70),
    'bajo': randomBetween(25, 50),
    'muy_bajo': randomBetween(10, 30)
  };
  
  return consistency[engagementLevel] || 50;
}

function generatePreferredStudyTimes() {
  const timeSlots = ['morning', 'afternoon', 'evening', 'night'];
  return timeSlots.slice(0, randomBetween(1, 2));
}

function generateDeviceUsage() {
  return {
    desktop: randomBetween(0, 100),
    mobile: randomBetween(0, 80),
    tablet: randomBetween(0, 40)
  };
}

function calculateLearningVelocity(timeSpent, progressPercentage) {
  if (timeSpent === 0) return 0;
  return Math.round((progressPercentage / timeSpent) * 10) / 10; // Progress per hour
}

function generateLearningActivities() {
  const activities = ['reading', 'video_watching', 'quiz_taking', 'discussion', 'assignment_work'];
  return activities.slice(0, randomBetween(2, 4));
}

function generateSubmissionContent(assignment, user) {
  return `Submission for ${assignment.title} by ${user.full_name}. Content demonstrates understanding of course concepts and meets assignment requirements.`;
}

function generateFileAttachments() {
  const attachments = [];
  const numFiles = randomBetween(1, 3);
  
  for (let i = 0; i < numFiles; i++) {
    attachments.push({
      filename: `archivo_${i + 1}.${randomChoice(['pdf', 'docx', 'pptx', 'jpg'])}`,
      size: randomBetween(100, 5000) // KB
    });
  }
  
  return attachments;
}

function generateSubmissionQuality(score, maxScore) {
  const percentage = (score / maxScore) * 100;
  
  if (percentage >= 90) return 'excellent';
  if (percentage >= 80) return 'good';
  if (percentage >= 70) return 'satisfactory';
  if (percentage >= 60) return 'needs_improvement';
  return 'unsatisfactory';
}

function generateTechnicalSkills(courseId, courses) {
  const course = courses.find(c => c.id === courseId);
  if (!course) return [];
  
  const skillsMap = {
    'Tecnología': ['programming', 'design', 'problem_solving'],
    'Matemáticas': ['calculation', 'analysis', 'logical_thinking'],
    'Ciencias Naturales': ['observation', 'experimentation', 'data_analysis']
  };
  
  return skillsMap[course.subject] || ['general_analysis'];
}

module.exports = { generateProgress };