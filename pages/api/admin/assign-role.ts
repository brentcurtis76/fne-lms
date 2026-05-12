import { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient, isValidSchoolIdInput } from '../../../lib/api-auth';
import {
  ED_ASSIGNABLE_ROLES,
  ED_FORBIDDEN_TARGET_ROLES_SET,
  SCHOOL_SCOPED_ROLES_SET,
} from '../../../utils/roleUtils';
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
    const rawSchoolId = req.body.schoolId;

    // Validate required fields
    if (!targetUserId || !roleType) {
      return res.status(400).json({ error: 'targetUserId and roleType are required' });
    }

    // Validate role type (admin valid role set, unchanged)
    const validRoles: UserRoleType[] = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'community_manager', 'docente', 'supervisor_de_red', 'encargado_licitacion'];
    if (!validRoles.includes(roleType)) {
      return res.status(400).json({ error: 'Invalid role type' });
    }

    // ED role-assignability gate: hoisted above the shared shape check so a
    // misdirected ED request like `roleType='admin' + schoolId='abc'` returns
    // the actionable 403 ("role not assignable") instead of a 400 about the
    // incidental schoolId shape. Mirrors create-user.ts's error precedence.
    if (requesterRole === 'equipo_directivo' && !(ED_ASSIGNABLE_ROLES as readonly string[]).includes(roleType)) {
      return res.status(403).json({ error: 'Role not assignable by equipo_directivo' });
    }

    // Shared schoolId shape validation: applies to BOTH admin and ED paths so
    // malformed/non-numeric/zero/negative values are rejected uniformly with
    // 400 before any downstream logic. ED branch still enforces the
    // cross-school comparison after this guard.
    if (rawSchoolId !== undefined && rawSchoolId !== null && rawSchoolId !== '') {
      if (!isValidSchoolIdInput(rawSchoolId)) {
        return res.status(400).json({ error: 'schoolId inválido' });
      }
    }

    // Coerce to a numeric (or null) value once, immediately after the shared
    // shape check passes. Every downstream consumer — insert/update payloads,
    // FK lookups, cross-school comparisons — reads this variable, so the
    // user_roles.school_id column can never receive a raw request-body string
    // like '42'.
    let schoolId: number | null =
      rawSchoolId !== undefined && rawSchoolId !== null && rawSchoolId !== ''
        ? Number(rawSchoolId)
        : null;

    // FK sanitization (applies to both admin and ED paths): only the matching
    // role type can carry these FK fields downstream. Stray IDs on unrelated
    // roles (e.g. docente) are nulled here so they cannot leak into
    // user_roles or any other downstream FK-aware code path. The ED branch
    // below still gates FK lookups by roleType, so stray IDs on docente
    // continue to skip growth_communities / generations lookups as well.
    const sanitizedCommunityId: string | null =
      roleType === 'lider_comunidad' && communityId ? String(communityId) : null;
    const sanitizedGenerationId: string | null =
      roleType === 'lider_generacion' && generationId ? String(generationId) : null;
    // lider_comunidad may consume a generationId in the auto-create branch
    // (generation-based schools link the new growth_community to a generation),
    // but the user_roles row for lider_comunidad must keep generation_id null —
    // that column is reserved for lider_generacion. Kept as a separate variable
    // so the insert payload uses sanitizedGenerationId while community
    // auto-create uses this value.
    const communityAutoCreateGenerationId: string | null =
      roleType === 'lider_comunidad' && generationId ? String(generationId) : null;

    if (requesterRole === 'equipo_directivo') {
      // ED role-assignability already enforced above (hoisted ahead of the
      // shared schoolId shape check so the actionable 403 wins over the
      // incidental 400).

      // Cross-school check (shape validation is enforced earlier for both
      // admin and ED paths). Body schoolId, when present and valid, must
      // match the ED's own schoolId. schoolId is already coerced to
      // number | null above, so this is a direct numeric comparison.
      if (schoolId !== null && schoolId !== edSchoolId) {
        return res.status(403).json({ error: 'No se puede asignar rol en otro colegio' });
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
        // Intentional: non-school-scoped roles must never carry a school_id,
        // so any incoming value is unconditionally nulled here to produce an
        // unambiguous insert payload (defensive normalization regardless of
        // whether the body supplied '', undefined, or a stray school id).
        schoolId = null;
      }

      // Note: this is a TOCTOU read. Concurrent role grants between this
      // check and the role write below could let a global-role escalation
      // slip through. Both admin and equipo_directivo can reach this code
      // path, widening the exposure beyond admin-only tooling. Tracked in
      // PR #19 follow-ups as "TOCTOU residual risk hardening (Postgres
      // function or partial unique index)".
      // Defense-in-depth: reject if the target holds any active role either
      // (a) in ED_FORBIDDEN_TARGET_ROLES (admin/consultor/community_manager/
      // supervisor_de_red) or (b) school-scoped but tied to a different
      // school. Two conceptually distinct gates: forbidden-role membership
      // vs. cross-school scope. The ED-scope profile check above only
      // covers profiles.school_id; a target may still hold a stale or
      // cross-school role row whose school_id does not match the ED's
      // school.
      const { data: targetRoles, error: rolesLookupError } = await supabaseService
        .from('user_roles')
        .select('role_type, school_id')
        .eq('user_id', targetUserId)
        .eq('is_active', true);

      if (rolesLookupError) {
        return res.status(500).json({ error: 'Error verificando roles del usuario' });
      }
      const hasForbiddenRole = (targetRoles ?? []).some(
        (r: { role_type: string }) => ED_FORBIDDEN_TARGET_ROLES_SET.has(r.role_type),
      );
      const hasCrossSchoolRole = (targetRoles ?? []).some(
        (r: { role_type: string; school_id: number | null }) =>
          SCHOOL_SCOPED_ROLES_SET.has(r.role_type) &&
          r.school_id !== null &&
          r.school_id !== edSchoolId,
      );
      if (hasForbiddenRole || hasCrossSchoolRole) {
        return res.status(403).json({ error: 'No autorizado para asignar roles a este usuario' });
      }

      // Gate FK validation by roleType: only roles that actually consume
      // these fields downstream should pay the lookup. For unrelated roles
      // (e.g. docente), stray communityId/generationId in the body are
      // ignored — matching how the role-insert path treats them.
      if (
        roleType === 'lider_comunidad' &&
        communityId !== undefined &&
        communityId !== null &&
        communityId !== ''
      ) {
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

      // lider_comunidad also consumes generationId when the school is
      // generation-based (community auto-create links the new growth_community
      // to a generation), so the FK gate runs for both roles. The user_roles
      // row for lider_comunidad still leaves generation_id null further down.
      if (
        (roleType === 'lider_generacion' || roleType === 'lider_comunidad') &&
        generationId !== undefined &&
        generationId !== null &&
        generationId !== ''
      ) {
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

    // Application-level validation for role organizational requirements.
    // Uses sanitized FK values so validation cannot be misled by stray IDs
    // that won't actually persist on the user_roles row.
    const organizationalScope = {
      schoolId: schoolId ?? null,
      generationId: sanitizedGenerationId,
      communityId: sanitizedCommunityId
    };

    // Phase 15.21 invariant: `schoolId` here is `number | null`. Upstream
    // `isValidSchoolIdInput` rejects `0` and negative values, so by the time
    // we reach this call the field is either a positive integer or `null`.
    // This means truthiness checks inside `validateRoleAssignment` (e.g.
    // `if (scope.schoolId)`) are safe — there is no `0` that would be
    // silently treated as "missing" and no negative ID that would slip past
    // a truthy guard.
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

    let finalCommunityId: string | null = sanitizedCommunityId;

    // Handle community leader role - auto-create community if needed.
    // Uses sanitized FK values so non-lider_comunidad roles can never enter
    // this branch even with a stray communityId in the body.
    if (roleType === 'lider_comunidad' && schoolId && !sanitizedCommunityId) {
      console.log('[assign-role API] Creating community for leader role:', {
        targetUserId,
        schoolId,
        generationId: communityAutoCreateGenerationId
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

      // Validate generation requirement. lider_comunidad keeps
      // user_roles.generation_id null (only lider_generacion owns that column),
      // so this branch reads communityAutoCreateGenerationId instead — that
      // variable carries the request generationId for the auto-create flow
      // when the school is generation-based.
      if (schoolHasGenerations && !communityAutoCreateGenerationId) {
        return res.status(400).json({
          error: `La escuela "${schoolData.name}" utiliza generaciones. Debe seleccionar una generación para crear la comunidad.`
        });
      }

      // Validate generation_id exists if provided
      if (communityAutoCreateGenerationId) {
        const { data: generationData, error: generationError } = await supabaseService
          .from('generations')
          .select('id, name')
          .eq('id', communityAutoCreateGenerationId)
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
        generation_id: communityAutoCreateGenerationId
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

    // NOTE: Do not null schoolId for non-school-scoped roles here. The
    // codebase semantics (see lib/utils/session-policy.ts:31) treat
    // `consultor.school_id IS NULL` as GLOBAL consultor access. Nulling
    // schoolId for a scoped consultor assignment would silently grant
    // global access — a privilege escalation. The admin path must preserve
    // the caller's schoolId verbatim. The ED branch above already enforces
    // its own normalization for non-school-scoped roles (defense-in-depth)
    // and the ED_ASSIGNABLE_ROLES gate prevents ED from ever reaching this
    // point with a non-school-scoped role anyway.
    //
    // Verified `community_manager` and `supervisor_de_red` do NOT use
    // null-vs-non-null school_id as a scope signal (per grep on
    // 2026-05-12): community_manager scopes via `community_id`
    // (utils/workspaceUtils.ts:114) and supervisor_de_red scopes via
    // `red_id` / `network_id` (utils/roleUtils.ts:1037, 1063;
    // utils/reportFilters.ts:44, 144). Only `consultor` uses the
    // null-vs-non-null school_id distinction, so preserving the caller's
    // schoolId is safe for all non-school-scoped roles on the admin path.

    // Insert the role assignment. FK fields use sanitized values so stray
    // IDs on roles that don't own them (e.g. docente with a body communityId)
    // are written as null rather than leaking onto the user_roles row.
    const roleInsertData = {
      user_id: targetUserId,
      role_type: roleType,
      school_id: schoolId ?? null,
      generation_id: sanitizedGenerationId,
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

    // Mirror the audit-logging pattern used by delete-user.ts /
    // reset-password.ts / update-user.ts. Role grants are sensitive policy
    // events — they need an audit trail for forensic investigation,
    // especially of ED-initiated assignments.
    // Audit details should not depend on the user_roles insert's `.select()`
    // projection — that's a fragile coupling. If a future refactor narrows
    // the projection (or a test mock returns just `{ id }`), the audit row
    // would silently store `undefined` for these fields, defeating the
    // forensic-visibility goal. Source from the request-derived variables
    // already in scope at this point: schoolId (post-coercion + ED
    // normalization), finalCommunityId (after auto-create resolution),
    // sanitizedGenerationId (from the FK sanitization block).
    const auditDetails = {
      role_type: roleType,
      school_id: schoolId,
      community_id: finalCommunityId || null,
      generation_id: sanitizedGenerationId,
      requester_role: requesterRole,
      requester_user_id: requestingUser.id,
      timestamp: new Date().toISOString(),
    };

    try {
      const auditInsertResult = await supabaseService
        .from('audit_logs')
        .insert({
          user_id: requestingUser.id,
          action: 'role_assigned',
          table_name: 'user_roles',
          record_id: targetUserId,
          details: auditDetails,
        });

      if (auditInsertResult.error) {
        console.error('[assign-role] audit_logs insert failed', {
          target_user_id: targetUserId,
          role_type: roleType,
          requester_user_id: requestingUser.id,
          requester_role: requesterRole,
          error: auditInsertResult.error.message,
        });
      }
    } catch (auditErr) {
      // Don't fail the request — the role assignment is already committed.
      console.error('[assign-role] audit_logs insert threw', {
        target_user_id: targetUserId,
        requester_user_id: requestingUser.id,
        requester_role: requesterRole,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
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
