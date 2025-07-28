#!/usr/bin/env node

/**
 * Schema State Verification: schools.has_generations
 * 
 * This script verifies the current state of the has_generations column
 * and provides information about what actions need to be taken.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifySchemaState() {
  console.log('🔍 Verifying current schema state for schools.has_generations...\n');

  try {
    // Check 1: Find any NULL values
    console.log('📋 Check 1: Looking for NULL values...');
    const { data: nullSchools, error: nullError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .is('has_generations', null);

    if (nullError) {
      console.error('❌ Error checking for NULL values:', nullError);
      return;
    }

    console.log(`✅ Schools with NULL has_generations: ${nullSchools?.length || 0}`);
    if (nullSchools && nullSchools.length > 0) {
      console.log('⚠️  NULL values found in:');
      nullSchools.forEach(school => {
        console.log(`   ${school.id}: ${school.name}`);
      });
    }

    // Check 2: Get all schools with their generation status
    console.log('\n📋 Check 2: All schools and their has_generations values...');
    const { data: allSchools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('id');

    if (schoolsError) {
      console.error('❌ Error fetching schools:', schoolsError);
      return;
    }

    console.log('✅ Current school generation flags:');
    if (allSchools) {
      allSchools.forEach(school => {
        const status = school.has_generations === null ? 'NULL' : school.has_generations;
        console.log(`   ${school.id}: ${school.name} → ${status}`);
      });
    }

    // Check 3: Cross-reference with actual generations data
    console.log('\n📋 Check 3: Cross-referencing with actual generations...');
    const { data: schoolGenerations, error: genError } = await supabase
      .from('generations')
      .select('school_id')
      .order('school_id');

    if (genError) {
      console.error('❌ Error fetching generations:', genError);
      return;
    }

    // Create a set of school IDs that have generations
    const schoolsWithGenerations = new Set(schoolGenerations?.map(g => g.school_id) || []);

    console.log('✅ Schools with actual generations in database:');
    console.log(`   ${Array.from(schoolsWithGenerations).join(', ')}`);

    // Check 4: Identify inconsistencies
    console.log('\n📋 Check 4: Identifying data inconsistencies...');
    let inconsistencies = 0;
    if (allSchools) {
      console.log('✅ Data consistency analysis:');
      allSchools.forEach(school => {
        const hasGenerationsInDB = schoolsWithGenerations.has(school.id);
        const flagValue = school.has_generations;
        
        if (flagValue === null) {
          console.log(`   ⚠️  ${school.id} (${school.name}): NULL flag, should be ${hasGenerationsInDB}`);
          inconsistencies++;
        } else if (flagValue !== hasGenerationsInDB) {
          console.log(`   ⚠️  ${school.id} (${school.name}): Flag=${flagValue}, Actual=${hasGenerationsInDB} (MISMATCH)`);
          inconsistencies++;
        } else {
          console.log(`   ✅ ${school.id} (${school.name}): Flag=${flagValue}, Actual=${hasGenerationsInDB} (CORRECT)`);
        }
      });
    }

    // Summary and recommendations
    console.log('\n📊 Summary:');
    console.log(`   Total schools: ${allSchools?.length || 0}`);
    console.log(`   Schools with NULL flags: ${nullSchools?.length || 0}`);
    console.log(`   Schools with actual generations: ${schoolsWithGenerations.size}`);
    console.log(`   Data inconsistencies found: ${inconsistencies}`);

    if (inconsistencies > 0) {
      console.log('\n🔧 Recommended Actions:');
      console.log('   1. Update NULL values based on actual generation data');
      console.log('   2. Fix any flag/data mismatches');
      console.log('   3. Apply NOT NULL constraint (requires database admin)');
    } else {
      console.log('\n✅ Data is consistent! Ready for NOT NULL constraint.');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run the verification
verifySchemaState().catch(console.error);