import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/assignments/user-group
 *
 * Fetch the user's existing group for an assignment (bypasses RLS).
 *
 * Query params:
 * - assignmentId: string (required)
 *
 * Returns:
 * - { group: { id, name, ... } | null } - User's group or null if not in any group
 *
 * Security:
 * - Validates user is authenticated
 * - Only returns the authenticated user's own group membership
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { assignmentId } = req.query;

  if (!assignmentId || typeof assignmentId !== 'string') {
    return res.status(400).json({ error: 'assignmentId es requerido' });
  }

  try {
    const userId = session.user.id;
    console.log('[user-group] REQUEST - userId:', userId, 'assignmentId:', assignmentId);

    // Initialize admin client for RLS bypass
    // This is safe because we only return the authenticated user's own group
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Step 1: Check if user belongs to a group for this assignment
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('group_assignment_members')
      .select('group_id, role')
      .eq('assignment_id', assignmentId)
      .eq('user_id', userId)
      .maybeSingle();

    console.log('[user-group] membership query result:', {
      found: !!membership,
      groupId: membership?.group_id,
      error: membershipError?.message,
      code: membershipError?.code
    });

    if (membershipError) {
      // PGRST116 = no rows found, which is expected if user has no group
      if (membershipError.code === 'PGRST116') {
        console.log('[user-group] No group found for user (expected for new users)');
        return res.status(200).json({ group: null });
      }

      console.error('[user-group] Error checking membership:', membershipError);
      return res.status(500).json({ error: 'Error al verificar grupo' });
    }

    if (!membership?.group_id) {
      // User is not in any group yet
      console.log('[user-group] User not in any group for this assignment');
      return res.status(200).json({ group: null });
    }

    // Step 2: Fetch the group details
    const { data: group, error: groupError } = await supabaseAdmin
      .from('group_assignment_groups')
      .select('id, name, assignment_id, community_id, is_consultant_managed, max_members, created_at, created_by')
      .eq('id', membership.group_id)
      .single();

    console.log('[user-group] group query result:', {
      found: !!group,
      groupId: group?.id,
      groupName: group?.name,
      error: groupError?.message
    });

    if (groupError || !group) {
      // Group doesn't exist - this is an orphaned membership record
      // Clean it up and treat as "no group" instead of erroring
      console.warn('[user-group] Orphaned membership - group_id', membership.group_id, 'does not exist. Cleaning up...');

      // Delete the orphaned membership record
      await supabaseAdmin
        .from('group_assignment_members')
        .delete()
        .eq('group_id', membership.group_id)
        .eq('user_id', userId);

      console.log('[user-group] Cleaned up orphaned membership. Returning null group.');
      return res.status(200).json({ group: null });
    }

    console.log('[user-group] Found group:', group.id, 'name:', group.name);
    return res.status(200).json({ group });

  } catch (error: any) {
    console.error('[user-group] Uncaught error:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error?.message || String(error)
    });
  }
}
