/**
 * Report data filtering utilities based on user roles
 * Ensures users only see data within their scope
 */

import { supabase } from '../lib/supabase-wrapper';

export interface UserProfile {
  id: string;
  role: string;
  school_id?: string;
  generation_id?: string;
  community_id?: string;
}

export interface ReportFilters {
  school_id?: string;
  generation_id?: string;
  community_id?: string;
  consultant_id?: string;
}

/**
 * Get report filters based on user role and profile
 * @param userProfile - The user's profile data
 * @returns Filters to apply to report queries
 */
export function getRoleBasedFilters(userProfile: UserProfile): ReportFilters {
  const { role, school_id, generation_id, community_id, id } = userProfile;
  
  switch (role) {
    case 'admin':
      // Admins see everything - no filters
      return {};
      
    case 'consultor':
      // Consultants see only students they're assigned to
      return {
        consultant_id: id
      };
      
    case 'equipo_directivo':
      // School leadership sees only their school
      if (!school_id) {
        throw new Error('Equipo directivo must have school_id');
      }
      return {
        school_id
      };
      
    case 'lider_generacion':
      // Generation leaders see only their school and generation
      if (!school_id || !generation_id) {
        throw new Error('Lider de generación must have school_id and generation_id');
      }
      return {
        school_id,
        generation_id
      };
      
    case 'lider_comunidad':
      // Community leaders see only their growth community
      if (!community_id) {
        throw new Error('Lider de comunidad must have community_id');
      }
      return {
        community_id
      };
      
    default:
      // No access for other roles
      throw new Error(`Role ${role} does not have report access`);
  }
}

/**
 * Apply role-based filters to a Supabase query
 * @param query - The base Supabase query
 * @param filters - The filters to apply
 * @returns The filtered query
 */
export function applyReportFilters(query: any, filters: ReportFilters): any {
  let filteredQuery = query;
  
  if (filters.school_id) {
    filteredQuery = filteredQuery.eq('school_id', filters.school_id);
  }
  
  if (filters.generation_id) {
    filteredQuery = filteredQuery.eq('generation_id', filters.generation_id);
  }
  
  if (filters.community_id) {
    filteredQuery = filteredQuery.eq('community_id', filters.community_id);
  }
  
  if (filters.consultant_id) {
    // For consultants, we need to join with consultant_assignments
    filteredQuery = filteredQuery
      .in('user_id', 
        supabase
          .from('consultant_assignments')
          .select('student_id')
          .eq('consultant_id', filters.consultant_id)
      );
  }
  
  return filteredQuery;
}

/**
 * Get a description of what data the user can see
 * @param role - The user's role
 * @returns A user-friendly description
 */
export function getReportScopeDescription(role: string): string {
  switch (role) {
    case 'admin':
      return 'Vista global de toda la plataforma';
    case 'consultor':
      return 'Estudiantes bajo tu supervisión';
    case 'equipo_directivo':
      return 'Todos los usuarios de tu escuela';
    case 'lider_generacion':
      return 'Usuarios de tu generación';
    case 'lider_comunidad':
      return 'Miembros de tu comunidad de crecimiento';
    default:
      return 'Sin acceso a reportes';
  }
}