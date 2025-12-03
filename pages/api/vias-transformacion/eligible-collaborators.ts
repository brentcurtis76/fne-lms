import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/vias-transformacion/eligible-collaborators
 *
 * Fetch users from the same school who can be added as collaborators to an assessment.
 *
 * Query params:
 * - schoolId: number (required) - The school to fetch users from
 * - assessmentId: string (optional) - If provided, excludes existing collaborators
 *
 * Security:
 * - Validates user is authenticated
 * - Validates user belongs to the requested school (or is admin)
 * - Only returns users from the specified school
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const userId = session.user.id;
  const { schoolId, assessmentId } = req.query;

  if (!schoolId) {
    return res.status(400).json({ error: 'schoolId es requerido' });
  }

  const schoolIdNum = parseInt(schoolId as string, 10);
  if (isNaN(schoolIdNum)) {
    return res.status(400).json({ error: 'schoolId debe ser un número' });
  }

  try {
    // Initialize admin client for RLS bypass
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

    // 1. Verify user belongs to this school (or is admin)
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('school_id, role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (rolesError) {
      console.error('[eligible-collaborators] Error getting user roles:', rolesError);
      return res.status(500).json({ error: 'Error al verificar permisos' });
    }

    const isAdmin = userRoles?.some(r => ['admin', 'consultor'].includes(r.role_type));
    const userSchoolIds = userRoles?.filter(r => r.school_id).map(r => r.school_id) || [];

    if (!isAdmin && !userSchoolIds.includes(schoolIdNum)) {
      return res.status(403).json({ error: 'No tienes acceso a esta escuela' });
    }

    // 2. Get all users from this school
    const { data: schoolUsers, error: usersError } = await supabaseAdmin
      .from('user_roles')
      .select(`
        user_id,
        role_type,
        profiles:user_id (
          id,
          first_name,
          last_name,
          email,
          avatar_url
        )
      `)
      .eq('school_id', schoolIdNum)
      .eq('is_active', true)
      .neq('user_id', userId); // Exclude current user

    if (usersError) {
      console.error('[eligible-collaborators] Error fetching school users:', usersError);
      return res.status(500).json({ error: 'Error al obtener usuarios de la escuela' });
    }

    // 3. Deduplicate users (they might have multiple roles)
    const userMap = new Map<string, any>();
    schoolUsers?.forEach(ur => {
      const profile = Array.isArray(ur.profiles) ? ur.profiles[0] : ur.profiles;
      if (!profile) return;

      if (!userMap.has(ur.user_id)) {
        userMap.set(ur.user_id, {
          id: ur.user_id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          full_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario',
          email: profile.email,
          avatar_url: profile.avatar_url,
          role_types: [ur.role_type],
        });
      } else {
        // Add role type if not already present
        const existing = userMap.get(ur.user_id);
        if (!existing.role_types.includes(ur.role_type)) {
          existing.role_types.push(ur.role_type);
        }
      }
    });

    let eligibleUsers = Array.from(userMap.values());

    // 4. If assessmentId provided, exclude existing collaborators
    if (assessmentId) {
      const { data: existingCollaborators, error: collabError } = await supabaseAdmin
        .from('transformation_assessment_collaborators')
        .select('user_id')
        .eq('assessment_id', assessmentId as string);

      if (collabError) {
        console.error('[eligible-collaborators] Error fetching collaborators:', collabError);
        // Continue anyway, just don't filter
      } else {
        const existingIds = new Set(existingCollaborators?.map(c => c.user_id) || []);
        eligibleUsers = eligibleUsers.filter(u => !existingIds.has(u.id));
      }
    }

    // 5. Sort by name
    eligibleUsers.sort((a, b) => a.full_name.localeCompare(b.full_name));

    console.log(
      '[eligible-collaborators] schoolId:',
      schoolIdNum,
      'assessmentId:',
      assessmentId || 'none',
      'eligible:',
      eligibleUsers.length
    );

    return res.status(200).json({
      collaborators: eligibleUsers,
      schoolId: schoolIdNum,
    });
  } catch (error) {
    console.error('[eligible-collaborators] Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
