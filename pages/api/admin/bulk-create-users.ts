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
  // Only allow POST requests
  if (req.method !== 'POST') {
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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    // Check if the user is an admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized. Only admins can bulk create users.' });
    }

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

    // Process users in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < parseResult.valid.length; i += batchSize) {
      const batch = parseResult.valid.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (userData) => {
        return createUser(userData, supabaseAdmin, sessionId);
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
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
    // SECURITY: Log detailed error server-side only
    console.error('Error in bulk user creation:', {
      message: error.message,
      stack: error.stack
    });
    
    // SECURITY: Return generic error message
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
    // Validate password if provided
    if (userData.password) {
      const validation = validatePassword(userData.password);
      if (!validation.valid) {
        return {
          email: userData.email,
          success: false,
          error: 'La contraseña no cumple con los requisitos',
          warnings: userData.warnings
        };
      }
    }

    // Create the user with admin privileges
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        role: userData.role || 'docente'
      }
    });

    if (createError) {
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
      role: userData.role || 'docente',
      rut: userData.rut || null,
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
    if (userData.password) {
      passwordStore.store(sessionId, userData.email, userData.password);
    }

    return {
      email: userData.email,
      success: true,
      userId: newUser.user.id,
      // SECURITY FIX: Never return passwords in API responses
      warnings: userData.warnings
    };

  } catch (error: any) {
    // SECURITY: Log detailed error server-side only
    console.error(`Error creating user:`, {
      email: userData.email,
      error: error.message,
      code: error.code
    });
    
    // SECURITY: Return sanitized error messages
    let sanitizedError = 'Error al crear usuario';
    
    // Check for specific error types and return user-friendly messages
    if (error.message?.includes('already registered') || 
        error.message?.includes('duplicate key') ||
        error.code === '23505') {
      sanitizedError = 'Este email ya está registrado';
    } else if (error.message?.includes('Invalid email')) {
      sanitizedError = 'Email inválido';
    } else if (error.message?.includes('password')) {
      sanitizedError = 'La contraseña no cumple con los requisitos';
    }
    
    return {
      email: userData.email,
      success: false,
      error: sanitizedError,
      warnings: userData.warnings
    };
  }
}