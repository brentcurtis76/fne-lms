import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabase } from '../../lib/supabase-wrapper';

type ProfileRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
};

type FeedbackRow = {
  id: string;
  description: string;
  type: string;
  status: string;
  created_by: string;
  page_url?: string;
  user_agent?: string;
  browser_info?: any;
};

const profiles = new Map<string, ProfileRow>();
const feedbackRows: FeedbackRow[] = [];
const allowedTypes = ['bug', 'idea', 'feedback'];
const allowedStatuses = ['new', 'in_progress', 'resolved'];
let currentUser: { id: string; role: string } | null = null;
let idCounter = 1;

function generateId(prefix: string) {
  return `${prefix}-${idCounter++}`;
}

function validateFeedback(row: any): string | null {
  if (!row.description || !row.created_by) {
    return 'null value';
  }
  if (row.type && !allowedTypes.includes(row.type)) {
    return 'check constraint';
  }
  if (row.status && !allowedStatuses.includes(row.status)) {
    return 'check constraint';
  }
  return null;
}

function upsertProfiles(rows: any) {
  const list = Array.isArray(rows) ? rows : [rows];
  list.forEach((row) => {
    const profile: ProfileRow = {
      id: row.id || generateId('profile'),
      email: row.email,
      first_name: row.first_name ?? '',
      last_name: row.last_name ?? '',
      role: row.role ?? 'docente',
      is_active: row.is_active ?? true
    };
    profiles.set(profile.id, profile);
  });
  return list;
}

function getAccessibleRows(rows: FeedbackRow[]) {
  if (!currentUser) return [];
  if (currentUser.role === 'admin') return rows;
  return rows.filter((row) => row.created_by === currentUser.id);
}

vi.mock('../../lib/supabase-wrapper', () => {
  const supabaseMock = {
    auth: {
      admin: {
        createUser: vi.fn(async ({ email }: { email: string }) => {
          const id = generateId('user');
          return {
            data: { user: { id, email } },
            error: null
          };
        }),
        deleteUser: vi.fn(async (userId: string) => {
          profiles.delete(userId);
          return { error: null };
        })
      },
      signInWithPassword: vi.fn(async ({ email }: { email: string }) => {
        const profile = Array.from(profiles.values()).find((p) => p.email === email);
        if (!profile) {
          currentUser = null;
          return { data: null, error: { message: 'invalid credentials' } };
        }
        currentUser = { id: profile.id, role: profile.role };
        return {
          data: { user: { id: profile.id, email: profile.email } },
          error: null
        };
      }),
      signOut: vi.fn(async () => {
        currentUser = null;
        return { error: null };
      })
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          insert: async (rows: any) => ({
            data: upsertProfiles(rows),
            error: null
          }),
          delete: () => ({
            eq: async (column: string, value: string) => {
              if (column === 'id') {
                profiles.delete(value);
              }
              return { error: null };
            }
          })
        };
      }

      if (table === 'platform_feedback') {
        return {
          insert: (row: any) => {
            const validationError = validateFeedback(row);
            if (validationError) {
              return { data: null, error: { message: validationError } };
            }

            const createdRow: FeedbackRow = {
              id: generateId('feedback'),
              status: row.status ?? 'new',
              description: row.description,
              type: row.type ?? 'bug',
              created_by: row.created_by,
              page_url: row.page_url,
              user_agent: row.user_agent,
              browser_info: row.browser_info
            };
            feedbackRows.push(createdRow);

            return {
              data: createdRow,
              error: null,
              select: () => ({
                single: async () => ({ data: createdRow, error: null })
              })
            };
          },
          select: () => ({
            eq: async (column: string, value: string) => {
              const filtered = getAccessibleRows(
                feedbackRows.filter((row) => (row as any)[column] === value)
              );
              return { data: filtered, error: null };
            }
          })
        };
      }

      return {
        select: () => ({
          eq: async () => ({ data: [], error: null })
        })
      };
    }
  };

  return { supabase: supabaseMock };
});

// Integration tests for the feedback system (using mocked Supabase)
// TODO: These integration tests require a real Supabase backend (storage buckets,
// notification triggers, row-level security). Skip them in the unit pipeline until
// we have a dedicated environment to run against.
describe.skip('Feedback System Integration', () => {
  let testUserId: string;
  let adminUserId: string;
  let feedbackId: string;

  beforeAll(async () => {
    // Use mock IDs for testing
    testUserId = 'test-user-123';
    adminUserId = 'admin-user-456';
    
    // Mock the auth.admin.createUser responses
    vi.mocked(supabase.auth.admin.createUser)
      .mockResolvedValueOnce({
        data: { user: { id: testUserId, email: 'test-user@example.com' } },
        error: null
      })
      .mockResolvedValueOnce({
        data: { user: { id: adminUserId, email: 'test-admin@example.com' } },
        error: null
      });

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
    // Clean up mocks
    vi.clearAllMocks();
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
