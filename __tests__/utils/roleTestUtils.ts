/**
 * Role-Based Testing Utilities
 * Provides helpers for testing role permissions and access control
 */

import React from 'react';
import { act, render, RenderResult } from '@testing-library/react';
import { vi } from 'vitest';
import { UserFactory, TestUser } from '../factories/userFactory';
import { UserRoleType } from '../../types/roles';

export interface RoleTestContext {
  user: TestUser;
  mockSupabaseUser: any;
  isAdmin: boolean;
  hasAdminPrivileges: boolean;
}

export interface PermissionTestCase {
  role: UserRoleType;
  shouldHaveAccess: boolean;
  description: string;
}

/**
 * Mock authentication for a specific user role
 */
export async function mockAuthForRole(user: TestUser): Promise<RoleTestContext> {
  const mockSupabaseUser = UserFactory.createSupabaseUser(user);
  
  // Mock Supabase auth
  const mockAuth = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: mockSupabaseUser },
      error: null
    }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { user: mockSupabaseUser } },
      error: null
    })
  };

  // Mock profile data
  const mockProfile = {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    school_id: user.school_id,
    generation_id: user.generation_id,
    community_id: user.community_id,
    avatar_url: user.avatar_url,
    is_active: user.is_active
  };

  // Mock Supabase queries for profile
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: mockProfile,
          error: null
        })
      })
    })
  });

  // Update global mocks through vi.mocked API
  const { supabase } = await import('../../lib/supabase-wrapper');
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: mockSupabaseUser },
    error: null
  });
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { user: mockSupabaseUser } },
    error: null
  });

  return {
    user,
    mockSupabaseUser,
    isAdmin: user.role === 'admin',
    hasAdminPrivileges: ['admin'].includes(user.role)
  };
}

/**
 * Test a component with multiple roles to verify access control
 */
export async function testComponentWithRoles(
  Component: React.ComponentType<any>,
  componentProps: any,
  permissionTests: PermissionTestCase[]
): Promise<void> {
  for (const testCase of permissionTests) {
    const testUser = UserFactory.createUser({ role: testCase.role });
    const context = await mockAuthForRole(testUser);

    let renderResult: RenderResult;
    
    await act(async () => {
      renderResult = render(
        React.createElement(Component, { ...componentProps, user: context.mockSupabaseUser })
      );
    });

    // Test should pass if access expectations are met
    if (testCase.shouldHaveAccess) {
      expect(renderResult!.container).not.toBeEmptyDOMElement();
    } else {
      // Component should either not render or show access denied
      const accessDeniedElements = renderResult!.container.querySelectorAll(
        '[data-testid="access-denied"]'
      );
      const accessDeniedByClass = renderResult!.container.querySelectorAll('.access-denied');
      const hasAccessDeniedText = renderResult!.container.textContent?.includes('No tienes permisos');
      
      if (accessDeniedElements.length === 0 && accessDeniedByClass.length === 0 && !hasAccessDeniedText) {
        // If no explicit access denied message, component should be empty or redirect
        expect(renderResult!.container.textContent).toBe('');
      }
    }

    renderResult!.unmount();
  }
}

/**
 * Generate permission test cases for common patterns
 */
export const PermissionPatterns = {
  /**
   * Admin-only access pattern
   */
  adminOnly: (): PermissionTestCase[] => [
    { role: 'admin', shouldHaveAccess: true, description: 'Admin should have access' },
    { role: 'consultor', shouldHaveAccess: false, description: 'Consultor should not have access' },
    { role: 'equipo_directivo', shouldHaveAccess: false, description: 'Equipo Directivo should not have access' },
    { role: 'lider_generacion', shouldHaveAccess: false, description: 'Líder Generación should not have access' },
    { role: 'lider_comunidad', shouldHaveAccess: false, description: 'Líder Comunidad should not have access' },
    { role: 'docente', shouldHaveAccess: false, description: 'Docente should not have access' }
  ],

  /**
   * Admin and consultants access pattern
   */
  adminAndConsultants: (): PermissionTestCase[] => [
    { role: 'admin', shouldHaveAccess: true, description: 'Admin should have access' },
    { role: 'consultor', shouldHaveAccess: true, description: 'Consultor should have access' },
    { role: 'equipo_directivo', shouldHaveAccess: false, description: 'Equipo Directivo should not have access' },
    { role: 'lider_generacion', shouldHaveAccess: false, description: 'Líder Generación should not have access' },
    { role: 'lider_comunidad', shouldHaveAccess: false, description: 'Líder Comunidad should not have access' },
    { role: 'docente', shouldHaveAccess: false, description: 'Docente should not have access' }
  ],

  /**
   * All authenticated users access pattern
   */
  allAuthenticated: (): PermissionTestCase[] => [
    { role: 'admin', shouldHaveAccess: true, description: 'Admin should have access' },
    { role: 'consultor', shouldHaveAccess: true, description: 'Consultor should have access' },
    { role: 'equipo_directivo', shouldHaveAccess: true, description: 'Equipo Directivo should have access' },
    { role: 'lider_generacion', shouldHaveAccess: true, description: 'Líder Generación should have access' },
    { role: 'lider_comunidad', shouldHaveAccess: true, description: 'Líder Comunidad should have access' },
    { role: 'docente', shouldHaveAccess: true, description: 'Docente should have access' }
  ],

  /**
   * School leadership access pattern (admin, equipo_directivo, leaders)
   */
  schoolLeadership: (): PermissionTestCase[] => [
    { role: 'admin', shouldHaveAccess: true, description: 'Admin should have access' },
    { role: 'consultor', shouldHaveAccess: false, description: 'Consultor should not have access' },
    { role: 'equipo_directivo', shouldHaveAccess: true, description: 'Equipo Directivo should have access' },
    { role: 'lider_generacion', shouldHaveAccess: true, description: 'Líder Generación should have access' },
    { role: 'lider_comunidad', shouldHaveAccess: true, description: 'Líder Comunidad should have access' },
    { role: 'docente', shouldHaveAccess: false, description: 'Docente should not have access' }
  ],

  /**
   * Reporting access pattern (excludes docentes)
   */
  reportingAccess: (): PermissionTestCase[] => [
    { role: 'admin', shouldHaveAccess: true, description: 'Admin should have access to all reports' },
    { role: 'consultor', shouldHaveAccess: true, description: 'Consultor should have access to assigned student reports' },
    { role: 'equipo_directivo', shouldHaveAccess: true, description: 'Equipo Directivo should have access to school reports' },
    { role: 'lider_generacion', shouldHaveAccess: true, description: 'Líder Generación should have access to generation reports' },
    { role: 'lider_comunidad', shouldHaveAccess: true, description: 'Líder Comunidad should have access to community reports' },
    { role: 'docente', shouldHaveAccess: false, description: 'Docente should not have access to reports' }
  ]
};

/**
 * Mock role-specific data access
 */
export function mockRoleBasedDataAccess(user: TestUser, testEnvironment?: ReturnType<typeof UserFactory.createTestEnvironment>) {
  // Use provided environment or create one that matches the user's associations
  const environment = testEnvironment || UserFactory.createTestEnvironment();
  
  // Use user's actual IDs without fallbacks for proper testing
  const userSchoolId = user.school_id;
  const userGenerationId = user.generation_id;
  const userCommunityId = user.community_id;
  
  // Mock data based on role
  switch (user.role) {
    case 'admin':
      // Admin sees all data
      return {
        schools: environment.schools,
        generations: environment.generations,
        communities: environment.communities,
        users: []
      };
      
    case 'equipo_directivo':
      // School leadership sees only their school
      const schoolData = environment.schools.filter(s => s.id === userSchoolId);
      return {
        schools: schoolData,
        generations: environment.generations.filter(g => g.school_id === userSchoolId),
        communities: environment.communities.filter(c => c.school_id === userSchoolId),
        users: []
      };
      
    case 'lider_generacion':
      // Generation leader sees only their generation
      const genSchoolData = environment.schools.filter(s => s.id === userSchoolId);
      return {
        schools: genSchoolData,
        generations: environment.generations.filter(g => g.id === userGenerationId),
        communities: environment.communities.filter(c => c.generation_id === userGenerationId),
        users: []
      };
      
    case 'lider_comunidad':
      // Community leader sees only their community  
      const commSchoolData = environment.schools.filter(s => s.id === userSchoolId);
      const commGenData = environment.generations.filter(g => g.id === userGenerationId);
      return {
        schools: commSchoolData,
        generations: commGenData,
        communities: environment.communities.filter(c => c.id === userCommunityId),
        users: []
      };
      
    case 'docente':
      // Students see minimal data
      return {
        schools: userSchoolId ? environment.schools.filter(s => s.id === userSchoolId) : [],
        generations: userGenerationId ? environment.generations.filter(g => g.id === userGenerationId) : [],
        communities: userCommunityId ? environment.communities.filter(c => c.id === userCommunityId) : [],
        users: []
      };
      
    case 'consultor':
      // Consultants see data for assigned students (would need assignment logic)
      return {
        schools: environment.schools,
        generations: environment.generations,
        communities: environment.communities,
        users: []
      };
      
    default:
      return {
        schools: [],
        generations: [],
        communities: [],
        users: []
      };
  }
}

/**
 * Helper to test role-based API access
 */
export async function testRoleBasedAPIAccess(
  apiFunction: (user: TestUser) => Promise<any>,
  permissionTests: PermissionTestCase[]
): Promise<void> {
  for (const testCase of permissionTests) {
    const testUser = UserFactory.createUser({ role: testCase.role });
    
    try {
      const result = await apiFunction(testUser);
      
      if (testCase.shouldHaveAccess) {
        expect(result).toBeDefined();
        expect(result.error).toBeNull();
      } else {
        // Should either return error or empty data
        expect(result).toEqual(
          expect.objectContaining({
            error: expect.any(Object)
          })
        );
      }
    } catch (error) {
      if (testCase.shouldHaveAccess) {
        throw new Error(`${testCase.description} but got error: ${error}`);
      }
      // Expected error for unauthorized access
    }
  }
}

/**
 * Create a complete test scenario with realistic data relationships
 */
export function createTestScenario(scenarioName: 'school' | 'consultant' | 'full') {
  switch (scenarioName) {
    case 'school':
      const schoolData = UserFactory.createRoleBasedUsers();
      return {
        users: schoolData,
        environment: schoolData.environment,
        ...schoolData
      };
      
    case 'consultant':
      const consultantData = UserFactory.createRoleBasedUsers();
      // Add consultant assignments (would be done via database in real tests)
      return {
        ...consultantData,
        environment: consultantData.environment,
        consultantAssignments: [
          { consultant_id: consultantData.consultor.id, student_id: consultantData.docentes[0].id },
          { consultant_id: consultantData.consultor.id, student_id: consultantData.docentes[1].id }
        ]
      };
      
    case 'full':
      const fullData = UserFactory.createRoleBasedUsers();
      return {
        ...fullData,
        environment: fullData.environment
      };
      
    default:
      throw new Error(`Unknown scenario: ${scenarioName}`);
  }
}

