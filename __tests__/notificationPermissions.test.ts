import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  isAdminOnlyRoute, 
  getRequiredRole, 
  checkUserAccess, 
  getAccessibleUrl,
  getAlternativeUrl 
} from '../utils/notificationPermissions';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    }))
  }))
}));

describe('Notification Permissions', () => {
  describe('isAdminOnlyRoute', () => {
    it('should identify admin-only routes', () => {
      expect(isAdminOnlyRoute('/admin/feedback')).toBe(true);
      expect(isAdminOnlyRoute('/admin/users')).toBe(true);
      expect(isAdminOnlyRoute('/configuracion')).toBe(true);
      expect(isAdminOnlyRoute('/usuarios')).toBe(true);
      expect(isAdminOnlyRoute('/gestion/contratos')).toBe(true);
    });

    it('should identify non-admin routes', () => {
      expect(isAdminOnlyRoute('/dashboard')).toBe(false);
      expect(isAdminOnlyRoute('/cursos')).toBe(false);
      expect(isAdminOnlyRoute('/tareas')).toBe(false);
      expect(isAdminOnlyRoute('/espacio-colaborativo')).toBe(false);
    });

    it('should handle null/undefined URLs', () => {
      expect(isAdminOnlyRoute('')).toBe(false);
      expect(isAdminOnlyRoute(null as any)).toBe(false);
      expect(isAdminOnlyRoute(undefined as any)).toBe(false);
    });
  });

  describe('getAccessibleUrl', () => {
    it('should return admin URLs for admin users', () => {
      const url = getAccessibleUrl('/admin/feedback?id={feedback_id}', 'admin', { feedback_id: '123' });
      expect(url).toBe('/admin/feedback?id=123');
    });

    it('should return null for non-admin users accessing admin URLs', () => {
      const url = getAccessibleUrl('/admin/feedback?id={feedback_id}', 'docente', { feedback_id: '123' });
      expect(url).toBeNull();
    });

    it('should allow non-admin users to access general URLs', () => {
      const url = getAccessibleUrl('/cursos/{course_id}', 'docente', { course_id: '456' });
      expect(url).toBe('/cursos/456');
    });

    it('should block docente from reports', () => {
      const url = getAccessibleUrl('/reportes', 'docente');
      expect(url).toBeNull();
    });

    it('should allow other roles to access reports', () => {
      expect(getAccessibleUrl('/reportes', 'consultor')).toBe('/reportes');
      expect(getAccessibleUrl('/reportes', 'equipo_directivo')).toBe('/reportes');
      expect(getAccessibleUrl('/reportes', 'lider_generacion')).toBe('/reportes');
    });

    it('should substitute multiple template variables', () => {
      const url = getAccessibleUrl(
        '/cursos/{course_id}/tareas/{assignment_id}', 
        'docente', 
        { course_id: '123', assignment_id: '456' }
      );
      expect(url).toBe('/cursos/123/tareas/456');
    });
  });

  describe('getAlternativeUrl', () => {
    it('should provide dashboard as alternative for admin URLs', () => {
      expect(getAlternativeUrl('/admin/feedback', 'docente')).toBe('/dashboard');
      expect(getAlternativeUrl('/admin/users', 'consultor')).toBe('/dashboard');
    });

    it('should provide dashboard for docente accessing reports', () => {
      expect(getAlternativeUrl('/reportes', 'docente')).toBe('/dashboard');
    });

    it('should return null for URLs without alternatives', () => {
      expect(getAlternativeUrl('/cursos', 'docente')).toBeNull();
      expect(getAlternativeUrl('/tareas', 'docente')).toBeNull();
    });
  });

  describe('Feedback Notification Scenarios', () => {
    it('should handle feedback notifications correctly for different roles', () => {
      const feedbackUrl = '/admin/feedback?id={feedback_id}';
      const eventData = { feedback_id: '789' };

      // Admin should get the full URL
      expect(getAccessibleUrl(feedbackUrl, 'admin', eventData)).toBe('/admin/feedback?id=789');

      // Non-admin users should get null (no access)
      expect(getAccessibleUrl(feedbackUrl, 'docente', eventData)).toBeNull();
      expect(getAccessibleUrl(feedbackUrl, 'consultor', eventData)).toBeNull();
      expect(getAccessibleUrl(feedbackUrl, 'equipo_directivo', eventData)).toBeNull();
    });
  });

  describe('Role Hierarchy', () => {
    it('should respect role-based access to consultancy pages', () => {
      const url = '/consultorias';
      
      expect(getAccessibleUrl(url, 'admin')).toBe('/consultorias');
      expect(getAccessibleUrl(url, 'consultor')).toBe('/consultorias');
      expect(getAccessibleUrl(url, 'equipo_directivo')).toBeNull();
      expect(getAccessibleUrl(url, 'docente')).toBeNull();
    });
  });
});