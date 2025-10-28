/**
 * Seed Comprehensive Permission System
 * 50 granular permissions across 13 categories
 * 9 roles with appropriate defaults
 * Total: 450 permission records
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Define all 50 permissions organized by category
const PERMISSION_CATEGORIES = {
  'Dashboard & Core': [
    'view_dashboard',
    'view_reports'
  ],
  'Learning Paths': [
    'view_learning_paths',
    'create_learning_paths',
    'edit_learning_paths',
    'delete_learning_paths',
    'assign_learning_paths'
  ],
  'Courses & Content': [
    'view_courses',
    'create_courses',
    'edit_courses',
    'delete_courses',
    'manage_course_content'
  ],
  'News & Articles': [
    'view_news',
    'create_news',
    'edit_news',
    'delete_news',
    'publish_news'
  ],
  'Events': [
    'view_events',
    'create_events',
    'edit_events',
    'delete_events'
  ],
  'User Management': [
    'view_users',
    'create_users',
    'edit_users',
    'delete_users',
    'manage_user_roles'
  ],
  'Schools & Organizations': [
    'view_schools',
    'create_schools',
    'edit_schools',
    'delete_schools',
    'manage_generations',
    'manage_communities'
  ],
  'Consultants': [
    'view_consultants',
    'create_consultants',
    'edit_consultants',
    'delete_consultants',
    'assign_consultants'
  ],
  'Financial Management': [
    'view_expense_reports',
    'create_expense_reports',
    'edit_expense_reports',
    'approve_expense_reports',
    'view_cash_flow'
  ],
  'Contracts & Internships': [
    'view_contracts',
    'create_contracts',
    'edit_contracts',
    'delete_contracts',
    'view_internship_proposals',
    'create_internship_proposals',
    'edit_internship_proposals',
    'approve_internship_proposals'
  ],
  'Workspace & Collaboration': [
    'view_workspace',
    'create_workspace_content',
    'edit_workspace_content',
    'manage_group_assignments'
  ],
  'Networks': [
    'view_networks',
    'manage_networks',
    'supervise_network_schools'
  ],
  'System Administration': [
    'manage_permissions',
    'view_audit_logs',
    'manage_system_settings'
  ]
};

// Flatten all permissions
const ALL_PERMISSIONS = Object.values(PERMISSION_CATEGORIES).flat();

console.log(`📊 Total Permissions: ${ALL_PERMISSIONS.length}`);

// Define role-specific permission matrices
const ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS.reduce((acc, perm) => ({ ...acc, [perm]: true }), {}),

  consultor: {
    view_dashboard: true,
    view_reports: true,
    view_learning_paths: true,
    assign_learning_paths: true,
    view_courses: true,
    view_news: true,
    view_events: true,
    view_users: true,
    view_schools: true,
    view_consultants: true,
    // All others false
  },

  equipo_directivo: {
    view_dashboard: true,
    view_reports: true,
    view_learning_paths: true,
    view_courses: true,
    view_news: true,
    create_news: true,
    edit_news: true,
    view_events: true,
    create_events: true,
    edit_events: true,
    view_users: true,
    view_expense_reports: true,
    create_expense_reports: true,
    edit_expense_reports: true,
    view_contracts: true,
    view_internship_proposals: true,
    create_internship_proposals: true,
    edit_internship_proposals: true,
    view_workspace: true,
    create_workspace_content: true,
    edit_workspace_content: true,
    // Others false
  },

  lider_generacion: {
    view_dashboard: true,
    view_reports: true,
    view_learning_paths: true,
    view_courses: true,
    view_news: true,
    view_events: true,
    view_users: true,
    view_workspace: true,
    create_workspace_content: true,
    edit_workspace_content: true,
    manage_group_assignments: true,
    // Others false
  },

  lider_comunidad: {
    view_dashboard: true,
    view_learning_paths: true,
    view_courses: true,
    view_news: true,
    view_events: true,
    view_users: true,
    view_workspace: true,
    create_workspace_content: true,
    edit_workspace_content: true,
    manage_group_assignments: true,
    // Others false
  },

  community_manager: {
    view_dashboard: true,
    view_news: true,
    create_news: true,
    edit_news: true,
    delete_news: true,
    publish_news: true,
    view_events: true,
    create_events: true,
    edit_events: true,
    delete_events: true,
    view_workspace: true,
    create_workspace_content: true,
    edit_workspace_content: true,
    // Others false
  },

  supervisor_de_red: {
    view_dashboard: true,
    view_reports: true,
    view_networks: true,
    manage_networks: true,
    supervise_network_schools: true,
    view_schools: true,
    view_users: true,
    view_consultants: true,
    // Others false
  },

  docente: {
    view_dashboard: true,
    view_learning_paths: true,
    view_courses: true,
    view_news: true,
    view_events: true,
    view_workspace: true,
    create_workspace_content: true,
    edit_workspace_content: true,
    // Others false
  },

  estudiante: {
    view_dashboard: true,
    view_learning_paths: true,
    view_courses: true,
    view_news: true,
    view_events: true,
    view_workspace: true,
    // Others false
  }
};

async function seedComprehensivePermissions() {
  console.log('\n🌱 Seeding Comprehensive Permission System...\n');

  try {
    // Step 1: Clear existing permissions
    console.log('🗑️  Step 1: Clearing existing permissions...');
    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('is_test', false);

    if (deleteError) {
      console.error('❌ Error deleting existing permissions:', deleteError.message);
      return;
    }
    console.log('✅ Existing permissions cleared\n');

    // Step 2: Generate all permission records
    console.log('📦 Step 2: Generating permission records...');
    const permissions = [];

    for (const [roleName, rolePerms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permKey of ALL_PERMISSIONS) {
        permissions.push({
          role_type: roleName,
          permission_key: permKey,
          granted: rolePerms[permKey] === true,
          is_test: false,
          active: true
        });
      }
    }

    console.log(`   Generated ${permissions.length} permission records`);
    console.log(`   Roles: ${Object.keys(ROLE_PERMISSIONS).length}`);
    console.log(`   Permissions per role: ${ALL_PERMISSIONS.length}\n`);

    // Step 3: Insert in batches
    console.log('💾 Step 3: Inserting permissions into database...');
    const BATCH_SIZE = 100;
    let inserted = 0;

    for (let i = 0; i < permissions.length; i += BATCH_SIZE) {
      const batch = permissions.slice(i, i + BATCH_SIZE);

      const { error: insertError } = await supabase
        .from('role_permissions')
        .insert(batch);

      if (insertError) {
        console.error(`❌ Error inserting batch at ${i}:`, insertError.message);
        return;
      }

      inserted += batch.length;
      process.stdout.write(`\r   Inserted ${inserted}/${permissions.length}...`);
    }

    console.log('\n✅ All permissions inserted successfully!\n');

    // Step 4: Verify counts
    console.log('🔍 Step 4: Verifying insertion...');

    const { count: totalCount } = await supabase
      .from('role_permissions')
      .select('*', { count: 'exact', head: true })
      .eq('is_test', false);

    console.log(`   Total records: ${totalCount}`);

    // Count granted vs denied
    const { count: grantedCount } = await supabase
      .from('role_permissions')
      .select('*', { count: 'exact', head: true })
      .eq('is_test', false)
      .eq('granted', true);

    const deniedCount = totalCount - grantedCount;

    console.log(`   Granted: ${grantedCount}`);
    console.log(`   Denied: ${deniedCount}\n`);

    // Step 5: Summary by role
    console.log('📊 Step 5: Permission Summary by Role\n');

    for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
      const { count } = await supabase
        .from('role_permissions')
        .select('*', { count: 'exact', head: true })
        .eq('role_type', roleName)
        .eq('granted', true)
        .eq('is_test', false);

      const percentage = Math.round((count / ALL_PERMISSIONS.length) * 100);
      console.log(`   ${roleName.padEnd(20)} ${String(count).padStart(2)}/${ALL_PERMISSIONS.length} (${percentage}%)`);
    }

    console.log('\n✅ Comprehensive permission system seeded successfully!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Refresh the role management page');
    console.log('   2. UI will now show 50 permissions across 13 categories');
    console.log('   3. All permissions are editable via the UI\n');

  } catch (error) {
    console.error('💥 Error seeding permissions:', error);
    process.exit(1);
  }
}

seedComprehensivePermissions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
