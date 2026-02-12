/**
 * Unit tests for session UI helper functions
 * Task 1.1: Consultant Session Views
 *
 * Tests the shared status badge and formatting utilities
 */

import { describe, it, expect } from 'vitest';
import { getStatusBadge, getStatusColor, formatTime, getModalityIcon } from '../../../lib/utils/session-ui-helpers';
import type { SessionStatus } from '../../../lib/types/consultor-sessions.types';

describe('session-ui-helpers', () => {
  describe('getStatusBadge', () => {
    it('should return correct badge for programada status', () => {
      const badge = getStatusBadge('programada');
      expect(badge.label).toBe('Programada');
      expect(badge.className).toContain('bg-blue-100');
      expect(badge.className).toContain('text-blue-800');
    });

    it('should return correct badge for pendiente_informe status', () => {
      const badge = getStatusBadge('pendiente_informe');
      expect(badge.label).toBe('Pendiente Informe');
      expect(badge.className).toContain('bg-orange-100');
      expect(badge.className).toContain('text-orange-800');
    });

    it('should return correct badge for completada status', () => {
      const badge = getStatusBadge('completada');
      expect(badge.label).toBe('Completada');
      expect(badge.className).toContain('bg-green-100');
      expect(badge.className).toContain('text-green-800');
    });

    it('should return correct badge for cancelada status', () => {
      const badge = getStatusBadge('cancelada');
      expect(badge.label).toBe('Cancelada');
      expect(badge.className).toContain('bg-red-100');
      expect(badge.className).toContain('text-red-800');
    });

    it('should handle all valid session statuses', () => {
      const statuses: SessionStatus[] = [
        'borrador',
        'pendiente_aprobacion',
        'programada',
        'en_progreso',
        'pendiente_informe',
        'completada',
        'cancelada',
      ];

      statuses.forEach((status) => {
        const badge = getStatusBadge(status);
        expect(badge).toHaveProperty('label');
        expect(badge).toHaveProperty('className');
        expect(badge.label).toBeTruthy();
        expect(badge.className).toBeTruthy();
      });
    });
  });

  describe('getStatusColor', () => {
    it('should return correct hex color for programada status', () => {
      const color = getStatusColor('programada');
      expect(color).toBe('#3B82F6');
    });

    it('should return correct hex color for completada status', () => {
      const color = getStatusColor('completada');
      expect(color).toBe('#10B981');
    });

    it('should return correct hex color for cancelada status', () => {
      const color = getStatusColor('cancelada');
      expect(color).toBe('#EF4444');
    });

    it('should handle all valid session statuses', () => {
      const statuses: SessionStatus[] = [
        'borrador',
        'pendiente_aprobacion',
        'programada',
        'en_progreso',
        'pendiente_informe',
        'completada',
        'cancelada',
      ];

      statuses.forEach((status) => {
        const color = getStatusColor(status);
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });
  });

  describe('formatTime', () => {
    it('should extract HH:MM from full time string', () => {
      const formatted = formatTime('14:30:00');
      expect(formatted).toBe('14:30');
    });

    it('should handle morning times', () => {
      const formatted = formatTime('09:15:00');
      expect(formatted).toBe('09:15');
    });

    it('should handle midnight', () => {
      const formatted = formatTime('00:00:00');
      expect(formatted).toBe('00:00');
    });

    it('should handle noon', () => {
      const formatted = formatTime('12:00:00');
      expect(formatted).toBe('12:00');
    });

    it('should handle end of day', () => {
      const formatted = formatTime('23:59:00');
      expect(formatted).toBe('23:59');
    });
  });
});
