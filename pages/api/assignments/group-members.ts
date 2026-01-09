import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/assignments/group-members
 *
 * Securely fetch group members with complete profile data for a group assignment.
 *
 * Query Params:
 * - groupId: string (required) - UUID of the group
 * - assignmentId: string (required) - UUID of the assignment
 *
 * Returns:
 * - members: Array of { id, full_name, avatar_url, role, is_current_user }
 *
 * Security:
 * - Validates user is authenticated
 * - Validates user is a member of the group before exposing any data
 * - Uses service role key AFTER validation to bypass RLS and get complete profile data
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (req.method === 'GET') {
    return handleGetMembers(req, res);
  }

  if (req.method === 'DELETE') {
    return handleRemoveMember(req, res);
  }
}

async function handleGetMembers(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { groupId, assignmentId } = req.query;

  // Validate input
  if (!groupId || !assignmentId) {
    return res.status(400).json({ error: 'groupId y assignmentId son requeridos' });
  }

  if (typeof groupId !== 'string' || typeof assignmentId !== 'string') {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  try {
    const userId = session.user.id;

    console.log('[group-members] Request from user:', userId, 'for group:', groupId, 'assignment:', assignmentId);

    // 1. Verify user is a member of this group BEFORE using admin client
    const { data: membership, error: membershipError } = await supabase
      .from('group_assignment_members')
      .select('group_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('assignment_id', assignmentId)
      .maybeSingle();

    if (membershipError) {
      console.error('[group-members] Error checking membership:', membershipError);
      return res.status(500).json({ error: 'Error al verificar membresía' });
    }

    if (!membership) {
      console.log('[group-members] User not a member:', userId, 'group:', groupId);
      return res.status(403).json({ error: 'No eres miembro de este grupo' });
    }

    console.log('[group-members] Membership verified, fetching members with admin client');

    // 2. AFTER validation, use admin client to read full member data
    // This bypasses RLS to ensure we get complete profile data
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

    // 3. Fetch all group members
    const { data: members, error: membersError } = await supabaseAdmin
      .from('group_assignment_members')
      .select('user_id, role')
      .eq('group_id', groupId)
      .eq('assignment_id', assignmentId);

    if (membersError) {
      console.error('[group-members] Error fetching members:', membersError);
      return res.status(500).json({ error: 'Error al cargar miembros del grupo' });
    }

    if (!members || members.length === 0) {
      console.log('[group-members] No members found for group:', groupId);
      return res.status(200).json({ members: [] });
    }

    // 4. Fetch all profiles for these members in a single query
    const userIds = members.map(m => m.user_id);
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', userIds);

    if (profilesError) {
      console.error('[group-members] Error fetching profiles:', profilesError);
      return res.status(500).json({ error: 'Error al cargar perfiles' });
    }

    // 5. Create a map of profiles for fast lookup
    const profileMap = new Map();
    (profiles || []).forEach(profile => {
      profileMap.set(profile.id, profile);
    });

    // 6. Format response with complete profile data
    const formattedMembers = members.map((member: any) => {
      const profile = profileMap.get(member.user_id);
      const firstName = profile?.first_name || '';
      const lastName = profile?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim() || 'Usuario desconocido';

      return {
        id: member.user_id,
        full_name: fullName,
        avatar_url: profile?.avatar_url || null,
        role: member.role || 'member',
        is_current_user: member.user_id === userId
      };
    });

    console.log('[group-members] Successfully fetched', formattedMembers.length, 'members');

    return res.status(200).json({ members: formattedMembers });

  } catch (error) {
    console.error('[group-members] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function handleRemoveMember(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { groupId, assignmentId, memberId } = req.body || {};

  if (!groupId || !assignmentId || !memberId) {
    return res.status(400).json({ error: 'groupId, assignmentId y memberId son requeridos' });
  }

  try {
    const userId = session.user.id;
    console.log('[group-members] DELETE request', { userId, groupId, assignmentId, memberId });

    const { data: membership, error: membershipError } = await supabase
      .from('group_assignment_members')
      .select('group_id')
      .eq('group_id', groupId)
      .eq('assignment_id', assignmentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError) {
      console.error('[group-members] Error checking membership on delete:', membershipError);
      return res.status(500).json({ error: 'Error al verificar permisos' });
    }

    if (!membership) {
      return res.status(403).json({ error: 'No eres miembro de este grupo' });
    }

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

    const { data: memberRecord, error: memberFetchError } = await supabaseAdmin
      .from('group_assignment_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('assignment_id', assignmentId)
      .eq('user_id', memberId)
      .maybeSingle();

    if (memberFetchError) {
      console.error('[group-members] Error verifying member to delete:', memberFetchError);
      return res.status(500).json({ error: 'Error al verificar miembro' });
    }

    if (!memberRecord) {
      return res.status(404).json({ error: 'Miembro no encontrado en este grupo' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('group_assignment_members')
      .delete()
      .eq('group_id', groupId)
      .eq('assignment_id', assignmentId)
      .eq('user_id', memberId);

    if (deleteError) {
      console.error('[group-members] Error deleting member:', deleteError);
      return res.status(500).json({ error: 'Error al remover al miembro' });
    }

    console.log('[group-members] Member removed successfully:', memberId);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[group-members] Unexpected delete error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
