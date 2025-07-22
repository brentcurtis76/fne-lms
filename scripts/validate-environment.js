#!/usr/bin/env node

/**
 * Environment Configuration Validator
 * Prevents production outages from environment misconfigurations
 */

const fs = require('fs');
const path = require('path');

const EXPECTED_PROD_URL = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const TEST_URLS = [
  'http://127.0.0.1:54321',
  'http://localhost:54321'
];

function validateEnvironmentConfig() {
  console.log('🔍 Validating environment configuration...');
  
  const envLocalPath = '.env.local';
  
  // Check if .env.local exists
  if (!fs.existsSync(envLocalPath)) {
    console.error('❌ CRITICAL: .env.local file not found!');
    console.error('   This will cause the application to fail.');
    process.exit(1);
  }
  
  // Check if .env.local is a symbolic link
  const stats = fs.lstatSync(envLocalPath);
  if (stats.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(envLocalPath);
    console.error('❌ CRITICAL: .env.local is a symbolic link!');
    console.error(`   Link target: ${linkTarget}`);
    console.error('   This may cause the application to use wrong database.');
    console.error('   Remove symbolic link: rm .env.local');
    console.error('   Restore from backup: cp .env.local.backup .env.local');
    process.exit(1);
  }
  
  // Read and validate environment content
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
  let supabaseUrl = '';
  let hasRequiredVars = true;
  const requiredVars = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  
  for (const line of lines) {
    const [key, value] = line.split('=');
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
      supabaseUrl = value;
    }
  }
  
  // Check for required variables
  for (const reqVar of requiredVars) {
    if (!envContent.includes(reqVar)) {
      console.error(`❌ MISSING: Required variable ${reqVar} not found in .env.local`);
      hasRequiredVars = false;
    }
  }
  
  if (!hasRequiredVars) {
    process.exit(1);
  }
  
  // Validate Supabase URL
  if (!supabaseUrl) {
    console.error('❌ CRITICAL: NEXT_PUBLIC_SUPABASE_URL not found in .env.local');
    process.exit(1);
  }
  
  // Check if pointing to test environment
  const isTestUrl = TEST_URLS.some(testUrl => supabaseUrl.includes(testUrl));
  if (isTestUrl) {
    console.error('❌ CRITICAL: Application configured for TEST environment!');
    console.error(`   Current URL: ${supabaseUrl}`);
    console.error(`   Expected production URL: ${EXPECTED_PROD_URL}`);
    console.error('   This will cause data loading failures.');
    process.exit(1);
  }
  
  // Check if pointing to expected production URL
  if (!supabaseUrl.includes(EXPECTED_PROD_URL)) {
    console.warn('⚠️  WARNING: Unexpected Supabase URL detected');
    console.warn(`   Current: ${supabaseUrl}`);
    console.warn(`   Expected: ${EXPECTED_PROD_URL}`);
    console.warn('   Verify this is correct for your environment.');
  } else {
    console.log('✅ Environment pointing to production database');
  }
  
  // Check for backup file
  if (!fs.existsSync('.env.local.backup')) {
    console.warn('⚠️  WARNING: No .env.local.backup found');
    console.warn('   Creating backup of current configuration...');
    fs.copyFileSync('.env.local', '.env.local.backup');
    console.log('✅ Backup created: .env.local.backup');
  }
  
  console.log('✅ Environment configuration validation passed');
}

// Run validation
try {
  validateEnvironmentConfig();
} catch (error) {
  console.error('❌ Validation failed:', error.message);
  process.exit(1);
}