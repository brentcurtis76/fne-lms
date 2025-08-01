#!/usr/bin/env node

// Test the API using the same approach the frontend uses
async function testFullAPIFlow() {
  const fetch = require('node-fetch');
  const { CookieJar } = require('tough-cookie');
  const { Cookie } = require('tough-cookie');

  console.log('🔍 TESTING FULL MY-PATHS API FLOW');
  console.log('==================================');

  try {
    // Step 1: Login to get session cookie
    console.log('🔐 Step 1: Logging in to get session...');
    
    const loginResponse = await fetch('http://localhost:3000/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: 'brent@nuevaeducacion.org',
        password: 'Admin123!'
      }),
      redirect: 'manual' // Don't follow redirects
    });

    console.log('📊 Login Response Status:', loginResponse.status);
    console.log('📋 Login Response Headers:', Object.fromEntries(loginResponse.headers));

    // Try a different approach - use Supabase auth directly via API
    console.log('\n🔐 Alternative: Using Supabase Auth API directly...');
    
    const { createClient } = require('@supabase/supabase-js');
    require('dotenv').config({ path: '.env.local' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Try to sign in with known user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'brent@nuevaeducacion.org',
      password: 'Admin123!'
    });

    if (authError) {
      console.log('❌ Auth failed, trying different credentials...');
      
      // Let's check what auth users exist
      const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
      
      if (usersError) {
        console.error('❌ Cannot list users:', usersError);
      } else {
        console.log('👥 Available auth users:');
        users.slice(0, 5).forEach((user, index) => {
          console.log(`${index + 1}. ${user.email} - ID: ${user.id}`);
        });
      }
      
      // Try with the admin user ID we know exists
      console.log('\n🔑 Attempting to test API with service role key...');
      
      const serviceSupabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      // Simulate API call using service role (like the API does internally)
      const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'; // Admin user from our previous test
      
      console.log('🧪 Testing LearningPathsService.getUserAssignedPaths directly...');
      
      // Import the service
      const { LearningPathsService } = require('./lib/services/learningPathsService');
      
      const assignedPaths = await LearningPathsService.getUserAssignedPaths(serviceSupabase, userId);
      console.log('✅ Direct service call result:');
      console.log(JSON.stringify(assignedPaths, null, 2));
      
      // Now test getting progress for each path
      console.log('\n📊 Testing getUserPathProgress for each path...');
      for (const path of assignedPaths) {
        console.log(`🎯 Getting progress for path: ${path.name} (ID: ${path.id})`);
        try {
          const progress = await LearningPathsService.getUserPathProgress(
            serviceSupabase,
            userId,
            path.id
          );
          console.log('✅ Progress result:', JSON.stringify(progress, null, 2));
        } catch (progressError) {
          console.error('❌ Progress error:', progressError.message);
        }
      }
      
      // Test the full API response structure
      console.log('\n🔄 Simulating full API response...');
      const pathsWithProgress = await Promise.all(
        assignedPaths.map(async (path) => {
          try {
            const progress = await LearningPathsService.getUserPathProgress(
              serviceSupabase,
              userId,
              path.id
            );
            
            return {
              ...path,
              progress
            };
          } catch (error) {
            console.warn(`⚠️  Progress error for path ${path.id}:`, error.message);
            return {
              ...path,
              progress: null
            };
          }
        })
      );
      
      console.log('🎯 Final API response simulation:');
      console.log(JSON.stringify(pathsWithProgress, null, 2));
      
      // Check if any path has undefined ID
      pathsWithProgress.forEach((path, index) => {
        console.log(`\n🔍 Path ${index + 1} Analysis:`);
        console.log(`   ID: ${path.id} (type: ${typeof path.id})`);
        console.log(`   Name: ${path.name}`);
        console.log(`   Is ID undefined? ${path.id === undefined}`);
        console.log(`   Is ID null? ${path.id === null}`);
        console.log(`   Is ID empty string? ${path.id === ''}`);
        console.log(`   All keys: ${Object.keys(path).join(', ')}`);
      });
      
    } else {
      console.log('✅ Authenticated successfully with user:', authData.user.email);
      
      // Get session token
      const { data: session } = await supabase.auth.getSession();
      console.log('📋 Session token available:', !!session.session?.access_token);
      
      // Test API call with proper auth
      const response = await fetch('http://localhost:3000/api/learning-paths/my-paths', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const responseText = await response.text();
      console.log('📊 API Response Status:', response.status);
      
      if (response.ok) {
        const data = JSON.parse(responseText);
        console.log('✅ API Response Success:');
        console.log(JSON.stringify(data, null, 2));
        
        // Analyze each path
        data.forEach((path, index) => {
          console.log(`\n🔍 Path ${index + 1} Analysis:`);
          console.log(`   ID: ${path.id} (type: ${typeof path.id})`);
          console.log(`   Name: ${path.name}`);
          console.log(`   Is ID undefined? ${path.id === undefined}`);
        });
      } else {
        console.error('❌ API Error:', responseText);
      }
    }

  } catch (error) {
    console.error('❌ Unexpected Error:', error);
  }
}

testFullAPIFlow();