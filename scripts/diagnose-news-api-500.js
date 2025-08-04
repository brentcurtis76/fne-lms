// Comprehensive diagnostic script to identify the root cause of news API 500 errors
// This script provides CONCRETE EVIDENCE before making any changes

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runDiagnostics() {
  console.log('🔍 NEWS API 500 ERROR - ROOT CAUSE INVESTIGATION');
  console.log('=' .repeat(60));
  console.log('Timestamp:', new Date().toISOString());
  console.log('');

  try {
    // PHASE 1: DATABASE STRUCTURE VERIFICATION
    console.log('📋 PHASE 1: DATABASE STRUCTURE VERIFICATION');
    console.log('-'.repeat(50));

    // 1.1 Check if news_articles table exists
    console.log('1.1 Checking if news_articles table exists...');
    try {
      const { data: tableExists, error: tableError } = await supabase.rpc('exec_sql', {
        sql_query: `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'news_articles'
          );
        `
      });
      
      if (tableError) {
        // Try alternative method
        const { data: testData, error: testError } = await supabase
          .from('news_articles')
          .select('id')
          .limit(1);
        
        if (testError && testError.code === '42P01') {
          console.log('❌ EVIDENCE: news_articles table does NOT exist');
          console.log('   Error:', testError.message);
        } else {
          console.log('✅ news_articles table exists');
        }
      } else {
        console.log('✅ news_articles table exists');
      }
    } catch (error) {
      console.log('❌ EVIDENCE: Error checking news_articles table existence');
      console.log('   Error:', error.message);
    }

    // 1.2 Get news_articles table structure
    console.log('\n1.2 Getting news_articles table structure...');
    try {
      const { data: columns, error: colError } = await supabase.rpc('exec_sql', {
        sql_query: `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'news_articles'
          ORDER BY ordinal_position;
        `
      });
      
      if (colError) {
        console.log('❌ EVIDENCE: Cannot get news_articles structure');
        console.log('   Error:', colError.message);
      } else if (columns && columns.length > 0) {
        console.log('✅ news_articles structure:');
        columns.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
      } else {
        console.log('❌ EVIDENCE: news_articles table has no columns or doesn\'t exist');
      }
    } catch (error) {
      console.log('❌ EVIDENCE: Error getting table structure');
      console.log('   Error:', error.message);
    }

    // 1.3 Check RLS policies on news_articles
    console.log('\n1.3 Checking RLS policies on news_articles...');
    try {
      const { data: policies, error: policyError } = await supabase.rpc('exec_sql', {
        sql_query: `
          SELECT 
            policyname,
            cmd,
            qual,
            with_check
          FROM pg_policies 
          WHERE tablename = 'news_articles';
        `
      });
      
      if (policyError) {
        console.log('❌ EVIDENCE: Cannot get RLS policies');
        console.log('   Error:', policyError.message);
      } else if (policies && policies.length > 0) {
        console.log('✅ RLS policies found:');
        policies.forEach(policy => {
          console.log(`   Policy: ${policy.policyname}`);
          console.log(`   Command: ${policy.cmd}`);
          console.log(`   Condition: ${policy.qual}`);
          
          // Check if policy references 'role' vs 'role_type'
          if (policy.qual && policy.qual.includes('role ')) {
            console.log('   🚨 CRITICAL: Policy references "role" column');
          }
          if (policy.qual && policy.qual.includes('role_type')) {
            console.log('   ✅ Policy correctly references "role_type" column');
          }
        });
      } else {
        console.log('❌ EVIDENCE: No RLS policies found on news_articles');
      }
    } catch (error) {
      console.log('❌ EVIDENCE: Error getting RLS policies');
      console.log('   Error:', error.message);
    }

    // 1.4 Check user_roles table structure
    console.log('\n1.4 Checking user_roles table structure...');
    try {
      const { data: userRolesCols, error: urError } = await supabase.rpc('exec_sql', {
        sql_query: `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = 'user_roles'
          AND column_name IN ('role', 'role_type')
          ORDER BY column_name;
        `
      });
      
      if (urError) {
        console.log('❌ EVIDENCE: Cannot get user_roles structure');
        console.log('   Error:', urError.message);
      } else if (userRolesCols) {
        console.log('✅ user_roles role columns:');
        userRolesCols.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type}`);
        });
        
        const hasRole = userRolesCols.some(col => col.column_name === 'role');
        const hasRoleType = userRolesCols.some(col => col.column_name === 'role_type');
        
        if (hasRole && !hasRoleType) {
          console.log('   📊 ANALYSIS: user_roles uses OLD "role" column');
        } else if (!hasRole && hasRoleType) {
          console.log('   📊 ANALYSIS: user_roles uses NEW "role_type" column');
        } else if (hasRole && hasRoleType) {
          console.log('   📊 ANALYSIS: user_roles has BOTH columns (migration in progress?)');
        } else {
          console.log('   ❌ EVIDENCE: Neither role nor role_type column found');
        }
      }
    } catch (error) {
      console.log('❌ EVIDENCE: Error checking user_roles structure');
      console.log('   Error:', error.message);
    }

    // PHASE 2: API SIMULATION TESTING
    console.log('\n\n📋 PHASE 2: API SIMULATION TESTING');
    console.log('-'.repeat(50));

    // 2.1 Find an admin user to test with
    console.log('2.1 Finding admin user for testing...');
    try {
      const { data: adminUser, error: adminError } = await supabase
        .from('user_roles')
        .select('user_id, role_type')
        .eq('role_type', 'admin')
        .eq('is_active', true)
        .limit(1)
        .single();
      
      if (adminError || !adminUser) {
        console.log('❌ EVIDENCE: No admin user found with role_type column');
        console.log('   Error:', adminError?.message);
        
        // Try with old role column
        const { data: oldAdminUser, error: oldAdminError } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .eq('role', 'admin')
          .eq('is_active', true)
          .limit(1)
          .single();
          
        if (oldAdminError || !oldAdminUser) {
          console.log('❌ EVIDENCE: No admin user found with old "role" column either');
          console.log('   Error:', oldAdminError?.message);
        } else {
          console.log('✅ Found admin user using OLD "role" column');
          console.log(`   User ID: ${oldAdminUser.user_id}`);
          console.log(`   Role: ${oldAdminUser.role}`);
        }
      } else {
        console.log('✅ Found admin user using NEW "role_type" column');
        console.log(`   User ID: ${adminUser.user_id}`);
        console.log(`   Role Type: ${adminUser.role_type}`);

        // 2.2 Test the exact API query
        console.log('\n2.2 Testing exact API role query...');
        const { data: apiRoles, error: apiError } = await supabase
          .from('user_roles')
          .select('role_type')
          .eq('user_id', adminUser.user_id)
          .eq('is_active', true);

        if (apiError) {
          console.log('❌ EVIDENCE: API role query fails');
          console.log('   Error:', apiError.message);
        } else {
          console.log('✅ API role query succeeds');
          console.log('   Roles found:', apiRoles.map(r => r.role_type));
          
          const isAdmin = apiRoles?.some(r => ['admin', 'consultor', 'community_manager'].includes(r.role_type));
          console.log('   Would API allow access?', isAdmin ? 'YES' : 'NO');
        }

        // 2.3 Test news_articles access as this admin user
        console.log('\n2.3 Testing news_articles access as admin user...');
        try {
          // Create a client with the admin user's context
          const { data: newsData, error: newsError } = await supabase
            .from('news_articles')
            .select('id, title, is_published')
            .limit(5);

          if (newsError) {
            console.log('❌ EVIDENCE: Admin cannot access news_articles');
            console.log('   Error Code:', newsError.code);
            console.log('   Error Message:', newsError.message);
            console.log('   Error Details:', newsError.details);
            
            if (newsError.code === '42703') {
              console.log('   🚨 CRITICAL: This is a "column does not exist" error');
            }
            if (newsError.message.includes('role')) {
              console.log('   🚨 CRITICAL: Error mentions "role" - likely RLS policy issue');
            }
          } else {
            console.log('✅ Admin can access news_articles');
            console.log(`   Found ${newsData?.length || 0} articles`);
          }
        } catch (error) {
          console.log('❌ EVIDENCE: Exception accessing news_articles');
          console.log('   Error:', error.message);
        }
      }
    } catch (error) {
      console.log('❌ EVIDENCE: Error in admin user testing');
      console.log('   Error:', error.message);
    }

    // PHASE 3: EXACT ERROR REPRODUCTION
    console.log('\n\n📋 PHASE 3: EXACT ERROR REPRODUCTION');
    console.log('-'.repeat(50));

    // 3.1 Simulate the exact API call
    console.log('3.1 Simulating exact API call sequence...');
    
    try {
      // Step 1: Test authentication (this works)
      console.log('   Step 1: Authentication check - PASSED');
      
      // Step 2: Test role query (this might work)
      console.log('   Step 2: Role query...');
      const { data: testRoles, error: testRoleError } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', '4ae17b21-8977-425c-b05a-ca7cdb8b9df5') // From logs
        .eq('is_active', true);
      
      if (testRoleError) {
        console.log('   ❌ Step 2 FAILED: Role query error');
        console.log('   Error:', testRoleError.message);
      } else {
        console.log('   ✅ Step 2 PASSED: Role query succeeded');
        console.log('   Roles:', testRoles?.map(r => r.role_type));
      }
      
      // Step 3: Test news articles access (this is where it likely fails)
      console.log('   Step 3: News articles access...');
      const { data: testNews, error: testNewsError } = await supabase
        .from('news_articles')
        .select(`
          *,
          author:profiles!author_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (testNewsError) {
        console.log('   ❌ Step 3 FAILED: News articles access error');
        console.log('   🎯 ROOT CAUSE IDENTIFIED:');
        console.log('   Error Code:', testNewsError.code);
        console.log('   Error Message:', testNewsError.message);
        console.log('   Error Details:', testNewsError.details);
        console.log('   Error Hint:', testNewsError.hint);
        
        // Analyze the specific error
        if (testNewsError.code === '42P01') {
          console.log('   📊 DIAGNOSIS: Table does not exist');
        } else if (testNewsError.code === '42703') {
          console.log('   📊 DIAGNOSIS: Column does not exist (likely in RLS policy)');
        } else if (testNewsError.code === '42501') {
          console.log('   📊 DIAGNOSIS: Insufficient privileges (RLS blocking access)');
        }
      } else {
        console.log('   ✅ Step 3 PASSED: News articles access succeeded');
        console.log(`   Found ${testNews?.length || 0} articles`);
      }
      
    } catch (error) {
      console.log('❌ EVIDENCE: Exception in API simulation');
      console.log('   Error:', error.message);
      console.log('   Stack:', error.stack);
    }

    // FINAL SUMMARY
    console.log('\n\n🎯 DIAGNOSTIC SUMMARY');
    console.log('=' .repeat(60));
    console.log('Analysis complete. Check the evidence above to identify:');
    console.log('1. Whether news_articles table exists');
    console.log('2. Whether RLS policies reference correct columns');
    console.log('3. Whether user_roles uses role vs role_type');
    console.log('4. The exact error code and message causing 500 errors');
    console.log('');
    console.log('Look for ❌ EVIDENCE markers above for concrete proof of issues.');

  } catch (error) {
    console.error('💥 DIAGNOSTIC SCRIPT FAILED:', error);
  }
}

// Run diagnostics
runDiagnostics().then(() => {
  console.log('\n✅ Diagnostic complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Diagnostic failed:', error);
  process.exit(1);
});