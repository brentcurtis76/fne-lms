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
import { sendNotificationEmail } from './email/notifications';
import type { EmailTransport } from './email/provider';
import { profileName } from './utils/profile-name';

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

/** Injection seam for the two collaborators `createNotification` reaches out to. */
interface CreateNotificationDeps {
  client?: SupabaseClient;
  transport?: EmailTransport;
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

/**
 * Helper: resolve notification recipients for licitacion events.
 * Queries encargados for the given school. If includeAdmins is true,
 * also includes all admin users. schoolId=0 means admins only.
 */
async function getLicitacionRecipients(
  supabase: SupabaseClient,
  schoolId: number,
  includeAdmins: boolean
): Promise<Array<{ id: string }>> {
  const recipients: Array<{ id: string }> = [];
  const seen = new Set<string>();

  // Fetch school encargados (skip if schoolId=0, meaning admins-only)
  if (schoolId > 0) {
    const { data: encargados } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'encargado_licitacion')
      .eq('school_id', schoolId);

    if (encargados) {
      for (const row of encargados) {
        if (row.user_id && !seen.has(row.user_id)) {
          seen.add(row.user_id);
          recipients.push({ id: row.user_id });
        }
      }
    }
  }

  // Fetch admin users if requested
  if (includeAdmins) {
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'admin');

    if (adminRoles) {
      for (const row of adminRoles) {
        if (row.user_id && !seen.has(row.user_id)) {
          seen.add(row.user_id);
          recipients.push({ id: row.user_id });
        }
      }
    }
  }

  return recipients;
}

/**
 * Resolve recipients for a community-meeting finalize/update email.
 *
 * - `opts.onlyAttended = false` (default): every active member of the meeting's
 *   growth community (all role types).
 * - `opts.onlyAttended = true`: only users with `meeting_attendees.attendance_status = 'attended'`.
 *
 * Dedupes by user id. Filters users whose notification preferences have
 * `email_enabled = false`.
 */
export async function getCommunityRecipients(
  supabase: SupabaseClient,
  meetingId: string,
  opts: { onlyAttended: boolean }
): Promise<Array<{ id: string; email: string; name: string }>> {
  const { data: meeting, error: meetingErr } = await supabase
    .from('community_meetings')
    .select(
      'id, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)'
    )
    .eq('id', meetingId)
    .single();

  if (meetingErr || !meeting) {
    throw new Error('meeting_not_found');
  }

  const workspace = Array.isArray((meeting as any).workspace)
    ? (meeting as any).workspace[0]
    : (meeting as any).workspace;
  const communityId = workspace?.community_id as string | undefined;

  const userIdSet = new Set<string>();

  if (opts.onlyAttended) {
    const { data: attendedRows } = await supabase
      .from('meeting_attendees')
      .select('user_id')
      .eq('meeting_id', meetingId)
      .eq('attendance_status', 'attended');
    for (const row of attendedRows || []) {
      if (row.user_id) userIdSet.add(row.user_id as string);
    }
  } else {
    if (!communityId) return [];
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('community_id', communityId)
      .eq('is_active', true);
    for (const row of roleRows || []) {
      if (row.user_id) userIdSet.add(row.user_id as string);
    }
  }

  if (userIdSet.size === 0) return [];

  const userIds = Array.from(userIdSet);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, name')
    .in('id', userIds);

  // Respect email-enabled preference; when no row exists, default is to send.
  const { data: prefs } = await supabase
    .from('user_notification_preferences')
    .select('user_id, email_enabled')
    .in('user_id', userIds);

  const optedOut = new Set(
    (prefs || [])
      .filter((p: any) => p.email_enabled === false)
      .map((p: any) => p.user_id as string)
  );

  const recipients: Array<{ id: string; email: string; name: string }> = [];
  for (const p of profiles || []) {
    if (!p.email || optedOut.has(p.id)) continue;
    const name = profileName(p as any, p.email as string);
    recipients.push({ id: p.id as string, email: p.email as string, name });
  }
  return recipients;
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
                finalRelatedUrl = '/admin/sessions/approvals';
                break;
              case 'session_edit_request_approved':
              case 'session_edit_request_rejected':
              case 'session_reminder_24h':
              case 'session_reminder_1h':
                finalRelatedUrl = '/consultor/sessions';
                break;
              case 'licitacion_created':
              case 'licitacion_published':
              case 'licitacion_bases_deadline_1d':
              case 'licitacion_bases_deadline':
              case 'licitacion_consultas_deadline_1d':
              case 'licitacion_consultas_deadline':
              case 'licitacion_propuestas_open':
              case 'licitacion_propuestas_deadline_1d':
              case 'licitacion_propuestas_deadline':
              case 'licitacion_evaluacion_start':
              case 'licitacion_evaluacion_deadline_1d':
              case 'licitacion_evaluacion_complete':
              case 'licitacion_adjudicada':
              case 'licitacion_contrato_generado':
                finalRelatedUrl = '/licitaciones';
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

        case 'session_created':
        case 'session_rescheduled':
        case 'session_cancelled':
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

        // ── LICITACION EVENTS ──────────────────────────────────────────────
        case 'licitacion_created':
        case 'licitacion_published':
        case 'licitacion_bases_deadline_1d':
        case 'licitacion_bases_deadline':
        case 'licitacion_consultas_deadline_1d':
        case 'licitacion_consultas_deadline':
        case 'licitacion_propuestas_open':
        case 'licitacion_propuestas_deadline_1d':
        case 'licitacion_propuestas_deadline':
        case 'licitacion_evaluacion_start':
        case 'licitacion_evaluacion_deadline_1d': {
          // Recipients: school encargados only
          const schoolId = typeof eventData.school_id === 'number' ? eventData.school_id : null;
          if (schoolId !== null) {
            const licitacionRecipients = await getLicitacionRecipients(
              supabaseServiceRole,
              schoolId,
              false
            );
            for (const r of licitacionRecipients) {
              recipients.push(r);
            }
          }
          break;
        }

        case 'licitacion_evaluacion_complete':
        case 'licitacion_adjudicada': {
          // Recipients: school encargados + admins
          const schoolId = typeof eventData.school_id === 'number' ? eventData.school_id : null;
          if (schoolId !== null) {
            const licitacionRecipients = await getLicitacionRecipients(
              supabaseServiceRole,
              schoolId,
              true
            );
            for (const r of licitacionRecipients) {
              recipients.push(r);
            }
          }
          break;
        }

        case 'licitacion_contrato_generado': {
          // Recipients: admins only
          const adminRecipients = await getLicitacionRecipients(
            supabaseServiceRole,
            0,
            true
          );
          for (const r of adminRecipients) {
            recipients.push(r);
          }
          break;
        }

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
      // Licitacion deadline reminders use daily granularity to prevent duplicate firings per page load
      case 'licitacion_bases_deadline_1d':
      case 'licitacion_bases_deadline':
      case 'licitacion_consultas_deadline_1d':
      case 'licitacion_consultas_deadline':
      case 'licitacion_propuestas_deadline_1d':
      case 'licitacion_propuestas_deadline':
      case 'licitacion_evaluacion_deadline_1d': {
        const licitId = eventData.licitacion_id || '';
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        return `licitacion_deadline_${licitId}_${eventType}_${today}_${userId}`;
      }
      case 'licitacion_created':
        eventId = (eventData.licitacion_id as string) || '';
        break;
      case 'licitacion_published':
        eventId = `${eventData.licitacion_id || ''}-published`;
        break;
      case 'licitacion_propuestas_open':
        eventId = `${eventData.licitacion_id || ''}-propuestas-open`;
        break;
      case 'licitacion_evaluacion_start':
        eventId = `${eventData.licitacion_id || ''}-evaluacion-start`;
        break;
      case 'licitacion_evaluacion_complete':
        eventId = `${eventData.licitacion_id || ''}-evaluacion-complete`;
        break;
      case 'licitacion_adjudicada':
        eventId = `${eventData.licitacion_id || ''}-adjudicada`;
        break;
      case 'licitacion_contrato_generado':
        eventId = `${eventData.licitacion_id || ''}-contrato`;
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
   * Create a new notification.
   *
   * The in-app row and the immediate e-mail are two independent channels: each
   * one is governed by its own column in `user_notification_preferences`, and
   * a recipient who has switched the in-app channel off still gets the mail.
   * The e-mail therefore does NOT wait on an inserted row — requiring one is
   * what made an email-only preference silently deliver nothing.
   *
   * @param {Object} notificationData - Notification data to insert
   * @param {Object} [deps] - Injection seam for tests: `client` replaces the
   *   service-role Supabase client, `transport` replaces the e-mail provider.
   *   Production passes neither.
   */
  async createNotification(notificationData, deps: CreateNotificationDeps = {}) {
    const client = deps.client || supabaseServiceRole;

    try {
      console.log('📧 Creating notification:', notificationData.title);

      const notificationType = notificationData.event_type || notificationData.category;
      const preference = await this.getNotificationPreference(
        client,
        notificationData.user_id,
        notificationType
      );

      if (!preference.in_app_enabled && !preference.email_enabled) {
        console.log(`🔕 User ${notificationData.user_id} has disabled ${notificationType} notifications`);
        return null;
      }

      // The in-app failure is held rather than thrown so the e-mail channel
      // still runs; it is rethrown below, keeping this method's contract.
      let createdNotification = null;
      let inAppError = null;
      if (preference.in_app_enabled) {
        try {
          createdNotification = await this.createInAppNotification(client, notificationData);
        } catch (error) {
          inAppError = error;
        }
      }

      if (preference.email_enabled) {
        await this.sendImmediateEmail(client, notificationData, deps.transport);
      }

      if (inAppError) {
        throw inAppError;
      }

      return createdNotification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Insert the in-app row, or return null when this notification is a repeat.
   * @param {Object} client - Supabase client to write through
   * @param {Object} notificationData - Notification data to insert
   */
  async createInAppNotification(client, notificationData) {
    const isDuplicate = await this.checkForDuplicate(
      client,
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

    const { data, error } = await client
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

    return data;
  }

  /**
   * Hand this notification to the authorized outbound-email boundary.
   *
   * Never throws and never reports a send it did not get: every outcome other
   * than `provider_accepted` is logged as not sent. The log lines carry the
   * delivery status and nothing that identifies the recipient: a notification
   * recipient may be a student, so neither their address, their domain nor
   * their user id belongs in a log line (Ley 21.719).
   *
   * @param {Object} client - Supabase client used for the recipient lookup and authorization
   * @param {Object} notificationData - Notification data being delivered
   * @param {Function} [transport] - Injected e-mail transport (tests only)
   */
  async sendImmediateEmail(client, notificationData, transport) {
    try {
      const result = await sendNotificationEmail(
        client,
        {
          userId: notificationData.user_id,
          title: notificationData.title,
          description: notificationData.description,
          relatedUrl: notificationData.related_url,
          idempotencyKey: notificationData.idempotency_key
        },
        transport
      );

      if (result.sent) {
        console.log('📧 Notification email accepted by the provider');
      } else {
        console.log('📭 Notification email NOT sent', { status: result.status });
      }

      return result;
    } catch (error) {
      // A notification trigger must stay nonfatal for its caller.
      console.error('Error sending notification email:', error instanceof Error ? error.message : String(error));
      return { sent: false, status: 'transport_error' };
    }
  }

  /**
   * Check if a similar notification was recently created
   * @param {Object} client - Supabase client to read through
   * @param {string} userId - User ID to check
   * @param {string} title - Notification title
   * @param {string} description - Notification description
   * @param {number} timeWindowSeconds - Time window to check (default 60 seconds)
   */
  async checkForDuplicate(client, userId, title, description, timeWindowSeconds = 60) {
    try {
      const cutoffTime = new Date(Date.now() - (timeWindowSeconds * 1000)).toISOString();
      
      const { data, error } = await client
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
        const { data: exactMatch } = await client
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
   * Resolve the recipient's per-type channel preferences.
   *
   * `user_notification_preferences` carries exactly two switches per
   * (user, notification_type): `email_enabled` and `in_app_enabled`. There is
   * no row for most (user, type) pairs, and the absence of one means both
   * channels are on — the same default the columns themselves declare.
   *
   * @param {Object} client - Supabase client to read through
   * @param {string} userId - Recipient user id
   * @param {string} notificationType - Event type, falling back to the category
   */
  async getNotificationPreference(client, userId, notificationType) {
    const bothEnabled = { email_enabled: true, in_app_enabled: true };

    try {
      const { data, error } = await client
        .from('user_notification_preferences')
        .select('email_enabled, in_app_enabled')
        .eq('user_id', userId)
        .eq('notification_type', notificationType)
        .maybeSingle();

      if (error || !data) {
        return bothEnabled;
      }

      return {
        email_enabled: data.email_enabled !== false,
        in_app_enabled: data.in_app_enabled !== false
      };
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
      return bothEnabled;
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