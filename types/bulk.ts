export interface BulkUserData {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  rut: string;
  /**
   * The password supplied by the CSV, if any. Empty when the row did not carry
   * one — the server then mints a CSPRNG value that satisfies the shared policy.
   *
   * S13: the parser used to FILL this with `Math.random().toString(36).slice(-8)`
   * — base-36, so lowercase and digits only, so the uppercase requirement failed
   * on every generated row and the import silently fell back to a shared
   * hardcoded constant. Parsing does not mint credentials any more.
   */
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
