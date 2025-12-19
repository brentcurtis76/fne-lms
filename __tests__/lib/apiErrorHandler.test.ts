/**
 * Unit tests for API Error Handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeErrorMessage,
  mapDatabaseError,
  createApiError,
  handleApiError,
  withErrorHandler,
  sendError,
  sendValidationError,
  ErrorCodes,
} from '../../lib/apiErrorHandler';
import { NextApiRequest, NextApiResponse } from 'next';

describe('apiErrorHandler', () => {
  describe('sanitizeErrorMessage', () => {
    it('should return "Error desconocido" for empty input', () => {
      expect(sanitizeErrorMessage('')).toBe('Error desconocido');
      expect(sanitizeErrorMessage(null as any)).toBe('Error desconocido');
      expect(sanitizeErrorMessage(undefined as any)).toBe('Error desconocido');
    });

    it('should redact passwords', () => {
      expect(sanitizeErrorMessage('Invalid password: abc123')).toContain('[REDACTED]');
      expect(sanitizeErrorMessage('password_hash mismatch')).toContain('[REDACTED]');
    });

    it('should redact secrets', () => {
      expect(sanitizeErrorMessage('API secret key expired')).toContain('[REDACTED]');
      expect(sanitizeErrorMessage('client_secret is missing')).toContain('[REDACTED]');
    });

    it('should redact tokens', () => {
      expect(sanitizeErrorMessage('Invalid token provided')).toContain('[REDACTED]');
      expect(sanitizeErrorMessage('access_token expired')).toContain('[REDACTED]');
    });

    it('should redact API keys', () => {
      expect(sanitizeErrorMessage('api_key invalid')).toContain('[REDACTED]');
      expect(sanitizeErrorMessage('API-KEY not found')).toContain('[REDACTED]');
    });

    it('should redact email addresses', () => {
      const result = sanitizeErrorMessage('User test@example.com not found');
      expect(result).not.toContain('test@example.com');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact credit card numbers', () => {
      expect(sanitizeErrorMessage('Card 4111-1111-1111-1111 declined')).toContain('[REDACTED]');
      expect(sanitizeErrorMessage('Card 4111111111111111 invalid')).toContain('[REDACTED]');
    });

    it('should redact JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      expect(sanitizeErrorMessage(`Invalid JWT: ${jwt}`)).not.toContain('eyJ');
    });

    it('should redact bearer tokens', () => {
      expect(sanitizeErrorMessage('Bearer abc123xyz-token')).toContain('[REDACTED]');
    });

    it('should redact service role key references', () => {
      expect(sanitizeErrorMessage('supabase_service_role_key expired')).toContain('[REDACTED]');
      expect(sanitizeErrorMessage('service_role access denied')).toContain('[REDACTED]');
    });

    it('should remove stack traces', () => {
      const stackTrace = 'Error at Object.<anonymous> (/app/index.js:10:15)';
      expect(sanitizeErrorMessage(stackTrace)).not.toContain('/app/index.js');
    });

    it('should remove file paths', () => {
      expect(sanitizeErrorMessage('Error in /home/user/app/src/index.ts')).toContain('[FILE]');
      expect(sanitizeErrorMessage('Failed at ./components/Auth.tsx:42')).toContain('[FILE]');
    });

    it('should trim excessive whitespace', () => {
      const result = sanitizeErrorMessage('Error   with    multiple   spaces');
      expect(result).toBe('Error with multiple spaces');
    });
  });

  describe('mapDatabaseError', () => {
    it('should map duplicate key error (23505)', () => {
      const error = { code: '23505', message: 'duplicate key value' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.DUPLICATE_ENTRY);
      expect(result.statusCode).toBe(400);
    });

    it('should map foreign key violation (23503)', () => {
      const error = { code: '23503', message: 'violates foreign key constraint' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.INVALID_INPUT);
      expect(result.statusCode).toBe(400);
    });

    it('should map not null violation (23502)', () => {
      const error = { code: '23502', message: 'null value not allowed' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.MISSING_REQUIRED_FIELD);
    });

    it('should map invalid format error (22P02)', () => {
      const error = { code: '22P02', message: 'invalid input syntax' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.INVALID_INPUT);
    });

    it('should map not found error (PGRST116)', () => {
      const error = { code: 'PGRST116', message: 'The result contains 0 rows' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.NOT_FOUND);
    });

    it('should detect duplicate key from message', () => {
      const error = { message: 'duplicate key value violates unique constraint' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.DUPLICATE_ENTRY);
      expect(result.statusCode).toBe(409);
    });

    it('should detect foreign key violation from message', () => {
      const error = { message: 'violates foreign key constraint' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.INVALID_INPUT);
    });

    it('should detect not found from message', () => {
      const error = { message: 'no rows returned' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.NOT_FOUND);
      expect(result.statusCode).toBe(404);
    });

    it('should return database error for unknown errors', () => {
      const error = { message: 'Something went wrong' };
      const result = mapDatabaseError(error);
      expect(result.code).toBe(ErrorCodes.DATABASE_ERROR);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('createApiError', () => {
    it('should create error with correct status codes', () => {
      expect(createApiError('UNAUTHORIZED').statusCode).toBe(401);
      expect(createApiError('FORBIDDEN').statusCode).toBe(403);
      expect(createApiError('NOT_FOUND').statusCode).toBe(404);
      expect(createApiError('METHOD_NOT_ALLOWED').statusCode).toBe(405);
      expect(createApiError('CONFLICT').statusCode).toBe(409);
      expect(createApiError('RATE_LIMITED').statusCode).toBe(429);
      expect(createApiError('VALIDATION_ERROR').statusCode).toBe(400);
      expect(createApiError('INTERNAL_ERROR').statusCode).toBe(500);
    });

    it('should use default Spanish error messages', () => {
      expect(createApiError('UNAUTHORIZED').message).toBe('No autorizado');
      expect(createApiError('NOT_FOUND').message).toBe('Recurso no encontrado');
      expect(createApiError('RATE_LIMITED').message).toBe(
        'Demasiadas solicitudes. Por favor, intente de nuevo más tarde.'
      );
    });

    it('should allow custom messages', () => {
      const error = createApiError('NOT_FOUND', 'Usuario no existe');
      expect(error.message).toBe('Usuario no existe');
    });

    it('should allow custom status codes', () => {
      const error = createApiError('VALIDATION_ERROR', undefined, 422);
      expect(error.statusCode).toBe(422);
    });
  });

  describe('handleApiError', () => {
    let mockRes: Partial<NextApiResponse>;
    let statusCode: number;
    let jsonBody: any;

    beforeEach(() => {
      statusCode = 0;
      jsonBody = null;
      mockRes = {
        status: vi.fn((code: number) => {
          statusCode = code;
          return mockRes as NextApiResponse;
        }),
        json: vi.fn((body: any) => {
          jsonBody = body;
          return mockRes as NextApiResponse;
        }),
      };
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should handle Error objects', () => {
      handleApiError(new Error('Something went wrong'), mockRes as NextApiResponse);

      expect(statusCode).toBe(500);
      expect(jsonBody.code).toBe(ErrorCodes.INTERNAL_ERROR);
    });

    it('should detect unauthorized errors from message', () => {
      handleApiError(new Error('Unauthorized access'), mockRes as NextApiResponse);

      expect(statusCode).toBe(401);
      expect(jsonBody.code).toBe(ErrorCodes.UNAUTHORIZED);
    });

    it('should detect not found errors from message', () => {
      handleApiError(new Error('Resource not found'), mockRes as NextApiResponse);

      expect(statusCode).toBe(404);
      expect(jsonBody.code).toBe(ErrorCodes.NOT_FOUND);
    });

    it('should handle database errors', () => {
      const dbError = { code: '23505', message: 'duplicate key' };
      handleApiError(dbError, mockRes as NextApiResponse);

      expect(statusCode).toBe(400);
      expect(jsonBody.code).toBe(ErrorCodes.DUPLICATE_ENTRY);
    });

    it('should handle unknown error types', () => {
      handleApiError('string error', mockRes as NextApiResponse);

      expect(statusCode).toBe(500);
      expect(jsonBody.code).toBe(ErrorCodes.INTERNAL_ERROR);
    });

    it('should sanitize error messages', () => {
      handleApiError(
        new Error('Failed for user test@example.com with password secret123'),
        mockRes as NextApiResponse
      );

      expect(jsonBody.error).not.toContain('test@example.com');
      expect(jsonBody.error).not.toContain('secret123');
    });

    it('should log full error to console', () => {
      const error = new Error('Test error');
      handleApiError(error, mockRes as NextApiResponse, 'test-context');

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('withErrorHandler', () => {
    it('should pass through successful handlers', async () => {
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withErrorHandler(handler, 'test');
      const mockReq = {} as NextApiRequest;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as NextApiResponse;

      await wrappedHandler(mockReq, mockRes);

      expect(handler).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should catch and handle errors', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const handler = vi.fn(async () => {
        throw new Error('Test error');
      });

      const wrappedHandler = withErrorHandler(handler, 'test');
      const mockReq = {} as NextApiRequest;
      let statusCode = 0;
      const mockRes = {
        status: vi.fn((code: number) => {
          statusCode = code;
          return mockRes;
        }),
        json: vi.fn(),
      } as unknown as NextApiResponse;

      await wrappedHandler(mockReq, mockRes);

      expect(statusCode).toBe(500);
    });
  });

  describe('sendError', () => {
    it('should send correct error response', () => {
      let statusCode = 0;
      let jsonBody: any = null;
      const mockRes = {
        status: vi.fn((code: number) => {
          statusCode = code;
          return mockRes;
        }),
        json: vi.fn((body: any) => {
          jsonBody = body;
        }),
      } as unknown as NextApiResponse;

      sendError(mockRes, 'FORBIDDEN');

      expect(statusCode).toBe(403);
      expect(jsonBody.code).toBe(ErrorCodes.FORBIDDEN);
      expect(jsonBody.error).toBe('No tiene permisos para realizar esta acción');
    });

    it('should use custom message when provided', () => {
      let jsonBody: any = null;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((body: any) => {
          jsonBody = body;
        }),
      } as unknown as NextApiResponse;

      sendError(mockRes, 'FORBIDDEN', 'Solo administradores');

      expect(jsonBody.error).toBe('Solo administradores');
    });
  });

  describe('sendValidationError', () => {
    it('should send 400 with validation error code', () => {
      let statusCode = 0;
      let jsonBody: any = null;
      const mockRes = {
        status: vi.fn((code: number) => {
          statusCode = code;
          return mockRes;
        }),
        json: vi.fn((body: any) => {
          jsonBody = body;
        }),
      } as unknown as NextApiResponse;

      sendValidationError(mockRes, 'email: Correo inválido');

      expect(statusCode).toBe(400);
      expect(jsonBody.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(jsonBody.details).toBe('email: Correo inválido');
    });

    it('should sanitize validation details', () => {
      let jsonBody: any = null;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((body: any) => {
          jsonBody = body;
        }),
      } as unknown as NextApiResponse;

      sendValidationError(mockRes, 'password field: secret123 is invalid');

      expect(jsonBody.details).not.toContain('secret123');
    });
  });
});
