import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/vias-transformacion/[id]/collaborators
 * List collaborators for an assessment
 *
 * POST /api/vias-transformacion/[id]/collaborators
 * Add collaborators to an assessment
 * Body: { userIds: string[] }
 *
 * DELETE /api/vias-transformacion/[id]/collaborators
 * Remove a collaborator from an assessment
 * Body: { userId: string }
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
    return handleGet(res, supabaseAdmin, assessmentId);
  } else if (req.method === 'POST') {
    return handlePost(req, res, supabase, supabaseAdmin, userId, assessmentId);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, supabase, supabaseAdmin, userId, assessmentId);
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: 'Método no permitido' });
  }
}

/**
 * GET: List collaborators
 */
async function handleGet(
  res: NextApiResponse,
  supabaseAdmin: any,
  assessmentId: string
) {
  try {
    // Get collaborators without join (foreign key relationship doesn't exist)
    const { data: collaborators, error } = await supabaseAdmin
      .from('transformation_assessment_collaborators')
      .select('user_id, role, can_edit, added_at, added_by')
      .eq('assessment_id', assessmentId)
      .order('added_at', { ascending: true });

    if (error) {
      console.error('[collaborators/get] Error:', error);
      return res.status(500).json({ error: 'Error al obtener colaboradores' });
    }

    // Get profiles separately
    const userIds = collaborators?.map(c => c.user_id) || [];
    let profilesMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      if (profiles) {
        profilesMap = profiles.reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    const formatted = collaborators?.map(c => {
      const profile = profilesMap[c.user_id];
      return {
        id: c.user_id,
        role: c.role,
        can_edit: c.can_edit,
        added_at: c.added_at,
        added_by: c.added_by,
        first_name: profile?.first_name,
        last_name: profile?.last_name,
        full_name: profile
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
          : 'Usuario',
        avatar_url: profile?.avatar_url,
      };
    }) || [];

    return res.status(200).json({ collaborators: formatted });
  } catch (error) {
    console.error('[collaborators/get] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST: Add collaborators
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  supabaseAdmin: any,
  userId: string,
  assessmentId: string
) {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds es requerido (array)' });
    }

    // 1. Get assessment and verify it exists
    const { data: assessment, error: assessmentError } = await supabaseAdmin
      .from('transformation_assessments')
      .select('id, school_id, created_by')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // 2. Check if user can add collaborators
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('school_id, role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    const isAdmin = userRoles?.some(r => ['admin', 'consultor'].includes(r.role_type));
    const isCreator = assessment.created_by === userId;

    // Check if user is an existing collaborator
    const { data: existingCollab } = await supabaseAdmin
      .from('transformation_assessment_collaborators')
      .select('can_edit')
      .eq('assessment_id', assessmentId)
      .eq('user_id', userId)
      .single();

    const canAddCollaborators = isAdmin || isCreator || existingCollab?.can_edit;

    if (!canAddCollaborators) {
      return res.status(403).json({ error: 'No tienes permiso para agregar colaboradores' });
    }

    // 3. Validate new collaborators belong to the same school
    const { data: validUsers, error: validationError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .in('user_id', userIds)
      .eq('school_id', assessment.school_id)
      .eq('is_active', true);

    if (validationError) {
      console.error('[collaborators/post] Validation error:', validationError);
      return res.status(500).json({ error: 'Error al validar usuarios' });
    }

    const validUserIds = [...new Set(validUsers?.map(u => u.user_id) || [])];

    if (validUserIds.length === 0) {
      return res.status(400).json({ error: 'Ninguno de los usuarios pertenece a la escuela' });
    }

    // 4. Add collaborators (skip duplicates)
    const collaboratorRecords = validUserIds.map(uid => ({
      assessment_id: assessmentId,
      user_id: uid,
      role: 'collaborator',
      can_edit: true,
      added_by: userId,
    }));

    const { data: added, error: insertError } = await supabaseAdmin
      .from('transformation_assessment_collaborators')
      .upsert(collaboratorRecords, {
        onConflict: 'assessment_id,user_id',
        ignoreDuplicates: true,
      })
      .select();

    if (insertError) {
      console.error('[collaborators/post] Insert error:', insertError);
      return res.status(500).json({ error: 'Error al agregar colaboradores' });
    }

    // 5. Update assessment updated_at
    await supabaseAdmin
      .from('transformation_assessments')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', assessmentId);

    console.log(
      '[collaborators/post] Added',
      added?.length || 0,
      'collaborators to assessment',
      assessmentId
    );

    return res.status(200).json({
      added: added?.length || 0,
      requested: userIds.length,
      validated: validUserIds.length,
    });
  } catch (error) {
    console.error('[collaborators/post] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE: Remove a collaborator
 */
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  supabaseAdmin: any,
  userId: string,
  assessmentId: string
) {
  try {
    const { userId: targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'userId es requerido' });
    }

    // 1. Get assessment
    const { data: assessment, error: assessmentError } = await supabaseAdmin
      .from('transformation_assessments')
      .select('id, school_id, created_by')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // 2. Check permissions
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    const isAdmin = userRoles?.some(r => ['admin', 'consultor'].includes(r.role_type));
    const isCreator = assessment.created_by === userId;
    const isRemovingSelf = targetUserId === userId;

    // Users can remove themselves, creators can remove anyone, admins can remove anyone
    const canRemove = isAdmin || isCreator || isRemovingSelf;

    if (!canRemove) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar colaboradores' });
    }

    // 3. Check if trying to remove the creator
    const { data: targetCollab } = await supabaseAdmin
      .from('transformation_assessment_collaborators')
      .select('role')
      .eq('assessment_id', assessmentId)
      .eq('user_id', targetUserId)
      .single();

    if (targetCollab?.role === 'creator') {
      return res.status(400).json({ error: 'No se puede eliminar al creador de la evaluación' });
    }

    // 4. Remove collaborator
    const { error: deleteError } = await supabaseAdmin
      .from('transformation_assessment_collaborators')
      .delete()
      .eq('assessment_id', assessmentId)
      .eq('user_id', targetUserId);

    if (deleteError) {
      console.error('[collaborators/delete] Delete error:', deleteError);
      return res.status(500).json({ error: 'Error al eliminar colaborador' });
    }

    // 5. Update assessment updated_at
    await supabaseAdmin
      .from('transformation_assessments')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', assessmentId);

    console.log('[collaborators/delete] Removed user', targetUserId, 'from assessment', assessmentId);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[collaborators/delete] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
