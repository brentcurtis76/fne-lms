/**
 * FNE LMS - Phase 3 Notification Triggers System
 * Centralized service for automated notification generation
 */

import { createClient } from '@supabase/supabase-js';
import { getAccessibleUrl } from '../utils/notificationPermissions';

// Use service role key for bypassing RLS when creating notifications
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  console.error('Available env vars:', Object.keys(process.env).filter(key => key.includes('SUPABASE')));
  console.error('Current NODE_ENV:', process.env.NODE_ENV);
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Please ensure it is set in your .env.local file.');
}

let supabaseServiceRole: any;
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
   * @param {string} eventType - Type of event that occurred
   * @param {Object} eventData - Data related to the event
   * @param {Object} options - Additional options for processing
   */
  async triggerNotification(eventType, eventData, options = {}) {
    try {
      console.log(`🔔 Notification trigger fired: ${eventType}`, eventData);
      
      // Get active triggers for this event type
      const triggers = await this.getActiveTriggers(eventType);
      
      if (!triggers || triggers.length === 0) {
        console.log(`⚠️ No active triggers found for event type: ${eventType}`);
        return { success: false, reason: 'No active triggers' };
      }

      let totalNotificationsCreated = 0;
      
      // Process each trigger
      for (const trigger of triggers) {
        try {
          const notificationCount = await this.processNotification(trigger, eventData, eventType, options);
          totalNotificationsCreated += notificationCount;
        } catch (error) {
          console.error(`❌ Error processing trigger ${trigger.trigger_id}:`, error);
          // Continue with other triggers even if one fails
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
   * @param {string} eventType - The event type to get triggers for
   */
  async getActiveTriggers(eventType) {
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
   * @param {Object} trigger - The trigger configuration
   * @param {Object} eventData - Event data for template substitution
   * @param {string} eventType - The event type
   * @param {Object} options - Processing options
   */
  async processNotification(trigger, eventData, eventType, options = {}) {
    try {
      // Get recipients for this trigger
      const recipients = await this.getRecipients(trigger, eventData, eventType);
      
      if (!recipients || recipients.length === 0) {
        console.log(`⚠️ No recipients found for trigger ${trigger.trigger_id}`);
        return 0;
      }

      // Generate notification content from template
      const content = await this.generateContent(trigger.template, eventData);
      
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
          
          await this.createNotification({
            user_id: recipient.id,
            title: content.title,
            description: content.description,
            category: trigger.category,
            related_url: relatedUrl,
            importance: content.importance || 'normal',
            read_at: null
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
   * @param {Object} trigger - The trigger configuration
   * @param {Object} eventData - Event data containing recipient information
   * @param {string} eventType - The event type
   */
  async getRecipients(trigger, eventData, eventType) {
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
          // All active users - need to query database
          const { data: activeUsers } = await supabaseServiceRole
            .from('profiles')
            .select('id')
            .eq('is_active', true);
          
          if (activeUsers) {
            activeUsers.forEach(user => recipients.push({ id: user.id }));
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
   * Generate notification content from template and event data
   * @param {Object} template - The notification template
   * @param {Object} eventData - Event data for substitution
   */
  async generateContent(template, eventData) {
    try {
      // Template substitution function
      const substitute = (text, data) => {
        if (!text) return '';
        
        return text.replace(/\{([^}]+)\}/g, (match, key) => {
          const value = this.getNestedValue(data, key);
          return value !== undefined ? value : match;
        });
      };

      const content = {
        title: substitute(template.title_template, eventData),
        description: substitute(template.description_template, eventData),
        related_url: substitute(template.url_template, eventData),
        importance: template.importance || 'normal'
      };

      return content;
    } catch (error) {
      console.error('Error generating content:', error);
      return {
        title: 'Notificación',
        description: 'Ha ocurrido un evento en la plataforma',
        related_url: '/dashboard',
        importance: 'normal'
      };
    }
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to search in
   * @param {string} path - Dot notation path (e.g., 'user.name')
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Create a new notification in the database
   * @param {Object} notificationData - Notification data to insert
   */
  async createNotification(notificationData) {
    try {
      console.log('📧 Creating notification:', notificationData);
      
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
        const { data, error } = await supabaseServiceRole
          .from('user_notifications')
          .insert({
            user_id: notificationData.user_id,
            title: notificationData.title,
            description: notificationData.description,
            category: notificationData.category,
            related_url: notificationData.related_url,
            importance: notificationData.importance || 'normal',
            read_at: null,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
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
export default new NotificationService();