import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { UserRoleType } from '../../../types/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user's session using the auth helper
    const supabaseClient = createServerSupabaseClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    
    if (sessionError || !session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUserId = session.user.id;

    // Create service role client to bypass RLS
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Check if the current user is an admin using service role
    const { data: adminCheck, error: adminError } = await supabaseService
      .from('user_roles')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);

    if (adminError || !adminCheck || adminCheck.length === 0) {
      return res.status(403).json({ error: 'Solo administradores pueden asignar roles' });
    }

    // Extract parameters from request body
    const {
      targetUserId,
      roleType,
      schoolId,
      generationId,
      communityId
    } = req.body;

    // Validate required fields
    if (!targetUserId || !roleType) {
      return res.status(400).json({ error: 'targetUserId and roleType are required' });
    }

    // Validate role type
    const validRoles: UserRoleType[] = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'];
    if (!validRoles.includes(roleType)) {
      return res.status(400).json({ error: 'Invalid role type' });
    }

    let finalCommunityId = communityId;

    // Handle community leader role - auto-create community if needed
    if (roleType === 'lider_comunidad' && schoolId && !communityId) {
      // Get user info for community name
      const { data: userData, error: userError } = await supabaseService
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', targetUserId)
        .single();

      if (userError || !userData) {
        return res.status(400).json({ error: 'Could not find user profile' });
      }

      const communityName = `Comunidad ${userData.first_name} ${userData.last_name}`;

      // Create the community
      const { data: newCommunity, error: communityError } = await supabaseService
        .from('growth_communities')
        .insert({
          name: communityName,
          school_id: schoolId,
          generation_id: generationId || null,
          created_by: currentUserId
        })
        .select()
        .single();

      if (communityError) {
        console.error('Error creating community:', communityError);
        return res.status(500).json({ error: 'Error al crear la comunidad' });
      }

      finalCommunityId = newCommunity.id;
    }

    // Insert the role assignment
    const { data: roleData, error: roleError } = await supabaseService
      .from('user_roles')
      .insert({
        user_id: targetUserId,
        role_type: roleType,
        school_id: schoolId || null,
        generation_id: generationId || null,
        community_id: finalCommunityId || null,
        is_active: true,
        assigned_by: currentUserId,
        assigned_at: new Date().toISOString()
      })
      .select()
      .single();

    if (roleError) {
      console.error('Error assigning role:', roleError);
      return res.status(500).json({ error: 'Error al asignar rol' });
    }

    // Return success with the created role and community ID if applicable
    return res.status(200).json({
      success: true,
      role: roleData,
      communityId: finalCommunityId
    });

  } catch (error) {
    console.error('Unexpected error in assign-role API:', error);
    return res.status(500).json({ error: 'Error inesperado al asignar rol' });
  }
}