import { describe, it, expect } from 'vitest';
import {
  parseBulkUserData,
  detectDelimiter,
  formatParsedData,
  exportAsCSV,
  detectRoleFromEmail,
  generateSampleCSV,
  type BulkUserData,
  type ParseOptions
} from '../../utils/bulkUserParser';

describe('Bulk User Parser Utilities', () => {
  describe('detectDelimiter', () => {
    it('should detect comma delimiter', () => {
      const csv = `email,name,role
john@test.com,John Doe,admin
jane@test.com,Jane Smith,docente`;
      expect(detectDelimiter(csv)).toBe(',');
    });

    it('should detect tab delimiter', () => {
      const tsv = `email\tname\trole
john@test.com\tJohn Doe\tadmin
jane@test.com\tJane Smith\tdocente`;
      expect(detectDelimiter(tsv)).toBe('\t');
    });

    it('should detect semicolon delimiter', () => {
      const csv = `email;name;role
john@test.com;John Doe;admin
jane@test.com;Jane Smith;docente`;
      expect(detectDelimiter(csv)).toBe(';');
    });

    it('should detect pipe delimiter', () => {
      const csv = `email|name|role
john@test.com|John Doe|admin`;
      expect(detectDelimiter(csv)).toBe('|');
    });

    it('should default to comma when no clear delimiter', () => {
      const text = `john@test.com
jane@test.com`;
      expect(detectDelimiter(text)).toBe(',');
    });
  });

  describe('parseBulkUserData', () => {
    it('should parse basic CSV with headers', () => {
      const csv = `email,firstName,lastName,role
john@test.com,John,Doe,admin
jane@test.com,Jane,Smith,docente`;

      const result = parseBulkUserData(csv);
      
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
      expect(result.summary.total).toBe(2);
      expect(result.summary.valid).toBe(2);
      
      expect(result.valid[0]).toMatchObject({
        email: 'john@test.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin'
      });
    });

    it('should parse CSV without headers', () => {
      const csv = `john@test.com,John,Doe,admin
jane@test.com,Jane,Smith,docente`;

      const result = parseBulkUserData(csv, { hasHeader: false });
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].email).toBe('john@test.com');
    });

    it('should handle quoted values', () => {
      const csv = `email,firstName,lastName,role
"john@test.com","John ""JD"" Doe","Smith, Jr.",admin`;

      const result = parseBulkUserData(csv);
      
      expect(result.valid[0].firstName).toBe('John "JD" Doe');
      expect(result.valid[0].lastName).toBe('Smith, Jr.');
    });

    it('should validate emails', () => {
      const csv = `email,firstName,lastName,role
invalid-email,John,Doe,admin
valid@email.com,Jane,Smith,docente`;

      const result = parseBulkUserData(csv);
      
      expect(result.invalid).toHaveLength(1);
      expect(result.valid).toHaveLength(1);
      expect(result.invalid[0].errors).toContain('Email inválido');
    });

    it('should validate roles', () => {
      const csv = `email,firstName,lastName,role
john@test.com,John,Doe,invalid_role
jane@test.com,Jane,Smith,admin`;

      const result = parseBulkUserData(csv);
      
      expect(result.invalid).toHaveLength(1);
      expect(result.valid).toHaveLength(1);
      expect(result.invalid[0].errors).toContain('Rol inválido: invalid_role');
    });

    it('should validate RUT when enabled', () => {
      const csv = `email,firstName,lastName,role,rut
john@test.cl,John,Doe,admin,12345678-5
jane@test.cl,Jane,Smith,docente,invalid-rut`;

      const result = parseBulkUserData(csv, { validateRut: true });
      
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].errors).toContain('RUT inválido');
    });

    it('should skip RUT validation when disabled', () => {
      const csv = `email,firstName,lastName,role,rut
john@test.cl,John,Doe,admin,invalid-rut`;

      const result = parseBulkUserData(csv, { validateRut: false });
      
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(0);
    });

    it('should generate passwords when not provided', () => {
      const csv = `email,firstName,lastName,role
john@test.com,John,Doe,admin`;

      const result = parseBulkUserData(csv, { generatePasswords: true });
      
      expect(result.valid[0].password).toBeTruthy();
      expect(result.valid[0].password!.length).toBeGreaterThanOrEqual(8);
    });

    it('should not generate passwords when disabled', () => {
      const csv = `email,firstName,lastName,role
john@test.com,John,Doe,admin`;

      const result = parseBulkUserData(csv, { generatePasswords: false });
      
      expect(result.valid[0].password).toBe('');
    });

    it('should use provided passwords', () => {
      const csv = `email,firstName,lastName,role,rut,password
john@test.com,John,Doe,admin,,MyPassword123`;

      const result = parseBulkUserData(csv);
      
      expect(result.valid[0].password).toBe('MyPassword123');
    });

    it('should handle empty lines', () => {
      const csv = `email,firstName,lastName,role

john@test.com,John,Doe,admin

jane@test.com,Jane,Smith,docente`;

      const result = parseBulkUserData(csv);
      
      expect(result.valid).toHaveLength(2);
    });

    it('should add warnings for Chilean emails without RUT', () => {
      const csv = `email,firstName,lastName,role
john@empresa.cl,John,Doe,admin`;

      const result = parseBulkUserData(csv);
      
      expect(result.valid[0].warnings).toContain('Email chileno detectado - considere agregar RUT');
    });

    it('should add warnings for missing names', () => {
      const csv = `email,firstName,lastName,role
john@test.com,,,admin`;

      const result = parseBulkUserData(csv);
      
      expect(result.valid[0].warnings).toContain('Se recomienda incluir nombre y apellido');
    });

    it('should use default role when not specified', () => {
      const csv = `email,firstName,lastName
john@test.com,John,Doe`;

      const result = parseBulkUserData(csv, { defaultRole: 'consultor' });
      
      expect(result.valid[0].role).toBe('consultor');
    });

    it('should handle custom column mapping', () => {
      const csv = `role,lastName,firstName,email
admin,Doe,John,john@test.com`;

      const result = parseBulkUserData(csv, {
        columnMapping: {
          email: 3,
          firstName: 2,
          lastName: 1,
          role: 0,
          rut: -1,
          password: -1
        }
      });
      
      expect(result.valid[0]).toMatchObject({
        email: 'john@test.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin'
      });
    });

    it('should handle Spanish headers', () => {
      const csv = `correo,nombre,apellido,rol
juan@test.com,Juan,Pérez,docente`;

      const result = parseBulkUserData(csv, { validateRut: false });
      
      expect(result.valid[0]).toMatchObject({
        email: 'juan@test.com',
        firstName: 'Juan',
        lastName: 'Pérez',
        role: 'docente'
      });
    });

    it('should track row numbers', () => {
      const csv = `email,firstName,lastName,role
john@test.com,John,Doe,admin
invalid-email,Jane,Smith,docente`;

      const result = parseBulkUserData(csv);
      
      expect(result.valid[0].rowNumber).toBe(2);
      expect(result.invalid[0].rowNumber).toBe(3);
    });
  });

  describe('formatParsedData', () => {
    it('should format users as table', () => {
      const users: BulkUserData[] = [
        {
          email: 'john@test.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'admin',
          rut: '12.345.678-5',
          password: 'Test1234'
        }
      ];

      const formatted = formatParsedData(users);
      
      expect(formatted).toContain('Email');
      expect(formatted).toContain('john@test.com');
      expect(formatted).toContain('12.345.678-5');
      expect(formatted).toContain('|'); // Table separator
    });

    it('should handle missing values', () => {
      const users: BulkUserData[] = [
        {
          email: 'john@test.com',
          role: 'admin'
        }
      ];

      const formatted = formatParsedData(users);
      
      expect(formatted).toContain('john@test.com');
      expect(formatted).not.toContain('undefined');
    });
  });

  describe('exportAsCSV', () => {
    it('should export users as CSV', () => {
      const users: BulkUserData[] = [
        {
          email: 'john@test.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'admin',
          password: 'Test1234'
        },
        {
          email: 'jane@test.com',
          firstName: 'Jane',
          lastName: 'Smith',
          role: 'docente',
          rut: '11.111.111-1'
        }
      ];

      const csv = exportAsCSV(users);
      
      expect(csv).toContain('email,firstName,lastName,role,rut,password');
      expect(csv).toContain('john@test.com,John,Doe,admin,,Test1234');
      expect(csv).toContain('jane@test.com,Jane,Smith,docente,11.111.111-1,');
    });

    it('should quote values with special characters', () => {
      const users: BulkUserData[] = [
        {
          email: 'john@test.com',
          firstName: 'John, Jr.',
          lastName: 'O"Brien',
          role: 'admin'
        }
      ];

      const csv = exportAsCSV(users);
      
      expect(csv).toContain('"John, Jr."');
      expect(csv).toContain('"O""Brien"'); // Escaped quotes
    });
  });

  describe('detectRoleFromEmail', () => {
    it('should detect admin role', () => {
      expect(detectRoleFromEmail('user@admin.com')).toBe('admin');
      expect(detectRoleFromEmail('admin@company.com')).toBe('admin');
    });

    it('should detect consultant role', () => {
      expect(detectRoleFromEmail('user@consultant.com')).toBe('consultor');
      expect(detectRoleFromEmail('user@consultor.cl')).toBe('consultor');
    });

    it('should detect director role', () => {
      expect(detectRoleFromEmail('user@director.edu')).toBe('equipo_directivo');
    });

    it('should return null for unrecognized patterns', () => {
      expect(detectRoleFromEmail('user@company.com')).toBe(null);
      expect(detectRoleFromEmail('invalid-email')).toBe(null);
    });
  });

  describe('generateSampleCSV', () => {
    it('should generate sample CSV data', () => {
      const sample = generateSampleCSV(3);
      
      expect(sample).toContain('email,firstName,lastName,role,rut');
      expect(sample).toContain('usuario1@ejemplo.cl');
      expect(sample).toContain('usuario2@ejemplo.cl');
      expect(sample).toContain('usuario3@ejemplo.cl');
    });

    it('should generate admin for first user', () => {
      const sample = generateSampleCSV(2);
      const lines = sample.split('\n');
      
      expect(lines[1]).toContain('admin');
      expect(lines[2]).toContain('docente');
    });

    it('should include RUT for first 3 users', () => {
      const sample = generateSampleCSV(5);
      const lines = sample.split('\n');
      
      expect(lines[1]).toContain('11.111.111-1');
      expect(lines[2]).toContain('12.345.678-5');
      expect(lines[3]).toContain('5.126.663-3');
      expect(lines[4]).not.toContain('11111114'); // No RUT for 4th
    });
  });

  describe('Integration tests', () => {
    it('should handle complete workflow', () => {
      // Generate sample data
      const sampleCSV = generateSampleCSV(10);
      
      // Parse it
      const parseResult = parseBulkUserData(sampleCSV);
      
      expect(parseResult.valid.length).toBeGreaterThan(0);
      expect(parseResult.invalid).toHaveLength(0);
      
      // Format for display
      const formatted = formatParsedData(parseResult.valid);
      expect(formatted).toBeTruthy();
      
      // Export back to CSV
      const exported = exportAsCSV(parseResult.valid);
      expect(exported.split('\n').length).toBe(11); // Header + 10 rows
    });

    it('should handle real-world messy data', () => {
      const messyCSV = `Email, First Name  ,Last Name,  Role  , RUT
  john.doe@company.cl  , John , "Doe, Jr." , ADMIN,12.345.678-5  
jane@test.com,Jane,,docente,
  ,Missing,Email,admin,
valid@email.com, , , , `;

      const result = parseBulkUserData(messyCSV);
      
      expect(result.valid.length).toBeGreaterThanOrEqual(2);
      expect(result.invalid.length).toBeGreaterThanOrEqual(1);
      
      // Check trimming worked
      const john = result.valid.find(u => u.firstName === 'John');
      expect(john?.email).toBe('john.doe@company.cl');
      expect(john?.role).toBe('admin');
    });
  });
});