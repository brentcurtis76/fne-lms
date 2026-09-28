/**
 * Genera - Notification Triggers System
 * Centralized service for automated notification generation
 *
 * Architecture: Hybrid (Code Defaults + DB Override)
 * - Code provides sensible defaults via notificationEvents registry
 * - Database templates can override when more flexibility is needed
 * - If DB template substitution fails, code defaults are used
 */

import { createHash, randomUUID } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAccessibleUrl } from '../utils/notificationPermissions';
import { getHighestRole, getUserRoles } from '../utils/roleUtils';
import { getEventConfig, hasEventConfig } from './notificationEvents';
import {
  buildRecordUrl,
  DEFAULT_NOTIFICATION_URL,
  getCatalogEntry,
  getFallbackUrl,
  isOpenToRole,
  NOTIFICATION_CATALOG,
  isSafeNotificationPath,
  isSessionRecordOpenTo,
  type SessionRecord,
} from './notifications/catalog';
import { resolveEmailPreference } from './notifications/resolve-preference';
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
  notification_type_id?: string | null;
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

/** The catalog event the meeting-summary email is governed by. */
const MEETING_SUMMARY_EVENT = 'meeting_finalized';

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve recipients for a community-meeting finalize/update email.
 *
 * - `opts.onlyAttended = false` (default): every active member of the meeting's
 *   growth community (all role types).
 * - `opts.onlyAttended = true`: only users with `meeting_attendees.attendance_status = 'attended'`.
 *
 * Dedupes by user id. Keeps only users the `meeting_finalized` email
 * precedence sends to: a non-default `community` category mode decides, then
 * any legacy preference row with `email_enabled = false` suppresses, then the
 * catalog default. If either preference read fails, nobody is returned.
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

  let preferenceReads;
  try {
    preferenceReads = await Promise.all([
      supabase
        .from('user_notification_preferences')
        .select('user_id, email_enabled')
        .in('user_id', userIds),
      supabase
        .from('user_notification_category_prefs')
        .select('user_id, email_mode')
        .eq('category', NOTIFICATION_CATALOG[MEETING_SUMMARY_EVENT].category)
        .in('user_id', userIds),
    ]);
  } catch {
    preferenceReads = null;
  }

  if (!preferenceReads || preferenceReads[0].error || preferenceReads[1].error) {
    console.error('Meeting summary email suppressed', { status: 'preference_unavailable' });
    return [];
  }
  const [{ data: prefs }, { data: categoryPrefs }] = preferenceReads;

  // Any false legacy row suppresses the meeting summary (its pre-N1-03 rule).
  const legacyOptedOut = new Set(
    (prefs || [])
      .filter((p: any) => p.email_enabled === false)
      .map((p: any) => p.user_id as string)
  );
  const categoryModes = new Map(
    (categoryPrefs || []).map((p: any) => [p.user_id as string, p.email_mode])
  );

  const recipients: Array<{ id: string; email: string; name: string }> = [];
  for (const p of profiles || []) {
    if (!p.email) continue;
    const decision = resolveEmailPreference({
      eventType: MEETING_SUMMARY_EVENT,
      categoryMode: categoryModes.get(p.id) ?? null,
      legacySuppressed: legacyOptedOut.has(p.id),
    });
    // Compat mode until the outbox: a digest choice is sent immediately.
    if (decision.mode === 'off') continue;
    const name = profileName(p as any, p.email as string);
    recipients.push({ id: p.id as string, email: p.email as string, name });
  }
  return recipients;
}

/**
 * `NOTIFICATION_EMAIL_ENABLED` set to `off`, `false` or `0`; unset or anything
 * else keeps the immediate email on.
 */
function isEmailKillSwitchOff(): boolean {
  const flag = process.env.NOTIFICATION_EMAIL_ENABLED?.trim().toLowerCase();
  return flag === 'off' || flag === 'false' || flag === '0';
}

/**
 * Log-safe context for a caught error: only a SQLSTATE or PostgREST code
 * survives. A message, details or hint can carry a credential or a recipient
 * id, so none of them is logged.
 */
function loggableError(error: unknown): { code?: string } {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? { code } : {};
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** The occurrence prefix `resolveOccurrence` gives a payload the catalog identifies. */
const IDENTIFIED_OCCURRENCE = 'record:';

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
    const occurrence = this.resolveOccurrence(eventType, eventData);
    try {
      // eventData carries recipient ids (e.g. `assigned_users`), so it is not logged.
      console.log(`🔔 Notification trigger fired: ${eventType}`);

      // Get active triggers for this event type from database
      const triggers = await this.getActiveTriggers(eventType);

      let totalNotificationsCreated = 0;

      // If we have database triggers, use them
      if (triggers && triggers.length > 0) {
        for (const trigger of triggers) {
          try {
            const notificationCount = await this.processNotification(trigger, eventData, eventType, options, occurrence);
            totalNotificationsCreated += notificationCount;
          } catch (error) {
            console.error(`❌ Error processing trigger ${trigger.trigger_id}`, loggableError(error));
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
          const notificationCount = await this.processNotification(syntheticTrigger, eventData, eventType, options, occurrence);
          totalNotificationsCreated += notificationCount;
        } catch (error) {
          console.error(`❌ Error processing code-based notification for ${eventType}`, loggableError(error));
        }
      }

      // Log the event for audit trail
      await this.logNotificationEvent(eventType, occurrence, null, totalNotificationsCreated, 'success');

      console.log(`✅ Notification processing complete: ${totalNotificationsCreated} notifications created`);
      return { success: true, notificationsCreated: totalNotificationsCreated };

    } catch (error) {
      console.error(`❌ Notification trigger failed for ${eventType}`, loggableError(error));
      await this.logNotificationEvent(eventType, occurrence, null, 0, 'failed');
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
        console.error('Error fetching triggers', loggableError(error));
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception fetching triggers', loggableError(error));
      return [];
    }
  }

  /**
   * Process individual notification trigger
   * @param trigger - The trigger configuration
   * @param eventData - Event data for template substitution
   * @param eventType - The event type
   * @param options - Processing options
   * @param occurrence - The trigger call's occurrence (`resolveOccurrence`)
   */
  async processNotification(
    trigger: NotificationTrigger,
    eventData: Record<string, unknown>,
    eventType: string,
    options: TriggerOptions = {},
    occurrence: string = this.resolveOccurrence(eventType, eventData)
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

      // A mapped event is stored under its catalog category; an unknown one keeps its trigger's.
      const category = getCatalogEntry(eventType)?.category ?? trigger.category;
      const notificationTypeId = await this.getNotificationTypeId(eventType);

      // A session record page re-checks `canViewSession` for its viewer, so the
      // session is read once here and each recipient's link is decided against it.
      const sessionRecord = await this.getSessionRecord(eventData);
      
      let notificationsCreated = 0;

      // Create notification for each recipient
      for (const recipient of recipients) {
        try {
          // Recipient's active roles, for URL generation (profiles has no role column)
          const userRoles = await getUserRoles(supabaseServiceRole, recipient.id);
          const highestRole = getHighestRole(userRoles);
          const userRole = highestRole || 'docente';
          
          // The catalog's record path wins when the payload identifies the record;
          // otherwise the template/default URL. Either is checked against the
          // recipient's role and, for a session record, against the page's own
          // access rule; anything else becomes the event's fallback page.
          const relatedUrl = getAccessibleUrl(
            buildRecordUrl(eventType, eventData, userRole) ?? content.related_url,
            userRole,
            eventData
          );
          
          const idempotencyKey = this.generateIdempotencyKey(eventType, occurrence, recipient.id);
          
          const finalRelatedUrl =
            isSafeNotificationPath(relatedUrl) &&
            isOpenToRole(relatedUrl, userRole) &&
            isSessionRecordOpenTo(relatedUrl, { userId: recipient.id, userRoles, highestRole }, sessionRecord)
              ? relatedUrl
              : getAccessibleUrl(getFallbackUrl(eventType, userRole), userRole) ?? DEFAULT_NOTIFICATION_URL;
          
          await this.createNotification({
            user_id: recipient.id,
            title: content.title,
            description: content.description,
            category,
            related_url: finalRelatedUrl,
            importance: content.importance || 'normal',
            read_at: null,
            event_type: eventType,
            idempotency_key: idempotencyKey,
            notification_type_id: notificationTypeId
          });
          notificationsCreated++;
        } catch (error) {
          // The error can carry the recipient id (e.g. a foreign-key violation's
          // details), so neither it nor the id is logged.
          console.error(`❌ Failed to create notification for trigger ${trigger.trigger_id}`);
        }
      }

      console.log(`✅ Created ${notificationsCreated} notifications for trigger ${trigger.trigger_id}`);
      return notificationsCreated;

    } catch (error) {
      console.error('Error processing notification', loggableError(error));
      throw error;
    }
  }

  /**
   * The `notification_types` row named after this event, or null when there is
   * none or the read fails: the column is a nullable foreign key and the types
   * are not seeded, so a missing type never costs the notification.
   * @param eventType - The event type
   */
  async getNotificationTypeId(eventType: string): Promise<string | null> {
    try {
      const { data, error } = await supabaseServiceRole
        .from('notification_types')
        .select('id')
        .eq('id', eventType)
        .maybeSingle();
      if (error) {
        console.error('Notification type lookup failed', loggableError(error));
        return null;
      }
      return typeof data?.id === 'string' ? data.id : null;
    } catch (error) {
      console.error('Notification type lookup failed', loggableError(error));
      return null;
    }
  }

  /**
   * Determine recipients based on trigger type and event data
   * @param trigger - The trigger configuration
   * @param eventData - Event data containing recipient information
   * @param eventType - The event type
   */
  /**
   * The session a payload's `session.id` names, as the session record pages
   * read it for their access rule; null when the id is not a UUID or the read
   * fails, which denies every session record link for this event.
   */
  async getSessionRecord(eventData: Record<string, unknown>): Promise<SessionRecord | null> {
    const id = (eventData?.session as Record<string, unknown> | undefined)?.id;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    try {
      const { data, error } = await supabaseServiceRole
        .from('consultor_sessions')
        .select('id, school_id, growth_community_id, status, is_active')
        .eq('id', id)
        .maybeSingle();
      return error || !data ? null : (data as SessionRecord);
    } catch {
      return null;
    }
  }

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

        case 'meeting_finalized': {
          // Exactly the finalize route's resolved recipients: valid, distinct user
          // ids only. Nothing is inferred from the title or the audience.
          const seen = new Set<string>();
          for (const userId of Array.isArray(eventData.recipient_ids) ? eventData.recipient_ids : []) {
            if (typeof userId !== 'string' || !USER_ID.test(userId)) continue;
            const id = userId.toLowerCase();
            if (!seen.has(id)) {
              seen.add(id);
              recipients.push({ id });
            }
          }
          break;
        }

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
            related_url: substitutedUrl || getFallbackUrl(eventType),
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
        related_url: getFallbackUrl(eventType),
        importance: eventConfig.importance,
      };

    } catch (error) {
      console.error('Error generating content', loggableError(error));
      // Ultimate fallback - should rarely happen
      return {
        title: eventConfig.defaultTitle(eventData),
        description: eventConfig.defaultDescription(eventData),
        related_url: getFallbackUrl(eventType),
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
   * The occurrence a trigger call notifies about (plan D3, N2-01): the
   * catalog's record identity when the payload carries a valid one. Otherwise
   * a fresh id for this call, so an unidentified call is never merged with
   * another one (two genuine occurrences stay two) and is never claimed to be
   * idempotent: a repeated unidentified call is delivered again.
   * @param eventType - The event type
   * @param eventData - Event payload
   */
  resolveOccurrence(eventType: string, eventData: Record<string, unknown>): string {
    const id = getCatalogEntry(eventType)?.occurrenceId(eventData ?? {}) ?? null;
    return id === null ? `unidentified:${randomUUID()}` : `${IDENTIFIED_OCCURRENCE}${id}`;
  }

  /**
   * The key shared by the in-app row (`unique_notification_idempotency_key`)
   * and the provider request: an opaque SHA-256 of event, occurrence and
   * recipient. It carries no readable id and does not depend on the clock;
   * 70 characters fit the column's 255 and the provider's 256.
   * @param eventType - The event type
   * @param occurrence - The trigger call's occurrence (`resolveOccurrence`)
   * @param userId - The recipient user ID
   */
  generateIdempotencyKey(eventType: string, occurrence: string, userId: string): string {
    return `notif-${sha256Hex(JSON.stringify([eventType, occurrence, userId]))}`;
  }

  /**
   * Create a new notification.
   *
   * The in-app row and the immediate e-mail are two independent channels. The
   * in-app row follows `user_notification_preferences.in_app_enabled`; the mail
   * follows the N1-03 precedence (`resolveEmailChannel`). A recipient who has
   * switched the in-app channel off still gets the mail.
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
      // The title can carry a person's name, so only the event type is logged.
      console.log('📧 Creating notification', { event_type: notificationData.event_type ?? null });

      const notificationType = notificationData.event_type || notificationData.category;
      const preference = await this.getNotificationPreference(
        client,
        notificationData.user_id,
        notificationType
      );

      const emailEnabled = await this.resolveEmailChannel(client, notificationData, preference);

      if (!preference.in_app_enabled && !emailEnabled) {
        console.log(`🔕 Recipient has disabled ${notificationType} notifications`);
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

      if (emailEnabled) {
        await this.sendImmediateEmail(client, notificationData, deps.transport);
      }

      if (inAppError) {
        throw inAppError;
      }

      return createdNotification;
    } catch (error) {
      console.error('Error creating notification');
      throw error;
    }
  }

  /**
   * Whether the immediate email goes out for this recipient.
   *
   * `meeting_finalized` never mails here. The kill switch is checked next,
   * before any preference read. Then the
   * recipient's row for the event's catalog category is read, and
   * `resolveEmailPreference` applies the precedence with SM-15's exact legacy
   * row. This synchronous path runs in compat mode until the outbox cutover: a
   * `digest` result is sent immediately and only `off` suppresses. A failed
   * read suppresses a non-mandatory email and logs only a status.
   *
   * @param {Object} client - Supabase client to read through
   * @param {Object} notificationData - Notification being delivered
   * @param {Object} preference - Result of `getNotificationPreference`
   */
  async resolveEmailChannel(client, notificationData, preference) {
    // Until N5-06 the finalize route's summary is a meeting's only email, so its
    // notification is in-app only whatever the category mode or kill switch.
    if (notificationData.event_type === MEETING_SUMMARY_EVENT) {
      console.log('📭 Notification email NOT sent', { status: 'in_app_only' });
      return false;
    }

    if (isEmailKillSwitchOff()) {
      console.log('📭 Notification email NOT sent', { status: 'disabled' });
      return false;
    }

    const eventType = notificationData.event_type;
    const category = eventType ? getCatalogEntry(eventType)?.category : undefined;
    let categoryMode = null;
    let lookupFailed = preference.lookup_failed === true;

    if (category && !lookupFailed) {
      try {
        const { data, error } = await client
          .from('user_notification_category_prefs')
          .select('email_mode')
          .eq('user_id', notificationData.user_id)
          .eq('category', category)
          .maybeSingle();
        if (error) lookupFailed = true;
        else categoryMode = data?.email_mode ?? null;
      } catch {
        lookupFailed = true;
      }
    }

    const decision = resolveEmailPreference({
      eventType,
      categoryMode,
      legacySuppressed: !preference.email_enabled,
      lookupFailed,
    });

    if (decision.reason === 'preference_unavailable') {
      console.error('Notification email suppressed', { status: 'preference_unavailable' });
    }
    return decision.mode !== 'off';
  }

  /**
   * Insert the in-app row, or return null when this notification is a repeat.
   * @param {Object} client - Supabase client to write through
   * @param {Object} notificationData - Notification data to insert
   */
  async createInAppNotification(client, notificationData) {
    // A keyed row is deduplicated by its occurrence key alone: the title check
    // would merge two genuine occurrences that happen to share a text.
    if (!notificationData.idempotency_key) {
      const isDuplicate = await this.checkForDuplicate(
        client,
        notificationData.user_id,
        notificationData.title,
        notificationData.description
      );

      if (isDuplicate) {
        console.log(`🔕 Duplicate notification prevented: ${notificationData.title}`);
        return null;
      }
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
      idempotency_key: notificationData.idempotency_key || null,
      notification_type_id: notificationData.notification_type_id || null
    };

    const { data, error } = await client
      .from('user_notifications')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      // Check if it's a unique constraint violation on idempotency_key
      if (error.code === '23505' && error.message.includes('unique_notification_idempotency_key')) {
        console.log('🔕 Duplicate notification prevented by idempotency key');
        return null;
      }
      console.error('Database error creating notification');
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
   * `NOTIFICATION_EMAIL_ENABLED` is the kill switch for this path: unset keeps
   * it on (the shipped SM-15 behaviour); `off`, `false` or `0` suppresses every
   * immediate mail before the recipient lookup or the provider is reached. It
   * gates only this channel, never the in-app row.
   *
   * @param {Function} [transport] - Injected e-mail transport (tests only)
   */
  async sendImmediateEmail(client, notificationData, transport) {
    if (isEmailKillSwitchOff()) {
      console.log('📭 Notification email NOT sent', { status: 'disabled' });
      return { sent: false, status: 'disabled' };
    }

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
      // A notification trigger must stay nonfatal for its caller. The message is
      // not logged: it can carry a recipient identifier or a credential.
      console.error('Error sending notification email', { status: 'transport_error' });
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
        console.error('Error checking for duplicate notifications', loggableError(error));
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
      console.error('Exception checking for duplicate notifications', loggableError(error));
      return false; // Don't prevent notification on error
    }
  }

  /**
   * Resolve the recipient's per-type channel preferences.
   *
   * `user_notification_preferences` carries exactly two switches per
   * (user, notification_type): `email_enabled` and `in_app_enabled`. There is
   * no row for most (user, type) pairs, and the absence of one means both
   * channels are on — the same default the columns themselves declare. A
   * failed read keeps both on and sets `lookup_failed`, which suppresses the
   * email (`resolveEmailChannel`) but leaves the in-app row independent.
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

      if (error) {
        console.error('Error fetching notification preferences', loggableError(error));
        return { ...bothEnabled, lookup_failed: true };
      }
      if (!data) {
        return bothEnabled;
      }

      return {
        email_enabled: data.email_enabled !== false,
        in_app_enabled: data.in_app_enabled !== false
      };
    } catch (error) {
      console.error('Error fetching notification preferences', loggableError(error));
      return { ...bothEnabled, lookup_failed: true };
    }
  }

  /**
   * Log notification event for audit trail.
   *
   * The payload is not written: it carries recipient ids, addresses and free
   * text. The audit keeps whether the occurrence was identified and, if so, an
   * opaque reference that is the same on every retry of that occurrence.
   * @param {string} eventType - The event type
   * @param {string} occurrence - The trigger call's occurrence (`resolveOccurrence`)
   * @param {string} triggerId - Trigger ID (optional)
   * @param {number} notificationCount - Number of notifications created
   * @param {string} status - Processing status
   */
  async logNotificationEvent(eventType, occurrence, triggerId, notificationCount, status) {
    const identified = occurrence.startsWith(IDENTIFIED_OCCURRENCE);
    try {
      const { error } = await supabaseServiceRole.rpc('log_notification_event', {
        p_event_type: eventType,
        p_event_data: {
          occurrence: identified ? 'identified' : 'unidentified',
          occurrence_ref: identified ? `occ-${sha256Hex(JSON.stringify([eventType, occurrence]))}` : null,
        },
        p_trigger_id: triggerId,
        p_notifications_count: notificationCount,
        p_status: status
      });

      if (error) {
        console.error('Error logging notification event', loggableError(error));
      }
    } catch (error) {
      console.error('Exception logging notification event', loggableError(error));
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