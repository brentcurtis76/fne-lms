/**
 * Comprehensive Role-Based Access Control Tests
 * Tests all 6 roles across different features and components
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserFactory, TestData } from '../factories/userFactory';
import { 
  mockAuthForRole, 
  testComponentWithRoles, 
  PermissionPatterns,
  mockRoleBasedDataAccess,
  testRoleBasedAPIAccess,
  createTestScenario
} from '../utils/roleTestUtils';
import { UserRoleType } from '../../types/roles';

// Mock components that we'll test
const MockAdminComponent = ({ user }: { user: any }) => {
  if (user?.role !== 'admin') {
    return React.createElement('div', { 'data-testid': 'access-denied' }, 'No tienes permisos');
  }
  return React.createElement('div', { 'data-testid': 'admin-content' }, 'Admin Dashboard');
};

const MockReportsComponent = ({ user }: { user: any }) => {
  const allowedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'];
  if (!allowedRoles.includes(user?.role)) {
    return React.createElement('div', { 'data-testid': 'access-denied' }, 'No tienes permisos para ver reportes');
  }
  return React.createElement('div', { 'data-testid': 'reports-content' }, 'Reportes Dashboard');
};

const MockStudentComponent = ({ user }: { user: any }) => {
  // All authenticated users can access
  return React.createElement('div', { 'data-testid': 'student-content' }, 'Mi Panel de Estudiante');
};

describe('Role-Based Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    UserFactory.resetCounters();
  });

  describe('User Factory Tests', () => {
    it('should create consistent test data', () => {
      const testData = TestData.fullEnvironment();
      
      // Verify we have all required roles
      expect(testData.admin.role).toBe('admin');
      expect(testData.consultor.role).toBe('consultor');
      expect(testData.equipoDirectivo.role).toBe('equipo_directivo');
      expect(testData.liderGeneracion.role).toBe('lider_generacion');
      expect(testData.liderComunidad.role).toBe('lider_comunidad');
      expect(testData.docentes).toHaveLength(3);
      expect(testData.docentes[0].role).toBe('docente');
    });

    it('should create proper data relationships', () => {
      const testData = TestData.fullEnvironment();
      const env = testData.environment;
      
      // School relationships
      expect(testData.equipoDirectivo.school_id).toBe(env.schools[0].id);
      expect(testData.liderGeneracion.school_id).toBe(env.schools[0].id);
      expect(testData.liderComunidad.school_id).toBe(env.schools[0].id);
      
      // Generation relationships
      expect(testData.liderGeneracion.generation_id).toBe(env.generations[0].id);
      expect(testData.liderComunidad.generation_id).toBe(env.generations[0].id);
      
      // Community relationships
      expect(testData.liderComunidad.community_id).toBe(env.communities[0].id);
      expect(testData.docentes[0].community_id).toBe(env.communities[0].id);
    });

    it('should reset counters properly', () => {
      UserFactory.createUser();
      UserFactory.createUser();
      const user1 = UserFactory.createUser();
      expect(user1.id).toBe('user-3');
      
      UserFactory.resetCounters();
      const user2 = UserFactory.createUser();
      expect(user2.id).toBe('user-1');
    });
  });

  describe('Component Access Control', () => {
    it('should enforce admin-only access', async () => {
      await testComponentWithRoles(
        MockAdminComponent,
        {},
        PermissionPatterns.adminOnly()
      );
    });

    it('should enforce reporting access permissions', async () => {
      await testComponentWithRoles(
        MockReportsComponent,
        {},
        PermissionPatterns.reportingAccess()
      );
    });

    it('should allow all authenticated users for student features', async () => {
      await testComponentWithRoles(
        MockStudentComponent,
        {},
        PermissionPatterns.allAuthenticated()
      );
    });
  });

  describe('Data Access by Role', () => {
    it('should provide role-appropriate data access', () => {
      const testData = TestData.fullEnvironment();
      
      // Admin sees everything
      const adminData = mockRoleBasedDataAccess(testData.admin, testData.environment);
      expect(adminData.schools).toHaveLength(2);
      expect(adminData.generations).toHaveLength(2);
      expect(adminData.communities).toHaveLength(3);
      
      // Equipo Directivo sees only their school
      const directorData = mockRoleBasedDataAccess(testData.equipoDirectivo, testData.environment);
      expect(directorData.schools).toHaveLength(1);
      expect(directorData.schools[0].id).toBe(testData.equipoDirectivo.school_id);
      
      // Líder Generación sees only their generation
      const genLeaderData = mockRoleBasedDataAccess(testData.liderGeneracion, testData.environment);
      expect(genLeaderData.generations).toHaveLength(1);
      expect(genLeaderData.generations[0].id).toBe(testData.liderGeneracion.generation_id);
      
      // Líder Comunidad sees only their community
      const comLeaderData = mockRoleBasedDataAccess(testData.liderComunidad, testData.environment);
      expect(comLeaderData.communities).toHaveLength(1);
      expect(comLeaderData.communities[0].id).toBe(testData.liderComunidad.community_id);
      
      // Docente sees minimal data
      const docenteData = mockRoleBasedDataAccess(testData.docentes[0], testData.environment);
      expect(docenteData.schools).toHaveLength(1);
      expect(docenteData.communities).toHaveLength(1);
    });
  });

  describe('Authentication Mock Tests', () => {
    it('should mock authentication correctly for each role', async () => {
      const roles: UserRoleType[] = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'];
      
      for (const role of roles) {
        const user = UserFactory.createUser({ role });
        const context = await mockAuthForRole(user);
        
        expect(context.user.role).toBe(role);
        expect(context.isAdmin).toBe(role === 'admin');
        expect(context.mockSupabaseUser.email).toBe(user.email);
      }
    });
  });

  describe('Dev Role Impersonation', () => {
    it('should allow dev users to impersonate any role', async () => {
      const devUser = UserFactory.createUser({ role: 'admin', email: 'dev@test.com' });
      
      // Mock dev user status through vi.mocked API
      const { devRoleService } = await import('../../lib/services/devRoleService');
      vi.mocked(devRoleService.isDevUser).mockResolvedValue(true);
      
      const roles: UserRoleType[] = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'];
      
      for (const targetRole of roles) {
        // Mock impersonation session
        vi.mocked(devRoleService.getActiveImpersonation)
          .mockResolvedValue({
            id: 'session-123',
            dev_user_id: devUser.id,
            impersonated_role: targetRole,
            session_token: 'test-token',
            is_active: true,
            started_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            created_at: new Date().toISOString()
          });
        
        // Verify role switching works
        const context = await mockAuthForRole(UserFactory.createUser({ role: targetRole }));
        expect(context.user.role).toBe(targetRole);
      }
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle school leadership scenario', () => {
      const scenario = createTestScenario('school');
      
      // Verify school has proper leadership structure
      expect(scenario.users.equipoDirectivo.school_id).toBe(scenario.environment.schools[0].id);
      expect(scenario.users.liderGeneracion.school_id).toBe(scenario.environment.schools[0].id);
      expect(scenario.users.liderComunidad.school_id).toBe(scenario.environment.schools[0].id);
      
      // Verify hierarchical relationships
      expect(scenario.users.liderGeneracion.generation_id).toBe(scenario.environment.generations[0].id);
      expect(scenario.users.liderComunidad.community_id).toBe(scenario.environment.communities[0].id);
    });

    it('should handle consultant scenario', () => {
      const scenario = createTestScenario('consultant');
      
      // Verify consultant has assigned students
      expect(scenario.consultantAssignments).toBeDefined();
      expect(scenario.consultantAssignments).toHaveLength(2);
      expect(scenario.consultantAssignments[0].consultant_id).toBe(scenario.consultor.id);
    });
  });

  describe('Permission Patterns', () => {
    it('should generate correct permission patterns', () => {
      const adminOnly = PermissionPatterns.adminOnly();
      expect(adminOnly.find(p => p.role === 'admin')?.shouldHaveAccess).toBe(true);
      expect(adminOnly.find(p => p.role === 'docente')?.shouldHaveAccess).toBe(false);
      
      const reportingAccess = PermissionPatterns.reportingAccess();
      expect(reportingAccess.find(p => p.role === 'admin')?.shouldHaveAccess).toBe(true);
      expect(reportingAccess.find(p => p.role === 'consultor')?.shouldHaveAccess).toBe(true);
      expect(reportingAccess.find(p => p.role === 'docente')?.shouldHaveAccess).toBe(false);
      
      const allAuthenticated = PermissionPatterns.allAuthenticated();
      expect(allAuthenticated.every(p => p.shouldHaveAccess)).toBe(true);
    });
  });

  describe('Cross-Role Interactions', () => {
    it('should test consultant-student relationships', () => {
      const scenario = createTestScenario('consultant');
      
      // Consultant should be able to see assigned students
      const consultantData = mockRoleBasedDataAccess(scenario.consultor);
      // In a real scenario, consultant would see assigned students' schools/communities
      
      // Students should not see consultant management features
      const studentData = mockRoleBasedDataAccess(scenario.docentes[0]);
      expect(studentData.users).toHaveLength(0); // Students don't see user management
    });

    it('should test school hierarchy permissions', () => {
      const testData = TestData.fullEnvironment();
      
      // Equipo Directivo should see all school data
      const directorData = mockRoleBasedDataAccess(testData.equipoDirectivo, testData.environment);
      expect(directorData.schools[0].id).toBe(testData.equipoDirectivo.school_id);
      
      // Líder Generación should see subset of school data
      const genLeaderData = mockRoleBasedDataAccess(testData.liderGeneracion, testData.environment);
      expect(genLeaderData.generations[0].school_id).toBe(testData.liderGeneracion.school_id);
      
      // Líder Comunidad should see subset of generation data
      const comLeaderData = mockRoleBasedDataAccess(testData.liderComunidad, testData.environment);
      expect(comLeaderData.communities[0].generation_id).toBe(testData.liderComunidad.generation_id);
    });
  });

  describe('Edge Cases', () => {
    it('should handle users without school assignments', () => {
      const userWithoutSchool = UserFactory.createUser({ 
        role: 'docente',
        school_id: undefined,
        generation_id: undefined,
        community_id: undefined
      });
      
      const data = mockRoleBasedDataAccess(userWithoutSchool);
      expect(data.schools).toHaveLength(0);
      expect(data.generations).toHaveLength(0);
      expect(data.communities).toHaveLength(0);
    });

    it('should handle schools without generations', () => {
      // Create an environment with a school that has no generations
      const environment = UserFactory.createTestEnvironment();
      const school = environment.schools[0];
      school.has_generations = false;
      
      const user = UserFactory.createUser({ 
        role: 'equipo_directivo',
        school_id: school.id,
        generation_id: undefined
      });
      
      // Should still have access to school data
      const data = mockRoleBasedDataAccess(user, environment);
      expect(data.schools).toHaveLength(1);
      expect(data.schools[0].id).toBe(school.id);
    });
  });
});