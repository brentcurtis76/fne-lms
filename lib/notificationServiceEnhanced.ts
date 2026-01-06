/**
 * Genera - Phase 4 Enhanced Notification Service
 * Includes user preferences, quiet hours, smart filtering, and email digest support
 */

import { createClient } from '@supabase/supabase-js';

// Use service role key for bypassing RLS when creating notifications
const supabaseServiceRole = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface NotificationData {
  user_id: string;
  title: string;
  description: string;
  category: string;
  related_url?: string;
  importance: 'low' | 'normal' | 'high';
  event_type?: string;
  metadata?: any;
}

interface UserPreferences {
  notification_settings: Record<string, {
    in_app_enabled: boolean;
    email_enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly' | 'never';
    priority: 'high' | 'medium' | 'low';
  }>;
  quiet_hours_start: string;
  quiet_hours_end: string;
  weekend_quiet: boolean;
  priority_override: boolean;
  auto_group: boolean;
  max_per_hour: number;
  do_not_disturb: boolean;
  mobile_optimization: boolean;
}

class EnhancedNotificationService {
  private notificationRateLimits: Map<string, { timestamps: number[] }> = new Map();

  /**
   * Enhanced notification creation with preference checking
   */
  async createNotification(notificationData: NotificationData): Promise<boolean> {
    try {
      // Get user preferences
      const preferences = await this.getUserPreferences(notificationData.user_id);
      
      // Check if user wants this notification type
      const shouldSend = await this.shouldSendNotification(
        notificationData.user_id,
        notificationData.event_type || notificationData.category,
        notificationData.importance,
        preferences
      );

      if (!shouldSend.sendInApp && !shouldSend.sendEmail) {
        console.log(`🔕 User ${notificationData.user_id} has disabled notifications for ${notificationData.event_type}`);
        return false;
      }

      // Check quiet hours
      if (await this.isInQuietHours(preferences) && !this.shouldOverrideQuietHours(notificationData.importance, preferences)) {
        console.log(`🌙 Notification delayed due to quiet hours for user ${notificationData.user_id}`);
        await this.queueForLater(notificationData, preferences);
        return false;
      }

      // Check rate limits
      if (!this.checkRateLimit(notificationData.user_id, preferences.max_per_hour)) {
        console.log(`⏰ Rate limit exceeded for user ${notificationData.user_id}`);
        return false;
      }

      // Create in-app notification if enabled
      if (shouldSend.sendInApp) {
        await this.createInAppNotification(notificationData);
      }

      // Handle email based on frequency preference
      if (shouldSend.sendEmail) {
        await this.handleEmailNotification(
          notificationData,
          shouldSend.emailFrequency,
          preferences
        );
      }

      return true;
    } catch (error) {
      console.error('Error in enhanced notification creation:', error);
      return false;
    }
  }

  /**
   * Get user preferences with fallback to defaults
   */
  private async getUserPreferences(userId: string): Promise<UserPreferences> {
    try {
      const { data, error } = await supabaseServiceRole
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        // Return defaults if no preferences found
        return this.getDefaultPreferences();
      }

      return data as UserPreferences;
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return this.getDefaultPreferences();
    }
  }

  /**
   * Default preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      notification_settings: {},
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
      weekend_quiet: false,
      priority_override: true,
      auto_group: true,
      max_per_hour: 5,
      do_not_disturb: false,
      mobile_optimization: false
    };
  }

  /**
   * Check if notification should be sent based on preferences
   */
  private async shouldSendNotification(
    userId: string,
    notificationType: string,
    priority: string,
    preferences: UserPreferences
  ): Promise<{ sendInApp: boolean; sendEmail: boolean; emailFrequency: string }> {
    // Check do not disturb
    if (preferences.do_not_disturb) {
      return { sendInApp: false, sendEmail: false, emailFrequency: 'never' };
    }

    // Get notification-specific settings
    const settings = preferences.notification_settings[notificationType];
    
    if (!settings) {
      // Default behavior if no specific settings
      return {
        sendInApp: true,
        sendEmail: priority === 'high',
        emailFrequency: 'immediate'
      };
    }

    return {
      sendInApp: settings.in_app_enabled,
      sendEmail: settings.email_enabled,
      emailFrequency: settings.frequency
    };
  }

  /**
   * Check if current time is within quiet hours
   */
  private async isInQuietHours(preferences: UserPreferences): Promise<boolean> {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Check weekend quiet
    if (preferences.weekend_quiet && (currentDay === 0 || currentDay === 6)) {
      return true;
    }

    // Check quiet hours
    const start = preferences.quiet_hours_start;
    const end = preferences.quiet_hours_end;

    if (start > end) {
      // Overnight period (e.g., 22:00 to 07:00)
      return currentTime >= start || currentTime <= end;
    } else {
      // Same day period
      return currentTime >= start && currentTime <= end;
    }
  }

  /**
   * Check if notification should override quiet hours
   */
  private shouldOverrideQuietHours(importance: string, preferences: UserPreferences): boolean {
    return preferences.priority_override && importance === 'high';
  }

  /**
   * Queue notification for later delivery
   */
  private async queueForLater(notificationData: NotificationData, preferences: UserPreferences): Promise<void> {
    // Calculate next available time (after quiet hours end)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [hours, minutes] = preferences.quiet_hours_end.split(':');
    tomorrow.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    // Store in delayed notifications table
    await supabaseServiceRole
      .from('delayed_notifications')
      .insert({
        ...notificationData,
        scheduled_for: tomorrow.toISOString(),
        reason: 'quiet_hours'
      });
  }

  /**
   * Check rate limit for user
   */
  private checkRateLimit(userId: string, maxPerHour: number): boolean {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    if (!this.notificationRateLimits.has(userId)) {
      this.notificationRateLimits.set(userId, { timestamps: [] });
    }

    const userLimits = this.notificationRateLimits.get(userId)!;
    
    // Clean old timestamps
    userLimits.timestamps = userLimits.timestamps.filter(ts => ts > oneHourAgo);

    // Check if limit exceeded
    if (userLimits.timestamps.length >= maxPerHour) {
      return false;
    }

    // Add current timestamp
    userLimits.timestamps.push(now);
    return true;
  }

  /**
   * Create in-app notification
   */
  private async createInAppNotification(notificationData: NotificationData): Promise<void> {
    await supabaseServiceRole
      .from('user_notifications')
      .insert({
        ...notificationData,
        created_at: new Date().toISOString()
      });
  }

  /**
   * Handle email notification based on frequency preference
   */
  private async handleEmailNotification(
    notificationData: NotificationData,
    frequency: string,
    preferences: UserPreferences
  ): Promise<void> {
    switch (frequency) {
      case 'immediate':
        // Send email immediately
        await this.sendEmailNow(notificationData);
        break;
      
      case 'daily':
        // Add to daily digest queue
        await this.addToDigestQueue(notificationData.user_id, notificationData, 'daily');
        break;
      
      case 'weekly':
        // Add to weekly digest queue
        await this.addToDigestQueue(notificationData.user_id, notificationData, 'weekly');
        break;
      
      case 'never':
        // Do nothing
        break;
    }
  }

  /**
   * Send email immediately
   */
  private async sendEmailNow(notificationData: NotificationData): Promise<void> {
    // This would integrate with your email service
    console.log(`📧 Sending immediate email for notification:`, notificationData.title);
    
    // TODO: Implement actual email sending
    // For now, we'll just log it
  }

  /**
   * Add notification to digest queue
   */
  private async addToDigestQueue(
    userId: string,
    notificationData: NotificationData,
    digestType: 'daily' | 'weekly'
  ): Promise<void> {
    // Create the notification first
    const { data: notification } = await supabaseServiceRole
      .from('user_notifications')
      .insert(notificationData)
      .select()
      .single();

    if (!notification) return;

    // Calculate scheduled time
    let scheduledFor: Date;
    const now = new Date();
    
    if (digestType === 'daily') {
      // Next day at 9 AM
      scheduledFor = new Date(now);
      scheduledFor.setDate(scheduledFor.getDate() + 1);
      scheduledFor.setHours(9, 0, 0, 0);
    } else {
      // Next Monday at 9 AM
      scheduledFor = new Date(now);
      const daysUntilMonday = (8 - scheduledFor.getDay()) % 7 || 7;
      scheduledFor.setDate(scheduledFor.getDate() + daysUntilMonday);
      scheduledFor.setHours(9, 0, 0, 0);
    }

    // Add to digest queue
    await supabaseServiceRole.rpc('add_to_digest_queue', {
      p_user_id: userId,
      p_notification_id: notification.id,
      p_digest_type: digestType
    });
  }

  /**
   * Process notification with smart grouping
   */
  async processWithGrouping(
    notifications: NotificationData[],
    userId: string,
    preferences: UserPreferences
  ): Promise<void> {
    if (!preferences.auto_group) {
      // Process individually if grouping is disabled
      for (const notification of notifications) {
        await this.createNotification(notification);
      }
      return;
    }

    // Group by category and type
    const grouped = notifications.reduce((acc, notif) => {
      const key = `${notif.category}-${notif.event_type}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(notif);
      return acc;
    }, {} as Record<string, NotificationData[]>);

    // Create grouped notifications
    for (const [key, group] of Object.entries(grouped)) {
      if (group.length === 1) {
        await this.createNotification(group[0]);
      } else {
        // Create a summary notification
        const summaryNotification: NotificationData = {
          user_id: userId,
          title: `${group.length} ${group[0].category} nuevas`,
          description: `Tienes ${group.length} notificaciones nuevas de tipo ${group[0].category}`,
          category: group[0].category,
          importance: 'normal',
          metadata: {
            grouped_count: group.length,
            notification_ids: group.map(n => n.event_type)
          }
        };
        
        await this.createNotification(summaryNotification);
      }
    }
  }
}

// Export singleton instance
export const enhancedNotificationService = new EnhancedNotificationService();