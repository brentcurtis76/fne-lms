import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { passwordStore, generateSessionId } from '../../lib/temporaryPasswordStore';

describe('TemporaryPasswordStore', () => {
  let sessionId: string;

  beforeEach(() => {
    // Use fake timers for tests that need time control
    vi.useFakeTimers();
    sessionId = generateSessionId();
    // Clear any existing data
    passwordStore.clear(sessionId);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
    passwordStore.clear(sessionId);
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^bulk-import-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^bulk-import-\d+-[a-z0-9]+$/);
    });

    it('should include timestamp in session ID', () => {
      const now = Date.now();
      const sessionId = generateSessionId();
      
      expect(sessionId).toContain(now.toString());
    });
  });

  describe('store', () => {
    it('should store password for a session', () => {
      passwordStore.store(sessionId, 'test@example.com', 'password123');
      
      const passwords = passwordStore.retrieve(sessionId);
      expect(passwords).toHaveLength(1);
      expect(passwords[0]).toMatchObject({
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should store multiple passwords for the same session', () => {
      passwordStore.store(sessionId, 'user1@example.com', 'pass1');
      passwordStore.store(sessionId, 'user2@example.com', 'pass2');
      
      const passwords = passwordStore.retrieve(sessionId);
      expect(passwords).toHaveLength(2);
      
      const emails = passwords.map(p => p.email);
      expect(emails).toContain('user1@example.com');
      expect(emails).toContain('user2@example.com');
    });

    it('should overwrite password for same email in same session', () => {
      passwordStore.store(sessionId, 'test@example.com', 'oldpassword');
      passwordStore.store(sessionId, 'test@example.com', 'newpassword');
      
      const passwords = passwordStore.retrieve(sessionId);
      expect(passwords).toHaveLength(1);
      expect(passwords[0].password).toBe('newpassword');
    });

    it('should isolate passwords between different sessions', () => {
      const session2 = generateSessionId();
      
      passwordStore.store(sessionId, 'user1@example.com', 'pass1');
      passwordStore.store(session2, 'user2@example.com', 'pass2');
      
      const passwords1 = passwordStore.retrieve(sessionId);
      const passwords2 = passwordStore.retrieve(session2);
      
      expect(passwords1).toHaveLength(1);
      expect(passwords2).toHaveLength(1);
      expect(passwords1[0].email).toBe('user1@example.com');
      expect(passwords2[0].email).toBe('user2@example.com');
      
      // Cleanup
      passwordStore.clear(session2);
    });
  });

  describe('retrieve', () => {
    it('should return empty array for non-existent session', () => {
      const passwords = passwordStore.retrieve('non-existent-session');
      expect(passwords).toEqual([]);
    });

    it('should include creation and expiration timestamps', () => {
      const beforeStore = new Date();
      passwordStore.store(sessionId, 'test@example.com', 'password123');
      const afterStore = new Date();
      
      const passwords = passwordStore.retrieve(sessionId);
      expect(passwords[0].createdAt).toBeInstanceOf(Date);
      expect(passwords[0].expiresAt).toBeInstanceOf(Date);
      
      expect(passwords[0].createdAt.getTime()).toBeGreaterThanOrEqual(beforeStore.getTime());
      expect(passwords[0].createdAt.getTime()).toBeLessThanOrEqual(afterStore.getTime());
      
      // Should expire 15 minutes after creation
      const expectedExpiration = passwords[0].createdAt.getTime() + (15 * 60 * 1000);
      expect(passwords[0].expiresAt.getTime()).toBe(expectedExpiration);
    });

    it('should filter out expired passwords', () => {
      passwordStore.store(sessionId, 'test@example.com', 'password123');
      
      // Advance time by 16 minutes (past 15-minute expiration)
      vi.advanceTimersByTime(16 * 60 * 1000);
      
      const passwords = passwordStore.retrieve(sessionId);
      expect(passwords).toEqual([]);
    });

    it('should return mix of expired and valid passwords correctly', () => {
      // Store first password
      passwordStore.store(sessionId, 'old@example.com', 'oldpass');
      
      // Advance time by 16 minutes
      vi.advanceTimersByTime(16 * 60 * 1000);
      
      // Store second password (should still be valid)
      passwordStore.store(sessionId, 'new@example.com', 'newpass');
      
      const passwords = passwordStore.retrieve(sessionId);
      expect(passwords).toHaveLength(1);
      expect(passwords[0].email).toBe('new@example.com');
    });
  });

  describe('clear', () => {
    it('should clear all passwords for a session', () => {
      passwordStore.store(sessionId, 'user1@example.com', 'pass1');
      passwordStore.store(sessionId, 'user2@example.com', 'pass2');
      
      expect(passwordStore.retrieve(sessionId)).toHaveLength(2);
      
      passwordStore.clear(sessionId);
      
      expect(passwordStore.retrieve(sessionId)).toEqual([]);
    });

    it('should not affect other sessions when clearing', () => {
      const session2 = generateSessionId();
      
      passwordStore.store(sessionId, 'user1@example.com', 'pass1');
      passwordStore.store(session2, 'user2@example.com', 'pass2');
      
      passwordStore.clear(sessionId);
      
      expect(passwordStore.retrieve(sessionId)).toEqual([]);
      expect(passwordStore.retrieve(session2)).toHaveLength(1);
      
      // Cleanup
      passwordStore.clear(session2);
    });

    it('should handle clearing non-existent session gracefully', () => {
      expect(() => {
        passwordStore.clear('non-existent-session');
      }).not.toThrow();
    });
  });

  describe('automatic cleanup', () => {
    it('should schedule automatic cleanup of expired entries', () => {
      passwordStore.store(sessionId, 'test@example.com', 'password123');
      
      // Verify password is there initially
      expect(passwordStore.retrieve(sessionId)).toHaveLength(1);
      
      // Advance time to trigger automatic cleanup (15 minutes + 1ms)
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      
      // Automatic cleanup should have removed the entry
      expect(passwordStore.retrieve(sessionId)).toEqual([]);
    });

    it('should clean up individual entries without affecting others', () => {
      passwordStore.store(sessionId, 'user1@example.com', 'pass1');
      
      // Wait 1 minute before storing second password
      vi.advanceTimersByTime(60 * 1000);
      passwordStore.store(sessionId, 'user2@example.com', 'pass2');
      
      // Advance to expire first password but not second (14 more minutes)
      vi.advanceTimersByTime(14 * 60 * 1000);
      
      const passwords = passwordStore.retrieve(sessionId);
      expect(passwords).toHaveLength(1);
      expect(passwords[0].email).toBe('user2@example.com');
    });
  });

  describe('security considerations', () => {
    it('should not expose internal store structure', () => {
      passwordStore.store(sessionId, 'test@example.com', 'password123');
      
      const passwords = passwordStore.retrieve(sessionId);
      
      // Modifying returned array should not affect internal state
      passwords.push({
        email: 'hacker@example.com',
        password: 'hacked',
        createdAt: new Date(),
        expiresAt: new Date()
      });
      
      const secondRetrieval = passwordStore.retrieve(sessionId);
      expect(secondRetrieval).toHaveLength(1);
      expect(secondRetrieval[0].email).toBe('test@example.com');
    });

    it('should handle malicious session IDs safely', () => {
      const maliciousIds = [
        '',
        null as any,
        undefined as any,
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
        'DROP TABLE passwords;--'
      ];
      
      maliciousIds.forEach(id => {
        expect(() => {
          passwordStore.store(id, 'test@example.com', 'password');
          passwordStore.retrieve(id);
          passwordStore.clear(id);
        }).not.toThrow();
      });
    });

    it('should handle malicious email and password data safely', () => {
      const maliciousData = [
        { email: '<script>alert("xss")</script>', password: 'normal' },
        { email: 'normal@example.com', password: '${process.env.SECRET}' },
        { email: '../../../etc/passwd', password: 'DROP TABLE users;--' },
        { email: '', password: '' },
        { email: 'a'.repeat(10000), password: 'b'.repeat(10000) }
      ];
      
      maliciousData.forEach(({ email, password }) => {
        expect(() => {
          passwordStore.store(sessionId, email, password);
          const passwords = passwordStore.retrieve(sessionId);
          expect(passwords[0]?.email).toBe(email);
          expect(passwords[0]?.password).toBe(password);
          passwordStore.clear(sessionId);
        }).not.toThrow();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent access to same session', () => {
      const promises = [];
      
      // Simulate concurrent stores
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            passwordStore.store(sessionId, `user${i}@example.com`, `pass${i}`);
            resolve();
          })
        );
      }
      
      return Promise.all(promises).then(() => {
        const passwords = passwordStore.retrieve(sessionId);
        expect(passwords).toHaveLength(10);
      });
    });

    it('should handle very long session IDs', () => {
      const longSessionId = 'a'.repeat(1000);
      
      expect(() => {
        passwordStore.store(longSessionId, 'test@example.com', 'password');
        const passwords = passwordStore.retrieve(longSessionId);
        expect(passwords).toHaveLength(1);
        passwordStore.clear(longSessionId);
      }).not.toThrow();
    });

    it('should handle storage of many passwords without memory issues', () => {
      const largeSessionId = generateSessionId();
      
      // Store 1000 passwords
      for (let i = 0; i < 1000; i++) {
        passwordStore.store(largeSessionId, `user${i}@example.com`, `password${i}`);
      }
      
      const passwords = passwordStore.retrieve(largeSessionId);
      expect(passwords).toHaveLength(1000);
      
      passwordStore.clear(largeSessionId);
      expect(passwordStore.retrieve(largeSessionId)).toEqual([]);
    });
  });
});