/**
 * Test script to verify admin permissions fix
 * Run with: node scripts/test-admin-permissions-fix.js
 */

const { getUserPermissions, ROLE_HIERARCHY } = require('../utils/roleUtils');

console.log('Testing Admin Permissions Fix\n');

// Test 1: Legacy admin with no new roles
console.log('Test 1: Legacy admin (no new roles)');
const legacyAdminPerms = getUserPermissions([], 'admin');
console.log('Has create courses permission:', legacyAdminPerms.can_create_courses);
console.log('Has delete users permission:', legacyAdminPerms.can_delete_users);
console.log('All permissions granted:', JSON.stringify(legacyAdminPerms) === JSON.stringify(ROLE_HIERARCHY.admin));

// Test 2: Legacy docente with no new roles
console.log('\nTest 2: Legacy docente (no new roles)');
const legacyDocentePerms = getUserPermissions([], 'docente');
console.log('Has create courses permission:', legacyDocentePerms.can_create_courses);
console.log('Has delete users permission:', legacyDocentePerms.can_delete_users);

// Test 3: New system admin
console.log('\nTest 3: New system admin');
const newAdminRoles = [{ role_type: 'admin' }];
const newAdminPerms = getUserPermissions(newAdminRoles);
console.log('Has create courses permission:', newAdminPerms.can_create_courses);
console.log('Has delete users permission:', newAdminPerms.can_delete_users);

// Test 4: Mixed - legacy admin + new docente role (edge case)
console.log('\nTest 4: Legacy admin with new docente role (should still have admin perms)');
const mixedRoles = [{ role_type: 'docente' }];
const mixedPerms = getUserPermissions(mixedRoles, 'admin');
console.log('Has create courses permission:', mixedPerms.can_create_courses);
console.log('Has delete users permission:', mixedPerms.can_delete_users);

console.log('\n✅ All tests completed!');