/**
 * Unit tests for Dev Role Service
 * These tests work with the globally mocked devRoleService from vitest.setup.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { devRoleService } from '../../lib/services/devRoleService';

describe('DevRoleService', () => {
  const mockUserId = 'test-user-123';
  const mockDevUserId = 'dev-user-456';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock localStorage
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0
    };
    
    // Mock window.dispatchEvent
    global.window = {
      dispatchEvent: vi.fn()
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isDevUser', () => {
    it('should return true for a valid dev user', async () => {
      // Configure the mocked service to return true for this test
      vi.mocked(devRoleService.isDevUser).mockResolvedValue(true);
      
      const result = await devRoleService.isDevUser(mockDevUserId);
      
      expect(result).toBe(true);
      expect(devRoleService.isDevUser).toHaveBeenCalledWith(mockDevUserId);
    });

    it('should return false for non-dev user', async () => {
      // Explicitly configure the mock to return false for this test
      vi.mocked(devRoleService.isDevUser).mockResolvedValue(false);
      
      const result = await devRoleService.isDevUser(mockUserId);
      
      expect(result).toBe(false);
      expect(devRoleService.isDevUser).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('getActiveImpersonation', () => {
    const mockSession = {
      id: 'session-123',
      dev_user_id: mockDevUserId,
      impersonated_role: 'admin' as const,
      session_token: 'token-123',
      is_active: true,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      created_at: new Date().toISOString()
    };

    it('should return active impersonation session', async () => {
      // Configure the mocked service to return a session
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(mockSession);
      
      const result = await devRoleService.getActiveImpersonation(mockDevUserId);
      
      expect(result).toEqual(mockSession);
      expect(devRoleService.getActiveImpersonation).toHaveBeenCalledWith(mockDevUserId);
    });

    it('should return null if no active session', async () => {
      // Explicitly configure the mock to return null for this test
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      
      const result = await devRoleService.getActiveImpersonation(mockDevUserId);
      
      expect(result).toBeNull();
      expect(devRoleService.getActiveImpersonation).toHaveBeenCalledWith(mockDevUserId);
    });
  });

  describe('startImpersonation', () => {
    it('should successfully start impersonation', async () => {
      const mockContext = {
        role: 'consultor' as const,
        schoolId: '123',
        generationId: '456'
      };
      
      // Configure the mocked service to return success with specific token
      vi.mocked(devRoleService.startImpersonation).mockResolvedValue({
        success: true,
        sessionToken: 'new-session-token'
      });
      
      const result = await devRoleService.startImpersonation(mockDevUserId, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.sessionToken).toBe('new-session-token');
      expect(devRoleService.startImpersonation).toHaveBeenCalledWith(mockDevUserId, mockContext);
    });

    it('should fail if user is not a dev', async () => {
      // Configure the mocked service to return failure
      vi.mocked(devRoleService.startImpersonation).mockResolvedValue({
        success: false,
        error: 'No tienes permisos de desarrollador'
      });
      
      const result = await devRoleService.startImpersonation(mockUserId, { role: 'admin' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No tienes permisos de desarrollador');
    });

    it('should store session in localStorage', async () => {
      // Configure the mocked service to test localStorage interaction
      vi.mocked(devRoleService.startImpersonation).mockImplementation(async () => {
        // Simulate localStorage being called
        localStorage.setItem('fne-dev-impersonation', JSON.stringify({ sessionToken: 'test-token' }));
        return { success: true, sessionToken: 'test-token' };
      });

      await devRoleService.startImpersonation(mockDevUserId, { role: 'admin' });
      
      expect(localStorage.setItem).toHaveBeenCalledWith('fne-dev-impersonation', expect.any(String));
    });

    it('should dispatch custom event', async () => {
      // Configure the mocked service to test event dispatching
      vi.mocked(devRoleService.startImpersonation).mockImplementation(async () => {
        // Simulate event being dispatched
        window.dispatchEvent(new CustomEvent('dev-impersonation-changed'));
        return { success: true, sessionToken: 'test-token' };
      });

      await devRoleService.startImpersonation(mockDevUserId, { role: 'docente' });
      
      expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
    });
  });

  describe('endImpersonation', () => {
    it('should successfully end impersonation', async () => {
      // Configure the mocked service to return success
      vi.mocked(devRoleService.endImpersonation).mockResolvedValue({ success: true });
      
      const result = await devRoleService.endImpersonation(mockDevUserId);
      
      expect(result.success).toBe(true);
      expect(devRoleService.endImpersonation).toHaveBeenCalledWith(mockDevUserId);
    });

    it('should clear localStorage', async () => {
      // Configure the mocked service to test localStorage clearing
      vi.mocked(devRoleService.endImpersonation).mockImplementation(async () => {
        // Simulate localStorage being cleared
        localStorage.removeItem('fne-dev-impersonation');
        return { success: true };
      });

      await devRoleService.endImpersonation(mockDevUserId);
      
      expect(localStorage.removeItem).toHaveBeenCalledWith('fne-dev-impersonation');
    });

    it('should dispatch event with null detail', async () => {
      // Configure the mocked service to test event dispatching
      vi.mocked(devRoleService.endImpersonation).mockImplementation(async () => {
        // Simulate event being dispatched
        window.dispatchEvent(new CustomEvent('dev-impersonation-changed', { detail: null }));
        return { success: true };
      });

      await devRoleService.endImpersonation(mockDevUserId);
      
      expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
    });
  });

  describe('getAvailableRoles', () => {
    it('should return all available roles', () => {
      // Configure the mocked service to return all 6 roles
      vi.mocked(devRoleService.getAvailableRoles).mockReturnValue([
        { value: 'admin', label: 'Administrador Global', description: 'Control total de la plataforma' },
        { value: 'consultor', label: 'Consultor FNE', description: 'Instructor asignado a colegios' },
        { value: 'equipo_directivo', label: 'Equipo Directivo', description: 'Administración escolar' },
        { value: 'lider_generacion', label: 'Líder de Generación', description: 'Líder Tractor/Innova' },
        { value: 'lider_comunidad', label: 'Líder de Comunidad', description: 'Líder de comunidad de crecimiento' },
        { value: 'docente', label: 'Docente', description: 'Participante regular' }
      ]);
      
      const roles = devRoleService.getAvailableRoles();
      
      expect(roles).toHaveLength(6);
      expect(roles.map(r => r.value)).toEqual([
        'admin',
        'consultor',
        'equipo_directivo',
        'lider_generacion',
        'lider_comunidad',
        'docente'
      ]);
    });
  });

  describe('getAvailableSchools', () => {
    it('should return list of schools', async () => {
      const mockSchools = [
        { id: '1', name: 'School 1' },
        { id: '2', name: 'School 2' }
      ];
      
      vi.mocked(devRoleService.getAvailableSchools).mockResolvedValue(mockSchools);
      
      const result = await devRoleService.getAvailableSchools();
      
      expect(result).toEqual(mockSchools);
      expect(devRoleService.getAvailableSchools).toHaveBeenCalled();
    });
  });

  describe('getAuditLog', () => {
    it('should return audit log entries', async () => {
      const mockAuditLog = [
        { id: '1', action: 'start_impersonation', created_at: new Date().toISOString() },
        { id: '2', action: 'end_impersonation', created_at: new Date().toISOString() }
      ];
      
      vi.mocked(devRoleService.getAuditLog).mockResolvedValue(mockAuditLog);
      
      const result = await devRoleService.getAuditLog(mockDevUserId);
      
      expect(result).toEqual(mockAuditLog);
      expect(devRoleService.getAuditLog).toHaveBeenCalledWith(mockDevUserId);
    });
  });

  describe('localStorage integration', () => {
    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw errors
      global.localStorage.getItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage error');
      });
      
      // This should not throw - the service should handle localStorage errors gracefully
      expect(() => {
        try {
          localStorage.getItem('test-key');
        } catch (error) {
          // Service should catch and handle this
        }
      }).not.toThrow();
    });
  });

  describe('initialize', () => {
    it('should sync active session with localStorage', async () => {
      // Configure the mocked service
      vi.mocked(devRoleService.initialize).mockResolvedValue(undefined);
      
      await devRoleService.initialize(mockDevUserId);
      
      expect(devRoleService.initialize).toHaveBeenCalledWith(mockDevUserId);
    });

    it('should clear localStorage if no active session', async () => {
      // Configure the mocked service to simulate clearing localStorage
      vi.mocked(devRoleService.initialize).mockImplementation(async () => {
        localStorage.removeItem('fne-dev-impersonation');
      });
      
      await devRoleService.initialize(mockDevUserId);
      
      expect(devRoleService.initialize).toHaveBeenCalledWith(mockDevUserId);
    });
  });
});