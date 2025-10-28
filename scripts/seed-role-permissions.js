/**
 * Seed initial role permissions from mock data
 * Migrates hardcoded permissions from pages/api/admin/roles/permissions.ts
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mock permissions from pages/api/admin/roles/permissions.ts
const mockPermissions = {
  admin: {
    view_dashboard: true,
    manage_users: true,
    manage_courses: true,
    manage_roles: true,
    view_reports: true,
    manage_content: true,
    manage_generations: true,
    manage_networks: true
  },
  consultor: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: false,
    manage_generations: false,
    manage_networks: false
  },
  equipo_directivo: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: true,
    manage_generations: false,
    manage_networks: false
  },
  lider_generacion: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: true,
    manage_generations: false,
    manage_networks: false
  },
  lider_comunidad: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: true,
    manage_generations: false,
    manage_networks: false
  },
  community_manager: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: true,
    manage_generations: false,
    manage_networks: false
  },
  supervisor_de_red: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: false,
    manage_generations: false,
    manage_networks: true
  },
  docente: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: true,
    manage_content: true,
    manage_generations: false,
    manage_networks: false
  },
  estudiante: {
    view_dashboard: true,
    manage_users: false,
    manage_courses: false,
    manage_roles: false,
    view_reports: false,
    manage_content: false,
    manage_generations: false,
    manage_networks: false
  }
};

// Permission descriptions
const permissionDescriptions = {
  view_dashboard: 'Ver el panel de control principal',
  manage_users: 'Gestionar usuarios (crear, editar, eliminar)',
  manage_courses: 'Gestionar cursos y contenido educativo',
  manage_roles: 'Gestionar roles y permisos de usuarios',
  view_reports: 'Ver reportes y análisis de actividad',
  manage_content: 'Gestionar contenido (noticias, eventos, materiales)',
  manage_generations: 'Gestionar generaciones y cohortes',
  manage_networks: 'Gestionar redes de colegios'
};

async function seedPermissions() {
  console.log('🌱 Seeding role permissions...\n');

  try {
    // Check if already seeded
    const { data: existing, error: checkError } = await supabase
      .from('role_permissions')
      .select('*')
      .limit(1);

    if (checkError) {
      console.error('❌ Error checking existing permissions:', checkError.message);
      process.exit(1);
    }

    if (existing && existing.length > 0) {
      console.log('⚠️  Permissions already seeded. Found', existing.length, 'existing records.');
      console.log('   To re-seed, first delete existing permissions.\n');

      // Show current count
      const { count } = await supabase
        .from('role_permissions')
        .select('*', { count: 'exact', head: true });

      console.log(`📊 Current permission count: ${count}`);
      process.exit(0);
    }

    // Prepare permission records
    // Note: Table uses 'granted' column (from overlay schema), not 'enabled'
    const permissions = [];
    for (const [roleType, rolePerms] of Object.entries(mockPermissions)) {
      for (const [permKey, granted] of Object.entries(rolePerms)) {
        permissions.push({
          role_type: roleType,
          permission_key: permKey,
          granted: granted,
          is_test: false, // These are baseline permissions, not test overlays
          active: true
        });
      }
    }

    console.log(`📦 Preparing to insert ${permissions.length} permission records...`);
    console.log(`   Roles: ${Object.keys(mockPermissions).length}`);
    console.log(`   Permissions: ${Object.keys(permissionDescriptions).length}\n`);

    // Insert in batches
    const batchSize = 50;
    let inserted = 0;

    for (let i = 0; i < permissions.length; i += batchSize) {
      const batch = permissions.slice(i, i + batchSize);

      const { error } = await supabase
        .from('role_permissions')
        .insert(batch);

      if (error) {
        console.error(`❌ Error inserting batch at index ${i}:`, error.message);
        process.exit(1);
      }

      inserted += batch.length;
      console.log(`   ✅ Inserted ${inserted}/${permissions.length} permissions...`);
    }

    console.log('\n✅ Successfully seeded all role permissions!');
    console.log('\n📊 Summary:');
    console.log(`   Total Permissions: ${permissions.length}`);
    console.log(`   Roles Configured: ${Object.keys(mockPermissions).length}`);
    console.log(`   Unique Permission Keys: ${Object.keys(permissionDescriptions).length}`);

    // Verify the seed
    const { count } = await supabase
      .from('role_permissions')
      .select('*', { count: 'exact', head: true });

    console.log(`\n✅ Verification: ${count} records in database`);

  } catch (error) {
    console.error('💥 Error seeding permissions:', error);
    process.exit(1);
  }
}

seedPermissions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
