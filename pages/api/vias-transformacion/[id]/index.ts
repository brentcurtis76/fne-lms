import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/vias-transformacion/[id]
 * Get a specific assessment with its collaborators
 *
 * PATCH /api/vias-transformacion/[id]
 * Update assessment (grades, status, etc.)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const userId = session.user.id;
  const { id: assessmentId } = req.query;

  if (!assessmentId || typeof assessmentId !== 'string') {
    return res.status(400).json({ error: 'ID de evaluación requerido' });
  }

  // Initialize admin client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  if (req.method === 'GET') {
    return handleGet(req, res, supabase, supabaseAdmin, userId, assessmentId);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res, supabase, supabaseAdmin, userId, assessmentId);
  } else {
    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: 'Método no permitido' });
  }
}

/**
 * GET: Get assessment details
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  supabaseAdmin: any,
  userId: string,
  assessmentId: string
) {
  try {
    // 1. Get the assessment
    const { data: assessment, error: assessmentError } = await supabaseAdmin
      .from('transformation_assessments')
      .select(`
        *,
        schools:school_id (
          id,
          name
        )
      `)
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      console.error('[vias-transformacion/get] Assessment not found:', assessmentId, assessmentError);
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // 2. Check access
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('school_id, role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    const isAdmin = userRoles?.some(r => ['admin', 'consultor'].includes(r.role_type));
    const userSchoolIds = userRoles?.filter(r => r.school_id).map(r => r.school_id) || [];
    const isInSchool = assessment.school_id && userSchoolIds.includes(assessment.school_id);
    const isCreator = assessment.created_by === userId;

    // 3. Get collaborators
    const { data: collaborators } = await supabaseAdmin
      .from('transformation_assessment_collaborators')
      .select('user_id, role, can_edit, added_at')
      .eq('assessment_id', assessmentId);

    const isCollaborator = collaborators?.some(c => c.user_id === userId);

    // 4. Get profiles for all collaborators
    const collaboratorUserIds = collaborators?.map(c => c.user_id) || [];
    let collaboratorProfiles: Record<string, any> = {};

    if (collaboratorUserIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', collaboratorUserIds);

      if (profiles) {
        collaboratorProfiles = profiles.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // Check if user has access
    if (!isAdmin && !isInSchool && !isCreator && !isCollaborator) {
      return res.status(403).json({ error: 'No tienes acceso a esta evaluación' });
    }

    // Determine if user can edit
    // Note: Admins can VIEW all assessments but can only EDIT if they're also a collaborator
    // This allows admins to review assessments without accidentally modifying them
    const canEdit =
      isCreator ||
      collaborators?.some(c => c.user_id === userId && c.can_edit);

    // Format collaborators using the profiles lookup
    const formattedCollaborators = collaborators?.map(c => {
      const profile = collaboratorProfiles[c.user_id];
      return {
        id: c.user_id,
        role: c.role,
        can_edit: c.can_edit,
        added_at: c.added_at,
        first_name: profile?.first_name,
        last_name: profile?.last_name,
        full_name: profile
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
          : 'Usuario',
        avatar_url: profile?.avatar_url,
        is_current_user: c.user_id === userId,
      };
    }) || [];

    // Get creator profile
    let creatorProfile = null;
    if (assessment.created_by) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .eq('id', assessment.created_by)
        .single();
      creatorProfile = profile;
    }

    // Add creator to collaborators list if not already there
    const creatorInCollabs = formattedCollaborators.some(c => c.id === assessment.created_by);
    if (creatorProfile && !creatorInCollabs) {
      formattedCollaborators.unshift({
        id: assessment.created_by,
        role: 'creator',
        can_edit: true,
        added_at: assessment.created_at || assessment.started_at,
        first_name: creatorProfile.first_name,
        last_name: creatorProfile.last_name,
        full_name: `${creatorProfile.first_name || ''} ${creatorProfile.last_name || ''}`.trim() || 'Usuario',
        avatar_url: creatorProfile.avatar_url,
        is_current_user: assessment.created_by === userId,
      });
    }

    // Determine if user is viewing as admin (can see but not edit)
    const isAdminViewer = isAdmin && !isCreator && !isCollaborator;

    return res.status(200).json({
      id: assessment.id,
      area: assessment.area,
      status: assessment.status,
      grades: assessment.grades || [],
      school_id: assessment.school_id,
      school_name: (assessment.schools as any)?.name || null,
      growth_community_id: assessment.growth_community_id,
      context_metadata: assessment.context_metadata,
      conversation_history: assessment.conversation_history,
      created_by: assessment.created_by,
      creator_name: creatorProfile
        ? `${creatorProfile.first_name || ''} ${creatorProfile.last_name || ''}`.trim()
        : 'Usuario',
      creator_avatar: creatorProfile?.avatar_url,
      started_at: assessment.started_at,
      updated_at: assessment.updated_at,
      completed_at: assessment.completed_at,
      collaborators: formattedCollaborators,
      is_creator: isCreator,
      is_collaborator: isCollaborator,
      is_admin_viewer: isAdminViewer,
      can_edit: canEdit,
    });
  } catch (error) {
    console.error('[vias-transformacion/get] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PATCH: Update assessment
 */
async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  supabaseAdmin: any,
  userId: string,
  assessmentId: string
) {
  try {
    const { grades, status } = req.body;

    // 1. Get the assessment
    const { data: assessment, error: assessmentError } = await supabaseAdmin
      .from('transformation_assessments')
      .select('id, school_id, created_by')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // 2. Check edit permissions
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('school_id, role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    const isAdmin = userRoles?.some(r => ['admin', 'consultor'].includes(r.role_type));
    const isCreator = assessment.created_by === userId;

    // Check if user is a collaborator with edit rights
    const { data: collaborator } = await supabaseAdmin
      .from('transformation_assessment_collaborators')
      .select('can_edit')
      .eq('assessment_id', assessmentId)
      .eq('user_id', userId)
      .single();

    const canEdit = isAdmin || isCreator || collaborator?.can_edit;

    if (!canEdit) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta evaluación' });
    }

    // 3. Build update object
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (grades !== undefined && Array.isArray(grades)) {
      updateData.grades = grades;
    }

    if (status !== undefined) {
      const validStatuses = ['in_progress', 'completed', 'archived'];
      if (validStatuses.includes(status)) {
        updateData.status = status;
        if (status === 'completed') {
          updateData.completed_at = new Date().toISOString();
        }
      }
    }

    // 4. Update
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('transformation_assessments')
      .update(updateData)
      .eq('id', assessmentId)
      .select()
      .single();

    if (updateError) {
      console.error('[vias-transformacion/patch] Update error:', updateError);
      return res.status(500).json({ error: 'Error al actualizar la evaluación' });
    }

    return res.status(200).json(updated);
  } catch (error) {
    console.error('[vias-transformacion/patch] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
