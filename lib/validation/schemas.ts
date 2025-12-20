/**
 * Zod Input Validation Schemas
 *
 * Centralized validation schemas for API inputs.
 * These schemas ensure type-safe input validation and prevent injection attacks.
 */

import { z } from 'zod';

// ============================================
// Common Schemas
// ============================================

/**
 * UUID validation - used for all IDs
 */
export const uuidSchema = z
  .string()
  .uuid('ID inválido')
  .describe('UUID identifier');

/**
 * Optional UUID
 */
export const optionalUuidSchema = z
  .string()
  .uuid('ID inválido')
  .optional()
  .nullable();

/**
 * Email validation
 */
export const emailSchema = z
  .string()
  .email('Correo electrónico inválido')
  .max(255, 'Correo electrónico demasiado largo')
  .transform((val) => val.toLowerCase().trim());

/**
 * Password validation - strong password requirements
 */
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña es demasiado larga')
  .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'La contraseña debe contener al menos una minúscula')
  .regex(/[0-9]/, 'La contraseña debe contener al menos un número');

/**
 * Simple password - for password change (current password might be weak)
 */
export const simplePasswordSchema = z
  .string()
  .min(1, 'La contraseña es requerida')
  .max(128, 'La contraseña es demasiado larga');

/**
 * Safe text - no HTML, limited length
 */
export const safeTextSchema = z
  .string()
  .max(1000, 'Texto demasiado largo')
  .transform((val) => val.trim());

/**
 * Safe name - for first/last names
 */
export const nameSchema = z
  .string()
  .min(1, 'El nombre es requerido')
  .max(100, 'El nombre es demasiado largo')
  .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-']+$/, 'El nombre contiene caracteres inválidos')
  .transform((val) => val.trim());

/**
 * Pagination parameters
 * M-8 FIX: Reduced max limit from 100 to 50 to prevent slow queries
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * Sort parameters
 */
export const sortSchema = z.object({
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================
// Authentication Schemas
// ============================================

/**
 * Login request
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: simplePasswordSchema,
  rememberMe: z.boolean().optional().default(false),
});

/**
 * Password change request
 */
export const changePasswordSchema = z
  .object({
    currentPassword: simplePasswordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'La nueva contraseña debe ser diferente a la actual',
    path: ['newPassword'],
  });

/**
 * Password reset request (admin)
 */
export const resetPasswordSchema = z.object({
  userId: uuidSchema,
  newPassword: passwordSchema.optional(),
  sendEmail: z.boolean().optional().default(true),
});

// ============================================
// User Management Schemas
// ============================================

/**
 * Valid role types
 */
export const roleTypeSchema = z.enum([
  'admin',
  'consultor',
  'equipo_directivo',
  'lider_generacion',
  'lider_comunidad',
  'community_manager',
  'docente',
  'supervisor_de_red',
]);

/**
 * Role assignment request
 */
export const assignRoleSchema = z.object({
  targetUserId: uuidSchema,
  roleType: roleTypeSchema,
  schoolId: optionalUuidSchema,
  generationId: optionalUuidSchema,
  communityId: optionalUuidSchema,
});

/**
 * User profile update
 */
export const updateProfileSchema = z.object({
  first_name: nameSchema.optional(),
  last_name: nameSchema.optional(),
  description: z.string().max(500, 'Descripción demasiado larga').transform((val) => val.trim()).optional(),
  school: z.string().max(200, 'Nombre de escuela demasiado largo').transform((val) => val.trim()).optional(),
  avatar_url: z.string().url().max(500).optional().nullable(),
});

/**
 * Bulk user creation
 */
export const bulkCreateUserSchema = z.object({
  email: emailSchema,
  first_name: nameSchema,
  last_name: nameSchema,
  role: roleTypeSchema.optional().default('docente'),
  school_id: optionalUuidSchema,
  generation_id: optionalUuidSchema,
  community_id: optionalUuidSchema,
});

export const bulkCreateUsersSchema = z.object({
  users: z.array(bulkCreateUserSchema).min(1).max(100),
  sendWelcomeEmail: z.boolean().optional().default(true),
});

// ============================================
// Course & Content Schemas
// ============================================

/**
 * Course creation/update
 */
export const courseSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(200, 'Título demasiado largo').transform((val) => val.trim()),
  description: z.string().max(2000, 'Descripción demasiado larga').transform((val) => val.trim()).optional(),
  structure_type: z.enum(['simple', 'structured']).default('simple'),
  is_published: z.boolean().default(false),
  thumbnail_url: z.string().url().max(500).optional().nullable(),
});

/**
 * Lesson creation/update
 */
export const lessonSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(200, 'Título demasiado largo').transform((val) => val.trim()),
  course_id: uuidSchema.optional(),
  module_id: optionalUuidSchema,
  order_number: z.number().int().min(0).default(0),
  content: z.record(z.unknown()).optional(),
});

/**
 * Block content - sanitized HTML allowed
 * L-6 FIX: Added basic payload validation with size limit
 */
export const blockSchema = z.object({
  type: z.enum([
    'text',
    'image',
    'video',
    'embed',
    'quiz',
    'assignment',
    'download',
    'html',
  ]),
  lesson_id: uuidSchema,
  position: z.number().int().min(0),
  // L-6 FIX: Validate payload is an object with reasonable size
  payload: z.record(z.unknown()).refine(
    (val) => JSON.stringify(val).length <= 500000, // 500KB max
    { message: 'El contenido del bloque es demasiado grande' }
  ),
});

// ============================================
// Assessment Schemas
// ============================================

/**
 * Assessment creation
 */
export const assessmentSchema = z.object({
  area: z.string().min(1).max(100),
  schoolId: optionalUuidSchema,
  generationId: optionalUuidSchema,
  communityId: optionalUuidSchema,
});

/**
 * Assessment response
 */
export const assessmentResponseSchema = z.object({
  assessmentId: uuidSchema,
  responses: z.array(
    z.object({
      questionId: z.string().min(1).max(100),
      answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    })
  ),
});

// ============================================
// Notification Schemas
// ============================================

/**
 * Notification preferences update
 */
export const notificationPreferencesSchema = z.object({
  email_notifications: z.boolean().optional(),
  push_notifications: z.boolean().optional(),
  in_app_notifications: z.boolean().optional(),
  digest_frequency: z.enum(['realtime', 'daily', 'weekly', 'never']).optional(),
  notification_types: z
    .object({
      course_updates: z.boolean().optional(),
      assignment_reminders: z.boolean().optional(),
      community_messages: z.boolean().optional(),
      system_announcements: z.boolean().optional(),
    })
    .optional(),
});

// ============================================
// Report Schemas
// ============================================

/**
 * Report filters
 */
export const reportFiltersSchema = z.object({
  schoolId: optionalUuidSchema,
  generationId: optionalUuidSchema,
  communityId: optionalUuidSchema,
  courseId: optionalUuidSchema,
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  roleFilter: roleTypeSchema.optional(),
});

// ============================================
// Search & Filter Schemas
// ============================================

/**
 * Search query - sanitized
 */
export const searchQuerySchema = z
  .string()
  .max(200, 'Búsqueda demasiado larga')
  .transform((val) => val.trim().replace(/[<>]/g, ''));

/**
 * Generic filter schema
 */
export const filterSchema = z.object({
  search: searchQuerySchema.optional(),
  ...paginationSchema.shape,
  ...sortSchema.shape,
});

// ============================================
// Utility Functions
// ============================================

/**
 * Validate and parse input with a schema
 * Returns { success: true, data } or { success: false, error }
 */
export function validateInput<T extends z.ZodSchema>(
  schema: T,
  input: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format error message
  const errors = result.error.errors
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join('; ');

  return { success: false, error: errors };
}

/**
 * Create a validation middleware for API routes
 */
export function withValidation<T extends z.ZodSchema>(
  schema: T,
  handler: (
    validatedData: z.infer<T>,
    req: any,
    res: any
  ) => Promise<void> | void
) {
  return async (req: any, res: any) => {
    const result = validateInput(schema, req.body);

    if (result.success === false) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: result.error,
      });
    }

    return handler(result.data, req, res);
  };
}

const validationSchemas = {
  // Common
  uuidSchema,
  emailSchema,
  passwordSchema,
  safeTextSchema,
  nameSchema,
  paginationSchema,
  sortSchema,
  // Auth
  loginSchema,
  changePasswordSchema,
  resetPasswordSchema,
  // Users
  roleTypeSchema,
  assignRoleSchema,
  updateProfileSchema,
  bulkCreateUsersSchema,
  // Content
  courseSchema,
  lessonSchema,
  blockSchema,
  // Assessments
  assessmentSchema,
  assessmentResponseSchema,
  // Notifications
  notificationPreferencesSchema,
  // Reports
  reportFiltersSchema,
  // Search
  searchQuerySchema,
  filterSchema,
  // Utilities
  validateInput,
  withValidation,
};

export default validationSchemas;
