/**
 * Unit test for admin permissions fix
 * Tests the getUserPermissions function directly
 */

import { getUserPermissions, ROLE_HIERARCHY } from '../utils/roleUtils';
import { UserRole } from '../types/roles';

describe('Admin Permissions Fix Tests', () => {
  test('Legacy admin with no new roles should have full permissions', () => {
    const permissions = getUserPermissions([], 'admin');
    
    expect(permissions.can_create_courses).toBe(true);
    expect(permissions.can_delete_users).toBe(true);
    expect(permissions.can_manage_schools).toBe(true);
    expect(permissions).toEqual(ROLE_HIERARCHY.admin);
  });

  test('Legacy docente with no new roles should have limited permissions', () => {
    const permissions = getUserPermissions([], 'docente');
    
    expect(permissions.can_create_courses).toBe(false);
    expect(permissions.can_delete_users).toBe(false);
    expect(permissions.can_manage_schools).toBe(false);
    expect(permissions).toEqual(ROLE_HIERARCHY.docente);
  });

  test('New system admin should have full permissions', () => {
    const adminRole: UserRole = {
      id: '1',
      user_id: 'test',
      role_type: 'admin',
      is_active: true,
      assigned_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    const permissions = getUserPermissions([adminRole]);
    
    expect(permissions.can_create_courses).toBe(true);
    expect(permissions.can_delete_users).toBe(true);
    expect(permissions.can_manage_schools).toBe(true);
    expect(permissions).toEqual(ROLE_HIERARCHY.admin);
  });

  test('Legacy admin with new docente role should still have admin permissions', () => {
    const docenteRole: UserRole = {
      id: '1',
      user_id: 'test',
      role_type: 'docente',
      is_active: true,
      assigned_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    const permissions = getUserPermissions([docenteRole], 'admin');
    
    expect(permissions.can_create_courses).toBe(true);
    expect(permissions.can_delete_users).toBe(true);
    expect(permissions.can_manage_schools).toBe(true);
    expect(permissions).toEqual(ROLE_HIERARCHY.admin);
  });

  test('Non-admin users should not have admin permissions', () => {
    const docenteRole: UserRole = {
      id: '1',
      user_id: 'test',
      role_type: 'docente',
      is_active: true,
      assigned_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    const permissions = getUserPermissions([docenteRole]);
    
    expect(permissions.can_create_courses).toBe(false);
    expect(permissions.can_delete_users).toBe(false);
    expect(permissions.can_manage_schools).toBe(false);
  });
});