import { BulkUserData, ParseOptions, ParseResult } from '../types/bulk';
import { validateRut } from './rutValidation';

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

  return {
    email: mapping?.email ?? findIndex(['email', 'correo']),
    firstName: mapping?.firstName ?? findIndex(['first', 'nombre']),
    lastName: mapping?.lastName ?? findIndex(['last', 'apellido']),
    role: mapping?.role ?? findIndex(['role', 'rol']),
    rut: mapping?.rut ?? findIndex(['rut']),
    password: mapping?.password ?? findIndex(['password', 'contraseña']),
  };
}

function parseUserRow(
  cells: string[],
  columns: Required<NonNullable<ParseOptions['columnMapping']>>,
  options: {
    generatePasswords: boolean;
    validateRut: boolean;
    defaultRole: string;
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
  if (DANGEROUS_CHARS.includes(roleForValidation.charAt(0))) {
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
  };
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
    columnMapping
  } = options;

  const lines = getLines(text.trim());
  if (lines.length === 0) {
    return { valid: [], invalid: [], warnings: [], summary: { total: 0, valid: 0, invalid: 0, hasWarnings: 0 } };
  }

  let headers: string[] = [];
  let dataStartIndex = 0;
  if (hasHeader) {
    headers = parseCsvLine(lines[0], delimiter).map(h => h.toLowerCase().trim());
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
    const userData = parseUserRow(cells, columns, { generatePasswords, validateRut: validateRutOption, defaultRole });
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