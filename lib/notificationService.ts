/**
 * Genera - Notification Triggers System
 * Centralized service for automated notification generation
 *
 * Architecture: Hybrid (Code Defaults + DB Override)
 * - Code provides sensible defaults via notificationEvents registry
 * - Database templates can override when more flexibility is needed
 * - If DB template substitution fails, code defaults are used
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAccessibleUrl } from '../utils/notificationPermissions';
import { getEventConfig, hasEventConfig } from './notificationEvents';

// Type definitions for notification service
interface TriggerOptions {
  skipDuplicateCheck?: boolean;
  forceImmediate?: boolean;
}

interface TriggerResult {
  success: boolean;
  notificationsCreated?: number;
  error?: string;
}

interface NotificationTrigger {
  trigger_id: string;
  template: NotificationTemplate | null;
  category: string;
}

interface NotificationTemplate {
  title_template?: string;
  description_template?: string;
  url_template?: string;
  importance?: 'low' | 'normal' | 'high';
}

interface NotificationContent {
  title: string;
  description: string;
  related_url: string;
  importance: 'low' | 'normal' | 'high';
}

interface Recipient {
  id: string;
}

interface NotificationData {
  user_id: string;
  title: string;
  description: string;
  category: string;
  related_url: string;
  importance: 'low' | 'normal' | 'high';
  read_at: null;
  event_type?: string;
  idempotency_key?: string | null;
}

interface UserPreferences {
  do_not_disturb: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  weekend_quiet: boolean;
  priority_override: boolean;
  notification_settings: Record<string, unknown>;
}

interface SendCheckResult {
  send_in_app: boolean;
  send_email: boolean;
  email_frequency: 'immediate' | 'daily' | 'weekly' | 'never';
}

// Use service role key for bypassing RLS when creating notifications
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  // Don't log env var names in production - potential security info leak
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Please ensure it is set in your .env.local file.');
}

let supabaseServiceRole: SupabaseClient;
try {
  supabaseServiceRole = createClient(supabaseUrl, supabaseServiceKey);
  console.log('✅ Supabase service role client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Supabase service role client:', error);
  throw error;
}

class NotificationService {
  
  /**
   * Main trigger function - Entry point for all notification events
   * @param eventType - Type of event that occurred
   * @param eventData - Data related to the event
   * @param options - Additional options for processing
   */
  async triggerNotification(
    eventType: string,
    eventData: Record<string, unknown>,
    options: TriggerOptions = {}
  ): Promise<TriggerResult> {
    try {
      console.log(`🔔 Notification trigger fired: ${eventType}`, eventData);

      // Get active triggers for this event type from database
      const triggers = await this.getActiveTriggers(eventType);

      let totalNotificationsCreated = 0;

      // If we have database triggers, use them
      if (triggers && triggers.length > 0) {
        for (const trigger of triggers) {
          try {
            const notificationCount = await this.processNotification(trigger, eventData, eventType, options);
            totalNotificationsCreated += notificationCount;
          } catch (error) {
            console.error(`❌ Error processing trigger ${trigger.trigger_id}:`, error);
            // Continue with other triggers even if one fails
          }
        }
      } else {
        // No DB triggers - use code-based defaults from notificationEvents registry
        console.log(`📋 No DB triggers for ${eventType}, using code defaults`);

        // Check if we have a registered event config
        if (!hasEventConfig(eventType)) {
          console.warn(`⚠️ Unknown event type: ${eventType} - no code defaults available`);
        }

        // Create a synthetic trigger using code defaults
        const eventConfig = getEventConfig(eventType);
        const syntheticTrigger = {
          trigger_id: `code-default-${eventType}`,
          template: null, // Will use code defaults
          category: eventConfig.category,
        };

        try {
          const notificationCount = await this.processNotification(syntheticTrigger, eventData, eventType, options);
          totalNotificationsCreated += notificationCount;
        } catch (error) {
          console.error(`❌ Error processing code-based notification for ${eventType}:`, error);
        }
      }

      // Log the event for audit trail
      await this.logNotificationEvent(eventType, eventData, null, totalNotificationsCreated, 'success');

      console.log(`✅ Notification processing complete: ${totalNotificationsCreated} notifications created`);
      return { success: true, notificationsCreated: totalNotificationsCreated };

    } catch (error) {
      console.error(`❌ Notification trigger failed for ${eventType}:`, error);
      await this.logNotificationEvent(eventType, eventData, null, 0, 'failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get active triggers for a specific event type
   * @param eventType - The event type to get triggers for
   */
  async getActiveTriggers(eventType: string): Promise<NotificationTrigger[]> {
    try {
      const { data, error } = await supabaseServiceRole.rpc('get_active_triggers', {
        p_event_type: eventType
      });

      if (error) {
        console.error('Error fetching triggers:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception fetching triggers:', error);
      return [];
    }
  }

  /**
   * Process individual notification trigger
   * @param trigger - The trigger configuration
   * @param eventData - Event data for template substitution
   * @param eventType - The event type
   * @param options - Processing options
   */
  async processNotification(
    trigger: NotificationTrigger,
    eventData: Record<string, unknown>,
    eventType: string,
    options: TriggerOptions = {}
  ): Promise<number> {
    try {
      // Get recipients for this trigger
      const recipients = await this.getRecipients(trigger, eventData, eventType);
      
      if (!recipients || recipients.length === 0) {
        console.log(`⚠️ No recipients found for trigger ${trigger.trigger_id}`);
        return 0;
      }

      // Generate notification content from template (hybrid: DB template with code fallback)
      const content = await this.generateContent(trigger.template, eventData, eventType);
      
      let notificationsCreated = 0;

      // Create notification for each recipient
      for (const recipient of recipients) {
        try {
          // Get recipient's role for URL generation
          const { data: profile } = await supabaseServiceRole
            .from('profiles')
            .select('role')
            .eq('id', recipient.id)
            .single();
          
          const userRole = profile?.role || 'docente';
          
          // Determine appropriate URL based on recipient's role
          const relatedUrl = getAccessibleUrl(
            content.related_url, 
            userRole, 
            eventData
          );
          
          // Generate idempotency key for this notification
          const idempotencyKey = this.generateIdempotencyKey(eventType, eventData, recipient.id);
          
          // Provide fallback URL if the template substitution failed
          let finalRelatedUrl = relatedUrl;
          if (!finalRelatedUrl || finalRelatedUrl.includes('{')) {
            console.warn(`⚠️ Invalid or missing related_url for ${eventType}, generating fallback`);
            switch (eventType) {
              case 'new_feedback':
                finalRelatedUrl = '/admin/feedback';
                break;
              case 'assignment_created':
                finalRelatedUrl = '/assignments';
                break;
              case 'course_assigned':
                finalRelatedUrl = '/mi-aprendizaje';
                break;
              case 'session_edit_request_submitted':
                finalRelatedUrl = '/admin/sessions';
                break;
              case 'session_edit_request_approved':
              case 'session_edit_request_rejected':
              case 'session_reminder_24h':
              case 'session_reminder_1h':
                finalRelatedUrl = '/consultor/sessions';
                break;
              default:
                finalRelatedUrl = '/dashboard';
            }
            console.log(`🔄 Using fallback URL: ${finalRelatedUrl}`);
          }
          
          await this.createNotification({
            user_id: recipient.id,
            title: content.title,
            description: content.description,
            category: trigger.category,
            related_url: finalRelatedUrl,
            importance: content.importance || 'normal',
            read_at: null,
            event_type: eventType,
            idempotency_key: idempotencyKey
          });
          notificationsCreated++;
        } catch (error) {
          console.error(`❌ Failed to create notification for user ${recipient.id}:`, error);
        }
      }

      console.log(`✅ Created ${notificationsCreated} notifications for trigger ${trigger.trigger_id}`);
      return notificationsCreated;

    } catch (error) {
      console.error('Error processing notification:', error);
      throw error;
    }
  }

  /**
   * Determine recipients based on trigger type and event data
   * @param trigger - The trigger configuration
   * @param eventData - Event data containing recipient information
   * @param eventType - The event type
   */
  async getRecipients(
    trigger: NotificationTrigger,
    eventData: Record<string, unknown>,
    eventType: string
  ): Promise<Recipient[]> {
    try {
      const recipients = [];

      switch (eventType) {
        case 'assignment_created':
          // Recipients are assigned users (for student assignments)
          if (eventData.assigned_users && Array.isArray(eventData.assigned_users)) {
            for (const userId of eventData.assigned_users) {
              recipients.push({ id: userId });
            }
          } else if (eventData.student_id) {
            recipients.push({ id: eventData.student_id });
          }
          break;

        case 'course_assigned':
          // Recipients are assigned teachers
          if (eventData.assigned_users && Array.isArray(eventData.assigned_users)) {
            for (const userId of eventData.assigned_users) {
              recipients.push({ id: userId });
            }
          }
          break;

        case 'message_sent':
          // Recipient is the message recipient
          if (eventData.recipient_id) {
            recipients.push({ id: eventData.recipient_id });
          }
          break;

        case 'user_mentioned':
          // Recipient is the mentioned user
          if (eventData.mentioned_user_id) {
            recipients.push({ id: eventData.mentioned_user_id });
          }
          break;

        case 'assignment_feedback':
        case 'assignment_due_soon':
          // Recipient is the student who submitted/was assigned
          if (eventData.student_id) {
            recipients.push({ id: eventData.student_id });
          }
          break;

        case 'course_completed':
        case 'module_completed':
          // Recipient is the student who completed
          if (eventData.student_id) {
            recipients.push({ id: eventData.student_id });
          }
          break;

        case 'consultant_assigned':
          // Recipient is the student getting the consultant
          if (eventData.student_id) {
            recipients.push({ id: eventData.student_id });
          }
          break;

        case 'system_update':
          // All active users - batch process to avoid memory issues
          const BATCH_SIZE = 100;
          let offset = 0;
          let hasMore = true;

          while (hasMore) {
            const { data: userBatch } = await supabaseServiceRole
              .from('profiles')
              .select('id')
              .eq('is_active', true)
              .range(offset, offset + BATCH_SIZE - 1);

            if (userBatch && userBatch.length > 0) {
              userBatch.forEach(user => recipients.push({ id: user.id }));
              hasMore = userBatch.length === BATCH_SIZE;
              offset += BATCH_SIZE;
            } else {
              hasMore = false;
            }
          }
          break;

        case 'new_feedback':
          // Recipients are assigned users (admins)
          if (eventData.assigned_users && Array.isArray(eventData.assigned_users)) {
            for (const userId of eventData.assigned_users) {
              recipients.push({ id: userId });
            }
          }
          break;

        case 'qa_test_failed':
          // Recipients are admin users (passed in admin_user_ids)
          if (eventData.admin_user_ids && Array.isArray(eventData.admin_user_ids)) {
            for (const userId of eventData.admin_user_ids) {
              recipients.push({ id: userId });
            }
          }
          break;

        case 'qa_scenario_assigned':
          // Recipient is the assigned tester
          if (eventData.tester_id) {
            recipients.push({ id: eventData.tester_id as string });
          }
          break;

        case 'session_edit_request_submitted':
          // Recipients: all admin users
          if (eventData.admin_user_ids && Array.isArray(eventData.admin_user_ids)) {
            for (const userId of eventData.admin_user_ids) {
              recipients.push({ id: userId });
            }
          }
          break;

        case 'session_edit_request_approved':
        case 'session_edit_request_rejected':
          // Recipient: the facilitator who submitted the request
          if (eventData.requester_id) {
            recipients.push({ id: eventData.requester_id as string });
          }
          break;

        case 'session_reminder_24h':
        case 'session_reminder_1h':
          // Recipients: all facilitators + attendees (deduplicated)
          {
            const userIdSet = new Set<string>();

            if (eventData.facilitator_ids && Array.isArray(eventData.facilitator_ids)) {
              for (const userId of eventData.facilitator_ids) {
                userIdSet.add(userId);
              }
            }
            if (eventData.attendee_ids && Array.isArray(eventData.attendee_ids)) {
              for (const userId of eventData.attendee_ids) {
                userIdSet.add(userId);
              }
            }

            // Convert set back to recipients array
            for (const userId of userIdSet) {
              recipients.push({ id: userId });
            }
          }
          break;

        default:
          console.warn(`⚠️ Unknown event type for recipient determination: ${eventType}`);
      }

      return recipients;
    } catch (error) {
      console.error('Error determining recipients:', error);
      return [];
    }
  }

  /**
   * Generate notification content using hybrid approach:
   * 1. Try database template first (if exists and valid)
   * 2. Fall back to code-based defaults from notificationEvents registry
   *
   * @param template - The notification template from database (may be null)
   * @param eventData - Event data for substitution
   * @param eventType - The event type for code-based fallback
   */
  async generateContent(
    template: NotificationTemplate | null,
    eventData: Record<string, unknown>,
    eventType: string
  ): Promise<NotificationContent> {
    const eventConfig = getEventConfig(eventType);

    try {
      // Try database template first (if exists and has valid templates)
      if (template?.title_template) {
        const substitutedTitle = this.substituteTemplate(template.title_template, eventData);
        const substitutedDesc = this.substituteTemplate(template.description_template, eventData);
        const substitutedUrl = this.substituteTemplate(template.url_template, eventData);

        // Only use DB template if substitution succeeded (no remaining placeholders)
        if (substitutedTitle && !substitutedTitle.includes('{')) {
          console.log(`✅ Using DB template for ${eventType}`);
          return {
            title: substitutedTitle,
            description: substitutedDesc || eventConfig.defaultDescription(eventData),
            related_url: substitutedUrl || eventConfig.defaultUrl,
            importance: template.importance || eventConfig.importance,
          };
        }

        // Log template substitution failure for debugging
        console.warn(`⚠️ DB template substitution failed for ${eventType}, using code defaults`);
      }

      // Fall back to code-based defaults from notificationEvents registry
      console.log(`📋 Using code defaults for ${eventType}`);
      return {
        title: eventConfig.defaultTitle(eventData),
        description: eventConfig.defaultDescription(eventData),
        related_url: eventConfig.defaultUrl,
        importance: eventConfig.importance,
      };

    } catch (error) {
      console.error('Error generating content:', error);
      // Ultimate fallback - should rarely happen
      return {
        title: eventConfig.defaultTitle(eventData),
        description: eventConfig.defaultDescription(eventData),
        related_url: eventConfig.defaultUrl,
        importance: eventConfig.importance,
      };
    }
  }

  /**
   * Substitute placeholders in a template string with event data values
   * @param template - Template string with {placeholder} syntax
   * @param data - Data object for substitution
   * @returns Substituted string, or empty if template is null/undefined
   */
  substituteTemplate(template: string | undefined, data: Record<string, unknown>): string {
    if (!template) return '';

    // Only allow alphanumeric keys with dots and underscores (prevents unusual access patterns)
    return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, (match, key) => {
      const value = this.getNestedValue(data, key);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Get nested value from object using dot notation
   * @param obj - Object to search in
   * @param path - Dot notation path (e.g., 'user.name')
   */
  getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Generate idempotency key for notifications to prevent duplicates
   * @param {string} eventType - The type of event
   * @param {Object} eventData - Event data containing unique identifiers
   * @param {string} userId - The recipient user ID
   */
  generateIdempotencyKey(eventType, eventData, userId) {
    // Extract a unique identifier from the event data
    let eventId = '';
    
    // Map event types to their unique identifiers
    switch (eventType) {
      case 'new_feedback':
        eventId = eventData.feedback_id || '';
        break;
      case 'assignment_created':
        eventId = eventData.assignment_id || '';
        break;
      case 'course_assigned':
        eventId = eventData.course_id || '';
        break;
      case 'message_sent':
        eventId = eventData.message_id || '';
        break;
      case 'user_mentioned':
        eventId = `${eventData.workspace_id}-${eventData.mentioned_user_id}`;
        break;
      case 'assignment_feedback':
        eventId = eventData.submission_id || '';
        break;
      case 'course_completed':
        eventId = `${eventData.course_id}-${eventData.student_id}`;
        break;
      case 'module_completed':
        eventId = `${eventData.module_id}-${eventData.student_id}`;
        break;
      default:
        // For unknown event types, create a hash of the event data
        eventId = this.hashObject(eventData);
    }
    
    // Generate key with minute-level timestamp to allow re-notification after time
    const timestamp = new Date();
    const minuteTimestamp = new Date(timestamp.getFullYear(), timestamp.getMonth(), 
      timestamp.getDate(), timestamp.getHours(), timestamp.getMinutes()).toISOString();
    
    // Create a consistent key format
    const keyString = `${eventType}-${eventId}-${userId}-${minuteTimestamp}`;
    
    // Return a hash for consistent length and format
    return this.simpleHash(keyString);
  }

  /**
   * Simple hash function for generating consistent strings
   * @param {string} str - String to hash
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Hash an object to create a unique identifier
   * @param {Object} obj - Object to hash
   */
  hashObject(obj) {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return this.simpleHash(str);
  }

  /**
   * Create a new notification in the database
   * @param {Object} notificationData - Notification data to insert
   */
  async createNotification(notificationData) {
    try {
      console.log('📧 Creating notification:', notificationData.title);
      
      // First check user preferences
      const userPrefs = await this.getUserPreferences(notificationData.user_id);
      const notificationType = notificationData.event_type || notificationData.category;
      
      // Check if notification should be sent
      const shouldSend = await this.shouldSendNotification(
        notificationData.user_id,
        notificationType,
        notificationData.importance || 'normal',
        userPrefs
      );

      if (!shouldSend.send_in_app && !shouldSend.send_email) {
        console.log(`🔕 User ${notificationData.user_id} has disabled ${notificationType} notifications`);
        return null;
      }

      // Check quiet hours
      if (await this.isQuietHours(notificationData.user_id, userPrefs)) {
        const priority = notificationData.importance || 'normal';
        if (!userPrefs.priority_override || priority !== 'high') {
          console.log(`🌙 Notification delayed due to quiet hours for user ${notificationData.user_id}`);
          // Queue for later delivery
          await this.queueForLater(notificationData);
          return null;
        }
      }

      // Create in-app notification if enabled
      let createdNotification = null;
      if (shouldSend.send_in_app) {
        // Check for recent duplicates before creating
        const isDuplicate = await this.checkForDuplicate(
          notificationData.user_id,
          notificationData.title,
          notificationData.description
        );
        
        if (isDuplicate) {
          console.log(`🔕 Duplicate notification prevented for user ${notificationData.user_id}: ${notificationData.title}`);
          return null;
        }
        
        const insertData = {
          user_id: notificationData.user_id,
          title: notificationData.title,
          description: notificationData.description,
          category: notificationData.category,
          related_url: notificationData.related_url,
          importance: notificationData.importance || 'normal',
          read_at: null,
          created_at: new Date().toISOString(),
          idempotency_key: notificationData.idempotency_key || null
        };
        
        // Insert notification to database
        const { data, error } = await supabaseServiceRole
          .from('user_notifications')
          .insert(insertData)
          .select()
          .single();

        if (error) {
          // Check if it's a unique constraint violation on idempotency_key
          if (error.code === '23505' && error.message.includes('unique_notification_idempotency_key')) {
            console.log(`🔕 Duplicate notification prevented by idempotency key for user ${notificationData.user_id}`);
            return null;
          }
          console.error('Database error creating notification:', error);
          throw error;
        }
        
        createdNotification = data;
      }

      // Handle email notifications based on frequency
      if (shouldSend.send_email && createdNotification) {
        await this.handleEmailNotification(
          notificationData,
          createdNotification.id,
          shouldSend.email_frequency
        );
      }

      return createdNotification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Check if a similar notification was recently created
   * @param {string} userId - User ID to check
   * @param {string} title - Notification title
   * @param {string} description - Notification description
   * @param {number} timeWindowSeconds - Time window to check (default 60 seconds)
   */
  async checkForDuplicate(userId, title, description, timeWindowSeconds = 60) {
    try {
      const cutoffTime = new Date(Date.now() - (timeWindowSeconds * 1000)).toISOString();
      
      const { data, error } = await supabaseServiceRole
        .from('user_notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('title', title)
        .gte('created_at', cutoffTime)
        .limit(1);
      
      if (error) {
        console.error('Error checking for duplicate notifications:', error);
        return false; // Don't prevent notification on error
      }
      
      // If description is provided, also check if it matches
      if (data && data.length > 0 && description) {
        const { data: exactMatch } = await supabaseServiceRole
          .from('user_notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('title', title)
          .eq('description', description)
          .gte('created_at', cutoffTime)
          .limit(1);
        
        return exactMatch && exactMatch.length > 0;
      }
      
      return data && data.length > 0;
    } catch (error) {
      console.error('Exception checking for duplicate notifications:', error);
      return false; // Don't prevent notification on error
    }
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId) {
    try {
      const { data, error } = await supabaseServiceRole
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        // Return defaults
        return {
          do_not_disturb: false,
          quiet_hours_start: '22:00',
          quiet_hours_end: '07:00',
          weekend_quiet: false,
          priority_override: true,
          notification_settings: {}
        };
      }

      return data;
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return {};
    }
  }

  /**
   * Check if notification should be sent based on preferences
   */
  async shouldSendNotification(userId, notificationType, priority, preferences) {
    try {
      // Use Supabase function to check
      const { data, error } = await supabaseServiceRole.rpc('should_send_notification', {
        p_user_id: userId,
        p_notification_type: notificationType,
        p_priority: priority
      });

      if (error || !data || data.length === 0) {
        // Default to sending if function fails
        return {
          send_in_app: true,
          send_email: true,
          email_frequency: 'immediate'
        };
      }

      return data[0];
    } catch (error) {
      console.error('Error checking notification preferences:', error);
      return {
        send_in_app: true,
        send_email: true,
        email_frequency: 'immediate'
      };
    }
  }

  /**
   * Check if user is in quiet hours
   */
  async isQuietHours(userId, preferences) {
    if (preferences.do_not_disturb) {
      return true;
    }

    try {
      const { data, error } = await supabaseServiceRole.rpc('is_quiet_hours', {
        p_user_id: userId
      });

      return data === true;
    } catch (error) {
      console.error('Error checking quiet hours:', error);
      return false;
    }
  }

  /**
   * Queue notification for later delivery
   */
  async queueForLater(notificationData) {
    try {
      // Calculate next delivery time (after quiet hours)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(7, 0, 0, 0); // Default to 7 AM next day

      await supabaseServiceRole
        .from('delayed_notifications')
        .insert({
          ...notificationData,
          scheduled_for: tomorrow.toISOString(),
          reason: 'quiet_hours'
        });
    } catch (error) {
      console.error('Error queuing notification:', error);
    }
  }

  /**
   * Handle email notification based on frequency preference
   */
  async handleEmailNotification(notificationData, notificationId, frequency) {
    try {
      switch (frequency) {
        case 'immediate':
          // TODO: Send email immediately
          console.log(`📧 Would send immediate email for: ${notificationData.title}`);
          break;
          
        case 'daily':
        case 'weekly':
          // Add to digest queue
          await supabaseServiceRole.rpc('add_to_digest_queue', {
            p_user_id: notificationData.user_id,
            p_notification_id: notificationId,
            p_digest_type: frequency
          });
          console.log(`📋 Added to ${frequency} digest for user ${notificationData.user_id}`);
          break;
          
        case 'never':
          // Do nothing
          break;
      }
    } catch (error) {
      console.error('Error handling email notification:', error);
    }
  }

  /**
   * Log notification event for audit trail
   * @param {string} eventType - The event type
   * @param {Object} eventData - Event data
   * @param {string} triggerId - Trigger ID (optional)
   * @param {number} notificationCount - Number of notifications created
   * @param {string} status - Processing status
   */
  async logNotificationEvent(eventType, eventData, triggerId, notificationCount, status) {
    try {
      const { error } = await supabaseServiceRole.rpc('log_notification_event', {
        p_event_type: eventType,
        p_event_data: eventData,
        p_trigger_id: triggerId,
        p_notifications_count: notificationCount,
        p_status: status
      });

      if (error) {
        console.error('Error logging notification event:', error);
      }
    } catch (error) {
      console.error('Exception logging notification event:', error);
    }
  }

  /**
   * Batch process multiple events (useful for cron jobs)
   * @param {Array} events - Array of events to process
   */
  async batchProcessEvents(events) {
    const results = [];
    
    for (const event of events) {
      try {
        const result = await this.triggerNotification(event.type, event.data, event.options);
        results.push({ ...event, result });
      } catch (error) {
        results.push({ ...event, result: { success: false, error: error.message } });
      }
    }

    return results;
  }

  /**
   * Get due assignments for reminder notifications
   * @param {number} hoursAhead - How many hours ahead to check
   */
  async getDueAssignments(hoursAhead = 24) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() + hoursAhead);

      const { data: assignments, error } = await supabaseServiceRole
        .from('lesson_assignments')
        .select(`
          id,
          title,
          due_date,
          course_id,
          student_id,
          due_reminder_sent,
          courses (name)
        `)
        .lte('due_date', cutoffTime.toISOString())
        .eq('due_reminder_sent', false)
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching due assignments:', error);
        return [];
      }

      return assignments || [];
    } catch (error) {
      console.error('Exception fetching due assignments:', error);
      return [];
    }
  }

  /**
   * Mark assignment reminder as sent to prevent duplicates
   * @param {string} assignmentId - Assignment ID
   */
  async markReminderSent(assignmentId) {
    try {
      const { error } = await supabaseServiceRole
        .from('lesson_assignments')
        .update({ due_reminder_sent: true })
        .eq('id', assignmentId);

      if (error) {
        console.error('Error marking reminder as sent:', error);
      }
    } catch (error) {
      console.error('Exception marking reminder as sent:', error);
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService();
export default notificationService;