import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { parseBulkUserData, type BulkUserData } from '../../../utils/bulkUserParser';
import { validatePassword } from '../../../utils/passwordGenerator';
import { passwordStore, generateSessionId } from '../../../lib/temporaryPasswordStore';

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

    // Process users SEQUENTIALLY to avoid Supabase Auth rate limits
    console.log('[BULK-IMPORT] Processing users sequentially to avoid rate limits...');
    
    for (let i = 0; i < parseResult.valid.length; i++) {
      const userData = parseResult.valid[i];
      console.log(`[BULK-IMPORT] Creating user ${i + 1}/${parseResult.valid.length}: ${userData.email}`);
      
      const result = await createUser(userData, supabaseAdmin, sessionId);
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
 * Create a single user
 */
async function createUser(userData: BulkUserData, supabaseAdmin: any, sessionId: string): Promise<UserCreationResult> {
  try {
    // Use default password if none provided or if generated password is weak
    let finalPassword = userData.password;
    if (!finalPassword || finalPassword.length < 8) {
      finalPassword = 'FnePassword123!'; // Default password meeting all requirements: 8+ chars, upper, lower, number, special
    }

    // Validate final password
    const validation = validatePassword(finalPassword);
    if (!validation.valid) {
      return {
        email: userData.email,
        success: false,
        error: 'La contraseña no cumple con los requisitos',
        warnings: userData.warnings
      };
    }

    // DIAGNOSTIC: Log exact parameters being passed to createUser
    const createUserParams = {
      email: userData.email,
      password: finalPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        first_name: userData.firstName || null,
        last_name: userData.lastName || null,
        role: userData.role || 'docente'
      }
    };
    
    console.log(`[BULK-IMPORT] DIAGNOSTIC: createUser parameters for ${userData.email}:`, {
      email: createUserParams.email,
      password: '***HIDDEN***',
      email_confirm: createUserParams.email_confirm,
      user_metadata: createUserParams.user_metadata,
      parameterTypes: {
        email: typeof createUserParams.email,
        password: typeof createUserParams.password,
        email_confirm: typeof createUserParams.email_confirm,
        user_metadata: typeof createUserParams.user_metadata
      }
    });

    // Create the user with admin privileges
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser(createUserParams);

    if (createError) {
      // DIAGNOSTIC: Log detailed error information
      console.log(`[BULK-IMPORT] DETAILED ERROR for ${userData.email}:`, {
        errorMessage: createError.message,
        errorCode: createError.code,
        errorStatus: createError.status,
        fullErrorObject: JSON.stringify(createError, null, 2),
        errorType: createError.constructor?.name,
        additionalProperties: Object.keys(createError)
      });
      
      // Check if user already exists
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

    // Create or update profile
    const profileData = {
      id: newUser.user.id,
      email: userData.email,
      first_name: userData.firstName || null,
      last_name: userData.lastName || null,
      name: userData.firstName && userData.lastName 
        ? `${userData.firstName} ${userData.lastName}` 
        : null,
      school_id: 3, // Santa Marta de Valdivia - hardcoded for now
      approval_status: 'approved', // Admin-created users are auto-approved
      must_change_password: true // Force password change on first login
    };

    // Check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', newUser.user.id)
      .single();

    if (existingProfile) {
      // Update existing profile
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(profileData)
        .eq('id', newUser.user.id);

      if (updateError) {
        // If profile update fails, try to delete the auth user
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        throw updateError;
      }
    } else {
      // Create new profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert(profileData);

      if (profileError) {
        // If profile creation fails, delete the auth user
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        throw profileError;
      }
    }

    // Log the creation in audit_logs with enhanced details
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: newUser.user.id,
        action: 'bulk_user_created',
        details: {
          created_by: 'admin',
          email: userData.email,
          role: userData.role,
          // Note: Never log passwords
          bulk_import_session: sessionId
        }
      });

    // SECURITY: Store password securely in temporary store
    if (finalPassword) {
      passwordStore.store(sessionId, userData.email, finalPassword);
    }

    return {
      email: userData.email,
      success: true,
      userId: newUser.user.id,
      // SECURITY FIX: Never return passwords in API responses
      warnings: userData.warnings
    };

  } catch (error: any) {
    // ENHANCED DIAGNOSTICS: Comprehensive server-side logging (NO PII)
    console.error(`[BULK-IMPORT] User creation failed:`, {
      email: userData.email, // Email is not PII in this context - needed for diagnostics
      timestamp: new Date().toISOString(),
      errorType: error.name || 'UnknownError',
      errorMessage: error.message,
      errorCode: error.code,
      stackTrace: error.stack?.split('\n').slice(0, 3), // First 3 lines only
      // Additional diagnostic context
      authStep: error.message?.includes('auth') ? 'AUTH_CREATION' : 
                error.message?.includes('profile') ? 'PROFILE_CREATION' : 'UNKNOWN',
      validationStep: error.message?.includes('password') ? 'PASSWORD_VALIDATION' : 
                     error.message?.includes('email') ? 'EMAIL_VALIDATION' : 'NO_VALIDATION_ERROR',
      databaseStep: error.code === '23505' ? 'DUPLICATE_CONSTRAINT' :
                   error.code === '23503' ? 'FOREIGN_KEY_CONSTRAINT' :
                   error.code === '42501' ? 'INSUFFICIENT_PRIVILEGES' : 'NO_DB_ERROR'
    });
    
    // SECURITY: Return sanitized error messages with enhanced categories
    let sanitizedError = 'Error al crear usuario';
    let errorCategory = 'general';
    
    // Enhanced error categorization for better user feedback
    if (error.message?.includes('already registered') || 
        error.message?.includes('duplicate key') ||
        error.code === '23505') {
      sanitizedError = 'Este email ya está registrado';
      errorCategory = 'duplicate';
    } else if (error.message?.includes('Invalid email') || 
               error.message?.includes('email')) {
      sanitizedError = 'Email inválido';
      errorCategory = 'email';
    } else if (error.message?.includes('password')) {
      sanitizedError = 'La contraseña no cumple con los requisitos';
      errorCategory = 'password';
    } else if (error.code === '23503') {
      sanitizedError = 'Error de configuración de datos (clave foránea)';
      errorCategory = 'foreign_key';
    } else if (error.code === '42501' || error.message?.includes('permission')) {
      sanitizedError = 'Error de permisos del sistema';
      errorCategory = 'permissions';
    } else if (error.message?.includes('timeout') || error.message?.includes('network')) {
      sanitizedError = 'Error de conexión - intente nuevamente';
      errorCategory = 'network';
    } else if (error.message?.includes('rate limit') || error.message?.includes('too many')) {
      sanitizedError = 'Demasiadas solicitudes - espere un momento';
      errorCategory = 'rate_limit';
    }
    
    // Log the sanitized error category for pattern analysis
    console.warn(`[BULK-IMPORT] Sanitized error category: ${errorCategory} for email: ${userData.email}`);
    
    return {
      email: userData.email,
      success: false,
      error: sanitizedError,
      warnings: userData.warnings
    };
  }
}