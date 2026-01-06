/**
 * Genera Data Seeding - Database Utilities
 * 
 * Provides database connection, validation, logging, and reporting utilities
 * for the comprehensive data seeding system
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const readline = require('readline');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

// CRITICAL SECURITY CONFIGURATION
const PRODUCTION_URL_BLACKLIST = [
  'https://sxlogxqzmarhqsblxmtj.supabase.co', // Genera Production Database
  'sxlogxqzmarhqsblxmtj.supabase.co'         // Alternative format
];

const REQUIRED_ENVIRONMENT_VALUES = ['sandbox', 'development', 'test'];
const CONFIRMATION_PHRASE = 'I confirm I am deleting from the sandbox';

/**
 * 🚨 CRITICAL SECURITY FUNCTION 🚨
 * 
 * This function ensures data seeding scripts can ONLY run against approved sandbox databases.
 * It implements multiple layers of protection against accidental production database access.
 * 
 * @returns {Promise<Object>} Secure Supabase client for sandbox use only
 * @throws {Error} If any security check fails
 */
async function confirmAndGetSandboxClient() {
  console.log('🔒 SECURITY CHECK: Validating sandbox environment...\n');
  
  // Step 1: Check for required environment variables
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'FNE_LMS_ENVIRONMENT'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('🚨 SECURITY FAILURE: Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\n💡 Required setup:');
    console.error('   1. Set NEXT_PUBLIC_SUPABASE_URL to a sandbox database URL');
    console.error('   2. Set SUPABASE_SERVICE_ROLE_KEY for the sandbox database');
    console.error('   3. Set FNE_LMS_ENVIRONMENT to "sandbox", "development", or "test"');
    process.exit(1);
  }
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const environment = process.env.FNE_LMS_ENVIRONMENT;
  
  // Step 2: PRODUCTION URL BLACKLIST CHECK
  console.log('🛡️  Checking production URL blacklist...');
  for (const productionUrl of PRODUCTION_URL_BLACKLIST) {
    if (supabaseUrl.includes(productionUrl.replace('https://', ''))) {
      console.error('\n🚨🚨🚨 CRITICAL SECURITY VIOLATION 🚨🚨🚨');
      console.error('PRODUCTION DATABASE DETECTED!');
      console.error(`Blocked URL: ${supabaseUrl}`);
      console.error('Data seeding is FORBIDDEN on production databases.');
      console.error('This would cause CATASTROPHIC DATA LOSS.');
      console.error('\n🚨🚨🚨 SCRIPT TERMINATED FOR SAFETY 🚨🚨🚨\n');
      process.exit(1);
    }
  }
  console.log('✅ Production URL blacklist check passed');
  
  // Step 3: DYNAMIC DATABASE CONFIRMATION (replaces whitelist)
  console.log('🛡️  Database identity confirmation required...');
  console.log('   Dynamic confirmation will be requested during cleanup operations');
  
  // Step 4: EXPLICIT ENVIRONMENT FLAG CHECK
  console.log('🛡️  Checking environment flag...');
  if (!REQUIRED_ENVIRONMENT_VALUES.includes(environment.toLowerCase())) {
    console.error('\n🚨 SECURITY FAILURE: Invalid environment setting');
    console.error(`Current FNE_LMS_ENVIRONMENT: ${environment}`);
    console.error('Environment must be one of:', REQUIRED_ENVIRONMENT_VALUES.join(', '));
    console.error('\n💡 Set FNE_LMS_ENVIRONMENT in your .env.local file');
    process.exit(1);
  }
  console.log('✅ Environment flag check passed');
  
  // Step 5: DATABASE CONNECTION TEST
  console.log('🛡️  Testing database connection...');
  try {
    const supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection failed:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    process.exit(1);
  }
  
  // Step 6: FINAL SECURITY SUMMARY
  console.log('\n🔒 INITIAL SECURITY VALIDATION COMPLETE');
  console.log('   ✅ Production URLs blocked');
  console.log('   ✅ Environment flag validated');
  console.log('   ✅ Database connection tested');
  console.log(`   🎯 Target: ${supabaseUrl} (${environment})`);
  console.log('   ⚠️  Final database confirmation required before cleanup operations');
  console.log('\n✅ READY FOR DATA SEEDING WITH INTERACTIVE CONFIRMATION\n');
  
  // Return secure client
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Legacy environment validation (kept for backwards compatibility)
async function validateEnvironment() {
  console.log('⚠️  DEPRECATED: Use confirmAndGetSandboxClient() for secure access');
  console.log('🔍 Validating environment configuration...');
  
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\n💡 Check your .env.local file and ensure all variables are set');
    return false;
  }
  
  // Test database connection
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
    
    console.log('✅ Environment validation successful');
    console.log(`   - Database: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
    console.log(`   - Service Role: ${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...`);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

// Progress logging utility
function logProgress(phase, current, total, details = '') {
  const percentage = Math.round((current / total) * 100);
  const progressBar = '█'.repeat(Math.floor(percentage / 5)) + 
                     '░'.repeat(20 - Math.floor(percentage / 5));
  
  const detailsText = details ? ` - ${details}` : '';
  console.log(`   [${progressBar}] ${percentage}% (${current}/${total})${detailsText}`);
}

// Batch insert utility for large datasets
async function batchInsert(supabase, tableName, records, batchSize = 100) {
  const results = [];
  
  console.log(`📥 Inserting ${records.length} records into ${tableName} (batches of ${batchSize})`);
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    try {
      const { data, error } = await supabase
        .from(tableName)
        .insert(batch)
        .select('*');
      
      if (error) {
        console.error(`❌ Batch insert failed for ${tableName}:`, error.message);
        throw error;
      }
      
      results.push(...(data || []));
      logProgress(`${tableName} insert`, i + batch.length, records.length);
      
      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`❌ Error inserting batch ${i}-${i + batch.length}:`, error);
      throw error;
    }
  }
  
  console.log(`✅ Successfully inserted ${results.length} records into ${tableName}`);
  return results;
}

// Generate comprehensive data report
async function generateReport(supabase) {
  console.log('📊 Generating comprehensive data report...');
  
  try {
    // Users by role distribution
    const { data: usersByRole } = await supabase.rpc('execute_sql', {
      sql: `
        SELECT role, COUNT(*) as count 
        FROM profiles 
        WHERE metadata->>'test_data' = 'true' 
        GROUP BY role 
        ORDER BY count DESC
      `
    });
    
    // Communities by health score distribution
    const { data: communitiesByHealth } = await supabase.rpc('execute_sql', {
      sql: `
        SELECT 
          CASE 
            WHEN (metadata->>'health_score')::int >= 80 THEN 'excellent'
            WHEN (metadata->>'health_score')::int >= 60 THEN 'good'
            WHEN (metadata->>'health_score')::int >= 40 THEN 'struggling'
            ELSE 'critical'
          END as health_category,
          COUNT(*) as count
        FROM growth_communities 
        WHERE metadata->>'test_data' = 'true'
        GROUP BY health_category
        ORDER BY count DESC
      `
    });
    
    // Activity by type distribution
    const { data: activityByType } = await supabase.rpc('execute_sql', {
      sql: `
        SELECT activity_type, COUNT(*) as count 
        FROM activity_feed 
        WHERE metadata->>'test_data' = 'true'
        GROUP BY activity_type 
        ORDER BY count DESC
      `
    });
    
    // Average completion rate
    const { data: completionData } = await supabase.rpc('execute_sql', {
      sql: `
        SELECT AVG(
          CASE 
            WHEN total_lessons > 0 
            THEN (completed_lessons::float / total_lessons::float) * 100 
            ELSE 0 
          END
        ) as avg_completion
        FROM user_course_time 
        WHERE created_at > NOW() - INTERVAL '1 year'
      `
    });
    
    // School distribution
    const { data: schoolStats } = await supabase.rpc('execute_sql', {
      sql: `
        SELECT 
          s.name,
          COUNT(DISTINCT p.id) as total_users,
          COUNT(DISTINCT gc.id) as total_communities
        FROM schools s
        LEFT JOIN profiles p ON p.school_id = s.id AND p.metadata->>'test_data' = 'true'
        LEFT JOIN growth_communities gc ON gc.school_id = s.id AND gc.metadata->>'test_data' = 'true'
        WHERE s.metadata->>'test_data' = 'true'
        GROUP BY s.id, s.name
        ORDER BY total_users DESC
      `
    });
    
    return {
      usersByRole: usersByRole?.reduce((acc, row) => {
        acc[row.role] = row.count;
        return acc;
      }, {}) || {},
      
      communitiesByHealth: communitiesByHealth?.reduce((acc, row) => {
        acc[row.health_category] = row.count;
        return acc;
      }, {}) || {},
      
      activityByType: activityByType?.reduce((acc, row) => {
        acc[row.activity_type] = row.count;
        return acc;
      }, {}) || {},
      
      averageCompletion: Math.round(completionData?.[0]?.avg_completion || 0),
      
      schoolDistribution: schoolStats || [],
      
      generatedAt: new Date().toISOString(),
      
      summary: {
        totalUsers: Object.values(usersByRole?.reduce((acc, row) => {
          acc[row.role] = row.count;
          return acc;
        }, {}) || {}).reduce((sum, count) => sum + count, 0),
        
        totalCommunities: Object.values(communitiesByHealth?.reduce((acc, row) => {
          acc[row.health_category] = row.count;
          return acc;
        }, {}) || {}).reduce((sum, count) => sum + count, 0),
        
        totalActivities: Object.values(activityByType?.reduce((acc, row) => {
          acc[row.activity_type] = row.count;
          return acc;
        }, {}) || {}).reduce((sum, count) => sum + count, 0)
      }
    };
  } catch (error) {
    console.warn('⚠️  Report generation encountered errors:', error.message);
    return {
      error: error.message,
      generatedAt: new Date().toISOString(),
      summary: { totalUsers: 0, totalCommunities: 0, totalActivities: 0 }
    };
  }
}

// Generate random realistic data helpers
function generateSpanishName() {
  const firstNames = [
    'María', 'Ana', 'Carmen', 'Francisca', 'Javiera', 'José', 'Carlos', 'Luis',
    'Miguel', 'Juan', 'Pedro', 'Diego', 'Sebastián', 'Matías', 'Nicolás',
    'Valentina', 'Sofía', 'Isidora', 'Constanza', 'Fernanda', 'Martina'
  ];
  
  const lastNames = [
    'González', 'Rodríguez', 'Muñoz', 'López', 'García', 'Martínez', 'Sánchez',
    'Rojas', 'Díaz', 'Pérez', 'Contreras', 'Silva', 'Sepúlveda', 'Morales'
  ];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName1 = lastNames[Math.floor(Math.random() * lastNames.length)];
  const lastName2 = lastNames[Math.floor(Math.random() * lastNames.length)];
  
  return `${firstName} ${lastName1} ${lastName2}`;
}

function generateEmail(name) {
  const cleanName = name
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[^a-z.]/g, '');
  
  const domains = ['fne.cl', 'colegio.edu', 'escuela.cl', 'instituto.edu'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  
  return `${cleanName}@${domain}`;
}

function generateRandomDate(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const randomTime = start + Math.random() * (end - start);
  return new Date(randomTime);
}

/**
 * 🚨 SECURE DYNAMIC CONFIRMATION FOR DESTRUCTIVE OPERATIONS 🚨
 * 
 * This function requires explicit user confirmation by typing the exact database hostname.
 * It prevents accidental data loss through precise database identity verification.
 */
async function getInteractiveConfirmation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
  
  try {
    const databaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const environment = process.env.FNE_LMS_ENVIRONMENT;
    
    // Extract hostname from URL (e.g., "xyz.supabase.co" from "https://xyz.supabase.co")
    const hostname = databaseUrl.replace('https://', '').replace('http://', '');
    
    console.log('\n🚨🚨🚨 DESTRUCTIVE ACTION WARNING 🚨🚨🚨');
    console.log('You are about to run a destructive cleanup operation on the following database:');
    console.log(`\n   ${databaseUrl}`);
    console.log(`   Environment: ${environment}`);
    
    console.log('\n🔐 SECURITY CONFIRMATION REQUIRED');
    console.log('To confirm this is the correct database for your intended operation,');
    console.log(`please type the hostname (${hostname}) and press Enter:`);
    
    const userInput = await question('\n> ');
    
    rl.close();
    
    if (userInput.trim() !== hostname) {
      console.log('\n❌ DATABASE CONFIRMATION FAILED');
      console.log(`Expected: ${hostname}`);
      console.log(`Received: ${userInput.trim()}`);
      console.log('Operation cancelled for security.');
      return false;
    }
    
    console.log('\n✅ DATABASE IDENTITY CONFIRMED');
    console.log('Proceeding with data cleanup operation...\n');
    return true;
    
  } catch (error) {
    rl.close();
    console.error('❌ Confirmation process failed:', error.message);
    return false;
  }
}

// Secure data cleanup with interactive confirmation
async function cleanupTestData(supabase, tables = [], skipConfirmation = false) {
  console.log('🧹 Preparing to clean up existing test data...');
  
  // SECURITY CHECK: Require confirmation unless explicitly skipped (CI environments)
  if (!skipConfirmation && !process.env.CI) {
    const confirmed = await getInteractiveConfirmation();
    if (!confirmed) {
      console.log('🛑 Data cleanup cancelled by user.');
      return false;
    }
  } else if (skipConfirmation) {
    console.log('⚠️  CONFIRMATION SKIPPED - Automated environment detected');
  }
  
  const defaultTables = [
    'activity_feed',
    'course_completions', 
    'course_enrollments',
    'user_course_time',
    'user_sessions',
    'courses',
    'growth_communities',
    'generations',
    'schools',
    'profiles'
  ];
  
  const tablesToClean = tables.length > 0 ? tables : defaultTables;
  let cleanedTables = 0;
  let totalRecordsDeleted = 0;
  
  console.log(`🗄️  Cleaning ${tablesToClean.length} tables...`);
  
  for (const table of tablesToClean) {
    try {
      // First, count records to be deleted (check both metadata and simple test patterns)
      let recordCount = 0;
      try {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('metadata->test_data', 'true');
        recordCount = count || 0;
      } catch (error) {
        // If metadata column doesn't exist, try comprehensive test patterns
        try {
          const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .or('name.ilike.%(Test)%,name.ilike.%Test%,id.like.test-%,id.gte.10000');
          recordCount = count || 0;
        } catch (fallbackError) {
          // For tables without name patterns, try direct ID-based cleanup
          try {
            const { count } = await supabase
              .from(table)
              .select('*', { count: 'exact', head: true })
              .gte('id', 10000);
            recordCount = count || 0;
          } catch (finalError) {
            console.log(`   Skipping ${table} - no compatible test data patterns`);
            continue;
          }
        }
      }
      
      if (recordCount > 0) {
        // Delete the records using the same pattern we used to count
        let deleteError = null;
        try {
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('metadata->test_data', 'true');
          deleteError = error;
        } catch (error) {
          // If metadata doesn't exist, use comprehensive test patterns
          try {
            const { error: fallbackError } = await supabase
              .from(table)
              .delete()
              .or('name.ilike.%(Test)%,name.ilike.%Test%,id.like.test-%,id.gte.10000');
            deleteError = fallbackError;
          } catch (finalError) {
            // For tables without name/id patterns, try direct ID cleanup for high-range test IDs
            const { error: idCleanupError } = await supabase
              .from(table)
              .delete()
              .gte('id', 10000);
            deleteError = idCleanupError;
          }
        }
        
        if (deleteError && !deleteError.message.includes('does not exist')) {
          console.warn(`⚠️  Cleanup warning for ${table}:`, deleteError.message);
        } else {
          console.log(`✅ Cleaned ${recordCount} test records from ${table}`);
          cleanedTables++;
          totalRecordsDeleted += recordCount;
        }
      } else {
        console.log(`ℹ️  No test data found in ${table}`);
      }
    } catch (error) {
      console.warn(`⚠️  Error cleaning ${table}:`, error.message);
    }
  }
  
  console.log(`\n📊 Cleanup Summary:`);
  console.log(`   • Tables processed: ${tablesToClean.length}`);
  console.log(`   • Tables cleaned: ${cleanedTables}`);
  console.log(`   • Total records deleted: ${totalRecordsDeleted}`);
  console.log('✅ Data cleanup completed safely\n');
  
  return true;
}

// Export utilities
module.exports = {
  confirmAndGetSandboxClient,  // 🚨 PRIMARY SECURE FUNCTION - USE THIS
  validateEnvironment,         // ⚠️  DEPRECATED - kept for backwards compatibility
  logProgress,
  batchInsert,
  generateReport,
  generateSpanishName,
  generateEmail,
  generateRandomDate,
  cleanupTestData,
  getInteractiveConfirmation,
  
  // Database connection helper
  createSupabaseClient: () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
  
  // Utility functions
  randomBetween: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  
  randomChoice: (array) => array[Math.floor(Math.random() * array.length)],
  
  weightedChoice: (choices) => {
    const totalWeight = choices.reduce((sum, choice) => sum + choice.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const choice of choices) {
      random -= choice.weight;
      if (random <= 0) {
        return choice.value;
      }
    }
    
    return choices[choices.length - 1].value; // Fallback
  },
  
  // UUID generation for test data
  generateUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};