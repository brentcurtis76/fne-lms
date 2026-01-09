/**
 * API Route: Get Shareable Members
 * Returns community members eligible for collaborative submission
 * Excludes users who have already submitted the assignment
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { userAssignmentsService } from '@/lib/services/userAssignments';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Create Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Check authentication
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Get query parameters
    const { assignmentId, communityId } = req.query;

    if (!assignmentId || !communityId) {
      return res.status(400).json({
        error: 'Se requieren assignmentId y communityId'
      });
    }

    // Validate user belongs to the community
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('community_id', communityId)
      .eq('is_active', true)
      .single();

    if (roleError || !userRole) {
      return res.status(403).json({
        error: 'No perteneces a esta comunidad'
      });
    }

    // Get shareable members
    const members = await userAssignmentsService.getShareableMembers(
      supabase,
      assignmentId as string,
      communityId as string,
      session.user.id
    );

    return res.status(200).json({
      success: true,
      members
    });
  } catch (error) {
    console.error('Error fetching shareable members:', error);
    return res.status(500).json({
      error: 'Error al obtener los miembros',
      details: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}
