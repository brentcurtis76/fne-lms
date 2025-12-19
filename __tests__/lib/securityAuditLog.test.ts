/**
 * Unit tests for Security Audit Logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  logSecurityAuditEvent,
  logAuthEvent,
  logAuthzEvent,
  logSecurityIncident,
  logDataAccessEvent,
  withSecurityAudit,
} from '../../lib/securityAuditLog';
import { NextApiRequest } from 'next';

// Mock console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

describe('securityAuditLog', () => {
  let consoleLogs: string[] = [];
  let consoleWarns: string[] = [];
  let consoleErrors: string[] = [];

  beforeEach(() => {
    consoleLogs = [];
    consoleWarns = [];
    consoleErrors = [];

    console.log = vi.fn((...args) => {
      consoleLogs.push(args.join(' '));
    });
    console.warn = vi.fn((...args) => {
      consoleWarns.push(args.join(' '));
    });
    console.error = vi.fn((...args) => {
      consoleErrors.push(args.join(' '));
    });
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  const createMockRequest = (overrides: Partial<NextApiRequest> = {}): NextApiRequest => ({
    headers: {
      'x-forwarded-for': '192.168.1.100',
      'user-agent': 'Mozilla/5.0 Test Browser',
    },
    url: '/api/test',
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as NextApiRequest);

  describe('logSecurityAuditEvent', () => {
    it('should log INFO events to console.log', () => {
      logSecurityAuditEvent('AUTH_LOGIN_SUCCESS', {
        userId: 'user-123',
        success: true,
      });

      expect(consoleLogs.length).toBe(1);
      expect(consoleLogs[0]).toContain('[SECURITY_AUDIT][INFO][AUTH_LOGIN_SUCCESS]');
      expect(consoleLogs[0]).toContain('user-123');
    });

    it('should log WARN events to console.warn', () => {
      logSecurityAuditEvent('AUTH_LOGIN_FAILURE', {
        userId: 'user-123',
        success: false,
      });

      expect(consoleWarns.length).toBe(1);
      expect(consoleWarns[0]).toContain('[SECURITY_AUDIT][WARN][AUTH_LOGIN_FAILURE]');
    });

    it('should log CRITICAL events to console.error', () => {
      logSecurityAuditEvent('SECURITY_RATE_LIMIT_EXCEEDED', {
        req: createMockRequest(),
        success: false,
      });

      expect(consoleErrors.length).toBe(1);
      expect(consoleErrors[0]).toContain('[SECURITY_AUDIT][CRITICAL][SECURITY_RATE_LIMIT_EXCEEDED]');
    });

    it('should extract IP from x-forwarded-for header', () => {
      logSecurityAuditEvent('AUTH_LOGIN_SUCCESS', {
        req: createMockRequest({
          headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
        }),
      });

      expect(consoleLogs[0]).toContain('10.0.0.1');
    });

    it('should extract IP from x-real-ip header', () => {
      logSecurityAuditEvent('AUTH_LOGIN_SUCCESS', {
        req: createMockRequest({
          headers: { 'x-real-ip': '172.16.0.1' },
        }),
      });

      expect(consoleLogs[0]).toContain('172.16.0.1');
    });

    it('should include user agent in logs', () => {
      logSecurityAuditEvent('AUTH_LOGIN_SUCCESS', {
        req: createMockRequest(),
      });

      expect(consoleLogs[0]).toContain('Mozilla/5.0 Test Browser');
    });

    it('should include endpoint and method in logs', () => {
      logSecurityAuditEvent('AUTH_LOGIN_SUCCESS', {
        req: createMockRequest(),
      });

      expect(consoleLogs[0]).toContain('/api/test');
      expect(consoleLogs[0]).toContain('POST');
    });
  });

  describe('PII Redaction', () => {
    it('should redact email addresses in details', () => {
      logSecurityAuditEvent('AUTH_LOGIN_SUCCESS', {
        details: { user_email: 'test@example.com' },
      });

      expect(consoleLogs[0]).toContain('[REDACTED]');
      expect(consoleLogs[0]).not.toContain('test@example.com');
    });

    it('should redact password fields in details', () => {
      // AUTH_PASSWORD_CHANGE maps to INFO severity (no FAILURE/DENIED in name)
      // so it goes to console.log
      logSecurityAuditEvent('AUTH_PASSWORD_CHANGE', {
        details: { old_password: 'secret123', new_password: 'newsecret456' },
      });

      // Check in consoleLogs since PASSWORD_CHANGE is INFO level
      expect(consoleLogs[0]).toContain('[REDACTED]');
      expect(consoleLogs[0]).not.toContain('secret123');
      expect(consoleLogs[0]).not.toContain('newsecret456');
    });

    it('should redact phone numbers in details', () => {
      logSecurityAuditEvent('DATA_USER_UPDATED', {
        details: { phone_number: '+1234567890' },
      });

      expect(consoleLogs[0]).toContain('[REDACTED]');
      expect(consoleLogs[0]).not.toContain('+1234567890');
    });

    it('should redact nested PII fields', () => {
      logSecurityAuditEvent('DATA_USER_CREATED', {
        details: {
          user: {
            email: 'nested@example.com',
            profile: {
              password_hash: 'abc123',
            },
          },
        },
      });

      expect(consoleLogs[0]).toContain('[REDACTED]');
      expect(consoleLogs[0]).not.toContain('nested@example.com');
      expect(consoleLogs[0]).not.toContain('abc123');
    });
  });

  describe('logAuthEvent', () => {
    it('should log LOGIN_SUCCESS with correct event type', () => {
      logAuthEvent('LOGIN_SUCCESS', {
        userId: 'user-123',
        req: createMockRequest(),
      });

      expect(consoleLogs[0]).toContain('AUTH_LOGIN_SUCCESS');
      expect(consoleLogs[0]).toContain('"success":true');
    });

    it('should log LOGIN_FAILURE with correct event type', () => {
      logAuthEvent('LOGIN_FAILURE', {
        req: createMockRequest(),
        errorMessage: 'Invalid credentials',
      });

      expect(consoleWarns[0]).toContain('AUTH_LOGIN_FAILURE');
      expect(consoleWarns[0]).toContain('"success":false');
    });

    it('should log PASSWORD_CHANGE with correct event type', () => {
      logAuthEvent('PASSWORD_CHANGE', {
        userId: 'user-123',
        req: createMockRequest(),
        details: { change_type: 'user_initiated' },
      });

      // PASSWORD_CHANGE maps to INFO level (no FAILURE in name)
      expect(consoleLogs[0]).toContain('AUTH_PASSWORD_CHANGE');
    });
  });

  describe('logAuthzEvent', () => {
    it('should log ACCESS_DENIED with correct event type', () => {
      logAuthzEvent('ACCESS_DENIED', {
        userId: 'user-123',
        req: createMockRequest(),
        details: { resource: '/admin/users' },
      });

      expect(consoleWarns[0]).toContain('AUTHZ_ACCESS_DENIED');
      expect(consoleWarns[0]).toContain('"success":false');
    });

    it('should log ROLE_ASSIGNED with correct event type', () => {
      logAuthzEvent('ROLE_ASSIGNED', {
        userId: 'admin-123',
        targetUserId: 'user-456',
        details: { role: 'docente' },
      });

      expect(consoleLogs[0]).toContain('AUTHZ_ROLE_ASSIGNED');
      expect(consoleLogs[0]).toContain('admin-123');
      expect(consoleLogs[0]).toContain('user-456');
    });
  });

  describe('logSecurityIncident', () => {
    it('should log RATE_LIMIT_EXCEEDED as CRITICAL', () => {
      logSecurityIncident('RATE_LIMIT_EXCEEDED', {
        req: createMockRequest(),
        details: { endpoint: '/api/login', limit: 10 },
      });

      expect(consoleErrors[0]).toContain('[CRITICAL]');
      expect(consoleErrors[0]).toContain('SECURITY_RATE_LIMIT_EXCEEDED');
    });

    it('should log XSS_ATTEMPT as CRITICAL', () => {
      logSecurityIncident('XSS_ATTEMPT', {
        req: createMockRequest(),
        details: { payload: '<script>alert("xss")</script>' },
      });

      expect(consoleErrors[0]).toContain('SECURITY_XSS_ATTEMPT');
    });

    it('should log SSRF_ATTEMPT as CRITICAL', () => {
      logSecurityIncident('SSRF_ATTEMPT', {
        req: createMockRequest(),
        details: { url: 'http://169.254.169.254/latest/meta-data/' },
      });

      expect(consoleErrors[0]).toContain('SECURITY_SSRF_ATTEMPT');
    });
  });

  describe('logDataAccessEvent', () => {
    it('should log USER_CREATED event', () => {
      logDataAccessEvent('USER_CREATED', {
        userId: 'admin-123',
        targetUserId: 'new-user-456',
        details: { role: 'docente' },
      });

      expect(consoleLogs[0]).toContain('DATA_USER_CREATED');
    });

    it('should log BULK_OPERATION event', () => {
      logDataAccessEvent('BULK_OPERATION', {
        userId: 'admin-123',
        details: { count: 50, operation: 'create_users' },
      });

      expect(consoleLogs[0]).toContain('DATA_BULK_OPERATION');
    });

    it('should log EXPORT event', () => {
      logDataAccessEvent('EXPORT', {
        userId: 'admin-123',
        details: { format: 'csv', records: 1000 },
      });

      expect(consoleLogs[0]).toContain('DATA_EXPORT');
    });
  });

  describe('withSecurityAudit middleware', () => {
    it('should log successful operations', async () => {
      const handler = vi.fn(async (req, res) => {
        res.statusCode = 200;
      });

      const wrappedHandler = withSecurityAudit('AUTH_LOGIN_SUCCESS', handler);
      const req = createMockRequest();
      const res = { statusCode: 200 };

      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
      expect(consoleLogs[0]).toContain('AUTH_LOGIN_SUCCESS');
      expect(consoleLogs[0]).toContain('"success":true');
    });

    it('should log failed operations when status >= 400', async () => {
      const handler = vi.fn(async (req, res) => {
        res.statusCode = 401;
      });

      const wrappedHandler = withSecurityAudit('AUTH_LOGIN_FAILURE', handler);
      const req = createMockRequest();
      const res = { statusCode: 401 };

      await wrappedHandler(req, res);

      expect(consoleWarns[0]).toContain('"success":false');
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Test error');
      const handler = vi.fn(async () => {
        throw error;
      });

      const wrappedHandler = withSecurityAudit('AUTH_LOGIN_FAILURE', handler);
      const req = createMockRequest();
      const res = { statusCode: 200 };

      await expect(wrappedHandler(req, res)).rejects.toThrow('Test error');
      expect(consoleWarns[0]).toContain('"success":false');
      expect(consoleWarns[0]).toContain('Test error');
    });

    it('should include duration in logs', async () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const wrappedHandler = withSecurityAudit('AUTH_LOGIN_SUCCESS', handler);
      const req = createMockRequest();
      const res = { statusCode: 200 };

      await wrappedHandler(req, res);

      expect(consoleLogs[0]).toContain('duration');
    });
  });
});
