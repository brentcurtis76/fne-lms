/**
 * Unit tests for session UI helper functions
 * Task 1.1: Consultant Session Views
 *
 * Tests the shared status badge and formatting utilities
 * Updated for brand-aligned palette (no blue/green/orange)
 */

import { describe, it, expect } from 'vitest';
import { getStatusBadge, getStatusColor, getSeriesStatsPillClass, formatTime } from '../../../lib/utils/session-ui-helpers';
import type { SessionStatus } from '../../../lib/types/consultor-sessions.types';

describe('session-ui-helpers', () => {
  describe('getStatusBadge', () => {
    it('should return correct badge for programada status (brand-aligned)', () => {
      const badge = getStatusBadge('programada');
      expect(badge.label).toBe('Programada');
      expect(badge.className).toContain('bg-gray-200');
      expect(badge.className).toContain('text-gray-900');
    });

    it('should return correct badge for pendiente_informe status (brand-aligned)', () => {
      const badge = getStatusBadge('pendiente_informe');
      expect(badge.label).toBe('Pendiente Informe');
      expect(badge.className).toContain('bg-yellow-50');
      expect(badge.className).toContain('text-amber-700');
    });

    it('should return correct badge for completada status (brand-aligned)', () => {
      const badge = getStatusBadge('completada');
      expect(badge.label).toBe('Completada');
      expect(badge.className).toContain('bg-gray-800');
      expect(badge.className).toContain('text-white');
    });

    it('should return correct badge for cancelada status', () => {
      const badge = getStatusBadge('cancelada');
      expect(badge.label).toBe('Cancelada');
      expect(badge.className).toContain('bg-red-100');
      expect(badge.className).toContain('text-red-700');
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

    it('should NOT use blue, green, or orange classes (brand compliance)', () => {
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
        expect(badge.className).not.toMatch(/\bblue\b/);
        expect(badge.className).not.toMatch(/\bgreen\b/);
        expect(badge.className).not.toMatch(/\borange\b/);
      });
    });
  });

  describe('getStatusColor', () => {
    it('should return brand_gray_dark hex for programada status', () => {
      const color = getStatusColor('programada');
      expect(color).toBe('#1f1f1f');
    });

    it('should return brand_primary hex for completada status', () => {
      const color = getStatusColor('completada');
      expect(color).toBe('#0a0a0a');
    });

    it('should return correct hex color for cancelada status', () => {
      const color = getStatusColor('cancelada');
      expect(color).toBe('#EF4444');
    });

    it('should handle all valid session statuses with valid hex', () => {
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
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it('should NOT use off-brand blue/green/orange hex values', () => {
      const offBrandHex = ['#3B82F6', '#10B981', '#EA580C', '#F97316'];
      const statuses: SessionStatus[] = [
        'borrador', 'pendiente_aprobacion', 'programada',
        'en_progreso', 'pendiente_informe', 'completada', 'cancelada',
      ];

      statuses.forEach((status) => {
        const color = getStatusColor(status);
        expect(offBrandHex).not.toContain(color);
      });
    });
  });

  describe('getSeriesStatsPillClass', () => {
    it('should return classes for all statuses', () => {
      const statuses: SessionStatus[] = [
        'borrador', 'pendiente_aprobacion', 'programada',
        'en_progreso', 'pendiente_informe', 'completada', 'cancelada',
      ];

      statuses.forEach((status) => {
        const cls = getSeriesStatsPillClass(status);
        expect(cls).toBeTruthy();
        expect(cls).not.toMatch(/\bblue\b/);
        expect(cls).not.toMatch(/\bgreen\b/);
        expect(cls).not.toMatch(/\borange\b/);
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
