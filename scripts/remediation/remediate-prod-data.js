/**
 * PRODUCTION DATABASE REMEDIATION SCRIPT
 * 
 * CRITICAL PURPOSE: Remove 12 specific test school records (IDs 9001-9012)
 * that were incorrectly added to the production database during a security breach.
 * 
 * THIS SCRIPT IS FOR ONE-TIME USE ONLY.
 * 
 * WARNING: This script is designed to operate directly on the production database.
 * It requires explicit confirmation and environment validation before execution.
 */

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

// EXACT IDs of the contaminated test records to be removed
const CONTAMINATED_SCHOOL_IDS = [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012];

// Required confirmation phrase
const CONFIRMATION_PHRASE = 'CONFIRM-PROD-DELETE-12';

/**
 * Interactive confirmation system for production operation
 */
async function getProductionConfirmation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
  
  try {
    const databaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    console.log('\n🚨🚨🚨 PRODUCTION DATABASE OPERATION 🚨🚨🚨');
    console.log(`You are about to permanently delete 12 specific records (IDs 9001-9012)`);
    console.log(`from the PRODUCTION 'schools' table in the database:`);
    console.log(`${databaseUrl}`);
    console.log('\nThis action is irreversible.');
    console.log(`\nTo confirm you understand and approve this action, type '${CONFIRMATION_PHRASE}' and press Enter:`);
    
    const userInput = await question('> ');
    
    rl.close();
    
    if (userInput.trim() !== CONFIRMATION_PHRASE) {
      console.log('\n❌ CONFIRMATION FAILED');
      console.log(`Expected: ${CONFIRMATION_PHRASE}`);
      console.log(`Received: ${userInput.trim()}`);
      console.log('Operation cancelled for security.');
      return false;
    }
    
    console.log('\n✅ PRODUCTION OPERATION CONFIRMED');
    console.log('Proceeding with surgical record removal...\n');
    return true;
    
  } catch (error) {
    rl.close();
    console.error('❌ Confirmation process failed:', error.message);
    return false;
  }
}

/**
 * Validate environment is configured for production operation
 */
function validateProductionEnvironment() {
  console.log('🔍 Validating production environment configuration...');
  
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'FNE_LMS_ENVIRONMENT'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    return false;
  }
  
  // Verify this is configured for production operation
  const environment = process.env.FNE_LMS_ENVIRONMENT;
  if (environment !== 'production') {
    console.error('❌ Environment validation failed');
    console.error(`Expected FNE_LMS_ENVIRONMENT: production`);
    console.error(`Current FNE_LMS_ENVIRONMENT: ${environment}`);
    console.error('\n💡 This script requires explicit production environment configuration');
    console.error('   Set FNE_LMS_ENVIRONMENT=production in your .env.local file');
    return false;
  }
  
  console.log('✅ Production environment validated');
  console.log(`   Database: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`   Environment: ${environment}`);
  return true;
}

/**
 * Verify the contaminated records exist before deletion
 */
async function verifyContaminatedRecords(supabase) {
  console.log('🔍 Pre-deletion verification: Checking for contaminated records...');
  
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('id, name')
      .in('id', CONTAMINATED_SCHOOL_IDS)
      .order('id');
    
    if (error) {
      console.error('❌ Pre-verification query failed:', error.message);
      return false;
    }
    
    if (!data || data.length === 0) {
      console.log('ℹ️  No contaminated records found - database may already be clean');
      return false;
    }
    
    console.log(`✅ Found ${data.length} contaminated records to remove:`);
    data.forEach(record => {
      console.log(`   - ID ${record.id}: ${record.name}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Pre-verification failed:', error.message);
    return false;
  }
}

/**
 * Execute the surgical deletion of contaminated records
 */
async function removeContaminatedRecords(supabase) {
  console.log('🔧 Executing surgical deletion...');
  
  try {
    const { data, error } = await supabase
      .from('schools')
      .delete()
      .in('id', CONTAMINATED_SCHOOL_IDS)
      .select('id, name');
    
    if (error) {
      console.error('❌ Deletion operation failed:', error.message);
      return false;
    }
    
    console.log(`✅ Successfully deleted ${data ? data.length : 0} contaminated records`);
    if (data && data.length > 0) {
      data.forEach(record => {
        console.log(`   - Removed ID ${record.id}: ${record.name}`);
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ Deletion execution failed:', error.message);
    return false;
  }
}

/**
 * Verify the contaminated records no longer exist after deletion
 */
async function verifyRemovalComplete(supabase) {
  console.log('🔍 Post-deletion verification: Confirming complete removal...');
  
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('id, name')
      .in('id', CONTAMINATED_SCHOOL_IDS);
    
    if (error) {
      console.error('❌ Post-verification query failed:', error.message);
      return false;
    }
    
    if (data && data.length > 0) {
      console.error(`❌ Remediation incomplete - ${data.length} records still exist:`);
      data.forEach(record => {
        console.error(`   - ID ${record.id}: ${record.name}`);
      });
      return false;
    }
    
    console.log('✅ Verification complete - no contaminated records remain');
    console.log('   All target IDs (9001-9012) have been successfully removed');
    return true;
  } catch (error) {
    console.error('❌ Post-verification failed:', error.message);
    return false;
  }
}

/**
 * Main remediation execution
 */
async function executeRemediation() {
  console.log('🩹 PRODUCTION DATABASE REMEDIATION INITIATED');
  console.log('   Target: Remove 12 specific contaminated school records (IDs 9001-9012)');
  console.log('   Operation: Surgical deletion with verification\n');
  
  try {
    // Step 1: Validate production environment
    if (!validateProductionEnvironment()) {
      console.log('\n❌ REMEDIATION ABORTED: Environment validation failed');
      process.exit(1);
    }
    
    // Step 2: Get explicit user confirmation
    const confirmed = await getProductionConfirmation();
    if (!confirmed) {
      console.log('\n❌ REMEDIATION ABORTED: User confirmation failed');
      process.exit(1);
    }
    
    // Step 3: Initialize database connection
    console.log('🔗 Connecting to production database...');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    console.log('✅ Database connection established');
    
    // Step 4: Pre-deletion verification
    const recordsExist = await verifyContaminatedRecords(supabase);
    if (!recordsExist) {
      console.log('\n✅ REMEDIATION COMPLETE: No contaminated records found to remove');
      process.exit(0);
    }
    
    // Step 5: Execute surgical deletion
    const deletionSuccessful = await removeContaminatedRecords(supabase);
    if (!deletionSuccessful) {
      console.log('\n❌ REMEDIATION FAILED: Deletion operation unsuccessful');
      process.exit(1);
    }
    
    // Step 6: Post-deletion verification
    const removalVerified = await verifyRemovalComplete(supabase);
    if (!removalVerified) {
      console.log('\n❌ REMEDIATION INCOMPLETE: Verification failed');
      process.exit(1);
    }
    
    // Success
    console.log('\n🎉 REMEDIATION SUCCESSFUL');
    console.log('   ✅ All 12 contaminated school records (IDs 9001-9012) have been removed');
    console.log('   ✅ Production database has been restored to clean state');
    console.log('   ✅ Post-operation verification confirms complete removal');
    console.log('\n📋 REMEDIATION SUMMARY:');
    console.log('   • Operation: Surgical deletion of test data contamination');
    console.log('   • Target: 12 specific school records with IDs 9001-9012');
    console.log('   • Result: Complete removal verified');
    console.log('   • Status: Production database remediation complete\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ CRITICAL REMEDIATION ERROR:', error.message);
    console.error('   Manual database inspection may be required');
    process.exit(1);
  }
}

// Script execution entry point
if (require.main === module) {
  executeRemediation();
}

module.exports = { executeRemediation };