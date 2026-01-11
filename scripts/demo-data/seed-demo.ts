/**
 * Demo Data Seeder
 * Main orchestrator for creating demo content for presentations
 *
 * Usage: npm run demo:seed
 */

import { createClient } from '@supabase/supabase-js';
import { DEMO_CONFIG } from './config';
import { createDemoSchool } from './generators/school';
import { createDemoUsers } from './generators/users';
import { createDemoMeetings } from './generators/meetings';
import { createDemoMigrationPlan } from './generators/migration-plan';

async function seedDemoData() {
  console.log('\n========================================');
  console.log('  FNE LMS Demo Data Seeder');
  console.log('========================================\n');

  // Validate environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('ERROR: Missing environment variables.');
    console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
  }

  // Create Supabase client with service role key for admin operations
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Check if demo school already exists
    const { data: existingSchool } = await supabase
      .from('schools')
      .select('id')
      .eq('name', DEMO_CONFIG.DEMO_SCHOOL_NAME)
      .single();

    if (existingSchool) {
      console.log(`WARNING: Demo school "${DEMO_CONFIG.DEMO_SCHOOL_NAME}" already exists.`);
      console.log('Run "npm run demo:cleanup" first to remove existing demo data.\n');
      process.exit(1);
    }

    console.log('Starting demo data creation...\n');

    // Step 1: Create school hierarchy
    console.log('Step 1: Creating school structure...');
    const schoolData = await createDemoSchool(supabase);
    console.log('');

    // Step 2: Create users
    console.log('Step 2: Creating demo users...');
    const usersData = await createDemoUsers(
      supabase,
      schoolData.school.id,
      schoolData.tractorGen.id,
      schoolData.community.id
    );
    console.log('');

    // Step 3: Create meetings with agreements/commitments
    console.log('Step 3: Creating demo meetings...');
    const meetingsData = await createDemoMeetings(
      supabase,
      schoolData.workspace.id,
      usersData
    );
    console.log('');

    // Step 4: Create migration plan
    console.log('Step 4: Creating demo migration plan...');
    const migrationData = await createDemoMigrationPlan(
      supabase,
      schoolData.school.id
    );
    console.log('');

    // Summary
    console.log('========================================');
    console.log('  Demo Data Creation Complete!');
    console.log('========================================\n');

    console.log('Created:');
    console.log(`  - School: ${schoolData.school.name} (ID: ${schoolData.school.id})`);
    console.log(`  - Workspace ID: ${schoolData.workspace.id}`);
    console.log(`  - Users: ${usersData.allUsers.length} total`);
    console.log(`    - Teachers: ${usersData.teachers.length}`);
    console.log(`    - Leaders: ${usersData.leaders.length}`);
    console.log(`    - Directivos: ${usersData.directivos.length}`);
    console.log(`  - Meetings: ${meetingsData.meetings.length}`);
    console.log(`  - Migration Plan: ${migrationData.entriesCount} entries (Year ${migrationData.transformationYear})`);

    console.log('\n----------------------------------------');
    console.log('How to view the demo data:');
    console.log('----------------------------------------');
    console.log('1. Run the dev server: npm run dev');
    console.log('2. Log in as an admin user');
    console.log('3. Navigate to the demo school:');
    console.log(`   - Vista General: /community/workspace (select "${DEMO_CONFIG.COMMUNITY_NAME}")`);
    console.log(`   - Reuniones: Click "Reuniones" tab in the workspace`);
    console.log(`   - Plan de Migracion: /school/migration-plan?school_id=${schoolData.school.id}`);
    console.log('');
    console.log('To clean up: npm run demo:cleanup\n');

  } catch (error) {
    console.error('\nERROR during demo data creation:');
    console.error(error);
    console.log('\nYou may need to run "npm run demo:cleanup" to remove partial data.');
    process.exit(1);
  }
}

// Run the seeder
seedDemoData();
