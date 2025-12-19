/**
 * Unit tests for Zod Validation Schemas
 */

import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  optionalUuidSchema,
  emailSchema,
  passwordSchema,
  simplePasswordSchema,
  safeTextSchema,
  nameSchema,
  paginationSchema,
  sortSchema,
  loginSchema,
  changePasswordSchema,
  resetPasswordSchema,
  roleTypeSchema,
  assignRoleSchema,
  updateProfileSchema,
  bulkCreateUserSchema,
  courseSchema,
  lessonSchema,
  blockSchema,
  searchQuerySchema,
  validateInput,
  withValidation,
} from '../../../lib/validation/schemas';

describe('validation/schemas', () => {
  describe('uuidSchema', () => {
    it('should accept valid UUIDs', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = uuidSchema.safeParse(validUuid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      const result = uuidSchema.safeParse('not-a-uuid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('ID inválido');
      }
    });

    it('should reject empty strings', () => {
      const result = uuidSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('optionalUuidSchema', () => {
    it('should accept valid UUIDs', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = optionalUuidSchema.safeParse(validUuid);
      expect(result.success).toBe(true);
    });

    it('should accept undefined', () => {
      const result = optionalUuidSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should accept null', () => {
      const result = optionalUuidSchema.safeParse(null);
      expect(result.success).toBe(true);
    });
  });

  describe('emailSchema', () => {
    it('should accept valid emails', () => {
      const result = emailSchema.safeParse('test@example.com');
      expect(result.success).toBe(true);
      expect(result.data).toBe('test@example.com');
    });

    it('should lowercase emails', () => {
      // Note: email() validation happens before transform, so we test without spaces
      // The transform lowercases and trims valid emails
      const result = emailSchema.safeParse('TEST@EXAMPLE.COM');
      expect(result.success).toBe(true);
      expect(result.data).toBe('test@example.com');
    });

    it('should reject invalid emails', () => {
      const result = emailSchema.safeParse('not-an-email');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Correo electrónico inválido');
      }
    });

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = emailSchema.safeParse(longEmail);
      expect(result.success).toBe(false);
    });
  });

  describe('passwordSchema', () => {
    it('should accept strong passwords', () => {
      const result = passwordSchema.safeParse('SecurePass123');
      expect(result.success).toBe(true);
    });

    it('should reject passwords without uppercase', () => {
      const result = passwordSchema.safeParse('lowercase123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('mayúscula');
      }
    });

    it('should reject passwords without lowercase', () => {
      const result = passwordSchema.safeParse('UPPERCASE123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('minúscula');
      }
    });

    it('should reject passwords without numbers', () => {
      const result = passwordSchema.safeParse('NoNumbersHere');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('número');
      }
    });

    it('should reject passwords that are too short', () => {
      const result = passwordSchema.safeParse('Short1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('8 caracteres');
      }
    });

    it('should reject passwords that are too long', () => {
      const longPassword = 'A'.repeat(129) + 'a1';
      const result = passwordSchema.safeParse(longPassword);
      expect(result.success).toBe(false);
    });
  });

  describe('simplePasswordSchema', () => {
    it('should accept any non-empty password', () => {
      const result = simplePasswordSchema.safeParse('weak');
      expect(result.success).toBe(true);
    });

    it('should reject empty passwords', () => {
      const result = simplePasswordSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('nameSchema', () => {
    it('should accept valid names', () => {
      const result = nameSchema.safeParse('Juan Carlos');
      expect(result.success).toBe(true);
    });

    it('should accept Spanish characters', () => {
      const result = nameSchema.safeParse('José María Ñuñez');
      expect(result.success).toBe(true);
    });

    it('should accept names with hyphens and apostrophes', () => {
      const result = nameSchema.safeParse("O'Brien-Smith");
      expect(result.success).toBe(true);
    });

    it('should trim whitespace', () => {
      const result = nameSchema.safeParse('  María  ');
      expect(result.success).toBe(true);
      expect(result.data).toBe('María');
    });

    it('should reject names with numbers', () => {
      const result = nameSchema.safeParse('User123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('caracteres inválidos');
      }
    });

    it('should reject names with special characters', () => {
      const result = nameSchema.safeParse('Name@#$');
      expect(result.success).toBe(false);
    });

    it('should reject empty names', () => {
      const result = nameSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('safeTextSchema', () => {
    it('should accept valid text', () => {
      const result = safeTextSchema.safeParse('This is some text');
      expect(result.success).toBe(true);
    });

    it('should trim whitespace', () => {
      const result = safeTextSchema.safeParse('  trimmed  ');
      expect(result.success).toBe(true);
      expect(result.data).toBe('trimmed');
    });

    it('should reject text that is too long', () => {
      const longText = 'a'.repeat(1001);
      const result = safeTextSchema.safeParse(longText);
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('should accept valid pagination params', () => {
      const result = paginationSchema.safeParse({ page: 2, limit: 50 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ page: 2, limit: 50 });
    });

    it('should coerce string values', () => {
      const result = paginationSchema.safeParse({ page: '3', limit: '25' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ page: 3, limit: 25 });
    });

    it('should use defaults for missing values', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ page: 1, limit: 20 });
    });

    it('should reject page less than 1', () => {
      const result = paginationSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit greater than 50', () => {
      const result = paginationSchema.safeParse({ limit: 51 });
      expect(result.success).toBe(false);
    });

    it('should accept limit of exactly 50', () => {
      const result = paginationSchema.safeParse({ limit: 50 });
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(50);
    });
  });

  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should default rememberMe to false', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
      expect(result.data?.rememberMe).toBe(false);
    });

    it('should accept rememberMe flag', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: true,
      });
      expect(result.success).toBe(true);
      expect(result.data?.rememberMe).toBe(true);
    });
  });

  describe('changePasswordSchema', () => {
    it('should accept valid password change', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldPassword',
        newPassword: 'NewSecure123',
        confirmPassword: 'NewSecure123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject mismatched passwords', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldPassword',
        newPassword: 'NewSecure123',
        confirmPassword: 'Different123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('no coinciden');
      }
    });

    it('should reject same old and new password', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'SamePass123',
        newPassword: 'SamePass123',
        confirmPassword: 'SamePass123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('diferente');
      }
    });
  });

  describe('roleTypeSchema', () => {
    it('should accept all valid roles', () => {
      const validRoles = [
        'admin',
        'consultor',
        'equipo_directivo',
        'lider_generacion',
        'lider_comunidad',
        'community_manager',
        'docente',
        'supervisor_de_red',
      ];

      for (const role of validRoles) {
        const result = roleTypeSchema.safeParse(role);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid roles', () => {
      const result = roleTypeSchema.safeParse('superadmin');
      expect(result.success).toBe(false);
    });
  });

  describe('assignRoleSchema', () => {
    it('should accept valid role assignment', () => {
      const result = assignRoleSchema.safeParse({
        targetUserId: '550e8400-e29b-41d4-a716-446655440000',
        roleType: 'docente',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional school/generation/community IDs', () => {
      const result = assignRoleSchema.safeParse({
        targetUserId: '550e8400-e29b-41d4-a716-446655440000',
        roleType: 'docente',
        schoolId: '550e8400-e29b-41d4-a716-446655440001',
        generationId: null,
        communityId: undefined,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('courseSchema', () => {
    it('should accept valid course data', () => {
      const result = courseSchema.safeParse({
        title: 'Introduction to Programming',
        description: 'Learn the basics of programming',
      });
      expect(result.success).toBe(true);
    });

    it('should trim title', () => {
      const result = courseSchema.safeParse({
        title: '  Trimmed Title  ',
      });
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Trimmed Title');
    });

    it('should reject empty title', () => {
      const result = courseSchema.safeParse({
        title: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('requerido');
      }
    });

    it('should reject title that is too long', () => {
      const result = courseSchema.safeParse({
        title: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should default structure_type to simple', () => {
      const result = courseSchema.safeParse({
        title: 'Test Course',
      });
      expect(result.success).toBe(true);
      expect(result.data?.structure_type).toBe('simple');
    });
  });

  describe('searchQuerySchema', () => {
    it('should accept valid search queries', () => {
      const result = searchQuerySchema.safeParse('programming basics');
      expect(result.success).toBe(true);
    });

    it('should trim and remove angle brackets', () => {
      const result = searchQuerySchema.safeParse('  <script>alert("xss")</script>  ');
      expect(result.success).toBe(true);
      expect(result.data).not.toContain('<');
      expect(result.data).not.toContain('>');
    });

    it('should reject queries that are too long', () => {
      const longQuery = 'a'.repeat(201);
      const result = searchQuerySchema.safeParse(longQuery);
      expect(result.success).toBe(false);
    });
  });

  describe('blockSchema', () => {
    const validLessonId = '123e4567-e89b-12d3-a456-426614174000';

    it('should accept valid block data', () => {
      const result = blockSchema.safeParse({
        type: 'text',
        lesson_id: validLessonId,
        position: 0,
        payload: { content: 'Hello world' },
      });
      expect(result.success).toBe(true);
    });

    it('should require type field', () => {
      const result = blockSchema.safeParse({
        lesson_id: validLessonId,
        position: 0,
        payload: {},
      });
      expect(result.success).toBe(false);
    });

    it('should require lesson_id field', () => {
      const result = blockSchema.safeParse({
        type: 'text',
        position: 0,
        payload: {},
      });
      expect(result.success).toBe(false);
    });

    it('should require position field', () => {
      const result = blockSchema.safeParse({
        type: 'text',
        lesson_id: validLessonId,
        payload: {},
      });
      expect(result.success).toBe(false);
    });

    it('should require payload field', () => {
      const result = blockSchema.safeParse({
        type: 'text',
        lesson_id: validLessonId,
        position: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid block type', () => {
      const result = blockSchema.safeParse({
        type: 'invalid_type',
        lesson_id: validLessonId,
        position: 0,
        payload: {},
      });
      expect(result.success).toBe(false);
    });

    it('should accept payload at size limit (500KB)', () => {
      // Create a payload just under 500KB
      const largeContent = 'x'.repeat(400000);
      const result = blockSchema.safeParse({
        type: 'text',
        lesson_id: validLessonId,
        position: 0,
        payload: { content: largeContent },
      });
      expect(result.success).toBe(true);
    });

    it('should reject payload exceeding 500KB', () => {
      // Create a payload over 500KB
      const hugeContent = 'x'.repeat(600000);
      const result = blockSchema.safeParse({
        type: 'text',
        lesson_id: validLessonId,
        position: 0,
        payload: { content: hugeContent },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('demasiado grande');
      }
    });

    it('should accept empty payload object', () => {
      const result = blockSchema.safeParse({
        type: 'text',
        lesson_id: validLessonId,
        position: 0,
        payload: {},
      });
      expect(result.success).toBe(true);
    });
  });

  describe('validateInput', () => {
    it('should return success for valid input', () => {
      const result = validateInput(emailSchema, 'test@example.com');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test@example.com');
      }
    });

    it('should return error for invalid input', () => {
      const result = validateInput(emailSchema, 'not-an-email');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Correo electrónico inválido');
      }
    });

    it('should format multiple errors', () => {
      const result = validateInput(loginSchema, {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('email');
        expect(result.error).toContain('password');
      }
    });
  });

  describe('withValidation middleware', () => {
    it('should call handler with validated data', async () => {
      const handler = vi.fn();
      const middleware = withValidation(loginSchema, handler);

      const req = {
        body: { email: 'test@example.com', password: 'password123' },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await middleware(req, res);

      expect(handler).toHaveBeenCalledWith(
        { email: 'test@example.com', password: 'password123', rememberMe: false },
        req,
        res
      );
    });

    it('should return 400 for invalid data', async () => {
      const handler = vi.fn();
      const middleware = withValidation(loginSchema, handler);

      const req = { body: {} };
      let statusCode = 0;
      let jsonBody: any = null;
      const res = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (body: any) => {
          jsonBody = body;
        },
      };

      await middleware(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(statusCode).toBe(400);
      expect(jsonBody.error).toBe('Datos de entrada inválidos');
    });
  });
});

// Need to import vi for function mocking
import { vi } from 'vitest';
