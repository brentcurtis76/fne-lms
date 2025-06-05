/**
 * FNE LMS - Phase 3 Notification Triggers System
 * Centralized service for automated notification generation
 */

import { createClient } from '@supabase/supabase-js';

// Use service role key for bypassing RLS when creating notifications
const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
          await this.createNotification({
            user_id: recipient.id,
            title: content.title,
            description: content.description,
            category: trigger.category,
            related_url: content.related_url,
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
          // Recipients are assigned users
          if (eventData.assigned_users && Array.isArray(eventData.assigned_users)) {
            for (const userId of eventData.assigned_users) {
              recipients.push({ id: userId });
            }
          } else if (eventData.student_id) {
            recipients.push({ id: eventData.student_id });
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
        });

      if (error) {
        console.error('Database error creating notification:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
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
        .from('assignments')
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
        .from('assignments')
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