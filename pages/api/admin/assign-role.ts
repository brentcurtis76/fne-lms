import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { UserRoleType, validateRoleAssignment } from '../../../types/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    // Get the user's session using the auth helper
    const supabaseClient = createServerSupabaseClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    
    if (sessionError || !session) {
      console.error('[assign-role API] Session error:', sessionError);
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
      console.error('[assign-role API] Admin check failed:', { adminError, adminCheck, currentUserId });
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
    const validRoles: UserRoleType[] = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'community_manager', 'docente'];
    if (!validRoles.includes(roleType)) {
      return res.status(400).json({ error: 'Invalid role type' });
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
      assigned_by: currentUserId,
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