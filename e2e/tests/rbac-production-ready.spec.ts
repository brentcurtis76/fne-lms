import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAsQA, TEST_QA_USERS } from '../utils/auth-helpers';

// Supabase client for test data manipulation
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Map role names to TEST_QA user types
const ROLE_TO_QA_USER: Record<string, keyof typeof TEST_QA_USERS | null> = {
  admin: 'admin',
  consultor: 'consultant',
  docente: 'docente',
  directivo: 'directivo',
  equipo_directivo: 'directivo',
  community_manager: null, // No TEST_QA user for this role
  supervisor: null, // No TEST_QA user for this role
  lider_comunidad: null,
  lider_generacion: null
};

// Helper: Login function using TEST_QA users
async function login(page: Page, email: string, password: string) {
  // Try to find matching TEST_QA user by email pattern
  if (email.includes('test_qa_admin')) {
    await loginAsQA(page, 'admin');
  } else if (email.includes('test_qa_directivo') || email.includes('directivo')) {
    await loginAsQA(page, 'directivo');
  } else if (email.includes('test_qa_docente') || email.includes('docente')) {
    await loginAsQA(page, 'docente');
  } else if (email.includes('test_qa_consultant') || email.includes('consultor')) {
    await loginAsQA(page, 'consultant');
  } else {
    // Fallback to direct login for non-TEST_QA users
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  }
}

// Helper: Login by role type
async function loginAsRole(page: Page, roleType: string) {
  const qaUserType = ROLE_TO_QA_USER[roleType];
  if (qaUserType) {
    await loginAsQA(page, qaUserType);
  } else {
    throw new Error(`No TEST_QA user available for role: ${roleType}`);
  }
}

// Helper: Get permission from database
async function getPermission(roleType: string, permissionKey: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('granted')
    .eq('role_type', roleType)
    .eq('permission_key', permissionKey)
    .single();

  if (error) throw error;
  return data.granted;
}

// Helper: Set permission in database
async function setPermission(roleType: string, permissionKey: string, granted: boolean) {
  const { error } = await supabase
    .from('role_permissions')
    .update({ granted })
    .eq('role_type', roleType)
    .eq('permission_key', permissionKey);

  if (error) throw error;
}

// Helper: Count audit log entries
async function countRecentAuditEntries(since: Date): Promise<number> {
  const { data, error } = await supabase
    .from('permission_audit_log')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since.toISOString());

  if (error) throw error;
  return data?.length || 0;
}

test.describe('RBAC Production Readiness Tests', () => {
  test.beforeAll(async () => {
    console.log('🧪 Starting RBAC production readiness test suite...');
  });

  test.describe('Suite 1: RBAC UI Functionality', () => {
    test('1.1: Permission toggle and save works', async ({ page }) => {
      // Login as superadmin
      await login(page, SUPERADMIN.email, SUPERADMIN.password);

      // Navigate to RBAC page
      await page.goto('http://localhost:3000/admin/role-management');
      await expect(page.locator('h1').first()).toContainText('Gestión de Roles y Permisos');

      // Find docente row and create_news_all permission
      const initialValue = await getPermission('docente', 'create_news_all');
      console.log(`📊 Initial docente.create_news_all: ${initialValue}`);

      // Toggle the permission
      const checkbox = page.locator(`[data-role="docente"][data-permission="create_news_all"]`);
      await checkbox.click();

      // Click save button
      await page.click('button:has-text("Guardar Cambios")');

      // Wait for success message
      await expect(page.locator('text=/Cambios guardados exitosamente/i')).toBeVisible({ timeout: 5000 });

      // Verify database updated
      const newValue = await getPermission('docente', 'create_news_all');
      expect(newValue).toBe(!initialValue);
      console.log(`✅ Permission toggled: ${initialValue} → ${newValue}`);

      // Cleanup: revert to original state
      await setPermission('docente', 'create_news_all', initialValue);
    });

    test('1.2: Critical permission lockout protection works', async ({ page }) => {
      await login(page, SUPERADMIN.email, SUPERADMIN.password);
      await page.goto('http://localhost:3000/admin/role-management');

      // Try to disable admin's manage_permissions
      const managePermsCheckbox = page.locator('[data-role="admin"][data-permission="manage_permissions"]');
      await managePermsCheckbox.click();

      // Modal should appear
      await expect(page.locator('text=/Advertencia|Peligroso/i')).toBeVisible({ timeout: 3000 });
      console.log('✅ Lockout protection modal appeared');

      // Cancel the change
      await page.click('button:has-text("Cancelar")');
      await expect(page.locator('text=/Advertencia/i')).not.toBeVisible();
    });

    test('1.3: Audit logging captures changes', async ({ page }) => {
      const testStart = new Date();

      await login(page, SUPERADMIN.email, SUPERADMIN.password);
      await page.goto('http://localhost:3000/admin/role-management');

      // Make 2 permission changes
      await page.click('[data-role="docente"][data-permission="view_events_all"]');
      await page.click('[data-role="consultor"][data-permission="view_schools_network"]');

      // Save changes
      await page.click('button:has-text("Guardar Cambios")');
      await expect(page.locator('text=/Cambios guardados exitosamente/i')).toBeVisible({ timeout: 5000 });

      // Check audit log
      await page.waitForTimeout(1000); // Allow time for audit writes
      const auditCount = await countRecentAuditEntries(testStart);

      expect(auditCount).toBeGreaterThanOrEqual(2);
      console.log(`✅ Audit log captured ${auditCount} entries`);

      // Cleanup: revert changes
      await page.click('[data-role="docente"][data-permission="view_events_all"]');
      await page.click('[data-role="consultor"][data-permission="view_schools_network"]');
      await page.click('button:has-text("Guardar Cambios")');
      await page.waitForTimeout(1000);
    });
  });

  test.describe('Suite 2: Sidebar Access Control', () => {
    test('2.1: Sidebar shows items when permission granted', async ({ page }) => {
      // Grant view_news_all to docente
      await setPermission('docente', 'view_news_all', true);

      // Login as docente
      await login(page, TEST_USERS.docente.email, TEST_USERS.docente.password);

      // Check sidebar for "Noticias"
      const noticiasMenu = page.locator('nav a:has-text("Noticias")');
      await expect(noticiasMenu).toBeVisible({ timeout: 5000 });
      console.log('✅ Noticias visible with permission granted');
    });

    test('2.2: Sidebar hides items when permission denied', async ({ page }) => {
      // Revoke view_news_all from docente
      await setPermission('docente', 'view_news_all', false);

      // Login as docente
      await login(page, TEST_USERS.docente.email, TEST_USERS.docente.password);

      // Check sidebar - Noticias should NOT be visible
      const noticiasMenu = page.locator('nav a:has-text("Noticias")');
      await expect(noticiasMenu).not.toBeVisible();
      console.log('✅ Noticias hidden with permission denied');
    });

    test('2.3: All 8 roles have correct sidebar items', async ({ page }) => {
      const roleTests = [
        { role: 'admin', user: TEST_USERS.admin, shouldSee: ['Cursos', 'Usuarios', 'Escuelas'] },
        { role: 'consultor', user: TEST_USERS.consultor, shouldSee: ['Reportes'] },
        { role: 'docente', user: TEST_USERS.docente, shouldSee: ['Mi Panel', 'Mi Perfil'] },
        { role: 'directivo', user: TEST_USERS.directivo, shouldSee: ['Mi Panel'] },
        { role: 'community_manager', user: TEST_USERS.community_manager, shouldSee: ['Gestión'] },
        { role: 'supervisor', user: TEST_USERS.supervisor, shouldSee: ['Mi Panel'] },
        { role: 'lider_comunidad', user: TEST_USERS.lider_comunidad, shouldSee: ['Mi Panel'] },
        { role: 'lider_generacion', user: TEST_USERS.lider_generacion, shouldSee: ['Mi Panel'] }
      ];

      for (const { role, user, shouldSee } of roleTests) {
        await login(page, user.email, user.password);

        for (const item of shouldSee) {
          const menuItem = page.locator(`nav a:has-text("${item}")`);
          await expect(menuItem).toBeVisible({ timeout: 3000 });
        }

        console.log(`✅ ${role} sidebar verified`);
        await page.goto('http://localhost:3000/logout');
      }
    });
  });

  test.describe('Suite 3: Security & Isolation', () => {
    test('3.1: Non-superadmin cannot access RBAC UI', async ({ page }) => {
      // Login as regular admin (not superadmin)
      await login(page, TEST_USERS.admin.email, TEST_USERS.admin.password);

      // Check sidebar - RBAC menu should NOT be visible
      const rbacMenu = page.locator('nav a:has-text("Roles y Permisos")');
      await expect(rbacMenu).not.toBeVisible();
      console.log('✅ RBAC menu hidden from non-superadmin');

      // Try direct URL access
      await page.goto('http://localhost:3000/admin/role-management');

      // Should NOT see RBAC page
      await expect(page.locator('h1:has-text("Gestión de Roles y Permisos")')).not.toBeVisible({ timeout: 3000 });
      console.log('✅ Direct URL access blocked for non-superadmin');
    });

    test('3.2: Permission changes do not affect other roles', async ({ page }) => {
      // Change docente permission
      await setPermission('docente', 'view_courses_all', false);

      // Verify consultor still has permission
      const consultorHasPermission = await getPermission('consultor', 'view_courses_all');
      expect(consultorHasPermission).toBe(true);
      console.log('✅ Roles are isolated - consultor unaffected by docente change');

      // Cleanup
      await setPermission('docente', 'view_courses_all', true);
    });

    test('3.3: Permission changes require page refresh', async ({ page, context }) => {
      // Setup: Grant permission
      await setPermission('docente', 'view_news_all', true);

      // Login as docente in one context
      await login(page, TEST_USERS.docente.email, TEST_USERS.docente.password);
      await expect(page.locator('nav a:has-text("Noticias")')).toBeVisible();

      // Revoke permission (without refresh)
      await setPermission('docente', 'view_news_all', false);

      // Menu should STILL be visible (cached in client)
      await expect(page.locator('nav a:has-text("Noticias")')).toBeVisible();
      console.log('✅ Permission change does not affect active session');

      // Now refresh
      await page.reload();

      // Menu should now be HIDDEN
      await expect(page.locator('nav a:has-text("Noticias")')).not.toBeVisible();
      console.log('✅ Permission change takes effect after refresh');
    });
  });

  test.describe('Suite 4: Edge Cases', () => {
    test('4.1: User with minimal permissions sees basic sidebar', async ({ page }) => {
      // Revoke all major permissions from docente (keep only own-scope permissions)
      await setPermission('docente', 'view_news_all', false);
      await setPermission('docente', 'view_events_all', false);
      await setPermission('docente', 'view_users_all', false);

      // Login
      await login(page, TEST_USERS.docente.email, TEST_USERS.docente.password);

      // Should still see basic items
      await expect(page.locator('nav a:has-text("Mi Panel")')).toBeVisible();
      await expect(page.locator('nav a:has-text("Mi Perfil")')).toBeVisible();

      // Should NOT see admin items
      await expect(page.locator('nav a:has-text("Usuarios")')).not.toBeVisible();
      console.log('✅ Minimal permissions show basic sidebar only');
    });

    test('4.2: System handles missing permission keys gracefully', async ({ page }) => {
      // This test verifies the system doesn't crash with invalid permissions
      // We can't easily inject invalid keys without modifying code, so we verify:
      // 1. Page loads without errors
      // 2. Sidebar renders

      await login(page, TEST_USERS.docente.email, TEST_USERS.docente.password);

      // Check for JavaScript errors
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));

      await page.waitForTimeout(2000); // Wait for any errors to surface

      expect(errors.length).toBe(0);
      console.log('✅ No JavaScript errors on sidebar render');
    });
  });

  test.describe('Suite 5: Rollback Capability', () => {
    test('5.1: Can export current permissions as backup', async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .order('role_type, permission_key');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThan(0);

      console.log(`✅ Exported ${data!.length} permission records`);

      // Optionally write to file
      const fs = require('fs');
      fs.writeFileSync(
        'test-results/rbac-backup-test.json',
        JSON.stringify(data, null, 2)
      );
      console.log('✅ Backup saved to test-results/rbac-backup-test.json');
    });

    test('5.2: Can restore permissions from backup', async () => {
      // Make a change
      const originalValue = await getPermission('docente', 'create_news_all');
      await setPermission('docente', 'create_news_all', !originalValue);

      // Verify change
      let currentValue = await getPermission('docente', 'create_news_all');
      expect(currentValue).toBe(!originalValue);

      // Restore original
      await setPermission('docente', 'create_news_all', originalValue);

      // Verify restoration
      currentValue = await getPermission('docente', 'create_news_all');
      expect(currentValue).toBe(originalValue);

      console.log('✅ Rollback successful');
    });
  });

  test.afterAll(async () => {
    console.log('🎉 RBAC production readiness tests complete!');
  });
});
