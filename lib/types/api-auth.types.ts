/**
 * Type definitions for API authentication
 * These types ensure type safety across all API routes
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { User } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Extended NextApiRequest with authentication context
 */
export interface AuthenticatedRequest extends NextApiRequest {
  user?: User;
  supabase?: SupabaseClient;
}

/**
 * Result of user authentication check
 */
export interface AuthResult {
  user: User | null;
  error: Error | null;
}

/**
 * Result of admin authentication check
 */
export interface AdminAuthResult extends AuthResult {
  isAdmin: boolean;
}

/**
 * Result of an admin-or-equipo-directivo authentication check.
 *
 * Three terminal states:
 * - Admin: `isAuthorized: true`, `role: 'admin'`, `schoolId: null`
 *   (admins are platform-wide and not scoped to a single school).
 * - Equipo directivo: `isAuthorized: true`, `role: 'equipo_directivo'`,
 *   `schoolId` set to the school the user is ED for.
 * - Unauthorized: `isAuthorized: false`, `role: null`, `schoolId: null`.
 *   Used both when there is no authenticated user and when the user has
 *   neither role; check `user`/`error` to disambiguate.
 */
export interface AdminOrEDAuthResult extends AuthResult {
  isAuthorized: boolean;
  role: 'admin' | 'equipo_directivo' | null;
  schoolId: number | null;
}

/**
 * Standard API error response
 */
export interface ApiError {
  error: string;
  details?: string;
  code?: string;
}

/**
 * Standard API success response
 */
export interface ApiSuccess<T = any> {
  data?: T;
  message?: string;
}

/**
 * Combined API response type
 */
export type ApiResponse<T = any> = ApiSuccess<T> | ApiError;

/**
 * Handler function with proper typing
 */
export type ApiHandler<T = any> = (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<T>>
) => Promise<void> | void;

/**
 * Authenticated handler function
 */
export type AuthenticatedApiHandler<T = any> = (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<T>>,
  user: User,
  supabase: SupabaseClient
) => Promise<void> | void;

/**
 * Admin handler function
 */
export type AdminApiHandler<T = any> = (
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<T>>,
  user: User,
  supabase: SupabaseClient
) => Promise<void> | void;

/**
 * User roles enum
 */
export enum UserRole {
  ADMIN = 'admin',
  CONSULTOR = 'consultor',
  EQUIPO_DIRECTIVO = 'equipo_directivo',
  LIDER_GENERACION = 'lider_generacion',
  LIDER_COMUNIDAD = 'lider_comunidad',
  DOCENTE = 'docente'
}

/**
 * Check if a role is a teacher role
 */
export function isTeacherRole(role: string): boolean {
  return role === UserRole.ADMIN || role === UserRole.CONSULTOR;
}

/**
 * Check if a role is an admin role
 */
export function isAdminRole(role: string): boolean {
  return role === UserRole.ADMIN;
}

/**
 * HTTP status codes
 */
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

/**
 * Standard error messages
 */
export const ErrorMessages = {
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  ADMIN_REQUIRED: 'Admin access required',
  TEACHER_REQUIRED: 'Teacher access required',
  INVALID_REQUEST: 'Invalid request',
  NOT_FOUND: 'Resource not found',
  INTERNAL_ERROR: 'Internal server error',
  METHOD_NOT_ALLOWED: 'Method not allowed'
} as const;

/**
 * Validation helpers
 */
export const Validators = {
  isUUID: (value: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },
  
  isEmail: (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  
  isPositiveInteger: (value: any): boolean => {
    return Number.isInteger(value) && value > 0;
  },
  
  isValidRole: (value: string): boolean => {
    return Object.values(UserRole).includes(value as UserRole);
  }
};