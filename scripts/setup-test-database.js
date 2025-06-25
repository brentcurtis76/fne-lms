/**
 * Setup script for test database
 * Creates test users and data for automated testing
 */

const { createClient } = require('@supabase/supabase-js');
const { UserFactory } = require('../__tests__/factories/userFactory');

const TEST_SUPABASE_URL = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const TEST_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TEST_SUPABASE_URL || !TEST_SERVICE_ROLE_KEY) {
  console.error('❌ Missing test database configuration');
  console.error('Required environment variables:');
  console.error('- TEST_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('- TEST_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY);

async function setupTestDatabase() {
  console.log('🏗️  Setting up test database...');
  
  try {
    // Create test environment
    console.log('📊 Creating test data structure...');
    const testData = UserFactory.createRoleBasedUsers();
    
    // Create test schools
    console.log('🏫 Creating test schools...');
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .upsert(testData.environment.schools.map(school => ({
        id: school.id,
        name: school.name,
        district: school.district,
        region: school.region,
        has_generations: school.has_generations
      })));
    
    if (schoolsError) {
      console.log('⚠️  Schools already exist or error:', schoolsError.message);
    } else {
      console.log(`✅ Created ${testData.environment.schools.length} test schools`);
    }

    // Create test generations
    console.log('📚 Creating test generations...');
    const { data: generations, error: generationsError } = await supabase
      .from('generations')
      .upsert(testData.environment.generations.map(gen => ({
        id: gen.id,
        name: gen.name,
        school_id: gen.school_id,
        grade_range: gen.grade_range,
        academic_year: gen.academic_year
      })));
    
    if (generationsError) {
      console.log('⚠️  Generations already exist or error:', generationsError.message);
    } else {
      console.log(`✅ Created ${testData.environment.generations.length} test generations`);
    }

    // Create test communities
    console.log('👥 Creating test communities...');
    const { data: communities, error: communitiesError } = await supabase
      .from('growth_communities')
      .upsert(testData.environment.communities.map(comm => ({
        id: comm.id,
        name: comm.name,
        school_id: comm.school_id,
        generation_id: comm.generation_id,
        description: comm.description
      })));
    
    if (communitiesError) {
      console.log('⚠️  Communities already exist or error:', communitiesError.message);
    } else {
      console.log(`✅ Created ${testData.environment.communities.length} test communities`);
    }

    // Create test users
    console.log('👤 Creating test users...');
    const allUsers = [
      testData.admin,
      testData.consultor,
      testData.equipoDirectivo,
      testData.liderGeneracion,
      testData.liderComunidad,
      ...testData.docentes
    ];

    for (const user of allUsers) {
      try {
        // Create auth user
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: 'test123456',
          email_confirm: true,
          user_metadata: {
            first_name: user.first_name,
            last_name: user.last_name
          }
        });

        if (authError && !authError.message.includes('already been registered')) {
          console.error(`❌ Failed to create auth user ${user.email}:`, authError.message);
          continue;
        }

        const userId = authUser?.user?.id || user.id;

        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            school_id: user.school_id,
            generation_id: user.generation_id,
            community_id: user.community_id,
            is_active: user.is_active
          });

        if (profileError) {
          console.log(`⚠️  Profile for ${user.email} already exists or error:`, profileError.message);
        } else {
          console.log(`✅ Created test user: ${user.email} (${user.role})`);
        }

        // Create user role entry
        const { error: roleError } = await supabase
          .from('user_roles')
          .upsert({
            user_id: userId,
            role_type: user.role,
            school_id: user.school_id,
            generation_id: user.generation_id,
            community_id: user.community_id,
            is_active: true,
            assigned_at: new Date().toISOString(),
            assigned_by: testData.admin.id
          });

        if (roleError) {
          console.log(`⚠️  Role for ${user.email} already exists or error:`, roleError.message);
        }

      } catch (error) {
        console.error(`❌ Failed to create user ${user.email}:`, error.message);
      }
    }

    // Create dev user for testing role switching
    console.log('🛠️  Creating dev user...');
    try {
      const devEmail = 'dev@test.com';
      const { data: devAuthUser, error: devAuthError } = await supabase.auth.admin.createUser({
        email: devEmail,
        password: 'test123456',
        email_confirm: true,
        user_metadata: {
          first_name: 'Dev',
          last_name: 'User'
        }
      });

      if (!devAuthError || devAuthError.message.includes('already been registered')) {
        const devUserId = devAuthUser?.user?.id || 'dev-user-id';
        
        // Create dev user entry
        const { error: devUserError } = await supabase
          .from('dev_users')
          .upsert({
            user_id: devUserId,
            is_active: true,
            assigned_at: new Date().toISOString(),
            assigned_by: testData.admin.id
          });

        if (!devUserError) {
          console.log('✅ Created dev user for role switching tests');
        }
      }
    } catch (error) {
      console.log('⚠️  Dev user setup failed:', error.message);
    }

    console.log('\n🎉 Test database setup completed!');
    console.log('\n📋 Test Users Created:');
    console.log(`   👑 Admin: ${testData.admin.email} (password: test123456)`);
    console.log(`   👨‍🏫 Consultant: ${testData.consultor.email} (password: test123456)`);
    console.log(`   👩‍💼 Director: ${testData.equipoDirectivo.email} (password: test123456)`);
    console.log(`   👤 Generation Leader: ${testData.liderGeneracion.email} (password: test123456)`);
    console.log(`   👥 Community Leader: ${testData.liderComunidad.email} (password: test123456)`);
    testData.docentes.forEach((docente, index) => {
      console.log(`   🎓 Student ${index + 1}: ${docente.email} (password: test123456)`);
    });
    console.log(`   🛠️  Dev User: dev@test.com (password: test123456)`);
    
    console.log('\n🏗️  Environment Structure:');
    console.log(`   🏫 Schools: ${testData.environment.schools.length}`);
    console.log(`   📚 Generations: ${testData.environment.generations.length}`);
    console.log(`   👥 Communities: ${testData.environment.communities.length}`);
    
    console.log('\n🧪 Ready for automated testing!');

  } catch (error) {
    console.error('❌ Test database setup failed:', error);
    process.exit(1);
  }
}

async function cleanupTestDatabase() {
  console.log('🧹 Cleaning up test database...');
  
  try {
    // Delete test data in reverse order of dependencies
    console.log('Removing test user roles...');
    await supabase.from('user_roles').delete().like('user_id', 'user-%');
    
    console.log('Removing test profiles...');
    await supabase.from('profiles').delete().like('email', '%@test.com');
    
    console.log('Removing test communities...');
    await supabase.from('growth_communities').delete().like('id', 'community-%');
    
    console.log('Removing test generations...');
    await supabase.from('generations').delete().like('id', 'gen-%');
    
    console.log('Removing test schools...');
    await supabase.from('schools').delete().like('id', 'school-%');
    
    console.log('Removing dev users...');
    await supabase.from('dev_users').delete().neq('id', 'keep');
    
    console.log('✅ Test database cleanup completed');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

// Check command line arguments
const command = process.argv[2];

if (command === 'cleanup') {
  cleanupTestDatabase();
} else {
  setupTestDatabase();
}

module.exports = {
  setupTestDatabase,
  cleanupTestDatabase
};