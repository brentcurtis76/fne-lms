/**
 * Genera 6-Role System Types
 * Defines the new role hierarchy and organizational structure
 */

// Role types enum matching database - Spanish names for consistency
export type UserRoleType = 
  | 'admin'               // FNE staff with full platform control (global admin)
  | 'consultor'           // FNE consultants assigned to specific schools
  | 'equipo_directivo'    // School-level administrators  
  | 'lider_generacion'    // Leaders of Tractor/Innova generations
  | 'lider_comunidad'     // Leaders of Growth Communities (2-16 teachers)
  | 'supervisor_de_red'   // Network supervisors with limited reporting access
  | 'community_manager'   // Community managers with access to content and reports
  | 'docente';            // Regular teachers/course participants

// Organizational entities
export interface School {
  id: string;
  name: string;
  code?: string;
  has_generations?: boolean;
  created_at?: string;
}

export interface Generation {
  id: string;
  school_id: string;
  name: string; // 'Tractor' or 'Innova'
  grade_range?: string; // e.g., 'PreK-2nd' or '3rd-12th'
  description?: string; // Optional description for the generation
  created_at?: string;
  updated_at?: string;
  school?: School;
}

export interface GrowthCommunity {
  id: string;
  generation_id: string;
  school_id: string;
  name: string;
  max_teachers?: number;
  created_at?: string;
  generation?: Generation;
  school?: School;
}

// Network of schools for supervisor_de_red role
export interface RedDeColegios {
  id: string;
  name: string;
  description?: string;
  created_by?: string;
  last_updated_by?: string;
  created_at: string;
  updated_at: string;
  
  // Related entities (populated via joins)
  schools?: School[];
  supervisors?: UserProfile[];
  school_count?: number;
  supervisor_count?: number;
}

// School-network assignment relationship
export interface RedEscuela {
  red_id: string;
  school_id: number;
  assigned_by?: string;
  assigned_at: string;
  
  // Related entities (populated via joins)
  network?: RedDeColegios;
  school?: School;
  assigned_by_profile?: UserProfile;
}

// User role assignment
export interface UserRole {
  id: string;
  user_id: string;
  role_type: UserRoleType;
  school_id?: string;
  generation_id?: string;
  community_id?: string;
  red_id?: string; // Network association for supervisor_de_red role
  is_active: boolean;
  assigned_at: string;
  reporting_scope?: Record<string, any>; // For future analytics features
  feedback_scope?: Record<string, any>;  // For future feedback workflows
  created_at: string;
  
  // Related entities (populated via joins)
  school?: School;
  generation?: Generation;
  community?: GrowthCommunity;
  network?: RedDeColegios;
}

// Extended user profile with role information
export interface UserProfile {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  role?: string; // Legacy role field for backward compatibility
  school_id?: string;
  generation_id?: string;
  community_id?: string;
  created_at?: string;
  external_school_affiliation?: string | null; // External school for consultants (informational only)

  // New role system
  user_roles?: UserRole[];
  school?: School;
  generation?: Generation;
  community?: GrowthCommunity;
}

// Role hierarchy and permissions
export interface RolePermissions {
  // Course management
  can_create_courses: boolean;
  can_edit_all_courses: boolean;
  can_delete_courses: boolean;
  can_assign_courses: boolean;
  
  // User management
  can_create_users: boolean;
  can_edit_users: boolean;
  can_delete_users: boolean;
  can_assign_roles: boolean;
  
  // Organizational management
  can_manage_schools: boolean;
  can_manage_generations: boolean;
  can_manage_communities: boolean;
  
  // Reporting and analytics
  reporting_scope: 'global' | 'network' | 'school' | 'generation' | 'community' | 'individual';
  feedback_scope: 'global' | 'network' | 'school' | 'generation' | 'community' | 'individual';
}

// Role hierarchy definition
export const ROLE_HIERARCHY: Record<UserRoleType, RolePermissions> = {
  admin: {
    can_create_courses: true,
    can_edit_all_courses: true,
    can_delete_courses: true,
    can_assign_courses: true,
    can_create_users: true,
    can_edit_users: true,
    can_delete_users: true,
    can_assign_roles: true,
    can_manage_schools: true,
    can_manage_generations: true,
    can_manage_communities: true,
    reporting_scope: 'global',
    feedback_scope: 'global'
  },
  consultor: {
    can_create_courses: false,
    can_edit_all_courses: false,
    can_delete_courses: false,
    can_assign_courses: true,
    can_create_users: false,
    can_edit_users: false,
    can_delete_users: false,
    can_assign_roles: false,
    can_manage_schools: false,
    can_manage_generations: false,
    can_manage_communities: false,
    reporting_scope: 'school',
    feedback_scope: 'school'
  },
  equipo_directivo: {
    can_create_courses: false,
    can_edit_all_courses: false,
    can_delete_courses: false,
    can_assign_courses: false,
    can_create_users: false,
    can_edit_users: false,
    can_delete_users: false,
    can_assign_roles: false,
    can_manage_schools: false,
    can_manage_generations: false,
    can_manage_communities: false,
    reporting_scope: 'school',
    feedback_scope: 'school'
  },
  lider_generacion: {
    can_create_courses: false,
    can_edit_all_courses: false,
    can_delete_courses: false,
    can_assign_courses: false,
    can_create_users: false,
    can_edit_users: false,
    can_delete_users: false,
    can_assign_roles: false,
    can_manage_schools: false,
    can_manage_generations: false,
    can_manage_communities: false,
    reporting_scope: 'generation',
    feedback_scope: 'generation'
  },
  lider_comunidad: {
    can_create_courses: false,
    can_edit_all_courses: false,
    can_delete_courses: false,
    can_assign_courses: false,
    can_create_users: false,
    can_edit_users: false,
    can_delete_users: false,
    can_assign_roles: false,
    can_manage_schools: false,
    can_manage_generations: false,
    can_manage_communities: false,
    reporting_scope: 'community',
    feedback_scope: 'community'
  },
  supervisor_de_red: {
    can_create_courses: false,
    can_edit_all_courses: false,
    can_delete_courses: false,
    can_assign_courses: false,
    can_create_users: false,
    can_edit_users: false,
    can_delete_users: false,
    can_assign_roles: false,
    can_manage_schools: false,
    can_manage_generations: false,
    can_manage_communities: false,
    reporting_scope: 'network',
    feedback_scope: 'network'
  },
  community_manager: {
    can_create_courses: false,
    can_edit_all_courses: false,
    can_delete_courses: false,
    can_assign_courses: false,
    can_create_users: false,
    can_edit_users: false,
    can_delete_users: false,
    can_assign_roles: false,
    can_manage_schools: false,
    can_manage_generations: false,
    can_manage_communities: false,
    reporting_scope: 'individual',
    feedback_scope: 'individual'
  },
  docente: {
    can_create_courses: false,
    can_edit_all_courses: false,
    can_delete_courses: false,
    can_assign_courses: false,
    can_create_users: false,
    can_edit_users: false,
    can_delete_users: false,
    can_assign_roles: false,
    can_manage_schools: false,
    can_manage_generations: false,
    can_manage_communities: false,
    reporting_scope: 'individual',
    feedback_scope: 'individual'
  }
};

// Role display names (in Spanish)
export const ROLE_NAMES: Record<UserRoleType, string> = {
  admin: 'Administrador Global',
  consultor: 'Consultor FNE',
  equipo_directivo: 'Equipo Directivo',
  lider_generacion: 'Líder de Generación',
  lider_comunidad: 'Líder de Comunidad',
  supervisor_de_red: 'Supervisor de Red',
  community_manager: 'Community Manager',
  docente: 'Docente'
};

// Role descriptions
export const ROLE_DESCRIPTIONS: Record<UserRoleType, string> = {
  admin: 'Staff de FNE con control total de la plataforma. Pueden pertenecer a comunidades para colaboración.',
  consultor: 'Consultores FNE asignados a colegios específicos. Pueden pertenecer a comunidades para colaboración.',
  equipo_directivo: 'Administradores a nivel de colegio. Pueden pertenecer a comunidades para colaboración.',
  lider_generacion: 'Líderes de generaciones Tractor/Innova. Pueden pertenecer a comunidades para colaboración.',
  lider_comunidad: 'Líderes de Comunidades de Crecimiento (2-16 miembros). Crean automáticamente su propia comunidad.',
  supervisor_de_red: 'Supervisores con acceso limitado a reportes de una red específica de colegios. Pueden inscribirse en cursos como estudiantes.',
  community_manager: 'Gestores de comunidad con acceso a panel, perfil, aprendizaje, cursos y rendición de gastos.',
  docente: 'Docentes participantes en cursos. Pueden pertenecer a comunidades para colaboración.'
};

// Utility type for permission checking
export type PermissionKey = keyof Omit<RolePermissions, 'reporting_scope' | 'feedback_scope'>;

// Organizational scope requirements for role assignment
export interface RoleOrganizationalRequirements {
  requiresSchool: boolean;
  requiresGeneration: boolean;
  requiresCommunity: boolean;
  description: string;
}

// Role organizational requirements definition
export const ROLE_ORGANIZATIONAL_REQUIREMENTS: Record<UserRoleType, RoleOrganizationalRequirements> = {
  admin: {
    requiresSchool: false,
    requiresGeneration: false,
    requiresCommunity: false,
    description: 'Global role - no organizational scope required'
  },
  consultor: {
    requiresSchool: true,
    requiresGeneration: false,
    requiresCommunity: false,
    description: 'Must be assigned to a specific school'
  },
  equipo_directivo: {
    requiresSchool: true,
    requiresGeneration: false,
    requiresCommunity: false,
    description: 'Must be assigned to a specific school'
  },
  lider_generacion: {
    requiresSchool: true,
    requiresGeneration: false,
    requiresCommunity: false,
    description: 'Must be assigned to a specific school and generation'
  },
  lider_comunidad: {
    requiresSchool: true,
    requiresGeneration: false,
    requiresCommunity: false,
    description: 'Must be assigned to a school (community auto-created)'
  },
  supervisor_de_red: {
    requiresSchool: false,
    requiresGeneration: false,
    requiresCommunity: false,
    description: 'Network-level role - no specific school required'
  },
  community_manager: {
    requiresSchool: false,
    requiresGeneration: false,
    requiresCommunity: false,
    description: 'Content management role - no organizational scope required'
  },
  docente: {
    requiresSchool: true,
    requiresGeneration: false,
    requiresCommunity: false,
    description: 'Must be assigned to a specific school'
  }
};

// Validation function for role assignments
export function validateRoleAssignment(
  roleType: UserRoleType,
  organizationalScope: {
    schoolId?: string | null;
    generationId?: string | null;
    communityId?: string | null;
  }
): { isValid: boolean; error?: string } {
  const requirements = ROLE_ORGANIZATIONAL_REQUIREMENTS[roleType];
  
  if (!requirements) {
    return {
      isValid: false,
      error: `Unknown role type: ${roleType}`
    };
  }
  
  // Check school requirement
  if (requirements.requiresSchool && !organizationalScope.schoolId) {
    return {
      isValid: false,
      error: `Role "${ROLE_NAMES[roleType]}" requires a school assignment`
    };
  }
  
  // Check generation requirement (currently none require it directly)
  if (requirements.requiresGeneration && !organizationalScope.generationId) {
    return {
      isValid: false,
      error: `Role "${ROLE_NAMES[roleType]}" requires a generation assignment`
    };
  }
  
  // Check community requirement (currently none require it directly - lider_comunidad auto-creates)
  if (requirements.requiresCommunity && !organizationalScope.communityId) {
    return {
      isValid: false,
      error: `Role "${ROLE_NAMES[roleType]}" requires a community assignment`
    };
  }
  
  return { isValid: true };
}

// Migration helper types
export interface LegacyProfile {
  id: string;
  role: 'admin' | 'docente';
  email?: string;
  first_name?: string;
  last_name?: string;
}

// Legacy to new role mapping
export const LEGACY_ROLE_MAPPING = {
  'admin': 'admin' as UserRoleType,     // Keep admin as admin (but now it means global admin)
  'docente': 'docente' as UserRoleType  // Keep docente as docente
} as const;

// Course assignment with new role system
export interface CourseAssignment {
  id: string;
  course_id: string;
  user_id: string;
  assigned_by: string;
  assigned_at: string;
  is_active: boolean;
  
  // Role context for the assignment
  role_context?: {
    school_id?: string;
    generation_id?: string;
    community_id?: string;
  };
}

// Dev user record
export interface DevUser {
  id: string;
  user_id: string;
  is_active: boolean;
  assigned_at: string;
  assigned_by?: string;
  created_at: string;
}

// Dev role impersonation session
export interface DevRoleSession {
  id: string;
  dev_user_id: string;
  impersonated_role: UserRoleType;
  impersonated_user_id?: string;
  school_id?: string | number;  // Can be string or number due to schema
  generation_id?: string;
  community_id?: string;
  session_token: string;
  is_active: boolean;
  started_at: string;
  expires_at: string;
  ended_at?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// Dev audit log entry
export interface DevAuditLog {
  id: string;
  dev_user_id: string;
  action: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}