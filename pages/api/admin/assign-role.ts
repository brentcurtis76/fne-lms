import { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient, isValidSchoolIdInput } from '../../../lib/api-auth';
import { ED_ASSIGNABLE_ROLES, SCHOOL_SCOPED_ROLES_SET } from '../../../utils/roleUtils';
import { UserRoleType, validateRoleAssignment } from '../../../types/roles';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log incoming request
    console.log('[assign-role API] Request received:', {
      method: req.method,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    const {
      isAuthorized,
      role: requesterRole,
      schoolId: edSchoolId,
      user: requestingUser,
      error: authError,
    } = await checkIsAdminOrEquipoDirectivo(req, res);

    if (!requestingUser) {
      console.error('[assign-role API] Auth failed:', { authError, requesterRole });
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (!isAuthorized) {
      console.error('[assign-role API] Insufficient role:', { requesterRole, userId: requestingUser.id });
      return res.status(403).json({ error: 'Solo administradores o equipo directivo pueden asignar roles' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const supabaseService = createServiceRoleClient();

    // Extract parameters from request body
    const {
      targetUserId,
      roleType,
      generationId,
      communityId
    } = req.body;
    let { schoolId } = req.body;

    // Validate required fields
    if (!targetUserId || !roleType) {
      return res.status(400).json({ error: 'targetUserId and roleType are required' });
    }

    // Validate role type (admin valid role set, unchanged)
    const validRoles: UserRoleType[] = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'community_manager', 'docente', 'supervisor_de_red', 'encargado_licitacion'];
    if (!validRoles.includes(roleType)) {
      return res.status(400).json({ error: 'Invalid role type' });
    }

    if (requesterRole === 'equipo_directivo') {
      if (!(ED_ASSIGNABLE_ROLES as readonly string[]).includes(roleType)) {
        return res.status(403).json({ error: 'Role not assignable by equipo_directivo' });
      }

      // Validate body schoolId before any cross-school comparison so that
      // malformed/negative inputs return 400 instead of being mis-routed
      // through the 403 cross-school gates below.
      if (schoolId !== undefined && schoolId !== null && schoolId !== '') {
        if (!isValidSchoolIdInput(schoolId)) {
          return res.status(400).json({ error: 'schoolId inválido' });
        }
        if (Number(schoolId) !== edSchoolId) {
          return res.status(403).json({ error: 'No se puede asignar rol en otro colegio' });
        }
      }

      const { data: targetProfile, error: profileLookupError } = await supabaseService
        .from('profiles')
        .select('school_id')
        .eq('id', targetUserId)
        .maybeSingle();

      if (profileLookupError) {
        return res.status(500).json({ error: 'Error verificando usuario' });
      }
      if (!targetProfile) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      if (targetProfile.school_id !== edSchoolId) {
        return res.status(403).json({ error: 'No autorizado para asignar roles a este usuario' });
      }

      // Defense-in-depth: only stamp the ED's schoolId onto the new role row
      // for role types that are actually school-scoped. Today ED_ASSIGNABLE_ROLES
      // equals SCHOOL_SCOPED_ROLES, but if a future global role (e.g.
      // community_manager, supervisor_de_red) is ever added to
      // ED_ASSIGNABLE_ROLES, its user_roles row must remain school_id=null —
      // overwriting it with edSchoolId would mis-scope a global grant.
      if (SCHOOL_SCOPED_ROLES_SET.has(roleType)) {
        schoolId = edSchoolId;
      } else {
        // Defensive normalization: if a future ED-assignable role is non-school-scoped,
        // collapse '', undefined, or null body inputs to an unambiguous null before insert.
        schoolId = null;
      }

      // TOCTOU: this user_roles read is a point-in-time check. A concurrent
      // role grant landing between this gate and the role write below could
      // allow a global-role escalation to slip through. The practical
      // mitigation is that role assignment is restricted to admin tooling.
      // Defense-in-depth: reject if the target holds any active role outside
      // SCHOOL_SCOPED_ROLES (admin/consultor/supervisor_de_red/community_manager).
      const { data: targetRoles, error: rolesLookupError } = await supabaseService
        .from('user_roles')
        .select('role_type')
        .eq('user_id', targetUserId)
        .eq('is_active', true);

      if (rolesLookupError) {
        return res.status(500).json({ error: 'Error verificando roles del usuario' });
      }
      const hasGlobalRole = (targetRoles ?? []).some(
        (r: { role_type: string }) => !SCHOOL_SCOPED_ROLES_SET.has(r.role_type),
      );
      if (hasGlobalRole) {
        return res.status(403).json({ error: 'No autorizado para asignar roles a este usuario' });
      }

      if (communityId !== undefined && communityId !== null && communityId !== '') {
        const { data: communityRow, error: communityLookupError } = await supabaseService
          .from('growth_communities')
          .select('school_id')
          .eq('id', communityId)
          .maybeSingle();

        if (communityLookupError) {
          return res.status(500).json({ error: 'Error verificando comunidad' });
        }
        if (!communityRow) {
          return res.status(404).json({ error: 'Comunidad no encontrada' });
        }
        if (communityRow.school_id !== edSchoolId) {
          return res.status(403).json({ error: 'Comunidad no pertenece a tu colegio' });
        }
      }

      if (generationId !== undefined && generationId !== null && generationId !== '') {
        const { data: generationRow, error: generationLookupError } = await supabaseService
          .from('generations')
          .select('school_id')
          .eq('id', generationId)
          .maybeSingle();

        if (generationLookupError) {
          return res.status(500).json({ error: 'Error verificando generación' });
        }
        if (!generationRow) {
          return res.status(404).json({ error: 'Generación no encontrada' });
        }
        if (generationRow.school_id !== edSchoolId) {
          return res.status(403).json({ error: 'Generación no pertenece a tu colegio' });
        }
      }
    }

    // Application-level validation for role organizational requirements
    const organizationalScope = {
      schoolId: schoolId || null,
      generationId: generationId || null,
      communityId: communityId || null
    };

    const validation = validateRoleAssignment(roleType, organizationalScope);
    if (!validation.isValid) {
      console.log('[assign-role API] Role validation failed:', {
        roleType,
        organizationalScope,
        error: validation.error
      });
      return res.status(400).json({
        error: validation.error
      });
    }

    console.log('[assign-role API] Role validation passed:', {
      roleType,
      organizationalScope
    });

    let finalCommunityId = communityId;

    // Handle community leader role - auto-create community if needed
    if (roleType === 'lider_comunidad' && schoolId && !communityId) {
      console.log('[assign-role API] Creating community for leader role:', {
        targetUserId,
        schoolId,
        generationId
      });

      // Get user info for community name
      const { data: userData, error: userError } = await supabaseService
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', targetUserId)
        .single();

      if (userError || !userData) {
        console.error('[assign-role API] Failed to get user profile:', { userError, targetUserId });
        return res.status(400).json({ error: 'Could not find user profile' });
      }

      // Check if school requires generations
      const { data: schoolData, error: schoolError } = await supabaseService
        .from('schools')
        .select('id, name, has_generations')
        .eq('id', schoolId)
        .single();

      if (schoolError || !schoolData) {
        console.error('[assign-role API] Failed to get school data:', { schoolError, schoolId });
        return res.status(400).json({ error: 'Could not find school information' });
      }

      console.log('[assign-role API] School data:', {
        schoolId: schoolData.id,
        schoolName: schoolData.name,
        hasGenerations: schoolData.has_generations
      });

      // Check if school has any generations in the database
      const { data: existingGenerations, error: genError } = await supabaseService
        .from('generations')
        .select('id')
        .eq('school_id', schoolId)
        .limit(1);

      if (genError) {
        console.error('Error checking generations:', genError);
        return res.status(500).json({ error: 'Error verificando generaciones' });
      }

      const schoolHasGenerations = schoolData.has_generations === true;

      // Validate generation requirement
      if (schoolHasGenerations && !generationId) {
        return res.status(400).json({
          error: `La escuela "${schoolData.name}" utiliza generaciones. Debe seleccionar una generación para crear la comunidad.`
        });
      }

      // Validate generation_id exists if provided
      if (generationId) {
        const { data: generationData, error: generationError } = await supabaseService
          .from('generations')
          .select('id, name')
          .eq('id', generationId)
          .eq('school_id', schoolId)
          .single();

        if (generationError || !generationData) {
          return res.status(400).json({ error: 'La generación seleccionada no es válida para esta escuela' });
        }
      }

      const communityName = `Comunidad ${userData.first_name} ${userData.last_name}`;

      console.log('[assign-role API] Creating community with name:', communityName);

      // Create the community with proper validation
      const communityData = {
        name: communityName,
        school_id: schoolId,
        generation_id: generationId || null
      };

      console.log('[assign-role API] Community insert data:', communityData);

      const { data: newCommunity, error: communityError } = await supabaseService
        .from('growth_communities')
        .insert(communityData)
        .select()
        .single();

      if (communityError) {
        console.error('[assign-role API] Error creating community:', {
          error: communityError,
          code: communityError.code,
          message: communityError.message,
          details: communityError.details,
          hint: communityError.hint,
          communityData
        });

        // Provide specific error messages based on constraint violations
        if (communityError.code === '23505') {
          // Unique constraint violation
          return res.status(400).json({
            error: `Ya existe una comunidad con el nombre "${communityName}" en esta escuela. Por favor, use un nombre diferente.`
          });
        } else if (communityError.code === '23503') {
          // Foreign key constraint violation
          return res.status(400).json({
            error: 'Error de configuración: referencias inválidas en la base de datos.'
          });
        } else if (communityError.message && communityError.message.includes('generation_id is required')) {
          // Our custom trigger error
          return res.status(400).json({
            error: 'Esta escuela requiere que se especifique una generación para crear comunidades.'
          });
        } else {
          // Generic error - but now with more info
          console.error('[assign-role API] Unhandled community creation error:', {
            errorCode: communityError.code,
            errorMessage: communityError.message,
            errorDetails: communityError.details,
            fullError: communityError
          });

          return res.status(500).json({
            error: 'Error al crear la comunidad. Por favor, verifique la configuración e intente nuevamente.',
            code: communityError.code || 'UNKNOWN',
            debug: process.env.NODE_ENV === 'development' ? {
              message: communityError.message,
              details: communityError.details
            } : undefined
          });
        }
      }

      finalCommunityId = newCommunity.id;
      console.log('[assign-role API] Community created successfully:', { communityId: finalCommunityId });
    }

    // Insert the role assignment
    const roleInsertData = {
      user_id: targetUserId,
      role_type: roleType,
      school_id: schoolId || null,
      generation_id: generationId || null,
      community_id: finalCommunityId || null,
      is_active: true,
      assigned_by: requestingUser.id,
      assigned_at: new Date().toISOString()
    };

    console.log('[assign-role API] Inserting role assignment:', roleInsertData);

    const { data: roleData, error: roleError } = await supabaseService
      .from('user_roles')
      .insert(roleInsertData)
      .select()
      .single();

    if (roleError) {
      console.error('[assign-role API] Error assigning role:', {
        error: roleError,
        roleInsertData
      });
      return res.status(500).json({ error: 'Error al asignar rol' });
    }

    // Update user's profile school_id if assigning a school-level role
    if (schoolId && ['equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente', 'community_manager', 'encargado_licitacion'].includes(roleType)) {
      console.log('[assign-role API] Updating profile school_id:', { targetUserId, schoolId });

      // Get school name for backward compatibility with profile.school field
      const { data: schoolData } = await supabaseService
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .single();

      const { error: profileUpdateError } = await supabaseService
        .from('profiles')
        .update({
          school_id: schoolId,
          school: schoolData?.name || null
        })
        .eq('id', targetUserId);

      if (profileUpdateError) {
        console.error('[assign-role API] Failed to update profile school_id:', profileUpdateError);
        // Don't fail the whole request, but log it
      } else {
        console.log('[assign-role API] Profile school_id updated successfully');
      }
    }

    // Ensure caches refresh so client queries see the new role immediately
    const { error: cacheRefreshError } = await supabaseService
      .rpc('refresh_user_roles_cache');

    if (cacheRefreshError) {
      console.error('[assign-role API] Failed to refresh user_roles_cache:', cacheRefreshError);
    }

    // Return success with the created role and community ID if applicable
    return res.status(200).json({
      success: true,
      role: roleData,
      communityId: finalCommunityId
    });

  } catch (error) {
    console.error('[assign-role API] Unexpected error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: req.body
    });
    return res.status(500).json({
      error: 'Error inesperado al asignar rol',
      debug: process.env.NODE_ENV === 'development' ? {
        message: error instanceof Error ? error.message : 'Unknown error'
      } : undefined
    });
  }
}
