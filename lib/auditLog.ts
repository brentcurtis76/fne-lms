import { SupabaseClient, createClient } from '@supabase/supabase-js';

export type AuditAction = 'assigned' | 'unassigned';

// Entity types for audit logging
// - 'user': Individual user (entity_id = auth.users.id UUID)
// - 'community_workspace': Workspace/group (entity_id = community_workspaces.id UUID)
//
// EXCLUDED:
// - 'school': schools.id is INTEGER, not UUID - incompatible with entity_id column
// - 'growth_community': Not used for assignments (only for user membership)
export type AuditEntityType = 'user' | 'community_workspace';
export type AuditContentType = 'course' | 'learning_path';
export type AuditSource = 'direct' | 'learning_path';

// Cached service role client for audit logging
// Uses service role to bypass RLS - audit inserts are server-only
let _serviceClient: SupabaseClient | null = null;

function getAuditServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('[auditLog] Missing Supabase environment variables for service role');
  }

  _serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return _serviceClient;
}

interface AuditLogEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  contentType: AuditContentType;
  contentId: string;
  source: AuditSource;
  sourceLearningPathId?: string | null;
  performedBy: string;
  metadata?: Record<string, any>;
}

/**
 * Log an assignment action to the audit log.
 * This is a non-blocking operation - errors are logged but don't fail the parent operation.
 *
 * NOTE: The supabase parameter is ignored. Uses internal service role client for server-only writes.
 * Parameter kept for backward compatibility with existing API call sites.
 */
export async function logAssignmentAudit(
  _supabase: SupabaseClient, // Ignored - uses service role internally
  entry: AuditLogEntry
): Promise<void> {
  try {
    const serviceClient = getAuditServiceClient();
    const { error } = await serviceClient
      .from('assignment_audit_log')
      .insert({
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        content_type: entry.contentType,
        content_id: entry.contentId,
        source: entry.source,
        source_learning_path_id: entry.sourceLearningPathId || null,
        performed_by: entry.performedBy,
        metadata: entry.metadata || {}
      });

    if (error) {
      console.error('[auditLog] Failed to log audit entry:', error);
    }
  } catch (err) {
    console.error('[auditLog] Error logging audit entry:', err);
  }
}

/**
 * Log multiple assignment actions in batch.
 * Useful when assigning/unassigning content to multiple users at once.
 *
 * NOTE: The supabase parameter is ignored. Uses internal service role client for server-only writes.
 * Parameter kept for backward compatibility with existing API call sites.
 */
export async function logBatchAssignmentAudit(
  _supabase: SupabaseClient, // Ignored - uses service role internally
  entries: AuditLogEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  try {
    const serviceClient = getAuditServiceClient();
    const rows = entries.map(entry => ({
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      content_type: entry.contentType,
      content_id: entry.contentId,
      source: entry.source,
      source_learning_path_id: entry.sourceLearningPathId || null,
      performed_by: entry.performedBy,
      metadata: entry.metadata || {}
    }));

    const { error } = await serviceClient
      .from('assignment_audit_log')
      .insert(rows);

    if (error) {
      console.error('[auditLog] Failed to log batch audit entries:', error);
    }
  } catch (err) {
    console.error('[auditLog] Error logging batch audit entries:', err);
  }
}

/**
 * Helper to create audit entries for course assignments
 */
export function createCourseAssignmentAuditEntries(
  action: AuditAction,
  courseId: string,
  userIds: string[],
  performedBy: string,
  batchSize?: number
): AuditLogEntry[] {
  return userIds.map(userId => ({
    action,
    entityType: 'user' as AuditEntityType,
    entityId: userId,
    contentType: 'course' as AuditContentType,
    contentId: courseId,
    source: 'direct' as AuditSource,
    performedBy,
    metadata: batchSize && batchSize > 1 ? { batchSize } : undefined
  }));
}

/**
 * Helper to create audit entries for learning path assignments
 */
export function createLPAssignmentAuditEntries(
  action: AuditAction,
  pathId: string,
  userIds: string[],
  performedBy: string,
  batchSize?: number
): AuditLogEntry[] {
  return userIds.map(userId => ({
    action,
    entityType: 'user' as AuditEntityType,
    entityId: userId,
    contentType: 'learning_path' as AuditContentType,
    contentId: pathId,
    source: 'direct' as AuditSource,
    performedBy,
    metadata: batchSize && batchSize > 1 ? { batchSize } : undefined
  }));
}
