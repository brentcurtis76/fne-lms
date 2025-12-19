/**
 * API Error Handler
 *
 * Centralized error handling for API routes.
 * Sanitizes errors to prevent information leakage while providing useful feedback.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// ============================================
// Types
// ============================================

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: string;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: string;
}

// ============================================
// Error Codes
// ============================================

export const ErrorCodes = {
  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  ROLE_REQUIRED: 'ROLE_REQUIRED',

  // Client errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_ID: 'INVALID_ID',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // Conflict errors (409)
  CONFLICT: 'CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // Rate limiting (429)
  RATE_LIMITED: 'RATE_LIMITED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Method errors (405)
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
} as const;

// ============================================
// Error Messages (Spanish)
// ============================================

const ErrorMessages: Record<string, string> = {
  // Authentication
  [ErrorCodes.UNAUTHORIZED]: 'No autorizado',
  [ErrorCodes.SESSION_EXPIRED]: 'La sesión ha expirado. Por favor, inicie sesión nuevamente.',
  [ErrorCodes.INVALID_TOKEN]: 'Token de autenticación inválido',

  // Authorization
  [ErrorCodes.FORBIDDEN]: 'No tiene permisos para realizar esta acción',
  [ErrorCodes.INSUFFICIENT_PERMISSIONS]: 'Permisos insuficientes',
  [ErrorCodes.ROLE_REQUIRED]: 'Se requiere un rol específico para esta acción',

  // Client errors
  [ErrorCodes.VALIDATION_ERROR]: 'Error de validación en los datos enviados',
  [ErrorCodes.INVALID_INPUT]: 'Datos de entrada inválidos',
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 'Faltan campos requeridos',
  [ErrorCodes.INVALID_ID]: 'ID inválido',

  // Not found
  [ErrorCodes.NOT_FOUND]: 'Recurso no encontrado',
  [ErrorCodes.USER_NOT_FOUND]: 'Usuario no encontrado',
  [ErrorCodes.RESOURCE_NOT_FOUND]: 'El recurso solicitado no existe',

  // Conflict
  [ErrorCodes.CONFLICT]: 'Conflicto con el estado actual del recurso',
  [ErrorCodes.DUPLICATE_ENTRY]: 'Ya existe un registro con estos datos',
  [ErrorCodes.ALREADY_EXISTS]: 'El recurso ya existe',

  // Rate limiting
  [ErrorCodes.RATE_LIMITED]: 'Demasiadas solicitudes. Por favor, intente de nuevo más tarde.',
  [ErrorCodes.TOO_MANY_REQUESTS]: 'Ha excedido el límite de solicitudes',

  // Server errors
  [ErrorCodes.INTERNAL_ERROR]: 'Error interno del servidor',
  [ErrorCodes.DATABASE_ERROR]: 'Error de base de datos',
  [ErrorCodes.EXTERNAL_SERVICE_ERROR]: 'Error en servicio externo',

  // Method
  [ErrorCodes.METHOD_NOT_ALLOWED]: 'Método no permitido',
};

// ============================================
// Sensitive Data Patterns
// ============================================

/**
 * Patterns that should be redacted from error messages
 */
const sensitivePatterns = [
  /password/gi,
  /secret/gi,
  /token/gi,
  /api[_-]?key/gi,
  /authorization/gi,
  /bearer\s+[\w-]+/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, // Credit card numbers
  /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, // JWT tokens
  /supabase[_-]?service[_-]?role[_-]?key/gi,
  /service[_-]?role/gi,
];

/**
 * Database error codes that should be mapped to user-friendly messages
 */
const dbErrorMap: Record<string, { code: string; message: string }> = {
  '23505': { code: ErrorCodes.DUPLICATE_ENTRY, message: 'Ya existe un registro con estos datos' },
  '23503': { code: ErrorCodes.INVALID_INPUT, message: 'Referencia inválida a otro recurso' },
  '23502': { code: ErrorCodes.MISSING_REQUIRED_FIELD, message: 'Faltan campos requeridos' },
  '22P02': { code: ErrorCodes.INVALID_INPUT, message: 'Formato de datos inválido' },
  '42P01': { code: ErrorCodes.INTERNAL_ERROR, message: 'Error de configuración del sistema' },
  'PGRST116': { code: ErrorCodes.NOT_FOUND, message: 'Recurso no encontrado' },
};

// ============================================
// Utility Functions
// ============================================

/**
 * Sanitize error message to remove sensitive information
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return 'Error desconocido';
  }

  let sanitized = message;

  // Remove sensitive patterns
  for (const pattern of sensitivePatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Remove stack traces
  sanitized = sanitized.replace(/at\s+[\w.<>]+\s+\([^)]+\)/g, '');
  sanitized = sanitized.replace(/\s+at\s+.+:\d+:\d+/g, '');

  // Remove file paths
  sanitized = sanitized.replace(/\/[\w/.]+\.(ts|js|tsx|jsx)/g, '[FILE]');

  // Trim excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Map database error to user-friendly error
 */
export function mapDatabaseError(error: any): ApiError {
  const code = error?.code || error?.message?.match(/^([A-Z0-9]+):/)?.[1];

  if (code && dbErrorMap[code]) {
    return {
      code: dbErrorMap[code].code,
      message: dbErrorMap[code].message,
      statusCode: 400,
    };
  }

  // Check for specific error patterns
  if (error?.message?.includes('duplicate key')) {
    return {
      code: ErrorCodes.DUPLICATE_ENTRY,
      message: 'Ya existe un registro con estos datos',
      statusCode: 409,
    };
  }

  if (error?.message?.includes('violates foreign key')) {
    return {
      code: ErrorCodes.INVALID_INPUT,
      message: 'Referencia inválida a otro recurso',
      statusCode: 400,
    };
  }

  if (error?.message?.includes('not found') || error?.message?.includes('no rows')) {
    return {
      code: ErrorCodes.NOT_FOUND,
      message: 'Recurso no encontrado',
      statusCode: 404,
    };
  }

  // Default database error
  return {
    code: ErrorCodes.DATABASE_ERROR,
    message: 'Error al procesar la solicitud',
    statusCode: 500,
  };
}

/**
 * Create a standardized API error
 */
export function createApiError(
  code: keyof typeof ErrorCodes,
  customMessage?: string,
  statusCode?: number
): ApiError {
  const errorCode = ErrorCodes[code];
  return {
    code: errorCode,
    message: customMessage || ErrorMessages[errorCode] || 'Error desconocido',
    statusCode: statusCode || getStatusCodeForError(errorCode),
  };
}

/**
 * Get HTTP status code for an error code
 */
function getStatusCodeForError(code: string): number {
  if (code.includes('UNAUTHORIZED') || code.includes('SESSION') || code.includes('TOKEN')) {
    return 401;
  }
  if (code.includes('FORBIDDEN') || code.includes('PERMISSION') || code.includes('ROLE')) {
    return 403;
  }
  if (code.includes('NOT_FOUND')) {
    return 404;
  }
  if (code.includes('METHOD')) {
    return 405;
  }
  if (code.includes('CONFLICT') || code.includes('DUPLICATE') || code.includes('EXISTS')) {
    return 409;
  }
  if (code.includes('RATE') || code.includes('TOO_MANY')) {
    return 429;
  }
  if (code.includes('VALIDATION') || code.includes('INVALID') || code.includes('MISSING')) {
    return 400;
  }
  return 500;
}

// ============================================
// Main Handler
// ============================================

/**
 * Handle API errors consistently
 * Use this in catch blocks to return sanitized error responses
 */
export function handleApiError(
  error: unknown,
  res: NextApiResponse,
  context?: string
): void {
  // Log the full error for debugging (server-side only)
  console.error(`[API Error]${context ? ` [${context}]` : ''}:`, {
    error,
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  });

  // Determine error type and create appropriate response
  let apiError: ApiError;

  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('Unauthorized') || error.message.includes('No autorizado')) {
      apiError = createApiError('UNAUTHORIZED');
    } else if (error.message.includes('not found') || error.message.includes('no encontrado')) {
      apiError = createApiError('NOT_FOUND');
    } else if ('code' in error) {
      // Database error
      apiError = mapDatabaseError(error);
    } else {
      // Generic error
      apiError = {
        code: ErrorCodes.INTERNAL_ERROR,
        message: sanitizeErrorMessage(error.message),
        statusCode: 500,
      };
    }
  } else if (typeof error === 'object' && error !== null) {
    // Handle Supabase/Postgres errors
    apiError = mapDatabaseError(error);
  } else {
    // Unknown error type
    apiError = createApiError('INTERNAL_ERROR');
  }

  // Build response
  const response: ApiErrorResponse = {
    error: apiError.message,
    code: apiError.code,
  };

  // Only include details in development
  if (process.env.NODE_ENV === 'development' && error instanceof Error) {
    response.details = sanitizeErrorMessage(error.message);
  }

  res.status(apiError.statusCode).json(response);
}

/**
 * Wrapper for API handlers with automatic error handling
 */
export function withErrorHandler(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  context?: string
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      handleApiError(error, res, context);
    }
  };
}

/**
 * Send a standardized error response
 */
export function sendError(
  res: NextApiResponse,
  code: keyof typeof ErrorCodes,
  customMessage?: string
): void {
  const error = createApiError(code, customMessage);
  res.status(error.statusCode).json({
    error: error.message,
    code: error.code,
  });
}

/**
 * Send a validation error response
 */
export function sendValidationError(
  res: NextApiResponse,
  details: string
): void {
  res.status(400).json({
    error: 'Datos de entrada inválidos',
    code: ErrorCodes.VALIDATION_ERROR,
    details: sanitizeErrorMessage(details),
  });
}

export default {
  ErrorCodes,
  handleApiError,
  withErrorHandler,
  sendError,
  sendValidationError,
  createApiError,
  sanitizeErrorMessage,
  mapDatabaseError,
};
