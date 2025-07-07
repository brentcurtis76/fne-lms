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
  };
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
