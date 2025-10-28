/**
 * Seed Scoped Permissions
 *
 * Creates ~123 permissions with scopes (own, school, network, all)
 * Total records: 9 roles × ~123 permissions = ~1,107 records
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// All available roles
const ROLES = [
  'admin',
  'consultor',
  'equipo_directivo',
  'community_manager',
  'supervisor_de_red',
  'lider_generacion',
  'lider_comunidad',
  'docente',
  'estudiante'
];

// Permissions that DON'T need scoping (always "all" - included as-is)
const UNSCOPED_PERMISSIONS = [
  'view_dashboard',
  'manage_permissions',
  'view_audit_logs',
  'manage_system_settings',
  'manage_networks',
  'supervise_network_schools'
];

// Permissions that NEED scoping
// Format: base permission name (will have _own, _school, _network, _all added)
const SCOPED_PERMISSION_GROUPS = {
  'Dashboard & Reports': {
    permissions: [
      { base: 'view_reports', scopes: ['school', 'generation', 'community', 'network', 'all'] }
    ]
  },
  'Learning Paths': {
    permissions: [
      { base: 'view_learning_paths', scopes: ['own', 'school', 'all'] },
      { base: 'create_learning_paths', scopes: ['school', 'all'] },
      { base: 'edit_learning_paths', scopes: ['own', 'school', 'all'] },
      { base: 'delete_learning_paths', scopes: ['own', 'school', 'all'] },
      { base: 'assign_learning_paths', scopes: ['all'] }
    ]
  },
  'Courses & Content': {
    permissions: [
      { base: 'view_courses', scopes: ['own', 'school', 'all'] },
      { base: 'create_courses', scopes: ['school', 'all'] },
      { base: 'edit_courses', scopes: ['own', 'school', 'all'] },
      { base: 'delete_courses', scopes: ['own', 'school', 'all'] },
      { base: 'manage_course_content', scopes: ['all'] }
    ]
  },
  'News & Articles': {
    permissions: [
      { base: 'view_news', scopes: ['all'] },
      { base: 'create_news', scopes: ['all'] },
      { base: 'edit_news', scopes: ['own', 'school', 'all'] },
      { base: 'delete_news', scopes: ['own', 'school', 'all'] },
      { base: 'publish_news', scopes: ['own', 'school', 'all'] }
    ]
  },
  'Events': {
    permissions: [
      { base: 'view_events', scopes: ['all'] },
      { base: 'create_events', scopes: ['school', 'all'] },
      { base: 'edit_events', scopes: ['own', 'school', 'all'] },
      { base: 'delete_events', scopes: ['own', 'school', 'all'] }
    ]
  },
  'User Management': {
    permissions: [
      { base: 'view_users', scopes: ['own', 'school', 'network', 'all'] },
      { base: 'create_users', scopes: ['school', 'all'] },
      { base: 'edit_users', scopes: ['own', 'school', 'all'] },
      { base: 'delete_users', scopes: ['school', 'all'] },
      { base: 'manage_user_roles', scopes: ['all'] }
    ]
  },
  'Schools & Organizations': {
    permissions: [
      { base: 'view_schools', scopes: ['network', 'all'] },
      { base: 'create_schools', scopes: ['all'] },
      { base: 'edit_schools', scopes: ['own', 'network', 'all'] },
      { base: 'delete_schools', scopes: ['all'] },
      { base: 'manage_generations', scopes: ['school', 'all'] },
      { base: 'manage_communities', scopes: ['school', 'all'] }
    ]
  },
  'Consultants': {
    permissions: [
      { base: 'view_consultants', scopes: ['all'] },
      { base: 'create_consultants', scopes: ['all'] },
      { base: 'edit_consultants', scopes: ['all'] },
      { base: 'delete_consultants', scopes: ['all'] },
      { base: 'assign_consultants', scopes: ['school', 'all'] }
    ]
  },
  'Financial Management': {
    permissions: [
      { base: 'view_expense_reports', scopes: ['own', 'school', 'all'] },
      { base: 'create_expense_reports', scopes: ['own', 'school', 'all'] },
      { base: 'edit_expense_reports', scopes: ['own', 'school', 'all'] },
      { base: 'approve_expense_reports', scopes: ['school', 'all'] },
      { base: 'view_cash_flow', scopes: ['school', 'all'] }
    ]
  },
  'Contracts & Internships': {
    permissions: [
      { base: 'view_contracts', scopes: ['own', 'school', 'all'] },
      { base: 'create_contracts', scopes: ['school', 'all'] },
      { base: 'edit_contracts', scopes: ['own', 'school', 'all'] },
      { base: 'delete_contracts', scopes: ['own', 'school', 'all'] },
      { base: 'view_internship_proposals', scopes: ['own', 'school', 'all'] },
      { base: 'create_internship_proposals', scopes: ['school', 'all'] },
      { base: 'edit_internship_proposals', scopes: ['own', 'school', 'all'] },
      { base: 'approve_internship_proposals', scopes: ['school', 'all'] }
    ]
  },
  'Workspace & Collaboration': {
    permissions: [
      { base: 'view_workspace', scopes: ['own', 'school'] },
      { base: 'create_workspace_content', scopes: ['school', 'all'] },
      { base: 'edit_workspace_content', scopes: ['own', 'all'] },
      { base: 'manage_group_assignments', scopes: ['school', 'all'] }
    ]
  }
};

// Generate all scoped permission keys
function generateAllPermissions() {
  const allPermissions = [...UNSCOPED_PERMISSIONS];

  for (const category of Object.values(SCOPED_PERMISSION_GROUPS)) {
    for (const perm of category.permissions) {
      for (const scope of perm.scopes) {
        allPermissions.push(`${perm.base}_${scope}`);
      }
    }
  }

  return allPermissions;
}

// Role permission defaults
const ROLE_DEFAULTS = {
  admin: (allPermissions) => {
    // Admin gets ALL permissions
    return allPermissions.reduce((acc, perm) => ({ ...acc, [perm]: true }), {});
  },

  consultor: (allPermissions) => ({
    view_dashboard: true,
    view_reports_all: true,
    view_learning_paths_all: true,
    view_courses_all: true,
    view_news_all: true,
    view_events_all: true,
    view_users_network: true,
    view_schools_network: true,
    view_consultants_all: true,
    view_expense_reports_all: true,
    view_cash_flow_all: true,
    view_contracts_all: true,
    view_internship_proposals_all: true
  }),

  equipo_directivo: (allPermissions) => ({
    view_dashboard: true,
    view_reports_school: true,
    view_learning_paths_school: true,
    create_learning_paths_school: true,
    edit_learning_paths_school: true,
    view_courses_school: true,
    create_courses_school: true,
    edit_courses_school: true,
    view_news_all: true,
    create_news_all: true,
    edit_news_school: true,
    publish_news_school: true,
    view_events_all: true,
    create_events_school: true,
    edit_events_school: true,
    view_users_school: true,
    create_users_school: true,
    edit_users_school: true,
    view_schools_all: true,
    edit_schools_own: true,
    manage_generations_school: true,
    manage_communities_school: true,
    view_expense_reports_school: true,
    create_expense_reports_school: true,
    edit_expense_reports_school: true,
    approve_expense_reports_school: true,
    view_cash_flow_school: true,
    view_contracts_school: true,
    create_contracts_school: true,
    edit_contracts_school: true,
    view_internship_proposals_school: true,
    create_internship_proposals_school: true,
    edit_internship_proposals_school: true,
    approve_internship_proposals_school: true,
    view_workspace_school: true,
    create_workspace_content_school: true,
    manage_group_assignments_school: true
  }),

  community_manager: (allPermissions) => ({
    view_dashboard: true,
    // NO view_reports permission - Community Managers should NOT see reports
    view_news_all: true,
    create_news_all: true,
    edit_news_own: true,
    delete_news_own: true,
    publish_news_own: true,
    view_events_all: true,
    create_events_school: true,
    edit_events_own: true,
    view_expense_reports_own: true,
    create_expense_reports_own: true,
    edit_expense_reports_own: true,
    view_workspace_own: true,
    edit_workspace_content_own: true
  }),

  supervisor_de_red: (allPermissions) => ({
    view_dashboard: true,
    view_reports_network: true,
    supervise_network_schools: true,
    view_users_network: true,
    view_schools_network: true,
    edit_schools_network: true,
    view_expense_reports_all: true,
    view_cash_flow_all: true,
    view_contracts_all: true
  }),

  lider_generacion: (allPermissions) => ({
    view_dashboard: true,
    view_reports_generation: true,
    view_learning_paths_school: true,
    view_courses_school: true,
    view_news_all: true,
    view_events_all: true,
    view_users_school: true,
    manage_generations_school: true,
    view_workspace_school: true,
    create_workspace_content_school: true,
    edit_workspace_content_own: true,
    manage_group_assignments_school: true
  }),

  lider_comunidad: (allPermissions) => ({
    view_dashboard: true,
    view_reports_community: true,
    view_learning_paths_school: true,
    view_courses_school: true,
    view_news_all: true,
    view_events_all: true,
    view_users_school: true,
    manage_communities_school: true,
    view_workspace_school: true,
    create_workspace_content_school: true,
    edit_workspace_content_own: true
  }),

  docente: (allPermissions) => ({
    view_dashboard: true,
    view_learning_paths_own: true,
    view_courses_own: true,
    view_news_all: true,
    view_events_all: true,
    view_users_own: true,
    view_workspace_own: true,
    edit_workspace_content_own: true,
    manage_group_assignments_school: true
  }),

  estudiante: (allPermissions) => ({
    view_dashboard: true,
    view_learning_paths_own: true,
    view_courses_own: true,
    view_news_all: true,
    view_events_all: true,
    view_users_own: true,
    view_workspace_own: true
  })
};

async function seedScopedPermissions() {
  console.log('🌱 Seeding Scoped Permission System...\n');

  // Generate all permissions
  const allPermissions = generateAllPermissions();
  console.log(`📊 Total Permissions: ${allPermissions.length}`);
  console.log(`📊 Roles: ${ROLES.length}`);
  console.log(`📊 Total Records to Insert: ${allPermissions.length * ROLES.length}\n`);

  // Delete existing non-test permissions
  const { error: deleteError } = await supabase
    .from('role_permissions')
    .delete()
    .eq('is_test', false);

  if (deleteError) {
    console.error('❌ Error deleting old permissions:', deleteError);
    process.exit(1);
  }

  console.log('🗑️  Cleared old permissions\n');

  // Build permission records
  const records = [];

  for (const role of ROLES) {
    const rolePermissions = ROLE_DEFAULTS[role](allPermissions);

    for (const permission of allPermissions) {
      records.push({
        role_type: role,
        permission_key: permission,
        granted: rolePermissions[permission] || false,
        is_test: false,
        active: true,
        created_at: new Date().toISOString()
      });
    }
  }

  // Insert in batches of 500 (Supabase limit)
  const batchSize = 500;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from('role_permissions')
      .insert(batch);

    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error);
      process.exit(1);
    }

    console.log(`✅ Inserted batch ${i / batchSize + 1}/${Math.ceil(records.length / batchSize)}`);
  }

  console.log('\n✅ All permissions inserted successfully!\n');

  // Display summary
  console.log('📊 Permission Summary by Role:\n');
  for (const role of ROLES) {
    const rolePermissions = ROLE_DEFAULTS[role](allPermissions);
    const grantedCount = Object.values(rolePermissions).filter(Boolean).length;
    const percentage = ((grantedCount / allPermissions.length) * 100).toFixed(1);
    console.log(`   ${role.padEnd(20)} ${grantedCount}/${allPermissions.length} (${percentage}%)`);
  }

  console.log('\n✅ Scoped permission seeding complete!');
}

// Run seeding
seedScopedPermissions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
