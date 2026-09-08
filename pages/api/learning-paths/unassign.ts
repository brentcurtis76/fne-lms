import { NextApiRequest, NextApiResponse } from 'next';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';
import { logBatchAssignmentAudit, createLPAssignmentAuditEntries } from '../../../lib/auditLog';

interface UnassignRequest {
  pathId: string;
  userIds?: string[];
  groupIds?: string[];
}

/**
 * DELETE /api/learning-paths/unassign — remove EXACTLY the selected assignment
 * sources of a learning path (W-B2c-01, closure C2, 2026-09-07).
 *
 *   - `userIds`  → the DIRECT assignment rows of those users for the path.
 *   - `groupIds` → the GROUP assignment rows of those workspaces for the path.
 *
 * Nothing else is touched. In particular a group removal never deletes the
 * direct assignments of the group's members (the previous implementation did,
 * with no provenance predicate — an independent direct assignment was lost).
 * Course enrolments are never written here: a path-derived enrolment stops
 * granting access by itself when the learner's last current entitlement
 * disappears (decision D1; see migration 20260907120500), and independent
 * enrolments and learning history are untouched.
 *
 * Every count in the response is the number of rows the database actually
 * deleted (a repeated call is idempotent and reports 0), and the audit trail
 * records only the sources that were actually removed.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return handleMethodNotAllowed(res, ['DELETE']);
  }

  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const hasPermission = await LearningPathsService.hasManagePermission(supabaseClient, user.id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to unassign learning paths' });
    }

    const { pathId, userIds, groupIds } = (req.body ?? {}) as UnassignRequest;
    if (!pathId || typeof pathId !== 'string') {
      return res.status(400).json({ error: 'pathId is required' });
    }

    const requestedUserIds = Array.isArray(userIds) ? Array.from(new Set(userIds.filter((id) => typeof id === 'string' && id))) : [];
    const requestedGroupIds = Array.isArray(groupIds) ? Array.from(new Set(groupIds.filter((id) => typeof id === 'string' && id))) : [];
    if (requestedUserIds.length === 0 && requestedGroupIds.length === 0) {
      return res.status(400).json({ error: 'At least one userId or groupId must be provided' });
    }

    const { data: path, error: pathError } = await supabaseClient
      .from('learning_paths')
      .select('id, name')
      .eq('id', pathId)
      .maybeSingle();
    if (pathError) {
      throw new Error(`Failed to load learning path: ${pathError.message}`);
    }
    if (!path) {
      return res.status(404).json({ error: 'Learning path not found' });
    }

    let removedDirectUserIds: string[] = [];
    let removedGroupIds: string[] = [];

    if (requestedUserIds.length > 0) {
      const { data: removed, error: userError } = await supabaseClient
        .from('learning_path_assignments')
        .delete()
        .eq('path_id', pathId)
        .in('user_id', requestedUserIds)
        .is('group_id', null)
        .select('user_id');
      if (userError) {
        throw new Error(`Failed to unassign users: ${userError.message}`);
      }
      removedDirectUserIds = Array.from(new Set((removed ?? []).map((row: { user_id: string }) => row.user_id)));

      if (removedDirectUserIds.length > 0) {
        const auditEntries = createLPAssignmentAuditEntries('unassigned', pathId, removedDirectUserIds, user.id, removedDirectUserIds.length);
        auditEntries.forEach((entry) => {
          entry.metadata = { ...entry.metadata, source: 'direct' };
        });
        logBatchAssignmentAudit(supabaseClient, auditEntries);
      }
    }

    if (requestedGroupIds.length > 0) {
      const { data: removed, error: groupError } = await supabaseClient
        .from('learning_path_assignments')
        .delete()
        .eq('path_id', pathId)
        .in('group_id', requestedGroupIds)
        .is('user_id', null)
        .select('group_id');
      if (groupError) {
        throw new Error(`Failed to unassign groups: ${groupError.message}`);
      }
      removedGroupIds = Array.from(new Set((removed ?? []).map((row: { group_id: string }) => row.group_id)));

      if (removedGroupIds.length > 0) {
        // One audit entry per removed group source; no member row is deleted.
        const groupEntries = createLPAssignmentAuditEntries('unassigned', pathId, removedGroupIds, user.id, removedGroupIds.length);
        groupEntries.forEach((entry) => {
          entry.entityType = 'community_workspace';
          entry.metadata = { ...entry.metadata, source: 'group', viaWorkspaceGroup: entry.entityId };
        });
        logBatchAssignmentAudit(supabaseClient, groupEntries);
      }
    }

    const unassignedCount = removedDirectUserIds.length + removedGroupIds.length;
    return res.status(200).json({
      success: true,
      pathName: path.name,
      unassigned_count: unassignedCount,
      removed: {
        directUserIds: removedDirectUserIds,
        groupIds: removedGroupIds,
        notFound: {
          userIds: requestedUserIds.filter((id) => !removedDirectUserIds.includes(id)),
          groupIds: requestedGroupIds.filter((id) => !removedGroupIds.includes(id)),
        },
      },
      message: `Successfully unassigned learning path from ${unassignedCount} source(s)`,
    });
  } catch (error: any) {
    console.error('Unassign error:', error);
    return res.status(500).json({ error: error.message || 'Failed to unassign learning path' });
  }
}
