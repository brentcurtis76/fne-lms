import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  AuthResult, 
  AdminAuthResult, 
  HttpStatus, 
  ErrorMessages,
  ApiError,
  ApiSuccess
} from './types/api-auth.types';
import { hasAdminPrivileges, extractRolesFromMetadata } from '../utils/roleUtils';

// Create a consistent Supabase client for API routes
export async function createApiSupabaseClient(
  req: NextApiRequest, 
  res: NextApiResponse
): Promise<SupabaseClient> {
  try {
    // Use auth-helpers to create a client that respects the user's session
    const client = createServerSupabaseClient({ req, res });
    return client;
  } catch (error) {
    console.error('[API Auth] Failed to create Supabase client:', error);
    throw new Error('Failed to initialize database connection');
  }
}

// Create a service role client for admin operations
// This should only be used when absolutely necessary
export function createServiceRoleClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[API Auth] Missing Supabase environment variables');
    throw new Error('Server configuration error');
  }

  try {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  } catch (error) {
    console.error('[API Auth] Failed to create service role client:', error);
    throw new Error('Failed to initialize admin connection');
  }
}

// Verify the user's session in API routes
export async function getApiUser(
  req: NextApiRequest, 
  res: NextApiResponse
): Promise<AuthResult> {
  try {
    // Check for Bearer token in Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      
      // Use service role client to verify the token
      const serviceClient = createServiceRoleClient();
      const { data: { user }, error } = await serviceClient.auth.getUser(token);
      
      if (error || !user) {
        console.error('[API Auth] Bearer token validation failed:', error);
        return { user: null, error: error || new Error('Invalid token') };
      }
      
      console.log('[API Auth] User authenticated via Bearer token:', {
        userId: user.id,
        email: user.email?.split('@')[0] + '@***'
      });
      
      return { user, error: null };
    }
    
    // Fall back to cookie-based auth
    const supabase = await createApiSupabaseClient(req, res);
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[API Auth] Session error:', error);
      return { user: null, error };
    }
    
    if (!session) {
      return { user: null, error: new Error('No active session') };
    }
    
    const metadataRoles = extractRolesFromMetadata(session.user.user_metadata);

    // Log successful auth (without sensitive data)
    console.log('[API Auth] User authenticated via session:', {
      userId: session.user.id,
      email: session.user.email?.split('@')[0] + '@***',
      roles: metadataRoles
    });

    return { user: session.user, error: null };
  } catch (error) {
    console.error('[API Auth] Unexpected error:', error);
    return { 
      user: null, 
      error: error instanceof Error ? error : new Error('Authentication failed') 
    };
  }
}

// Check if user is admin (using consistent pattern)
export async function checkIsAdmin(
  req: NextApiRequest, 
  res: NextApiResponse
): Promise<AdminAuthResult> {
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return { isAdmin: false, user: null, error };
  }
  
  try {
    // Use service role client for admin checks to bypass RLS
    // This ensures we can accurately check user_roles regardless of RLS policies
    const serviceClient = createServiceRoleClient();
    const isAdmin = await hasAdminPrivileges(serviceClient, user.id);

    if (isAdmin) {
      console.log(`[API Auth] Admin verified via RLS check for user: ${user.id}`);
    } else {
      console.log(`[API Auth] User is not an admin via RLS check: ${user.id}`);
    }

    return { isAdmin, user, error: null };

  } catch (error) {
    console.error('[API Auth] Admin check failed:', error);
    return { 
      isAdmin: false, 
      user, 
      error: error instanceof Error ? error : new Error('Admin verification failed') 
    };
  }
}

// Standard error response with logging
export function sendAuthError(
  res: NextApiResponse<ApiError>, 
  message: string = ErrorMessages.UNAUTHORIZED, 
  status: number = HttpStatus.UNAUTHORIZED,
  details?: string
): void {
  console.error(`[API Auth] Error ${status}: ${message}`, details || '');
  
  const errorResponse: ApiError = { error: message };
  if (details && process.env.NODE_ENV === 'development') {
    errorResponse.details = details;
  }
  
  res.status(status).json(errorResponse);
}

// Standard success response
export function sendApiResponse<T>(
  res: NextApiResponse<ApiSuccess<T>>, 
  data: T, 
  status: number = HttpStatus.OK,
  message?: string
): void {
  const response: ApiSuccess<T> = { data };
  if (message) {
    response.message = message;
  }
  
  res.status(status).json(response);
}

// Helper to handle method not allowed
export function handleMethodNotAllowed(
  res: NextApiResponse<ApiError>,
  allowedMethods: string[]
): void {
  res.setHeader('Allow', allowedMethods.join(', '));
  sendAuthError(
    res, 
    ErrorMessages.METHOD_NOT_ALLOWED, 
    HttpStatus.METHOD_NOT_ALLOWED,
    `Allowed methods: ${allowedMethods.join(', ')}`
  );
}

// Helper to validate request body
export function validateRequestBody<T>(
  body: any,
  requiredFields: (keyof T)[]
): { valid: boolean; missing: string[] } {
  const missing = requiredFields.filter(field => !body[field]);
  return {
    valid: missing.length === 0,
    missing: missing as string[]
  };
}

// Helper to log API requests (without sensitive data)
export function logApiRequest(
  req: NextApiRequest,
  context: string
): void {
  console.log(`[API] ${context}:`, {
    method: req.method,
    url: req.url,
    query: req.query,
    hasBody: !!req.body,
    userAgent: req.headers['user-agent']?.substring(0, 50),
    timestamp: new Date().toISOString()
  });
}
