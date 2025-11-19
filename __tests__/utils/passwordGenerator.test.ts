import { describe, it, expect } from 'vitest';
import {
  generatePassword,
  generateMemorablePassword,
  generateBulkPasswords,
  validatePassword,
  calculatePasswordStrength,
  getPasswordStrengthLabel,
  DEFAULT_REQUIREMENTS,
  type PasswordRequirements
} from '../../utils/passwordGenerator';

describe('Password Generator Utilities', () => {
  describe('generatePassword', () => {
    it('should generate password with default requirements', () => {
      const password = generatePassword();
      
      expect(password).toHaveLength(8);
      expect(password).toMatch(/[A-Z]/); // Has uppercase
      expect(password).toMatch(/[a-z]/); // Has lowercase
      expect(password).toMatch(/[0-9]/); // Has number
    });

    it('should generate password with custom length', () => {
      const password = generatePassword({ minLength: 12 });
      expect(password).toHaveLength(12);
    });

    it('should generate password without special characters by default', () => {
      const password = generatePassword();
      expect(password).not.toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/);
    });

    it('should generate password with special characters when required', () => {
      const password = generatePassword({
        requireSpecialChars: true,
        specialChars: '!@#$'
      });
      expect(password).toMatch(/[!@#$]/);
    });

    it('should respect all custom requirements', () => {
      const requirements: PasswordRequirements = {
        minLength: 16,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        specialChars: '!@#'
      };
      
      const password = generatePassword(requirements);
      
      expect(password).toHaveLength(16);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#]/);
    });

    it('should generate different passwords on each call', () => {
      const passwords = new Set();
      for (let i = 0; i < 100; i++) {
        passwords.add(generatePassword());
      }
      // Should generate mostly unique passwords
      expect(passwords.size).toBeGreaterThan(95);
    });

    it('should avoid ambiguous characters', () => {
      // Generate many passwords to ensure we test the character set
      for (let i = 0; i < 100; i++) {
        const password = generatePassword();
        expect(password).not.toMatch(/[0O1lI]/); // No ambiguous chars
      }
    });
  });

  describe('generateMemorablePassword', () => {
    it('should generate memorable password with name parts', () => {
      const password = generateMemorablePassword('Juan', 'Pérez', true);
      
      expect(password).toContain('Juan');
      expect(password).toContain('Pérez'.substring(0, 4));
      expect(password).toMatch(/\d{3}/); // Contains 3-digit number
      expect(password).toContain(new Date().getFullYear().toString());
      expect(password).toMatch(/[!@#$*]/); // Contains special char
    });

    it('should handle short names', () => {
      const password = generateMemorablePassword('Jo', 'Li', true);
      
      expect(password).toMatch(/\d{3}/); // Still has number
      expect(password).toMatch(/[!@#$*]/); // Still has special char
    });

    it('should work without names', () => {
      const password = generateMemorablePassword(undefined, undefined, true);
      
      expect(password).toMatch(/\d{3}/);
      expect(password).toContain(new Date().getFullYear().toString());
      expect(password).toMatch(/[!@#$*]/);
    });

    it('should work without year', () => {
      const password = generateMemorablePassword('Test', 'User', false);
      
      expect(password).not.toContain(new Date().getFullYear().toString());
      expect(password).toContain('Test');
    });
  });

  describe('generateBulkPasswords', () => {
    it('should generate requested number of passwords', () => {
      const passwords = generateBulkPasswords(10);
      expect(passwords).toHaveLength(10);
    });

    it('should generate unique passwords', () => {
      const passwords = generateBulkPasswords(100);
      const uniquePasswords = new Set(passwords);
      expect(uniquePasswords.size).toBe(100);
    });

    it('should respect custom requirements for all passwords', () => {
      const requirements: PasswordRequirements = {
        minLength: 12,
        requireSpecialChars: true,
        specialChars: '@#$'
      };
      
      const passwords = generateBulkPasswords(50, requirements);
      
      passwords.forEach(password => {
        expect(password).toHaveLength(12);
        expect(password).toMatch(/[@#$]/);
      });
    });
  });

  describe('validatePassword', () => {
    it('should validate correct password', () => {
      const result = validatePassword('Test1234');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject short password', () => {
      const result = validatePassword('Test12');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La contraseña debe tener al menos 8 caracteres');
    });

    it('should reject password without uppercase', () => {
      const result = validatePassword('test1234');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La contraseña debe contener al menos una letra mayúscula');
    });

    it('should reject password without lowercase', () => {
      const result = validatePassword('TEST1234');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La contraseña debe contener al menos una letra minúscula');
    });

    it('should reject password without numbers', () => {
      const result = validatePassword('TestTest');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La contraseña debe contener al menos un número');
    });

    it('should validate special characters when required', () => {
      const requirements: PasswordRequirements = {
        requireSpecialChars: true,
        specialChars: '!@#'
      };
      
      const result1 = validatePassword('Test1234', requirements);
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('La contraseña debe contener al menos un carácter especial');
      
      const result2 = validatePassword('Test1234!', requirements);
      expect(result2.valid).toBe(true);
    });

    it('should return multiple errors', () => {
      const result = validatePassword('test');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('calculatePasswordStrength', () => {
    it('should calculate strength for weak passwords', () => {
      expect(calculatePasswordStrength('12345')).toBeLessThan(20);
      expect(calculatePasswordStrength('password')).toBeLessThan(30);
      expect(calculatePasswordStrength('abc123')).toBeLessThan(40);
    });

    it('should calculate strength for moderate passwords', () => {
      const score = calculatePasswordStrength('Test1234');
      expect(score).toBeGreaterThanOrEqual(40);
      expect(score).toBeLessThan(60);
    });

    it('should calculate strength for strong passwords', () => {
      const score = calculatePasswordStrength('Test@1234567');
      expect(score).toBeGreaterThanOrEqual(60);
      expect(score).toBeLessThan(80);
    });

    it('should calculate strength for very strong passwords', () => {
      const score = calculatePasswordStrength('MyVery$tr0ng&SecureP@ssw0rd2024!');
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('should penalize repeated characters', () => {
      const score1 = calculatePasswordStrength('Test1234');
      const score2 = calculatePasswordStrength('Testt1234'); // Double (no penalty)
      const score3 = calculatePasswordStrength('Testtt1234'); // Triple repeated (penalty)
      
      // Double characters don't get penalized, so scores should be similar
      expect(Math.abs(score1 - score2)).toBeLessThan(5);
      // Triple characters get penalized
      expect(score1).toBeGreaterThan(score3);
      expect(score2).toBeGreaterThan(score3);
    });

    it('should penalize common patterns', () => {
      const score1 = calculatePasswordStrength('Test5678');
      const score2 = calculatePasswordStrength('Test1234'); // Contains '123'
      
      expect(score1).toBeGreaterThan(score2);
    });

    it('should give bonus for length', () => {
      const score8 = calculatePasswordStrength('Test@123');
      const score12 = calculatePasswordStrength('Test@1234567');
      const score16 = calculatePasswordStrength('Test@12345678901');
      const score20 = calculatePasswordStrength('Test@123456789012345');
      
      expect(score12).toBeGreaterThan(score8);
      expect(score16).toBeGreaterThan(score12);
      expect(score20).toBeGreaterThan(score16);
    });
  });

  describe('getPasswordStrengthLabel', () => {
    it('should return correct labels for different scores', () => {
      expect(getPasswordStrengthLabel(10)).toBe('Muy débil');
      expect(getPasswordStrengthLabel(25)).toBe('Débil');
      expect(getPasswordStrengthLabel(45)).toBe('Moderada');
      expect(getPasswordStrengthLabel(65)).toBe('Fuerte');
      expect(getPasswordStrengthLabel(85)).toBe('Muy fuerte');
    });

    it('should handle edge cases', () => {
      expect(getPasswordStrengthLabel(0)).toBe('Muy débil');
      expect(getPasswordStrengthLabel(100)).toBe('Muy fuerte');
      expect(getPasswordStrengthLabel(19)).toBe('Muy débil');
      expect(getPasswordStrengthLabel(20)).toBe('Débil');
      expect(getPasswordStrengthLabel(80)).toBe('Muy fuerte');
    });
  });

  describe('Integration tests', () => {
    it('should generate and validate passwords correctly', () => {
      const requirements: PasswordRequirements = {
        minLength: 10,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        specialChars: '!@#$%'
      };
      
      // Generate 100 passwords and validate each
      for (let i = 0; i < 100; i++) {
        const password = generatePassword(requirements);
        const validation = validatePassword(password, requirements);
        
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it('should generate strong passwords', () => {
      // Generate passwords and check their strength
      const passwords = generateBulkPasswords(50, {
        minLength: 12,
        requireSpecialChars: true
      });
      
      passwords.forEach(password => {
        const strength = calculatePasswordStrength(password);
        expect(strength).toBeGreaterThanOrEqual(60); // At least "Strong"
      });
    });
  });
});