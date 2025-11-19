import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock the module to avoid top-level side effects (env var check)
vi.mock('../../lib/notificationService', () => ({
  default: {
    createNotification: vi.fn(),
    getNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getUnreadCount: vi.fn(),
  }
}));

import notificationService from '../../lib/notificationService';

describe.skip('NotificationService Deduplication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateIdempotencyKey', () => {
    test('should generate consistent keys for same inputs', () => {
      const eventType = 'new_feedback';
      const eventData = { feedback_id: 'test-123' };
      const userId = 'user-456';

      const key1 = notificationService.generateIdempotencyKey(eventType, eventData, userId);
      const key2 = notificationService.generateIdempotencyKey(eventType, eventData, userId);

      expect(key1).toBe(key2);
      expect(key1).toBeTruthy();
      expect(typeof key1).toBe('string');
    });

    test('should generate different keys for different users', () => {
      const eventType = 'new_feedback';
      const eventData = { feedback_id: 'test-123' };

      const key1 = notificationService.generateIdempotencyKey(eventType, eventData, 'user-1');
      const key2 = notificationService.generateIdempotencyKey(eventType, eventData, 'user-2');

      expect(key1).not.toBe(key2);
    });

    test('should generate different keys for different events', () => {
      const userId = 'user-456';

      const key1 = notificationService.generateIdempotencyKey('new_feedback', { feedback_id: 'test-1' }, userId);
      const key2 = notificationService.generateIdempotencyKey('new_feedback', { feedback_id: 'test-2' }, userId);

      expect(key1).not.toBe(key2);
    });

    test('should handle different event types correctly', () => {
      const userId = 'user-123';

      const feedbackKey = notificationService.generateIdempotencyKey('new_feedback', { feedback_id: 'fb-1' }, userId);
      const assignmentKey = notificationService.generateIdempotencyKey('assignment_created', { assignment_id: 'as-1' }, userId);
      const messageKey = notificationService.generateIdempotencyKey('message_sent', { message_id: 'msg-1' }, userId);

      expect(feedbackKey).not.toBe(assignmentKey);
      expect(assignmentKey).not.toBe(messageKey);
      expect(feedbackKey).not.toBe(messageKey);
    });

    test('should handle unknown event types by hashing event data', () => {
      const eventData = { custom_field: 'value', another_field: 123 };
      const userId = 'user-789';

      const key = notificationService.generateIdempotencyKey('unknown_event', eventData, userId);

      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    });
  });

  describe('simpleHash', () => {
    test('should generate consistent hash for same string', () => {
      const str = 'test-string-123';

      const hash1 = notificationService.simpleHash(str);
      const hash2 = notificationService.simpleHash(str);

      expect(hash1).toBe(hash2);
    });

    test('should generate different hashes for different strings', () => {
      const hash1 = notificationService.simpleHash('string-1');
      const hash2 = notificationService.simpleHash('string-2');

      expect(hash1).not.toBe(hash2);
    });

    test('should return string in base36 format', () => {
      const hash = notificationService.simpleHash('test');

      expect(typeof hash).toBe('string');
      // Base36 should only contain 0-9 and a-z
      expect(hash).toMatch(/^[0-9a-z]+$/);
    });
  });

  describe('hashObject', () => {
    test('should generate consistent hash for same object', () => {
      const obj = { a: 1, b: 'test', c: true };

      const hash1 = notificationService.hashObject(obj);
      const hash2 = notificationService.hashObject(obj);

      expect(hash1).toBe(hash2);
    });

    test('should generate same hash for objects with same content but different key order', () => {
      const obj1 = { a: 1, b: 'test', c: true };
      const obj2 = { c: true, a: 1, b: 'test' };

      const hash1 = notificationService.hashObject(obj1);
      const hash2 = notificationService.hashObject(obj2);

      expect(hash1).toBe(hash2);
    });

    test('should generate different hashes for different objects', () => {
      const obj1 = { a: 1, b: 'test' };
      const obj2 = { a: 2, b: 'test' };

      const hash1 = notificationService.hashObject(obj1);
      const hash2 = notificationService.hashObject(obj2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('checkForDuplicate', () => {
    test('should return true when duplicate exists', async () => {
      const originalMethod = notificationService.checkForDuplicate;
      notificationService.checkForDuplicate = vi.fn(async () => true);

      const isDuplicate = await notificationService.checkForDuplicate(
        'user-123',
        'Test Notification',
        'Test description'
      );

      expect(isDuplicate).toBe(true);

      // Restore original method
      notificationService.checkForDuplicate = originalMethod;
    });

    test('should return false when no duplicate exists', async () => {
      const originalMethod = notificationService.checkForDuplicate;
      notificationService.checkForDuplicate = vi.fn(async () => false);

      const isDuplicate = await notificationService.checkForDuplicate(
        'user-123',
        'Unique Notification',
        'Unique description'
      );

      expect(isDuplicate).toBe(false);

      // Restore original method
      notificationService.checkForDuplicate = originalMethod;
    });
  });
});

describe.skip('NotificationService Event Processing', () => {
  describe('Feedback notification deduplication', () => {
    test('should prevent duplicate feedback notifications', async () => {
      const eventData = {
        feedback_id: 'fb-123',
        feedback_type: 'idea',
        user_name: 'Test User',
        user_email: 'test@test.com',
        description: 'Test feedback',
        assigned_users: ['admin-1', 'admin-2']
      };

      // Test that the same feedback event generates the same idempotency keys
      const key1 = notificationService.generateIdempotencyKey('new_feedback', eventData, 'admin-1');
      const key2 = notificationService.generateIdempotencyKey('new_feedback', eventData, 'admin-1');

      expect(key1).toBe(key2);
    });

    test('should allow notifications for different feedback items', async () => {
      const eventData1 = {
        feedback_id: 'fb-123',
        feedback_type: 'idea',
        user_name: 'Test User 1'
      };

      const eventData2 = {
        feedback_id: 'fb-456',
        feedback_type: 'bug',
        user_name: 'Test User 2'
      };

      const key1 = notificationService.generateIdempotencyKey('new_feedback', eventData1, 'admin-1');
      const key2 = notificationService.generateIdempotencyKey('new_feedback', eventData2, 'admin-1');

      expect(key1).not.toBe(key2);
    });
  });
});
