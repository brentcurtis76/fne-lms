import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { parseBulkUserData, type BulkUserData } from '../../../utils/bulkUserParser';
import { BulkImportOrganizationalScope } from '../../../types/bulk';
import { validatePassword } from '../../../utils/passwordGenerator';
import { passwordStore, generateSessionId } from '../../../lib/temporaryPasswordStore';
import { UserRoleType, validateRoleAssignment, ROLE_ORGANIZATIONAL_REQUIREMENTS } from '../../../types/roles';

// Create a function to get the Supabase admin client
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

/**
 * Result for each user creation attempt
 */
interface UserCreationResult {
  email: string;
  success: boolean;
  userId?: string;
  error?: string;
  // SECURITY: Removed password field - passwords should never be in API responses
  warnings?: string[];
}

/**
 * API response structure
 */
interface BulkCreateResponse {
  success: boolean;
  results: UserCreationResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  // Session ID for secure password retrieval
  sessionId?: string;
}

// Configuration constants
const MAX_CSV_SIZE = 1024 * 1024; // 1MB limit
const MAX_USERS_PER_IMPORT = 500; // Maximum users per import
const MAX_REQUESTS_PER_HOUR = 10; // Rate limit

// Simple in-memory rate limiter (should use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: Date }>();

/**
 * Create a community for a lider_comunidad role during bulk import
 * Follows the same pattern as assign-role.ts
 */
async function createCommunityForBulkLeader(
  supabaseAdmin: any,
  firstName: string,
  lastName: string,
  schoolId: number,
  generationId: string | undefined
): Promise<{ success: boolean; communityId?: string; error?: string }> {
  try {
    // Check if school requires generations
    const { data: schoolData, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('id, name, has_generations')
      .eq('id', schoolId)
      .single();

    if (schoolError || !schoolData) {
      console.error('[BULK-IMPORT] Failed to get school data:', { schoolError, schoolId });
      return { success: false, error: 'No se pudo encontrar información del colegio' };
    }

    const schoolHasGenerations = schoolData.has_generations === true;

    // Validate generation requirement
    if (schoolHasGenerations && !generationId) {
      return {
        success: false,
        error: `La escuela "${schoolData.name}" utiliza generaciones. Debe seleccionar una generación para crear la comunidad.`
      };
    }

    // Validate generation_id exists if provided
    if (generationId) {
      const { data: generationData, error: generationError } = await supabaseAdmin
        .from('generations')
        .select('id, name')
        .eq('id', generationId)
        .eq('school_id', schoolId)
        .single();

      if (generationError || !generationData) {
        return { success: false, error: 'La generación seleccionada no es válida para esta escuela' };
      }
    }

    const communityName = `Comunidad ${firstName || ''} ${lastName || ''}`.trim();

    console.log('[BULK-IMPORT] Creating community:', {
      communityName,
      schoolId,
      generationId
    });

    // Create the community
    const communityData = {
      name: communityName,
      school_id: schoolId,
      generation_id: generationId || null
    };

    const { data: newCommunity, error: communityError } = await supabaseAdmin
      .from('growth_communities')
      .insert(communityData)
      .select()
      .single();

    if (communityError) {
      console.error('[BULK-IMPORT] Error creating community:', {
        error: communityError,
        code: communityError.code,
        message: communityError.message,
        communityData
      });

      // Handle duplicate name - try to find existing community
      if (communityError.code === '23505') {
        const { data: existingCommunity } = await supabaseAdmin
          .from('growth_communities')
          .select('id')
          .eq('name', communityName)
          .eq('school_id', schoolId)
          .single();

        if (existingCommunity) {
          console.log('[BULK-IMPORT] Found existing community:', existingCommunity.id);
          return { success: true, communityId: existingCommunity.id };
        }
        return { success: false, error: `Ya existe una comunidad con el nombre "${communityName}"` };
      }

      // Foreign key constraint violation
      if (communityError.code === '23503') {
        return { success: false, error: 'Error de configuración: referencias inválidas en la base de datos' };
      }

      return { success: false, error: 'Error al crear la comunidad' };
    }

    console.log('[BULK-IMPORT] Community created successfully:', newCommunity.id);
    return { success: true, communityId: newCommunity.id };

  } catch (error: any) {
    console.error('[BULK-IMPORT] createCommunityForBulkLeader error:', error);
    return { success: false, error: 'Error inesperado al crear comunidad' };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BulkCreateResponse | { error: string }>
) {
  // SIMPLE TEST LOG to verify this code is running
  console.log('🚀 [BULK-IMPORT] API Handler started - NEW CODE VERSION', new Date().toISOString());
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log('❌ [BULK-IMPORT] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // SECURITY: Input size validation
    const csvData = req.body.csvData;
    if (!csvData || typeof csvData !== 'string') {
      return res.status(400).json({ error: 'CSV data is required' });
    }

    const csvSize = Buffer.byteLength(csvData, 'utf8');
    if (csvSize > MAX_CSV_SIZE) {
      return res.status(413).json({ 
        error: `El archivo CSV es demasiado grande (máximo ${MAX_CSV_SIZE / 1024 / 1024}MB)` 
      });
    }

    // SECURITY: Simple rate limiting (skip in test environment)
    if (process.env.NODE_ENV !== 'test') {
      const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string;
      const now = new Date();
      const rateLimitKey = `bulk-import-${clientIp}`;
      
      const rateLimit = rateLimitStore.get(rateLimitKey);
      if (rateLimit) {
        if (rateLimit.resetTime > now) {
          if (rateLimit.count >= MAX_REQUESTS_PER_HOUR) {
            return res.status(429).json({ 
              error: 'Demasiadas solicitudes. Por favor, intente más tarde.' 
            });
          }
          rateLimit.count++;
        } else {
          // Reset the counter
          rateLimitStore.set(rateLimitKey, {
            count: 1,
            resetTime: new Date(now.getTime() + 60 * 60 * 1000) // 1 hour
          });
        }
      } else {
        rateLimitStore.set(rateLimitKey, {
          count: 1,
          resetTime: new Date(now.getTime() + 60 * 60 * 1000)
        });
      }
    }
    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify the user making the request is an admin
    const token = authHeader.replace('Bearer ', '');
    
    // DETAILED AUTH DEBUGGING: Log incoming token details
    console.log('[BULK-IMPORT] AUTH DEBUG: Token extraction:', {
      authHeaderLength: authHeader.length,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + '...',
      timestamp: new Date().toISOString()
    });
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    // DETAILED AUTH DEBUGGING: Log user resolution
    console.log('[BULK-IMPORT] AUTH DEBUG: User resolution:', {
      authError: authError ? authError.message : null,
      userFound: !!user,
      userId: user?.id,
      userEmail: user?.email,
      userCreatedAt: user?.created_at,
      userAud: user?.aud,
      userRole: user?.role
    });
    
    if (authError || !user) {
      console.error('[BULK-IMPORT] AUTH FAILURE:', { authError: authError?.message, hasUser: !!user });
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    // DETAILED AUTH DEBUGGING: Log role query parameters
    console.log('[BULK-IMPORT] ROLE QUERY DEBUG: Query parameters:', {
      queryUserId: user.id,
      userIdType: typeof user.id,
      userIdLength: user.id?.length,
      expectedUserId: '4ae17b21-8977-425c-b05a-ca7cdb8b9df5', // Your known admin ID
      userIdMatch: user.id === '4ae17b21-8977-425c-b05a-ca7cdb8b9df5',
      supabaseClientConfigured: !!supabaseAdmin,
      queryFilters: {
        user_id: user.id,
        role_type: 'admin',
        is_active: true
      }
    });

    // Check if the user is an admin using the proper role system
    const { data: userRoles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role_type, is_active, user_id, school_id, community_id, assigned_at')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);

    // DETAILED AUTH DEBUGGING: Log role query results
    console.log('[BULK-IMPORT] ROLE QUERY DEBUG: Query results:', {
      roleError: roleError ? {
        message: roleError.message,
        code: roleError.code,
        details: roleError.details,
        hint: roleError.hint
      } : null,
      userRolesFound: !!userRoles,
      userRolesLength: userRoles?.length || 0,
      userRolesData: userRoles,
      querySuccess: !roleError && userRoles && userRoles.length > 0
    });

    // Also query ALL roles for this user for comparison
    const { data: allUserRoles, error: allRolesError } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id);

    console.log('[BULK-IMPORT] ROLE QUERY DEBUG: All user roles:', {
      allRolesError: allRolesError?.message,
      totalRoles: allUserRoles?.length || 0,
      allRoles: allUserRoles?.map(role => ({
        role_type: role.role_type,
        is_active: role.is_active,
        school_id: role.school_id,
        community_id: role.community_id,
        assigned_at: role.assigned_at
      }))
    });

    if (roleError || !userRoles || userRoles.length === 0) {
      console.error('[BULK-IMPORT] AUTHORIZATION DENIED:', {
        reason: roleError ? 'QUERY_ERROR' : 'NO_ADMIN_ROLES',
        userId: user.id,
        userEmail: user.email,
        roleError: roleError?.message,
        userRolesLength: userRoles?.length || 0,
        timestamp: new Date().toISOString()
      });
      return res.status(403).json({ error: 'Unauthorized. Only admins can bulk create users.' });
    }

    console.log('[BULK-IMPORT] AUTHORIZATION SUCCESS:', {
      userId: user.id,
      userEmail: user.email,
      adminRolesFound: userRoles.length,
      proceeding: 'to bulk import'
    });

    // Get request body (csvData already validated above)
    const { options } = req.body;

    // Parse the CSV data
    const parseResult = parseBulkUserData(csvData, options);
    
    // SECURITY: Check user limit
    if (parseResult.valid.length > MAX_USERS_PER_IMPORT) {
      return res.status(400).json({ 
        error: `Demasiados usuarios. Máximo ${MAX_USERS_PER_IMPORT} usuarios por importación.` 
      });
    }

    // If there are no valid users, return error
    if (parseResult.valid.length === 0) {
      return res.status(400).json({ 
        error: 'No valid users found in the provided data',
        success: false,
        results: parseResult.invalid.map(user => ({
          email: user.email,
          success: false,
          error: user.errors?.join(', ') || 'Invalid user data',
          warnings: user.warnings
        })),
        summary: {
          total: parseResult.summary.total,
          succeeded: 0,
          failed: parseResult.summary.total
        }
      });
    }

    // Generate session ID for password storage
    const sessionId = generateSessionId();
    
    // Process each valid user
    const results: UserCreationResult[] = [];
    let succeeded = 0;
    let failed = 0;

    // Get global password from options if provided
    const globalPassword = options?.globalPassword;

    // Process users SEQUENTIALLY to avoid Supabase Auth rate limits
    console.log('[BULK-IMPORT] Processing users sequentially to avoid rate limits...');

    for (let i = 0; i < parseResult.valid.length; i++) {
      const userData = parseResult.valid[i];
      console.log(`[BULK-IMPORT] Creating user ${i + 1}/${parseResult.valid.length}: ${userData.email}`);

      const result = await createUser(userData, supabaseAdmin, sessionId, user.id, globalPassword);
      results.push(result);
      
      if (result.success) {
        succeeded++;
        console.log(`[BULK-IMPORT] ✅ User ${i + 1} created successfully: ${userData.email}`);
      } else {
        failed++;
        console.log(`[BULK-IMPORT] ❌ User ${i + 1} failed: ${userData.email} - ${result.error}`);
      }
      
      // Add small delay between users to prevent rate limiting
      if (i < parseResult.valid.length - 1) {
        console.log('[BULK-IMPORT] Waiting 1 second before next user...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Add invalid users to results
    for (const invalidUser of parseResult.invalid) {
      results.push({
        email: invalidUser.email,
        success: false,
        error: invalidUser.errors?.join(', ') || 'Invalid user data',
        warnings: invalidUser.warnings
      });
      failed++;
    }

    // Refresh user roles cache after all users are processed
    if (succeeded > 0) {
      console.log('[BULK-IMPORT] Refreshing user roles cache...');
      const { error: cacheRefreshError } = await supabaseAdmin.rpc('refresh_user_roles_cache');
      if (cacheRefreshError) {
        console.error('[BULK-IMPORT] Failed to refresh user_roles_cache:', cacheRefreshError);
        // Don't fail the whole import, just log the error
      } else {
        console.log('[BULK-IMPORT] User roles cache refreshed successfully');
      }
    }

    // Return results with session ID for secure password retrieval
    return res.status(200).json({
      success: failed === 0,
      results,
      summary: {
        total: results.length,
        succeeded,
        failed
      },
      // Only include sessionId if there were successful imports
      sessionId: succeeded > 0 ? sessionId : undefined
    });

  } catch (error: any) {
    // ENHANCED DIAGNOSTICS: Comprehensive top-level error logging
    console.error('[BULK-IMPORT] Top-level handler error:', {
      timestamp: new Date().toISOString(),
      errorType: error.name || 'UnknownError',
      errorMessage: error.message,
      errorCode: error.code,
      requestSize: req.body?.csvData?.length || 0,
      userCount: req.body?.csvData ? req.body.csvData.split('\n').length - 1 : 0,
      stackTrace: error.stack?.split('\n').slice(0, 5), // First 5 lines for context
      // System context
      nodeEnv: process.env.NODE_ENV,
      supabaseConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
    });
    
    // SECURITY: Return generic error message but log specific categories
    let errorCategory = 'unknown';
    if (error.message?.includes('CSV') || error.message?.includes('parse')) {
      errorCategory = 'csv_parsing';
    } else if (error.message?.includes('auth') || error.message?.includes('token')) {
      errorCategory = 'authentication';
    } else if (error.message?.includes('supabase') || error.message?.includes('database')) {
      errorCategory = 'database_connection';
    } else if (error.message?.includes('timeout')) {
      errorCategory = 'timeout';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorCategory = 'network';
    }
    
    console.warn(`[BULK-IMPORT] Top-level error category: ${errorCategory}`);
    
    return res.status(500).json({ 
      error: 'Error interno del servidor. Por favor, intente más tarde.' 
    });
  }
}

/**
 * Create a single user with role assignment
 */
async function createUser(
  userData: BulkUserData,
  supabaseAdmin: any,
  sessionId: string,
  adminUserId: string,
  globalPassword?: string
): Promise<UserCreationResult> {
  try {
    const roleType = (userData.role || 'docente') as UserRoleType;
    const schoolId = typeof userData.school_id === 'string'
      ? parseInt(userData.school_id, 10)
      : userData.school_id;
    const generationId = userData.generation_id;
    const communityId = userData.community_id;

    console.log(`[BULK-IMPORT] Creating user ${userData.email} with organizational scope:`, {
      roleType,
      schoolId,
      generationId,
      communityId
    });

    // --- Step 1: Validate role organizational requirements ---
    const organizationalScope = {
      schoolId: schoolId ? String(schoolId) : null,
      generationId: generationId || null,
      communityId: communityId || null
    };

    const roleValidation = validateRoleAssignment(roleType, organizationalScope);
    if (!roleValidation.isValid) {
      console.log(`[BULK-IMPORT] Role validation failed for ${userData.email}:`, roleValidation.error);
      return {
        email: userData.email,
        success: false,
        error: roleValidation.error || 'Error de validación de rol',
        warnings: userData.warnings
      };
    }

    // --- Step 2: Handle lider_comunidad auto-community creation ---
    let finalCommunityId = communityId;
    if (roleType === 'lider_comunidad' && schoolId && !communityId) {
      console.log(`[BULK-IMPORT] Creating auto-community for lider_comunidad: ${userData.email}`);

      const communityResult = await createCommunityForBulkLeader(
        supabaseAdmin,
        userData.firstName || '',
        userData.lastName || '',
        schoolId,
        generationId
      );

      if (!communityResult.success) {
        return {
          email: userData.email,
          success: false,
          error: communityResult.error || 'Error al crear comunidad automática',
          warnings: userData.warnings
        };
      }

      finalCommunityId = communityResult.communityId;
      console.log(`[BULK-IMPORT] Auto-community created: ${finalCommunityId}`);
    }

    // --- Step 3: Determine password ---
    // Priority: globalPassword > userData.password > generated default
    let finalPassword = globalPassword || userData.password;
    if (!finalPassword || finalPassword.length < 8) {
      finalPassword = 'FnePassword123!'; // Default password meeting all requirements
    }

    const passwordValidation = validatePassword(finalPassword);
    if (!passwordValidation.valid) {
      return {
        email: userData.email,
        success: false,
        error: 'La contraseña no cumple con los requisitos',
        warnings: userData.warnings
      };
    }

    // --- Step 4: Create auth user ---
    const createUserParams = {
      email: userData.email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: {
        first_name: userData.firstName || null,
        last_name: userData.lastName || null,
        role: roleType
      }
    };

    console.log(`[BULK-IMPORT] Creating auth user for ${userData.email}`);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser(createUserParams);

    if (createError) {
      console.log(`[BULK-IMPORT] Auth creation error for ${userData.email}:`, {
        errorMessage: createError.message,
        errorCode: createError.code
      });

      if (createError.message?.includes('already registered') ||
          createError.message?.includes('duplicate key')) {
        return {
          email: userData.email,
          success: false,
          error: 'Este email ya está registrado',
          warnings: userData.warnings
        };
      }
      throw createError;
    }

    if (!newUser.user) {
      throw new Error('User creation failed - no user returned');
    }

    const userId = newUser.user.id;

    // --- Step 5: Create profile with dynamic school_id ---
    const profileData = {
      id: userId,
      email: userData.email,
      first_name: userData.firstName || null,
      last_name: userData.lastName || null,
      name: userData.firstName && userData.lastName
        ? `${userData.firstName} ${userData.lastName}`
        : null,
      school_id: schoolId || null,
      approval_status: 'approved',
      must_change_password: true
    };

    console.log(`[BULK-IMPORT] Creating profile for ${userData.email} with school_id: ${schoolId}`);

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingProfile) {
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(profileData)
        .eq('id', userId);

      if (updateError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw updateError;
      }
    } else {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert(profileData);

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw profileError;
      }
    }

    // --- Step 6: Create user_roles entry ---
    const roleInsertData = {
      user_id: userId,
      role_type: roleType,
      school_id: schoolId || null,
      generation_id: generationId || null,
      community_id: finalCommunityId || null,
      is_active: true,
      assigned_by: adminUserId,
      assigned_at: new Date().toISOString()
    };

    console.log(`[BULK-IMPORT] Creating user_roles entry for ${userData.email}:`, roleInsertData);

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert(roleInsertData);

    if (roleError) {
      console.error(`[BULK-IMPORT] Error creating user_roles for ${userData.email}:`, {
        error: roleError,
        code: roleError.code,
        message: roleError.message
      });

      // Handle specific errors
      if (roleError.code === '23505') {
        // Duplicate role - this is okay, log warning and continue
        console.warn(`[BULK-IMPORT] Duplicate role entry for ${userData.email}, continuing...`);
      } else if (roleError.code === '23503') {
        // FK violation - this is critical, clean up
        console.error(`[BULK-IMPORT] FK violation for ${userData.email}, cleaning up...`);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return {
          email: userData.email,
          success: false,
          error: 'Error de configuración: referencias organizacionales inválidas',
          warnings: userData.warnings
        };
      } else {
        // Other errors - log but continue (user and profile were created)
        console.warn(`[BULK-IMPORT] Non-critical role error for ${userData.email}:`, roleError.message);
      }
    }

    // --- Step 7: Update profile with school name for backward compatibility ---
    if (schoolId) {
      const { data: schoolData } = await supabaseAdmin
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .single();

      if (schoolData?.name) {
        await supabaseAdmin
          .from('profiles')
          .update({ school: schoolData.name })
          .eq('id', userId);
      }
    }

    // --- Step 8: Log to audit_logs ---
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'bulk_user_created',
        details: {
          created_by: adminUserId,
          email: userData.email,
          role: roleType,
          school_id: schoolId,
          generation_id: generationId,
          community_id: finalCommunityId,
          bulk_import_session: sessionId
        }
      });

    // --- Step 9: Store password securely ---
    if (finalPassword) {
      passwordStore.store(sessionId, userData.email, finalPassword);
    }

    console.log(`[BULK-IMPORT] Successfully created user ${userData.email} with role ${roleType}`);

    return {
      email: userData.email,
      success: true,
      userId: userId,
      warnings: userData.warnings
    };

  } catch (error: any) {
    console.error(`[BULK-IMPORT] User creation failed:`, {
      email: userData.email,
      timestamp: new Date().toISOString(),
      errorType: error.name || 'UnknownError',
      errorMessage: error.message,
      errorCode: error.code,
      stackTrace: error.stack?.split('\n').slice(0, 3)
    });

    // Sanitized error messages
    let sanitizedError = 'Error al crear usuario';

    if (error.message?.includes('already registered') ||
        error.message?.includes('duplicate key') ||
        error.code === '23505') {
      sanitizedError = 'Este email ya está registrado';
    } else if (error.message?.includes('Invalid email') ||
               error.message?.includes('email')) {
      sanitizedError = 'Email inválido';
    } else if (error.message?.includes('password')) {
      sanitizedError = 'La contraseña no cumple con los requisitos';
    } else if (error.code === '23503') {
      sanitizedError = 'Error de configuración de datos (clave foránea)';
    } else if (error.code === '42501' || error.message?.includes('permission')) {
      sanitizedError = 'Error de permisos del sistema';
    } else if (error.message?.includes('timeout') || error.message?.includes('network')) {
      sanitizedError = 'Error de conexión - intente nuevamente';
    } else if (error.message?.includes('rate limit') || error.message?.includes('too many')) {
      sanitizedError = 'Demasiadas solicitudes - espere un momento';
    }

    return {
      email: userData.email,
      success: false,
      error: sanitizedError,
      warnings: userData.warnings
    };
  }
}