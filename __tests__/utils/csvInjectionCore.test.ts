import { describe, it, expect } from 'vitest';
import { parseBulkUserData } from '../../utils/bulkUserParser';

describe('CSV Injection Protection - Core Functionality', () => {
  describe('Formula Prevention', () => {
    it('should escape equals sign at start of field', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,=SUM(A1:A10),Normal,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'=SUM(A1:A10)");
    });

    it('should escape plus sign at start of field', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,+SUM(A1:A10),Normal,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'+SUM(A1:A10)");
    });

    it('should escape minus sign at start of field', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,-SUM(A1:A10),Normal,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'-SUM(A1:A10)");
    });

    it('should escape at sign at start of field', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,@SUM(A1:A10),Normal,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'@SUM(A1:A10)");
    });

    it('should not escape formula characters in middle of field', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,John=Doe,Smith+Johnson,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe('John=Doe');
      expect(result.valid[0].lastName).toBe('Smith+Johnson');
    });
  });

  describe('Real-world Attack Vectors', () => {
    it('should protect against Excel DDE injection', () => {
      const csvData = `email,firstName,lastName,role
evil@hacker.com,=cmd|'/c calc'!A0,Victim,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'=cmd|'/c calc'!A0");
    });

    it('should protect against CSV formula injection in all fields', () => {
      const csvData = `email,firstName,lastName,role\n=evil@hacker.com,+EVIL(),@MALICIOUS(),=admin`;

      const result = parseBulkUserData(csvData);
      
      // Should be invalid due to various validation errors
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].email).toBe("'=evil@hacker.com");
      expect(result.invalid[0].errors?.length).toBeGreaterThan(0);
    });

    it('should handle quoted fields with formula injection', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,"=SUM(A1:A10)","Normal Name",docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'=SUM(A1:A10)");
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle empty fields without errors', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,,,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe('');
      expect(result.valid[0].lastName).toBe('');
    });

    it('should handle large formula injections efficiently', () => {
      const longFormula = '=' + 'A'.repeat(1000);
      const csvData = `email,firstName,lastName,role
test@example.com,${longFormula},Normal,docente`;

      const startTime = Date.now();
      const result = parseBulkUserData(csvData);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'" + longFormula);
    });

    it('should process multiple formula injections in batch', () => {
      const rows = ['email,firstName,lastName,role'];
      for (let i = 0; i < 50; i++) {
        rows.push(`user${i}@example.com,=EVIL${i},+BAD${i},docente`);
      }
      
      const csvData = rows.join('\n');
      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(50);
      result.valid.forEach((user, index) => {
        expect(user.firstName).toBe(`'=EVIL${index}`);
        expect(user.lastName).toBe(`'+BAD${index}`);
      });
    });
  });

  describe('Security Validation', () => {
    it('should prevent all common spreadsheet formula prefixes', () => {
      const dangerousPrefixes = ['=', '+', '-', '@'];
      
      dangerousPrefixes.forEach(prefix => {
        const csvData = `email,firstName,lastName,role
test@example.com,${prefix}MALICIOUS(),Normal,docente`;

        const result = parseBulkUserData(csvData);
        
        expect(result.valid).toHaveLength(1);
        expect(result.valid[0].firstName).toBe(`'${prefix}MALICIOUS()`);
      });
    });

    it('should maintain data integrity for legitimate data', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,José María,García-López,docente
user@example.com,María José,O'Connor,admin`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toBe('José María');
      expect(result.valid[0].lastName).toBe('García-López');
      expect(result.valid[1].firstName).toBe('María José');
      expect(result.valid[1].lastName).toBe("O'Connor");
    });
  });
});