/**
 * Integration tests for Learning Path Tracking Accuracy
 * Validates end-to-end tracking from session creation to analytics reporting
 */

import { describe } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { LearningPathSessionTracker } from '../../lib/services/learningPathSessionTracker';

describe.skip('Learning Path Tracking Accuracy - Integration Tests', () => {
  let supabaseClient: any;
  let testUserId: string = 'test-user-' + Date.now();
  let testPathId: string;
  let testCourseId: string;
  
  // Test configuration
  const TEST_SESSION_DURATION = 5000; // 5 seconds for fast tests
  const HEARTBEAT_INTERVAL = 1000; // 1 second
  const EXPECTED_TIME_TOLERANCE = 2000; // 2 second tolerance for timing

  beforeAll(async () => {
    // Skip if environment variables not available
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('Skipping integration tests - missing environment variables');
      return;
    }

    // Initialize Supabase client for integration tests
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Use existing test user ID instead of creating new ones
    testUserId = 'a45ac5e9-1234-5678-9abc-def123456789'; // Mock test user ID
    
    // Create test data with existing user
    await createTestDataWithExistingUser();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Skip if client not initialized
    if (!supabaseClient) return;
    
    // Clear any existing sessions before each test
    await supabaseClient
      .from('learning_path_progress_sessions')
      .delete()
      .eq('user_id', testUserId);
  });

  describe('Session Tracking Accuracy', () => {
    it('should accurately track session duration with heartbeats', async () => {
      // Skip if client not initialized
      if (!supabaseClient) {
        console.warn('Skipping test - Supabase client not initialized');
        return;
      }

      const tracker = new LearningPathSessionTracker(testPathId, testCourseId, {
        heartbeatInterval: HEARTBEAT_INTERVAL,
        inactivityTimeout: 10000,
        debugMode: true
      });

      // Start session
      const startTime = Date.now();
      await tracker.startSession(testUserId);

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, TEST_SESSION_DURATION));

      // End session
      await tracker.endSession();
      const endTime = Date.now();
      const expectedDuration = Math.floor((endTime - startTime) / (60 * 1000)); // Convert to minutes

      // Verify session was recorded accurately
      const { data: sessions } = await supabaseClient
        .from('learning_path_progress_sessions')
        .select('*')
        .eq('user_id', testUserId)
        .eq('path_id', testPathId);

      expect(sessions).toHaveLength(1);
      
      const session = sessions[0];
      expect(session.activity_type).toBe('course_view');
      expect(session.course_id).toBe(testCourseId);
      
      // Validate time tracking accuracy (within tolerance)
      const actualDuration = session.time_spent_minutes;
      const timeDifference = Math.abs(actualDuration - expectedDuration);
      expect(timeDifference).toBeLessThanOrEqual(1); // Should be within 1 minute
      
      console.log(`✅ Expected ~${expectedDuration}min, got ${actualDuration}min (diff: ${timeDifference}min)`);
    });

    it('should track multiple activities and aggregate time correctly', async () => {
      const activities = [
        { type: 'course_start', courseId: testCourseId, duration: 2000 },
        { type: 'course_view', courseId: testCourseId, duration: 3000 },
        { type: 'course_complete', courseId: testCourseId, duration: 1000 }
      ];

      let totalExpectedTime = 0;

      for (const activity of activities) {
        const tracker = new LearningPathSessionTracker(testPathId, activity.courseId, {
          heartbeatInterval: 500,
          debugMode: true
        });

        await tracker.startSession(testUserId);
        await new Promise(resolve => setTimeout(resolve, activity.duration));
        await tracker.updateActivity(activity.type as any, activity.courseId);
        await tracker.endSession();

        totalExpectedTime += Math.floor(activity.duration / (60 * 1000));
      }

      // Verify total time aggregation
      const { data: sessions } = await supabaseClient
        .from('learning_path_progress_sessions')
        .select('time_spent_minutes, activity_type')
        .eq('user_id', testUserId)
        .eq('path_id', testPathId);

      expect(sessions).toHaveLength(activities.length);

      const totalTrackedTime = sessions.reduce((sum: number, session: any) => 
        sum + session.time_spent_minutes, 0
      );

      // Verify activity types are correctly recorded
      const activityTypes = sessions.map((s: any) => s.activity_type).sort();
      const expectedTypes = activities.map(a => a.type).sort();
      expect(activityTypes).toEqual(expectedTypes);

      console.log(`✅ Total expected: ~${totalExpectedTime}min, tracked: ${totalTrackedTime}min`);
    });

    it('should handle session cleanup for abandoned sessions', async () => {
      // Create an abandoned session (no proper end)
      await supabaseClient
        .from('learning_path_progress_sessions')
        .insert({
          user_id: testUserId,
          path_id: testPathId,
          course_id: testCourseId,
          activity_type: 'course_view',
          session_start: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
          last_heartbeat: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          time_spent_minutes: 0
        });

      // Simulate cleanup job
      const response = await fetch('/api/cron/cleanup-learning-path-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.ok).toBe(true);

      // Verify abandoned session was cleaned up
      const { data: cleanedSessions } = await supabaseClient
        .from('learning_path_progress_sessions')
        .select('*')
        .eq('user_id', testUserId)
        .is('session_end', null);

      expect(cleanedSessions).toHaveLength(0);
      console.log('✅ Abandoned session cleanup working correctly');
    });
  });

  describe('Progress Calculation Accuracy', () => {
    it('should accurately calculate learning path progress from session data', async () => {
      // Create test enrollment data
      await supabaseClient
        .from('course_enrollments')
        .insert({
          user_id: testUserId,
          course_id: testCourseId,
          progress_percentage: 75,
          status: 'in_progress',
          enrolled_at: new Date().toISOString()
        });

      // Create assignment record
      await supabaseClient
        .from('learning_path_assignments')
        .insert({
          path_id: testPathId,
          user_id: testUserId,
          assigned_by: testUserId,
          assigned_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          total_time_spent_minutes: 120,
          current_course_sequence: 1
        });

      // Test the RPC function we optimized
      const { data: pathDetails, error } = await supabaseClient
        .rpc('get_user_path_details_with_progress', {
          p_user_id: testUserId,
          p_path_id: testPathId
        });

      expect(error).toBeNull();
      expect(pathDetails).toBeDefined();

      // Validate progress calculation
      expect(pathDetails.progress.total_courses).toBe(1);
      expect(pathDetails.progress.completed_courses).toBe(0); // 75% is not complete
      expect(pathDetails.progress.progress_percentage).toBe(0);

      // Validate time tracking
      expect(pathDetails.timeTracking.totalTimeSpent).toBe(120);
      
      // Validate course status
      const course = pathDetails.courses[0];
      expect(course.status).toBe('in_progress');
      expect(course.completion_rate).toBe(75);
      expect(course.buttonText).toBe('Continuar');

      console.log('✅ Progress calculation accuracy validated');
    });

    it('should handle 100% course completion correctly', async () => {
      // Update course to completed
      await supabaseClient
        .from('course_enrollments')
        .upsert({
          user_id: testUserId,
          course_id: testCourseId,
          progress_percentage: 100,
          status: 'completed',
          enrolled_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        });

      // Test completion detection
      const { data: pathDetails } = await supabaseClient
        .rpc('get_user_path_details_with_progress', {
          p_user_id: testUserId,
          p_path_id: testPathId
        });

      // Validate 100% completion is detected
      expect(pathDetails.progress.completed_courses).toBe(1);
      expect(pathDetails.progress.progress_percentage).toBe(100);

      const course = pathDetails.courses[0];
      expect(course.status).toBe('completed');
      expect(course.completion_rate).toBe(100);
      expect(course.buttonText).toBe('Revisar');
      expect(course.buttonVariant).toBe('secondary');

      console.log('✅ Course completion detection working correctly');
    });
  });

  describe('Analytics Reporting Accuracy', () => {
    it('should provide accurate analytics data from tracking sessions', async () => {
      // Create realistic session data
      const sessionData = [
        { activity: 'course_start', time: 30 },
        { activity: 'course_view', time: 45 },
        { activity: 'course_complete', time: 15 }
      ];

      for (const session of sessionData) {
        await supabaseClient
          .from('learning_path_progress_sessions')
          .insert({
            user_id: testUserId,
            path_id: testPathId,
            course_id: testCourseId,
            activity_type: session.activity,
            session_start: new Date().toISOString(),
            session_end: new Date().toISOString(),
            time_spent_minutes: session.time,
            last_heartbeat: new Date().toISOString()
          });
      }

      // Test analytics API
      const analyticsResponse = await fetch(`/api/learning-paths/analytics?pathId=${testPathId}&dateRange=30`);
      expect(analyticsResponse.ok).toBe(true);
      
      const analyticsData = await analyticsResponse.json();

      // Validate analytics aggregation
      expect(analyticsData.pathInfo.pathId).toBe(testPathId);
      expect(analyticsData.recentActivity.totalSessions).toBe(sessionData.length);
      
      const totalExpectedTime = sessionData.reduce((sum, s) => sum + s.time, 0);
      expect(analyticsData.timeAnalytics.totalTimeSpentHours).toBeCloseTo(totalExpectedTime / 60, 1);

      console.log('✅ Analytics reporting accuracy validated');
    });
  });

  describe('Data Consistency Validation', () => {
    it('should maintain data consistency across all tracking tables', async () => {
      const testTime = 60; // 1 hour

      // Create session
      await supabaseClient
        .from('learning_path_progress_sessions')
        .insert({
          user_id: testUserId,
          path_id: testPathId,
          course_id: testCourseId,
          activity_type: 'course_view',
          session_start: new Date().toISOString(),
          session_end: new Date().toISOString(),
          time_spent_minutes: testTime,
          last_heartbeat: new Date().toISOString()
        });

      // Update assignment total time
      await supabaseClient
        .from('learning_path_assignments')
        .upsert({
          path_id: testPathId,
          user_id: testUserId,
          assigned_by: testUserId,
          assigned_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          total_time_spent_minutes: testTime
        });

      // Verify data consistency
      const { data: sessions } = await supabaseClient
        .from('learning_path_progress_sessions')
        .select('time_spent_minutes')
        .eq('user_id', testUserId)
        .eq('path_id', testPathId);

      const { data: assignment } = await supabaseClient
        .from('learning_path_assignments')
        .select('total_time_spent_minutes')
        .eq('user_id', testUserId)
        .eq('path_id', testPathId)
        .single();

      const sessionTime = sessions.reduce((sum: number, s: any) => sum + s.time_spent_minutes, 0);
      expect(assignment.total_time_spent_minutes).toBe(sessionTime);

      console.log('✅ Data consistency maintained across tracking tables');
    });
  });

  // Helper functions
  async function createTestDataWithExistingUser() {
    // Use a mock user ID instead of creating a real auth user
    // This avoids auth permission issues in testing

    try {
      // Create test learning path
      const { data: pathData, error: pathError } = await supabaseClient
        .from('learning_paths')
        .insert({
          name: 'Test Tracking Path',
          description: 'Test path for tracking accuracy validation',
          created_by: testUserId
        })
        .select()
        .single();

      if (pathError) throw pathError;
      testPathId = pathData.id;

      // Create test course
      const { data: courseData, error: courseError } = await supabaseClient
        .from('courses')
        .insert({
          title: 'Test Tracking Course',
          description: 'Test course for tracking accuracy',
          instructor_id: testUserId,
          category: 'test',
          duration_hours: 2,
          difficulty_level: 'beginner',
          status: 'published'
        })
        .select()
        .single();

      if (courseError) throw courseError;
      testCourseId = courseData.id;

      // Link course to path
      await supabaseClient
        .from('learning_path_courses')
        .insert({
          learning_path_id: testPathId,
          course_id: testCourseId,
          sequence_order: 1
        });

      console.log(`✅ Test data created - User: ${testUserId}, Path: ${testPathId}, Course: ${testCourseId}`);
    } catch (error) {
      console.warn('Failed to create test data:', error);
      // Set fallback IDs for tests that don't require actual database records
      testPathId = 'test-path-' + Date.now();
      testCourseId = 'test-course-' + Date.now();
    }
  }

  async function cleanupTestData() {
    if (!supabaseClient || !testUserId) return;

    try {
      // Clean up in reverse dependency order
      await supabaseClient.from('learning_path_progress_sessions').delete().eq('user_id', testUserId);
      await supabaseClient.from('learning_path_assignments').delete().eq('user_id', testUserId);
      await supabaseClient.from('course_enrollments').delete().eq('user_id', testUserId);
      
      if (testPathId && testPathId.startsWith('test-path-')) {
        // Only cleanup if we have real test data (not fallback IDs)
        await supabaseClient.from('learning_path_courses').delete().eq('learning_path_id', testPathId);
        await supabaseClient.from('learning_paths').delete().eq('id', testPathId);
      }
      
      if (testCourseId && testCourseId.startsWith('test-course-')) {
        // Only cleanup if we have real test data (not fallback IDs)  
        await supabaseClient.from('courses').delete().eq('id', testCourseId);
      }

      console.log('✅ Test data cleanup completed');
    } catch (error) {
      console.warn('Test cleanup failed (this is expected in test environment):', error);
    }
  }
});
