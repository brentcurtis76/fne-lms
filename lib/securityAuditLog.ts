/**
 * Security Audit Logging
 *
 * Centralized audit logging for security-relevant events.
 * Logs to console in development and can be extended for production logging services.
 *
 * This complements the existing auditLog.ts which handles assignment-specific auditing.
 */

import { NextApiRequest } from 'next';

// ============================================
// Types
// ============================================

export type SecurityEventType =
  // Authentication events
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILURE'
  | 'AUTH_LOGOUT'
  | 'AUTH_PASSWORD_CHANGE'
  | 'AUTH_PASSWORD_RESET'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_TOKEN_REFRESH'
  // Authorization events
  | 'AUTHZ_ACCESS_DENIED'
  | 'AUTHZ_ROLE_ASSIGNED'
  | 'AUTHZ_ROLE_REMOVED'
  | 'AUTHZ_PERMISSION_CHECK_FAILED'
  // Data access events
  | 'DATA_USER_CREATED'
  | 'DATA_USER_UPDATED'
  | 'DATA_USER_DELETED'
  | 'DATA_BULK_OPERATION'
  | 'DATA_EXPORT'
  // Security events
  | 'SECURITY_RATE_LIMIT_EXCEEDED'
  | 'SECURITY_INVALID_INPUT'
  | 'SECURITY_XSS_ATTEMPT'
  | 'SECURITY_SSRF_ATTEMPT'
  | 'SECURITY_SUSPICIOUS_ACTIVITY';

export type AuditSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface SecurityAuditEntry {
  timestamp: string;
  eventType: SecurityEventType;
  severity: AuditSeverity;
  userId?: string;
  targetUserId?: string;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  details?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
}

// ============================================
// Configuration
// ============================================

const AUDIT_CONFIG = {
  // Events that should always be logged regardless of environment
  criticalEvents: [
    'AUTH_LOGIN_FAILURE',
    'AUTH_PASSWORD_CHANGE',
    'AUTH_PASSWORD_RESET',
    'AUTHZ_ACCESS_DENIED',
    'AUTHZ_ROLE_ASSIGNED',
    'AUTHZ_ROLE_REMOVED',
    'DATA_USER_CREATED',
    'DATA_USER_DELETED',
    'DATA_BULK_OPERATION',
    'DATA_EXPORT',
    'SECURITY_RATE_LIMIT_EXCEEDED',
    'SECURITY_XSS_ATTEMPT',
    'SECURITY_SSRF_ATTEMPT',
    'SECURITY_SUSPICIOUS_ACTIVITY',
  ] as SecurityEventType[],

  // PII fields that should be redacted in logs
  piiFields: ['email', 'password', 'phone', 'address', 'ssn', 'credit_card'],
};

// ============================================
// Utility Functions
// ============================================

/**
 * Redact PII from log data
 */
function redactPII(data: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...data };

  for (const key of Object.keys(redacted)) {
    const lowerKey = key.toLowerCase();

    // Check for PII fields
    if (AUDIT_CONFIG.piiFields.some((pii) => lowerKey.includes(pii))) {
      redacted[key] = '[REDACTED]';
    }

    // Recursively redact nested objects
    if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactPII(redacted[key] as Record<string, unknown>);
    }
  }

  return redacted;
}

/**
 * Extract client IP from request
 */
function getClientIP(req?: NextApiRequest): string {
  if (!req) return 'unknown';

  // Check common proxy headers
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fall back to socket address
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Get severity based on event type
 */
function getSeverity(eventType: SecurityEventType): AuditSeverity {
  if (eventType.startsWith('SECURITY_')) return 'CRITICAL';
  if (eventType.includes('FAILURE') || eventType.includes('DENIED')) return 'WARN';
  if (eventType.includes('DELETED') || eventType.includes('RESET')) return 'WARN';
  return 'INFO';
}

// ============================================
// Main Logging Functions
// ============================================

/**
 * Log a security audit event
 */
export function logSecurityAuditEvent(
  eventType: SecurityEventType,
  options: {
    userId?: string;
    targetUserId?: string;
    req?: NextApiRequest;
    details?: Record<string, unknown>;
    success?: boolean;
    errorMessage?: string;
    severity?: AuditSeverity;
  } = {}
): void {
  const {
    userId,
    targetUserId,
    req,
    details = {},
    success = true,
    errorMessage,
    severity = getSeverity(eventType),
  } = options;

  const entry: SecurityAuditEntry = {
    timestamp: new Date().toISOString(),
    eventType,
    severity,
    userId,
    targetUserId,
    ip: getClientIP(req),
    userAgent: req?.headers['user-agent'] || undefined,
    endpoint: req?.url || undefined,
    method: req?.method || undefined,
    details: redactPII(details),
    success,
    errorMessage,
  };

  // Format log message
  const logPrefix = `[SECURITY_AUDIT][${severity}][${eventType}]`;
  const logMessage = {
    ...entry,
    // Remove undefined values for cleaner logs
    ...Object.fromEntries(
      Object.entries(entry).filter(([, v]) => v !== undefined)
    ),
  };

  // Log based on severity
  switch (severity) {
    case 'CRITICAL':
      console.error(logPrefix, JSON.stringify(logMessage));
      break;
    case 'ERROR':
      console.error(logPrefix, JSON.stringify(logMessage));
      break;
    case 'WARN':
      console.warn(logPrefix, JSON.stringify(logMessage));
      break;
    default:
      console.log(logPrefix, JSON.stringify(logMessage));
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Log authentication event
 */
export function logAuthEvent(
  event: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'PASSWORD_RESET',
  options: {
    userId?: string;
    req?: NextApiRequest;
    details?: Record<string, unknown>;
    errorMessage?: string;
  }
): void {
  const eventType = `AUTH_${event}` as SecurityEventType;
  logSecurityAuditEvent(eventType, {
    ...options,
    success: !event.includes('FAILURE'),
  });
}

/**
 * Log authorization event
 */
export function logAuthzEvent(
  event: 'ACCESS_DENIED' | 'ROLE_ASSIGNED' | 'ROLE_REMOVED',
  options: {
    userId?: string;
    targetUserId?: string;
    req?: NextApiRequest;
    details?: Record<string, unknown>;
  }
): void {
  const eventType = `AUTHZ_${event}` as SecurityEventType;
  logSecurityAuditEvent(eventType, {
    ...options,
    success: event !== 'ACCESS_DENIED',
  });
}

/**
 * Log security incident
 */
export function logSecurityIncident(
  event: 'RATE_LIMIT_EXCEEDED' | 'INVALID_INPUT' | 'XSS_ATTEMPT' | 'SSRF_ATTEMPT' | 'SUSPICIOUS_ACTIVITY',
  options: {
    userId?: string;
    req?: NextApiRequest;
    details?: Record<string, unknown>;
  }
): void {
  const eventType = `SECURITY_${event}` as SecurityEventType;
  logSecurityAuditEvent(eventType, {
    ...options,
    success: false,
    severity: 'CRITICAL',
  });
}

/**
 * Log data access event
 */
export function logDataAccessEvent(
  event: 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED' | 'BULK_OPERATION' | 'EXPORT',
  options: {
    userId?: string;
    targetUserId?: string;
    req?: NextApiRequest;
    details?: Record<string, unknown>;
  }
): void {
  const eventType = `DATA_${event}` as SecurityEventType;
  logSecurityAuditEvent(eventType, options);
}

// ============================================
// Middleware
// ============================================

/**
 * Create audit logging middleware for API routes
 */
export function withSecurityAudit(
  eventType: SecurityEventType,
  handler: (req: NextApiRequest, res: any) => Promise<void>
) {
  return async (req: NextApiRequest, res: any) => {
    const startTime = Date.now();

    try {
      await handler(req, res);

      // Log successful operation
      logSecurityAuditEvent(eventType, {
        req,
        details: {
          duration: Date.now() - startTime,
          statusCode: res.statusCode,
        },
        success: res.statusCode < 400,
      });
    } catch (error) {
      // Log failed operation
      logSecurityAuditEvent(eventType, {
        req,
        details: {
          duration: Date.now() - startTime,
        },
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  };
}

const securityAuditLog = {
  logSecurityAuditEvent,
  logAuthEvent,
  logAuthzEvent,
  logSecurityIncident,
  logDataAccessEvent,
  withSecurityAudit,
};

export default securityAuditLog;
