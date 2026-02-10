import { BulkUserData, ParseOptions, ParseResult, BulkImportOrganizationalScope } from '../types/bulk';
import { validateRut } from './rutValidation';

// Re-export types for backward compatibility
export type { BulkUserData, ParseOptions, ParseResult, BulkImportOrganizationalScope } from '../types/bulk';

const DANGEROUS_CHARS = ['=', '+', '-', '@', '\t', '\r'];

function sanitizeCsvValue(value: string | undefined): string {
  if (typeof value !== 'string') return '';
  // Security sanitization for dangerous first characters
  if (DANGEROUS_CHARS.includes(value.charAt(0))) {
    const rest = value.substring(1).replace(/[\r\n]+/g, ' ');
    return "'" + value.charAt(0) + rest;
  }
  // General cleanup for other cases
  return value.replace(/[\r\n]+/g, ' ');
}

function isValidEmail(email: string): boolean {
  if (DANGEROUS_CHARS.includes(email.charAt(0))) {
    return false;
  }
  const emailRegex = /^(?!.*\s)[^@]+@[^@]+\.[^@]+$/;
  return emailRegex.test(email);
}

/**
 * Normalize school ID - schools use integer IDs
 * Returns number or undefined
 */
function normalizeSchoolId(value: string | undefined): number | undefined {
  if (!value || value.trim() === '') return undefined;
  const parsed = parseInt(value.trim(), 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Normalize UUID ID - generations and communities use UUIDs
 * Returns string or undefined
 */
function normalizeUuidId(value: string | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined;
  const trimmed = value.trim();
  // Basic UUID validation (loose - accepts any non-empty string for flexibility)
  if (trimmed.length >= 1) {
    return trimmed;
  }
  return undefined;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField);
  return result;
}

function getLines(text: string): string[] {
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    for (const char of text) {
        if (char === '"') {
            inQuotes = !inQuotes;
        }
        if (char === '\n' && !inQuotes) {
            lines.push(currentLine);
            currentLine = '';
        } else {
            currentLine += char;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
}

function getColumnIndices(
  headers: string[],
  mapping?: ParseOptions['columnMapping']
): Required<NonNullable<ParseOptions['columnMapping']>> {
  const findIndex = (patterns: string[]) =>
    headers.findIndex(h => patterns.some(p => h.toLowerCase().includes(p)));

  const columnIndices = {
    email: mapping?.email ?? findIndex(['email', 'correo']),
    firstName: mapping?.firstName ?? findIndex(['first', 'nombre', 'firstname']),
    lastName: mapping?.lastName ?? findIndex(['last', 'apellido', 'lastname']),
    role: mapping?.role ?? findIndex(['role', 'rol']),
    rut: mapping?.rut ?? findIndex(['rut']),
    password: mapping?.password ?? findIndex(['password', 'contraseña']),
    // Organizational columns
    school_id: mapping?.school_id ?? findIndex(['school_id', 'escuela_id', 'colegio_id', 'school', 'colegio']),
    generation_id: mapping?.generation_id ?? findIndex(['generation_id', 'generacion_id', 'generation', 'generacion']),
    community_id: mapping?.community_id ?? findIndex(['community_id', 'comunidad_id', 'community', 'comunidad']),
  };

  // Validate critical columns
  if (columnIndices.email === -1) {
    console.error('[CSV-PARSER] CRITICAL: Email column not found in headers:', headers);
  }

  return columnIndices;
}

function parseUserRow(
  cells: string[],
  columns: Required<NonNullable<ParseOptions['columnMapping']>>,
  options: {
    generatePasswords: boolean;
    validateRut: boolean;
    defaultRole: string;
    organizationalScope?: BulkImportOrganizationalScope;
  }
): BulkUserData {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get raw values without trimming
  const rawEmail = cells[columns.email] || '';
  const rawFirstName = cells[columns.firstName] || '';
  const rawLastName = cells[columns.lastName] || '';
  const rawRole = cells[columns.role] || '';
  const rawRut = cells[columns.rut] || '';
  const rawPassword = cells[columns.password] || '';

  // Get organizational values from CSV (may be empty/undefined)
  const rawSchoolId = columns.school_id >= 0 ? cells[columns.school_id] || '' : '';
  const rawGenerationId = columns.generation_id >= 0 ? cells[columns.generation_id] || '' : '';
  const rawCommunityId = columns.community_id >= 0 ? cells[columns.community_id] || '' : '';

  // --- Validation Phase --- (on trimmed values)
  const emailForValidation = rawEmail.trim();
  if (!emailForValidation) {
    errors.push('Email es requerido');
  } else if (!isValidEmail(emailForValidation)) {
    errors.push('Email inválido');
  }

  const roleForValidation = rawRole.trim().toLowerCase();
  const finalRole = roleForValidation || options.defaultRole;
  const validRoles = ['admin', 'docente', 'inspirador', 'socio_comunitario', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'];
  if (roleForValidation && DANGEROUS_CHARS.includes(roleForValidation.charAt(0))) {
    errors.push(`Rol '${roleForValidation}' inválido`);
  } else if (roleForValidation && !validRoles.includes(roleForValidation)) {
    errors.push(`Rol '${roleForValidation}' inválido`);
  }

  const rutForValidation = rawRut.trim();
  if (DANGEROUS_CHARS.includes(rutForValidation.charAt(0))) {
    errors.push('RUT inválido');
  } else if (options.validateRut && rutForValidation && !validateRut(rutForValidation)) {
    errors.push('RUT inválido');
  }

  let password = rawPassword.trim();
  if (options.generatePasswords && !password) {
    password = Math.random().toString(36).slice(-8);
    warnings.push('Se generó una contraseña por defecto');
  }

  // --- Organizational ID Processing ---
  // Parse CSV values
  const csvSchoolId = normalizeSchoolId(rawSchoolId);
  const csvGenerationId = normalizeUuidId(rawGenerationId);
  const csvCommunityId = normalizeUuidId(rawCommunityId);

  // Determine final values: CSV override > global selection
  const finalSchoolId = csvSchoolId ?? options.organizationalScope?.globalSchoolId;
  const finalGenerationId = csvGenerationId ?? options.organizationalScope?.globalGenerationId;
  const finalCommunityId = csvCommunityId ?? options.organizationalScope?.globalCommunityId;

  // Track which values came from CSV override
  const csv_overrides = {
    school: csvSchoolId !== undefined,
    generation: csvGenerationId !== undefined,
    community: csvCommunityId !== undefined,
  };

  // --- Sanitization & Output Phase --- (on raw values, then trim)
  return {
    email: sanitizeCsvValue(rawEmail).trim(),
    firstName: sanitizeCsvValue(rawFirstName).trim(),
    lastName: sanitizeCsvValue(rawLastName).trim(),
    role: sanitizeCsvValue(finalRole).trim(),
    rut: sanitizeCsvValue(rawRut).trim(),
    password: sanitizeCsvValue(password).trim(),
    errors,
    warnings,
    rowNumber: 0,
    // Organizational fields
    school_id: finalSchoolId,
    generation_id: finalGenerationId,
    community_id: finalCommunityId,
    csv_overrides,
  };
}

export function formatParsedData(data: BulkUserData[]): BulkUserData[] {
  return data;
}

export function exportAsCSV(data: BulkUserData[]): string {
  const headers = ['email', 'firstName', 'lastName', 'role', 'rut', 'password', 'school_id', 'generation_id', 'community_id'];
  const rows = data.map(user => [
    user.email,
    user.firstName || '',
    user.lastName || '',
    user.role || '',
    user.rut || '',
    user.password || '',
    user.school_id?.toString() || '',
    user.generation_id || '',
    user.community_id || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
}

export function detectDelimiter(text: string): string {
  const delimiters = [',', '\t', ';', '|'];
  const lines = text.split('\n').slice(0, 5); // Check first 5 lines
  const counts = delimiters.map(delimiter => ({
    delimiter,
    count: lines.reduce((acc, line) => acc + line.split(delimiter).length - 1, 0),
  }));

  const best = counts.sort((a, b) => b.count - a.count)[0];
  return best.count > 0 ? best.delimiter : ',';
}

export function detectRoleFromEmail(email: string): string | null {
  if (typeof email !== 'string' || !email.includes('@')) {
    return null;
  }
  const lowerEmail = email.toLowerCase();
  if (lowerEmail.includes('admin')) return 'admin';
  if (lowerEmail.includes('consultor') || lowerEmail.includes('consultant')) return 'consultor';
  if (lowerEmail.includes('director')) return 'equipo_directivo';
  if (lowerEmail.includes('lider_generacion')) return 'lider_generacion';
  if (lowerEmail.includes('lider_comunidad')) return 'lider_comunidad';
  if (lowerEmail.includes('docente')) return 'docente';

  return null;
}

export function generateSampleCSV(rowCount: number = 3): string {
  const sampleRows = [
    '"juan.perez@ejemplo.com","Juan","Pérez","docente","12.345.678-9","","",""',
    '"maria.gonzalez@ejemplo.com","María","González","admin","98.765.432-1","","",""',
    '"carlos.rodriguez@ejemplo.com","Carlos","Rodríguez","consultor","11.222.333-4","","",""',
    '"ana.martinez@ejemplo.com","Ana","Martínez","equipo_directivo","55.666.777-8","","",""',
    '"pedro.silva@ejemplo.com","Pedro","Silva","lider_comunidad","99.888.777-6","","",""'
  ];

  const headers = 'email,firstName,lastName,role,rut,school_id,generation_id,community_id';
  const selectedRows = sampleRows.slice(0, Math.min(rowCount, sampleRows.length));

  return [headers, ...selectedRows].join('\n');
}

export function parseBulkUserData(
  text: string,
  options: ParseOptions = {}
): ParseResult {
  const {
    delimiter = ',',
    hasHeader = true,
    generatePasswords = true,
    validateRut: validateRutOption = true,
    defaultRole = 'docente',
    columnMapping,
    organizationalScope
  } = options;

  const lines = getLines(text.trim());
  if (lines.length === 0) {
    return { valid: [], invalid: [], warnings: [], summary: { total: 0, valid: 0, invalid: 0, hasWarnings: 0 } };
  }

  let headers: string[] = [];
  let dataStartIndex = 0;
  if (hasHeader) {
    headers = parseCsvLine(lines[0], delimiter).map(h => h.replace(/"/g, '').toLowerCase().trim());
    dataStartIndex = 1;
  }

  const columns = getColumnIndices(headers, columnMapping);

  if (columns.email === -1) {
    throw new Error('La columna "email" es requerida.');
  }

  const valid: BulkUserData[] = [];
  const invalid: BulkUserData[] = [];

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const rowNumber = i + 1;
    const cells = parseCsvLine(line, delimiter);
    const userData = parseUserRow(cells, columns, {
      generatePasswords,
      validateRut: validateRutOption,
      defaultRole,
      organizationalScope  // Pass organizational scope
    });
    userData.rowNumber = rowNumber;

    if (userData.errors && userData.errors.length > 0) {
      invalid.push(userData);
    } else {
      valid.push(userData);
    }
  }

  return {
    valid,
    invalid,
    warnings: [],
    summary: {
      total: valid.length + invalid.length,
      valid: valid.length,
      invalid: invalid.length,
      hasWarnings: valid.filter(u => u.warnings && u.warnings.length > 0).length,
    },
  };
}
