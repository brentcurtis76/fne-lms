/**
 * Enhanced Supabase Client with RLS Error Handling
 * Provides better error handling and retry logic for RLS policy violations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create the base client
const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    headers: {
      'x-client-info': 'fne-lms-enhanced'
    }
  }
});

// Error types
export enum SupabaseErrorType {
  RLS_VIOLATION = 'RLS_VIOLATION',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN'
}

export interface EnhancedError {
  type: SupabaseErrorType;
  message: string;
  originalError: any;
  retryable: boolean;
}

// Analyze error and categorize it
function analyzeError(error: any): EnhancedError {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  const errorCode = error?.code || '';
  
  // RLS policy violation
  if (errorCode === '42501' || errorMessage.includes('policy') || errorMessage.includes('permission')) {
    return {
      type: SupabaseErrorType.RLS_VIOLATION,
      message: 'No tienes permisos para realizar esta acción',
      originalError: error,
      retryable: false
    };
  }
  
  // Session expired
  if (errorCode === 'PGRST301' || errorMessage.includes('JWT') || errorMessage.includes('token')) {
    return {
      type: SupabaseErrorType.SESSION_EXPIRED,
      message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente',
      originalError: error,
      retryable: true
    };
  }
  
  // Network error
  if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
    return {
      type: SupabaseErrorType.NETWORK_ERROR,
      message: 'Error de conexión. Por favor, verifica tu conexión a internet',
      originalError: error,
      retryable: true
    };
  }
  
  return {
    type: SupabaseErrorType.UNKNOWN,
    message: errorMessage,
    originalError: error,
    retryable: false
  };
}

// Enhanced query builder that handles RLS errors
export class EnhancedSupabaseClient {
  private client: SupabaseClient<Database>;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  // Wrapper for database queries with retry logic
  async query<T>(
    queryFn: (client: SupabaseClient<Database>) => Promise<{ data: T | null; error: any }>,
    options?: {
      maxRetries?: number;
      onRetry?: (attempt: number, error: EnhancedError) => void;
      fallbackValue?: T;
    }
  ): Promise<{ data: T | null; error: EnhancedError | null }> {
    const maxRetries = options?.maxRetries ?? this.maxRetries;
    let lastError: EnhancedError | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // If this is a retry, refresh the session first
        if (attempt > 0 && lastError?.type === SupabaseErrorType.SESSION_EXPIRED) {
          const { error: refreshError } = await this.client.auth.refreshSession();
          if (refreshError) {
            console.error('Failed to refresh session:', refreshError);
          }
        }
        
        const { data, error } = await queryFn(this.client);
        
        if (error) {
          lastError = analyzeError(error);
          
          // Don't retry if it's an RLS violation
          if (!lastError.retryable || attempt === maxRetries) {
            return { 
              data: options?.fallbackValue ?? null, 
              error: lastError 
            };
          }
          
          // Call retry callback if provided
          if (options?.onRetry) {
            options.onRetry(attempt + 1, lastError);
          }
          
          // Wait before retrying
          await new Promise(resolve => 
            setTimeout(resolve, this.retryDelay * (attempt + 1))
          );
        } else {
          return { data, error: null };
        }
      } catch (error) {
        lastError = analyzeError(error);
        
        if (!lastError.retryable || attempt === maxRetries) {
          return { 
            data: options?.fallbackValue ?? null, 
            error: lastError 
          };
        }
        
        await new Promise(resolve => 
          setTimeout(resolve, this.retryDelay * (attempt + 1))
        );
      }
    }
    
    return { 
      data: options?.fallbackValue ?? null, 
      error: lastError 
    };
  }

  // Batch operations with transaction-like behavior
  async batchOperation<T>(
    operations: Array<(client: SupabaseClient<Database>) => Promise<any>>,
    options?: {
      stopOnError?: boolean;
      rollbackOnError?: boolean;
    }
  ): Promise<{ results: any[]; errors: EnhancedError[] }> {
    const results: any[] = [];
    const errors: EnhancedError[] = [];
    const stopOnError = options?.stopOnError ?? true;
    
    for (const operation of operations) {
      const { data, error } = await this.query(() => operation(this.client));
      
      if (error) {
        errors.push(error);
        if (stopOnError) {
          break;
        }
      } else {
        results.push(data);
      }
    }
    
    // If rollback is requested and there were errors, attempt to rollback
    if (options?.rollbackOnError && errors.length > 0) {
      console.warn('Batch operation failed, rollback not implemented in Supabase');
    }
    
    return { results, errors };
  }

  // Get the underlying client for direct access
  get raw() {
    return this.client;
  }

  // Auth shortcuts with enhanced error handling
  get auth() {
    return {
      ...this.client.auth,
      getSessionWithRetry: async () => {
        return this.query(
          async (client) => {
            const { data, error } = await client.auth.getSession();
            return { data: data?.session ?? null, error };
          },
          { maxRetries: 3 }
        );
      },
      refreshSessionWithRetry: async () => {
        return this.query(
          async (client) => {
            const { data, error } = await client.auth.refreshSession();
            return { data: data?.session ?? null, error };
          },
          { maxRetries: 3 }
        );
      }
    };
  }

  // Storage shortcuts with enhanced error handling
  get storage() {
    return {
      ...this.client.storage,
      uploadWithRetry: async (
        bucket: string,
        path: string,
        file: File,
        options?: any
      ) => {
        return this.query(
          async (client) => {
            return client.storage.from(bucket).upload(path, file, options);
          },
          { maxRetries: 3 }
        );
      }
    };
  }
}

// Create enhanced client instance
export const supabaseEnhanced = new EnhancedSupabaseClient(supabaseClient);

// Export the base client for backward compatibility
export const supabase = supabaseClient;

// Helper function to handle RLS errors in API routes
export async function withRLSErrorHandling<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  fallbackResponse?: T
): Promise<{ data: T | null; error: any; enhancedError?: EnhancedError }> {
  try {
    const { data, error } = await operation();
    
    if (error) {
      const enhancedError = analyzeError(error);
      return {
        data: fallbackResponse ?? null,
        error,
        enhancedError
      };
    }
    
    return { data, error: null };
  } catch (error) {
    const enhancedError = analyzeError(error);
    return {
      data: fallbackResponse ?? null,
      error,
      enhancedError
    };
  }
}

// Middleware for API routes to check authentication
export async function requireAuth(
  req: any,
  res: any,
  next: () => void
) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({
      error: 'No se proporcionó token de autenticación'
    });
  }
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({
        error: 'Token inválido o expirado'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'Error al verificar autenticación'
    });
  }
}