/**
 * Create Mock Users for RBAC Testing
 * Creates one user for each role with predictable credentials for manual testing
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Test users - one per role
const TEST_USERS = [
  {
    email: 'test.admin@fne-test.com',
    password: 'TestAdmin123!',
    role: 'admin',
    metadata: {
      full_name: 'Test Admin',
      roles: ['admin']
    }
  },
  {
    email: 'test.consultor@fne-test.com',
    password: 'TestConsultor123!',
    role: 'consultor',
    metadata: {
      full_name: 'Test Consultor',
      roles: ['consultor']
    }
  },
  {
    email: 'test.directivo@fne-test.com',
    password: 'TestDirectivo123!',
    role: 'equipo_directivo',
    metadata: {
      full_name: 'Test Directivo',
      roles: ['equipo_directivo']
    }
  },
  {
    email: 'test.lider.generacion@fne-test.com',
    password: 'TestLider123!',
    role: 'lider_generacion',
    metadata: {
      full_name: 'Test Líder Generación',
      roles: ['lider_generacion']
    }
  },
  {
    email: 'test.lider.comunidad@fne-test.com',
    password: 'TestLiderCom123!',
    role: 'lider_comunidad',
    metadata: {
      full_name: 'Test Líder Comunidad',
      roles: ['lider_comunidad']
    }
  },
  {
    email: 'test.community.manager@fne-test.com',
    password: 'TestManager123!',
    role: 'community_manager',
    metadata: {
      full_name: 'Test Community Manager',
      roles: ['community_manager']
    }
  },
  {
    email: 'test.supervisor@fne-test.com',
    password: 'TestSupervisor123!',
    role: 'supervisor_de_red',
    metadata: {
      full_name: 'Test Supervisor de Red',
      roles: ['supervisor_de_red']
    }
  },
  {
    email: 'test.docente@fne-test.com',
    password: 'TestDocente123!',
    role: 'docente',
    metadata: {
      full_name: 'Test Docente',
      roles: ['docente']
    }
  },
  {
    email: 'test.estudiante@fne-test.com',
    password: 'TestEstudiante123!',
    role: 'estudiante',
    metadata: {
      full_name: 'Test Estudiante',
      roles: ['estudiante']
    }
  }
];

async function createTestUsers() {
  console.log('🚀 Creating RBAC Test Users...\n');

  const results = {
    created: [],
    existing: [],
    errors: []
  };

  for (const user of TEST_USERS) {
    try {
      console.log(`Creating user: ${user.email} (${user.role})...`);

      // Try to create user
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: user.metadata
      });

      if (error) {
        if (error.message.includes('already registered')) {
          console.log(`  ⚠️  User already exists`);
          results.existing.push(user.email);

          // Try to update metadata
          const { data: users } = await supabase.auth.admin.listUsers();
          const existingUser = users.users.find(u => u.email === user.email);

          if (existingUser) {
            await supabase.auth.admin.updateUserById(existingUser.id, {
              user_metadata: user.metadata
            });
            console.log(`  ✅ Updated metadata for existing user`);
          }
        } else {
          console.log(`  ❌ Error: ${error.message}`);
          results.errors.push({ email: user.email, error: error.message });
        }
      } else {
        console.log(`  ✅ Created successfully`);
        results.created.push(user.email);

        // Add to user_roles table
        if (data.user) {
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({
              user_id: data.user.id,
              role_type: user.role,
              active: true,
              is_test: true
            });

          if (roleError && !roleError.message.includes('duplicate')) {
            console.log(`  ⚠️  Could not add to user_roles: ${roleError.message}`);
          } else {
            console.log(`  ✅ Added to user_roles table`);
          }
        }
      }

      console.log('');
    } catch (err) {
      console.log(`  ❌ Unexpected error: ${err.message}\n`);
      results.errors.push({ email: user.email, error: err.message });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Created: ${results.created.length}`);
  console.log(`⚠️  Already existed: ${results.existing.length}`);
  console.log(`❌ Errors: ${results.errors.length}`);

  if (results.created.length > 0) {
    console.log('\n📝 Newly Created Users:');
    results.created.forEach(email => console.log(`  - ${email}`));
  }

  if (results.existing.length > 0) {
    console.log('\n📝 Existing Users (metadata updated):');
    results.existing.forEach(email => console.log(`  - ${email}`));
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(({ email, error }) => {
      console.log(`  - ${email}: ${error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔑 TEST CREDENTIALS');
  console.log('='.repeat(60));
  console.log('\nAll test users have predictable passwords:');
  console.log('  Format: Test[Role]123!');
  console.log('\nExamples:');
  console.log('  Admin:     test.admin@fne-test.com / TestAdmin123!');
  console.log('  Consultor: test.consultor@fne-test.com / TestConsultor123!');
  console.log('  Docente:   test.docente@fne-test.com / TestDocente123!');
  console.log('  Student:   test.estudiante@fne-test.com / TestEstudiante123!');

  console.log('\n' + '='.repeat(60));
  console.log('🧪 NEXT STEPS');
  console.log('='.repeat(60));
  console.log('1. Start dev server: npm run dev');
  console.log('2. Open Chrome: http://localhost:3000');
  console.log('3. Start Chrome DevTools MCP: npm run mcp:chrome');
  console.log('4. Test login with each user');
  console.log('5. Navigate to /admin/role-management as superadmin');
  console.log('6. Verify permission matrix loads correctly');
  console.log('7. Test permission editing and saving');
  console.log('='.repeat(60));
}

// Run the script
createTestUsers()
  .then(() => {
    console.log('\n✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
