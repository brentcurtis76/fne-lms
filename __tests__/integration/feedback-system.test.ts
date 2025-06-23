import { createClient } from '@supabase/supabase-js';

// Integration tests for the feedback system
describe('Feedback System Integration', () => {
  let supabase: any;
  let testUserId: string;
  let adminUserId: string;
  let feedbackId: string;

  beforeAll(async () => {
    // Initialize Supabase client with service role for testing
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create test users
    const { data: testUser } = await supabase.auth.admin.createUser({
      email: 'test-user@example.com',
      password: 'testpassword123',
      email_confirm: true
    });
    testUserId = testUser.user.id;

    const { data: adminUser } = await supabase.auth.admin.createUser({
      email: 'test-admin@example.com',
      password: 'adminpassword123',
      email_confirm: true
    });
    adminUserId = adminUser.user.id;

    // Create profiles
    await supabase.from('profiles').insert([
      {
        id: testUserId,
        email: 'test-user@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'docente',
        is_active: true
      },
      {
        id: adminUserId,
        email: 'test-admin@example.com',
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        is_active: true
      }
    ]);
  });

  afterAll(async () => {
    // Clean up test data
    if (feedbackId) {
      await supabase.from('feedback_activity').delete().eq('feedback_id', feedbackId);
      await supabase.from('platform_feedback').delete().eq('id', feedbackId);
    }
    
    await supabase.from('profiles').delete().in('id', [testUserId, adminUserId]);
    await supabase.auth.admin.deleteUser(testUserId);
    await supabase.auth.admin.deleteUser(adminUserId);
  });

  describe('Feedback Creation', () => {
    it('should create feedback with all required fields', async () => {
      const feedbackData = {
        description: 'Test feedback description',
        type: 'bug',
        page_url: 'https://example.com/test',
        user_agent: 'Test User Agent',
        browser_info: {
          userAgent: 'Test User Agent',
          platform: 'Test Platform',
          language: 'en-US'
        },
        created_by: testUserId
      };

      const { data, error } = await supabase
        .from('platform_feedback')
        .insert(feedbackData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.description).toBe(feedbackData.description);
      expect(data.type).toBe(feedbackData.type);
      expect(data.status).toBe('new'); // Default status
      expect(data.created_by).toBe(testUserId);

      feedbackId = data.id;
    });

    it('should enforce required fields', async () => {
      const invalidFeedback = {
        type: 'bug',
        page_url: 'https://example.com/test'
        // Missing description and created_by
      };

      const { error } = await supabase
        .from('platform_feedback')
        .insert(invalidFeedback);

      expect(error).toBeDefined();
      expect(error.message).toContain('null value');
    });

    it('should validate feedback type', async () => {
      const invalidTypeFeedback = {
        description: 'Test description',
        type: 'invalid_type',
        created_by: testUserId
      };

      const { error } = await supabase
        .from('platform_feedback')
        .insert(invalidTypeFeedback);

      expect(error).toBeDefined();
      expect(error.message).toContain('check constraint');
    });

    it('should validate feedback status', async () => {
      const invalidStatusFeedback = {
        description: 'Test description',
        type: 'bug',
        status: 'invalid_status',
        created_by: testUserId
      };

      const { error } = await supabase
        .from('platform_feedback')
        .insert(invalidStatusFeedback);

      expect(error).toBeDefined();
      expect(error.message).toContain('check constraint');
    });
  });

  describe('Row Level Security', () => {
    it('should allow users to view their own feedback', async () => {
      // Set user context
      await supabase.auth.signInWithPassword({
        email: 'test-user@example.com',
        password: 'testpassword123'
      });

      const { data, error } = await supabase
        .from('platform_feedback')
        .select('*')
        .eq('id', feedbackId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(feedbackId);

      await supabase.auth.signOut();
    });

    it('should prevent users from viewing other users feedback', async () => {
      // Create another user
      const { data: otherUser } = await supabase.auth.admin.createUser({
        email: 'other-user@example.com',
        password: 'password123',
        email_confirm: true
      });

      await supabase.from('profiles').insert({
        id: otherUser.user.id,
        email: 'other-user@example.com',
        first_name: 'Other',
        last_name: 'User',
        role: 'docente',
        is_active: true
      });

      // Sign in as other user
      await supabase.auth.signInWithPassword({
        email: 'other-user@example.com',
        password: 'password123'
      });

      const { data, error } = await supabase
        .from('platform_feedback')
        .select('*')
        .eq('id', feedbackId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // Should not see other user's feedback

      await supabase.auth.signOut();
      
      // Cleanup
      await supabase.from('profiles').delete().eq('id', otherUser.user.id);
      await supabase.auth.admin.deleteUser(otherUser.user.id);
    });

    it('should allow admins to view all feedback', async () => {
      // Sign in as admin
      await supabase.auth.signInWithPassword({
        email: 'test-admin@example.com',
        password: 'adminpassword123'
      });

      const { data, error } = await supabase
        .from('platform_feedback')
        .select('*')
        .eq('id', feedbackId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(feedbackId);

      await supabase.auth.signOut();
    });
  });

  describe('Feedback Activity', () => {
    it('should allow adding activity to feedback', async () => {
      const activityData = {
        feedback_id: feedbackId,
        message: 'Test activity message',
        created_by: adminUserId,
        is_system_message: false
      };

      const { data, error } = await supabase
        .from('feedback_activity')
        .insert(activityData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.message).toBe(activityData.message);
      expect(data.feedback_id).toBe(feedbackId);
    });

    it('should create system message on status change', async () => {
      // Update feedback status
      const { error: updateError } = await supabase
        .from('platform_feedback')
        .update({ status: 'in_progress' })
        .eq('id', feedbackId);

      expect(updateError).toBeNull();

      // Check if system activity was created
      const { data: activities } = await supabase
        .from('feedback_activity')
        .select('*')
        .eq('feedback_id', feedbackId)
        .eq('is_system_message', true);

      expect(activities).toBeDefined();
      expect(activities.length).toBeGreaterThan(0);
      
      const statusChangeActivity = activities.find(a => 
        a.message.includes('Estado cambiado')
      );
      expect(statusChangeActivity).toBeDefined();
    });
  });

  describe('Feedback Stats View', () => {
    it('should return correct statistics', async () => {
      const { data, error } = await supabase
        .from('feedback_stats')
        .select('*')
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(typeof data.new_count).toBe('number');
      expect(typeof data.in_progress_count).toBe('number');
      expect(typeof data.resolved_count).toBe('number');
      expect(typeof data.bug_count).toBe('number');
      expect(typeof data.idea_count).toBe('number');
      expect(typeof data.feedback_count).toBe('number');
    });

    it('should update statistics when feedback status changes', async () => {
      // Get initial stats
      const { data: initialStats } = await supabase
        .from('feedback_stats')
        .select('*')
        .single();

      const initialInProgress = initialStats.in_progress_count;

      // Create new feedback
      const { data: newFeedback } = await supabase
        .from('platform_feedback')
        .insert({
          description: 'Stats test feedback',
          type: 'bug',
          status: 'in_progress',
          created_by: testUserId
        })
        .select()
        .single();

      // Get updated stats
      const { data: updatedStats } = await supabase
        .from('feedback_stats')
        .select('*')
        .single();

      expect(updatedStats.in_progress_count).toBe(initialInProgress + 1);

      // Cleanup
      await supabase
        .from('platform_feedback')
        .delete()
        .eq('id', newFeedback.id);
    });
  });

  describe('Storage Integration', () => {
    it('should have feedback-screenshots bucket configured', async () => {
      const { data: buckets, error } = await supabase.storage.listBuckets();

      expect(error).toBeNull();
      expect(buckets).toBeDefined();
      
      const feedbackBucket = buckets.find(b => b.id === 'feedback-screenshots');
      expect(feedbackBucket).toBeDefined();
      expect(feedbackBucket.public).toBe(true);
    });

    it('should allow authenticated users to upload to their folder', async () => {
      // Sign in as test user
      await supabase.auth.signInWithPassword({
        email: 'test-user@example.com',
        password: 'testpassword123'
      });

      const testFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      const filePath = `feedback/${testUserId}/test-image.jpg`;

      const { data, error } = await supabase.storage
        .from('feedback-screenshots')
        .upload(filePath, testFile);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.path).toBe(filePath);

      // Cleanup
      await supabase.storage
        .from('feedback-screenshots')
        .remove([filePath]);

      await supabase.auth.signOut();
    });
  });

  describe('Notification Integration', () => {
    it('should have notification trigger configured', async () => {
      const { data: triggers, error } = await supabase
        .from('notification_triggers')
        .select('*')
        .eq('event_type', 'new_feedback');

      expect(error).toBeNull();
      expect(triggers).toBeDefined();
      expect(triggers.length).toBe(1);
      expect(triggers[0].is_active).toBe(true);
      expect(triggers[0].category).toBe('system');
    });

    it('should have valid notification template', async () => {
      const { data: triggers } = await supabase
        .from('notification_triggers')
        .select('notification_template')
        .eq('event_type', 'new_feedback')
        .single();

      const template = triggers.notification_template;
      expect(template).toBeDefined();
      expect(template.title_template).toContain('{feedback_type}');
      expect(template.description_template).toContain('{user_name}');
      expect(template.description_template).toContain('{description}');
      expect(template.url_template).toBe('/admin/feedback');
    });
  });
});