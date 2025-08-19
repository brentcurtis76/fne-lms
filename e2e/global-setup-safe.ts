/**
 * SAFE Global setup for Playwright tests
 * Creates isolated test data without affecting production
 */

import { FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
const localEnvPath = './.env.test.local';
const testEnvPath = './.env.test';

if (fs.existsSync(localEnvPath)) {
  console.log('Using test environment from .env.test.local');
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath });
} else {
  dotenv.config();
}

// Test data namespace to avoid conflicts
const TEST_NAMESPACE = `e2e_test_${Date.now()}`;

async function globalSetup(config: FullConfig) {
  console.log('🚀 Setting up SAFE E2E test environment...');
  console.log(`📦 Test namespace: ${TEST_NAMESPACE}`);
  
  // Verify we're not accidentally using production without safeguards
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl?.includes('sxlogxqzmarhqsblxmtj') && !process.env.ALLOW_PRODUCTION_TESTS) {
    console.error('❌ SAFETY CHECK FAILED: Tests configured to use production database!');
    console.error('   To run tests against production (NOT RECOMMENDED), set ALLOW_PRODUCTION_TESTS=true');
    console.error('   Better option: Set up a local Supabase instance for testing');
    process.exit(1);
  }
  
  // Create Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  
  // Store test namespace for cleanup
  process.env.TEST_NAMESPACE = TEST_NAMESPACE;
  
  console.log('✅ Safe test environment ready');
  console.log('ℹ️  Test data will be prefixed with:', TEST_NAMESPACE);
  console.log('⚠️  Remember to run cleanup after tests');
  
  // Create test users with namespace
  const testUsers = [
    {
      email: `admin_${TEST_NAMESPACE}@test.local`,
      password: 'TestAdmin123!',
      role: 'admin',
      metadata: { 
        first_name: 'Test',
        last_name: 'Admin',
        test_namespace: TEST_NAMESPACE
      }
    },
    {
      email: `student_${TEST_NAMESPACE}@test.local`,
      password: 'TestStudent123!',
      role: 'docente',
      metadata: {
        first_name: 'Test',
        last_name: 'Student',
        test_namespace: TEST_NAMESPACE
      }
    },
    {
      email: `consultant_${TEST_NAMESPACE}@test.local`,
      password: 'TestConsultant123!',
      role: 'consultor',
      metadata: {
        first_name: 'Test',
        last_name: 'Consultant',
        test_namespace: TEST_NAMESPACE
      }
    },
    {
      email: `director_${TEST_NAMESPACE}@test.local`,
      password: 'TestDirector123!',
      role: 'equipo_directivo',
      metadata: {
        first_name: 'Test',
        last_name: 'Director',
        test_namespace: TEST_NAMESPACE
      }
    }
  ];
  
  console.log('Creating isolated test users...');
  
  for (const testUser of testUsers) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: testUser.email,
        password: testUser.password,
        email_confirm: true,
        user_metadata: testUser.metadata
      });
      
      if (error) {
        console.log(`⚠️ Could not create ${testUser.role} test user:`, error.message);
      } else {
        console.log(`✅ Created test user: ${testUser.email}`);
        
        // Create profile
        await supabase.from('profiles').insert({
          id: data.user.id,
          email: testUser.email,
          first_name: testUser.metadata.first_name,
          last_name: testUser.metadata.last_name,
          approval_status: 'approved',
          created_at: new Date().toISOString()
        });
        
        // Assign role
        if (testUser.role === 'admin') {
          await supabase.from('user_roles').insert({
            user_id: data.user.id,
            role_type: 'admin',
            is_active: true,
            assigned_by: data.user.id,
            assigned_at: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`Error creating test user ${testUser.email}:`, err);
    }
  }
  
  // Store test credentials for use in tests
  process.env.TEST_ADMIN_EMAIL = `admin_${TEST_NAMESPACE}@test.local`;
  process.env.TEST_ADMIN_PASSWORD = 'TestAdmin123!';
  process.env.TEST_STUDENT_EMAIL = `student_${TEST_NAMESPACE}@test.local`;
  process.env.TEST_STUDENT_PASSWORD = 'TestStudent123!';
  
  console.log('✅ Test users created with namespace isolation');
  console.log('ℹ️  All test data is isolated with prefix:', TEST_NAMESPACE);
}

export default globalSetup;