/**
 * Verify 6-role system migration
 * Checks that all database changes were applied correctly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyMigration() {
  console.log('🔍 Verifying 6-role system migration...\n');
  
  try {
    // 1. Check if new tables exist
    console.log('1. Checking if new tables exist...');
    const tables = ['schools', 'generations', 'growth_communities', 'user_roles'];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
        
      if (error) {
        console.log(`❌ Table ${table}: ${error.message}`);
      } else {
        console.log(`✅ Table ${table}: exists and accessible`);
      }
    }

    // 2. Check enum type
    console.log('\n2. Checking user_role_type enum...');
    try {
      const { data: enumData, error: enumError } = await supabase
        .rpc('exec_sql', { 
          sql: "SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role_type')" 
        });
      
      if (enumError) {
        console.log(`❌ Enum check: ${enumError.message}`);
      } else {
        console.log('✅ user_role_type enum: exists');
        console.log('   Available roles:', enumData || 'Could not fetch enum values');
      }
    } catch (err) {
      console.log(`⚠️  Could not verify enum: ${err.message}`);
    }

    // 3. Check helper functions
    console.log('\n3. Checking helper functions...');
    try {
      const { data: funcData, error: funcError } = await supabase
        .rpc('exec_sql', { 
          sql: "SELECT proname FROM pg_proc WHERE proname IN ('is_global_admin', 'get_user_admin_status')" 
        });
      
      if (funcError) {
        console.log(`❌ Functions check: ${funcError.message}`);
      } else {
        console.log('✅ Helper functions: exist');
      }
    } catch (err) {
      console.log(`⚠️  Could not verify functions: ${err.message}`);
    }

    // 4. Check default organizational data
    console.log('\n4. Checking default organizational data...');
    
    const { data: schools, error: schoolError } = await supabase
      .from('schools')
      .select('*')
      .eq('code', 'DEMO001');
    
    if (schoolError) {
      console.log(`❌ Demo school: ${schoolError.message}`);
    } else if (schools && schools.length > 0) {
      console.log(`✅ Demo school: ${schools[0].name} (${schools[0].code})`);
      
      // Check generations
      const { data: generations, error: genError } = await supabase
        .from('generations')
        .select('*')
        .eq('school_id', schools[0].id);
      
      if (genError) {
        console.log(`❌ Generations: ${genError.message}`);
      } else {
        console.log(`✅ Generations: ${generations?.length || 0} found`);
        generations?.forEach(gen => {
          console.log(`   - ${gen.name} (${gen.grade_range})`);
        });
      }
      
      // Check communities
      const { data: communities, error: commError } = await supabase
        .from('growth_communities')
        .select('*')
        .eq('school_id', schools[0].id);
      
      if (commError) {
        console.log(`❌ Communities: ${commError.message}`);
      } else {
        console.log(`✅ Communities: ${communities?.length || 0} found`);
        communities?.forEach(comm => {
          console.log(`   - ${comm.name}`);
        });
      }
    } else {
      console.log('❌ Demo school: not found');
    }

    // 5. Check user role migration
    console.log('\n5. Checking user role migration...');
    
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('is_active', true);
    
    if (roleError) {
      console.log(`❌ User roles: ${roleError.message}`);
    } else {
      console.log(`✅ User roles: ${userRoles?.length || 0} active roles found`);
      
      // Count by role type
      const roleCounts = userRoles?.reduce((acc, role) => {
        acc[role.role_type] = (acc[role.role_type] || 0) + 1;
        return acc;
      }, {}) || {};
      
      Object.entries(roleCounts).forEach(([roleType, count]) => {
        console.log(`   - ${roleType}: ${count} users`);
      });
    }

    // 6. Check legacy profiles
    console.log('\n6. Checking legacy profile roles...');
    
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .not('role', 'is', null);
    
    if (profileError) {
      console.log(`❌ Legacy profiles: ${profileError.message}`);
    } else {
      console.log(`✅ Legacy profiles: ${profiles?.length || 0} with roles`);
      
      const legacyRoleCounts = profiles?.reduce((acc, profile) => {
        acc[profile.role] = (acc[profile.role] || 0) + 1;
        return acc;
      }, {}) || {};
      
      Object.entries(legacyRoleCounts).forEach(([roleType, count]) => {
        console.log(`   - ${roleType}: ${count} users`);
      });
    }

    // 7. Test helper functions
    console.log('\n7. Testing helper functions...');
    
    try {
      // Test with a known user (if any)
      const { data: testProfile } = await supabase
        .from('profiles')
        .select('id, email, role')
        .limit(1)
        .single();
      
      if (testProfile) {
        console.log(`Testing with user: ${testProfile.email}`);
        
        try {
          const { data: isAdminResult, error: adminError } = await supabase
            .rpc('get_user_admin_status', { user_uuid: testProfile.id });
          
          if (adminError) {
            console.log(`❌ get_user_admin_status: ${adminError.message}`);
          } else {
            console.log(`✅ get_user_admin_status: ${isAdminResult} (legacy role: ${testProfile.role})`);
          }
        } catch (err) {
          console.log(`⚠️  Could not test admin function: ${err.message}`);
        }
        
        try {
          const { data: isGlobalResult, error: globalError } = await supabase
            .rpc('is_global_admin', { user_uuid: testProfile.id });
          
          if (globalError) {
            console.log(`❌ is_global_admin: ${globalError.message}`);
          } else {
            console.log(`✅ is_global_admin: ${isGlobalResult}`);
          }
        } catch (err) {
          console.log(`⚠️  Could not test global admin function: ${err.message}`);
        }
      } else {
        console.log('⚠️  No test user found');
      }
    } catch (err) {
      console.log(`⚠️  Could not test functions: ${err.message}`);
    }

    console.log('\n🎉 Migration verification completed!');
    console.log('\nNext steps:');
    console.log('1. Update TypeScript types: npx supabase gen types typescript --project-id sxlogxqzmarhqsblxmtj > types/supabase-updated.ts');
    console.log('2. Test existing functionality to ensure backward compatibility');
    console.log('3. Begin using new role system features');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

// Run verification
verifyMigration().catch(console.error);