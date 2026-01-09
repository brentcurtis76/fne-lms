export interface BulkUserData {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  rut: string;
  password: string;
  rowNumber: number;
  errors?: string[];
  warnings?: string[];
  // Organizational assignment fields
  school_id?: number | string;      // Integer ID (can come as string from CSV)
  generation_id?: string;           // UUID
  community_id?: string;            // UUID
  // Flag to indicate if values came from CSV override
  csv_overrides?: {
    school?: boolean;
    generation?: boolean;
    community?: boolean;
  };
}

/**
 * Global organizational scope for bulk import
 * These values apply to all users unless CSV provides per-user overrides
 */
export interface BulkImportOrganizationalScope {
  globalSchoolId?: number;
  globalGenerationId?: string;
  globalCommunityId?: string;
}

export interface ParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
  generatePasswords?: boolean;
  validateRut?: boolean;
  defaultRole?: string;
  columnMapping?: {
    email?: number;
    firstName?: number;
    lastName?: number;
    role?: number;
    rut?: number;
    password?: number;
    // Organizational column mappings
    school_id?: number;
    generation_id?: number;
    community_id?: number;
  };
  // Global organizational scope
  organizationalScope?: BulkImportOrganizationalScope;
}

export interface ParseResult {
  valid: BulkUserData[];
  invalid: BulkUserData[];
  warnings: string[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    hasWarnings: number;
  };
}
