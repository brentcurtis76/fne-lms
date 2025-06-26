/**
 * Bulk user data parsing utilities
 * Supports CSV, TSV, and copy-paste formats
 */

import { validateRut, formatRut } from './rutValidation';
import { generatePassword, generateMemorablePassword } from './passwordGenerator';

/**
 * User data structure for bulk import
 */
export interface BulkUserData {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  rut?: string;
  password?: string;
  // Metadata for tracking
  rowNumber?: number;
  errors?: string[];
  warnings?: string[];
}

/**
 * Parsing options
 */
export interface ParseOptions {
  delimiter?: string; // Default: auto-detect
  hasHeader?: boolean; // Default: true
  generatePasswords?: boolean; // Default: true
  validateRut?: boolean; // Default: true
  defaultRole?: string; // Default: 'docente'
  columnMapping?: {
    email?: number;
    firstName?: number;
    lastName?: number;
    role?: number;
    rut?: number;
    password?: number;
  };
}

/**
 * Parsing result
 */
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

/**
 * Auto-detect delimiter from text
 */
export function detectDelimiter(text: string): string {
  const lines = text.trim().split('\n').slice(0, 5); // Check first 5 lines
  
  // Count occurrences of common delimiters
  const delimiters = [',', '\t', ';', '|'];
  const counts = delimiters.map(delimiter => {
    const count = lines.reduce((sum, line) => {
      return sum + (line.split(delimiter).length - 1);
    }, 0);
    return { delimiter, count };
  });
  
  // Return delimiter with highest consistent count
  const sorted = counts.sort((a, b) => b.count - a.count);
  return sorted[0].count > 0 ? sorted[0].delimiter : ',';
}

/**
 * Parse bulk user data from text
 */
export function parseBulkUserData(
  text: string,
  options: ParseOptions = {}
): ParseResult {
  const {
    delimiter = detectDelimiter(text),
    hasHeader = true,
    generatePasswords = true,
    validateRut: validateRutOption = true,
    defaultRole = 'docente',
    columnMapping
  } = options;
  
  const lines = text.trim().split('\n');
  if (lines.length === 0) {
    return {
      valid: [],
      invalid: [],
      warnings: [],
      summary: { total: 0, valid: 0, invalid: 0, hasWarnings: 0 }
    };
  }
  
  // Parse header if present
  let headers: string[] = [];
  let dataStartIndex = 0;
  
  if (hasHeader) {
    headers = parseRow(lines[0], delimiter).map(h => h.toLowerCase().trim());
    dataStartIndex = 1;
  }
  
  // Determine column indices
  const columns = getColumnIndices(headers, columnMapping);
  
  // Parse data rows
  const valid: BulkUserData[] = [];
  const invalid: BulkUserData[] = [];
  const warnings: string[] = [];
  let hasWarnings = 0;
  
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    const rowNumber = i + 1;
    const userData = parseUserRow(line, delimiter, columns, rowNumber, {
      generatePasswords,
      validateRut: validateRutOption,
      defaultRole
    });
    
    if (userData.errors && userData.errors.length > 0) {
      invalid.push(userData);
    } else {
      valid.push(userData);
      if (userData.warnings && userData.warnings.length > 0) {
        hasWarnings++;
      }
    }
  }
  
  return {
    valid,
    invalid,
    warnings,
    summary: {
      total: valid.length + invalid.length,
      valid: valid.length,
      invalid: invalid.length,
      hasWarnings
    }
  };
}

/**
 * Sanitize a CSV value to prevent formula injection
 * SECURITY: Prevents CSV injection attacks
 */
function sanitizeCsvValue(value: string): string {
  // Check if the value starts with a formula character
  if (/^[=+\-@\t\r]/.test(value)) {
    // Prefix with single quote to escape formula
    return "'" + value;
  }
  
  // Also escape if it contains newlines which could break CSV structure
  if (value.includes('\n') || value.includes('\r')) {
    return value.replace(/[\r\n]+/g, ' ');
  }
  
  return value;
}

/**
 * Parse a single row of data
 */
function parseRow(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        currentValue += '"';
        i += 2;
        continue;
      }
      // Toggle quote state
      insideQuotes = !insideQuotes;
      i++;
      continue;
    }
    
    if (char === delimiter && !insideQuotes) {
      // End of field
      values.push(currentValue.trim());
      currentValue = '';
      i++;
      continue;
    }
    
    currentValue += char;
    i++;
  }
  
  // Don't forget the last value
  values.push(currentValue.trim());
  
  // SECURITY: Sanitize all values to prevent CSV injection
  return values.map(sanitizeCsvValue);
}

/**
 * Get column indices from headers or mapping
 */
function getColumnIndices(
  headers: string[],
  mapping?: ParseOptions['columnMapping']
): Required<NonNullable<ParseOptions['columnMapping']>> {
  if (mapping) {
    return {
      email: mapping.email ?? 0,
      firstName: mapping.firstName ?? 1,
      lastName: mapping.lastName ?? 2,
      role: mapping.role ?? 3,
      rut: mapping.rut ?? 4,
      password: mapping.password ?? 5
    };
  }
  
  // Auto-detect from headers or use defaults
  if (headers.length === 0) {
    // No headers, use default positions
    return {
      email: 0,
      firstName: 1,
      lastName: 2,
      role: 3,
      rut: 4,
      password: 5
    };
  }
  
  const findIndex = (patterns: string[]) => {
    for (const pattern of patterns) {
      const index = headers.findIndex(h => h.includes(pattern));
      if (index !== -1) return index;
    }
    return -1;
  };
  
  return {
    email: findIndex(['email', 'correo', 'mail']) >= 0 ? findIndex(['email', 'correo', 'mail']) : 0,
    firstName: findIndex(['firstname', 'first', 'nombre', 'primer']) >= 0 ? findIndex(['firstname', 'first', 'nombre', 'primer']) : 1,
    lastName: findIndex(['lastname', 'last', 'apellido']) >= 0 ? findIndex(['lastname', 'last', 'apellido']) : 2,
    role: findIndex(['role', 'rol', 'tipo']) >= 0 ? findIndex(['role', 'rol', 'tipo']) : 3,
    rut: findIndex(['rut', 'dni', 'identificacion', 'id']) >= 0 ? findIndex(['rut', 'dni', 'identificacion', 'id']) : 4,
    password: findIndex(['password', 'contraseña', 'clave']) >= 0 ? findIndex(['password', 'contraseña', 'clave']) : 5
  };
}

/**
 * Parse a single user row
 */
function parseUserRow(
  line: string,
  delimiter: string,
  columns: Required<NonNullable<ParseOptions['columnMapping']>>,
  rowNumber: number,
  options: {
    generatePasswords: boolean;
    validateRut: boolean;
    defaultRole: string;
  }
): BulkUserData {
  const values = parseRow(line, delimiter);
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Extract values
  const email = values[columns.email]?.toLowerCase().trim() || '';
  const firstName = values[columns.firstName]?.trim() || '';
  const lastName = values[columns.lastName]?.trim() || '';
  const role = values[columns.role]?.toLowerCase().trim() || options.defaultRole;
  const rut = values[columns.rut]?.trim() || '';
  let password = values[columns.password]?.trim() || '';
  
  // Validate email
  if (!email) {
    errors.push('Email es requerido');
  } else if (!isValidEmail(email)) {
    errors.push('Email inválido');
  }
  
  // Validate names
  if (!firstName && !lastName) {
    warnings.push('Se recomienda incluir nombre y apellido');
  }
  
  // Validate role
  const validRoles = ['admin', 'consultor', 'docente', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'];
  if (!validRoles.includes(role)) {
    errors.push(`Rol inválido: ${role}`);
  }
  
  // Validate RUT if provided and option is enabled
  if (rut && rut.trim() !== '' && options.validateRut) {
    if (!validateRut(rut)) {
      errors.push('RUT inválido');
    }
  }
  
  // Generate password if needed
  if (!password && options.generatePasswords) {
    password = firstName && lastName
      ? generateMemorablePassword(firstName, lastName)
      : generatePassword();
  }
  
  // Check for Chilean email domain but no RUT
  if (email.endsWith('.cl') && !rut) {
    warnings.push('Email chileno detectado - considere agregar RUT');
  }
  
  return {
    email,
    firstName,
    lastName,
    role,
    rut: rut ? formatRut(rut) : undefined,
    password,
    rowNumber,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format parsed data for display
 */
export function formatParsedData(users: BulkUserData[]): string {
  const headers = ['Email', 'Nombre', 'Apellido', 'Rol', 'RUT', 'Contraseña'];
  const rows = users.map(user => [
    user.email,
    user.firstName || '',
    user.lastName || '',
    user.role,
    user.rut || '',
    user.password || ''
  ]);
  
  // Calculate column widths
  const widths = headers.map((header, i) => {
    const maxLength = Math.max(
      header.length,
      ...rows.map(row => (row[i] || '').length)
    );
    return Math.min(maxLength + 2, 30); // Cap at 30 chars
  });
  
  // Format table
  const separator = widths.map(w => '-'.repeat(w)).join('|');
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join('|');
  const dataRows = rows.map(row =>
    row.map((cell, i) => (cell || '').padEnd(widths[i])).join('|')
  );
  
  return [headerRow, separator, ...dataRows].join('\n');
}

/**
 * Export parsed data as CSV
 */
export function exportAsCSV(users: BulkUserData[]): string {
  const headers = ['email', 'firstName', 'lastName', 'role', 'rut', 'password'];
  const rows = [
    headers.join(','),
    ...users.map(user =>
      headers.map(key => {
        const value = user[key as keyof BulkUserData] || '';
        // Quote if contains comma, quote, or newline
        if (typeof value === 'string' && /[,"\n]/.test(value)) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ];
  
  return rows.join('\n');
}

/**
 * Detect role from email domain
 */
export function detectRoleFromEmail(email: string): string | null {
  const emailLower = email.toLowerCase();
  const [localPart, domain] = emailLower.split('@');
  if (!domain) return null;
  
  // Check both local part and domain for patterns
  const fullEmail = localPart + '@' + domain;
  
  if (fullEmail.includes('admin')) return 'admin';
  if (fullEmail.includes('consultant') || fullEmail.includes('consultor')) return 'consultor';
  if (fullEmail.includes('director')) return 'equipo_directivo';
  
  return null;
}

/**
 * Generate sample CSV data for testing
 */
export function generateSampleCSV(count: number = 5): string {
  const headers = 'email,firstName,lastName,role,rut';
  const rows: string[] = [headers];
  
  // Valid test RUTs
  const validRuts = ['11.111.111-1', '12.345.678-5', '5.126.663-3'];
  
  for (let i = 1; i <= count; i++) {
    rows.push([
      `usuario${i}@ejemplo.cl`,
      `Nombre${i}`,
      `Apellido${i}`,
      i === 1 ? 'admin' : 'docente',
      i <= 3 && i <= validRuts.length ? validRuts[i - 1] : ''
    ].join(','));
  }
  
  return rows.join('\n');
}