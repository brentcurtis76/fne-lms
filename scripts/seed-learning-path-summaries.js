#!/usr/bin/env node
/**
 * Script to seed/refresh learning path summary tables
 * Run this to populate pre-aggregated tables with initial data
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function seedSummaryTables() {
  console.log('🚀 Starting learning path summary tables seeding...');
  console.log('');
  
  const startTime = Date.now();
  let totalOperations = 0;

  try {
    // 1. Get all learning paths
    console.log('📊 Fetching learning paths...');
    const { data: learningPaths, error: pathError } = await supabase
      .from('learning_paths')
      .select('id, name');

    if (pathError) {
      throw new Error(`Failed to fetch learning paths: ${pathError.message}`);
    }

    console.log(`   Found ${learningPaths.length} learning paths`);
    console.log('');

    // 2. Seed performance summaries
    console.log('📈 Seeding performance summaries...');
    let performanceCount = 0;
    
    for (const path of learningPaths) {
      try {
        const { error } = await supabase.rpc('update_learning_path_performance_summary', {
          p_path_id: path.id
        });

        if (error) {
          console.error(`   ❌ Failed for ${path.name}: ${error.message}`);
        } else {
          performanceCount++;
          console.log(`   ✅ ${path.name}`);
        }
        totalOperations++;
      } catch (error) {
        console.error(`   ❌ Error processing ${path.name}:`, error.message);
      }
    }

    console.log(`   Completed: ${performanceCount}/${learningPaths.length} performance summaries`);
    console.log('');

    // 3. Seed user summaries
    console.log('👥 Seeding user summaries...');
    const { data: assignments, error: assignmentError } = await supabase
      .from('learning_path_assignments')
      .select('user_id, path_id');

    if (assignmentError) {
      throw new Error(`Failed to fetch assignments: ${assignmentError.message}`);
    }

    let userSummaryCount = 0;
    console.log(`   Processing ${assignments.length} user assignments...`);

    for (const assignment of assignments) {
      try {
        const { error } = await supabase.rpc('update_user_learning_path_summary', {
          p_user_id: assignment.user_id,
          p_path_id: assignment.path_id
        });

        if (error) {
          console.error(`   ❌ Failed for user ${assignment.user_id.substring(0, 8)}...: ${error.message}`);
        } else {
          userSummaryCount++;
        }
        totalOperations++;
      } catch (error) {
        console.error(`   ❌ Error processing user assignment:`, error.message);
      }
    }

    console.log(`   Completed: ${userSummaryCount}/${assignments.length} user summaries`);
    console.log('');

    // 4. Seed daily summaries for last 30 days
    console.log('📅 Seeding daily summaries for last 30 days...');
    let dailySummaryCount = 0;

    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      console.log(`   Processing ${dateStr}...`);

      for (const path of learningPaths) {
        try {
          const { error } = await supabase.rpc('update_learning_path_daily_summary', {
            p_path_id: path.id,
            p_date: dateStr
          });

          if (error && !error.message.includes('no data')) {
            console.error(`     ❌ Failed for ${path.name}: ${error.message}`);
          } else {
            dailySummaryCount++;
          }
          totalOperations++;
        } catch (error) {
          console.error(`     ❌ Error processing daily summary:`, error.message);
        }
      }
    }

    console.log(`   Completed: ${dailySummaryCount} daily summary records`);
    console.log('');

    // 5. Verify summary tables have data
    console.log('🔍 Verifying seeded data...');

    const { data: perfCount } = await supabase
      .from('learning_path_performance_summary')
      .select('*', { count: 'exact' });

    const { data: userCount } = await supabase
      .from('user_learning_path_summary')
      .select('*', { count: 'exact' });

    const { data: dailyCount } = await supabase
      .from('learning_path_daily_summary')
      .select('*', { count: 'exact' });

    console.log('   📊 Performance summaries:', perfCount?.length || 0);
    console.log('   👥 User summaries:', userCount?.length || 0);
    console.log('   📅 Daily summaries:', dailyCount?.length || 0);
    console.log('');

    // 6. Test analytics API performance
    console.log('⚡ Testing analytics API performance...');
    
    const testStartTime = Date.now();
    const response = await fetch(`${SUPABASE_URL.replace('supabase.co', 'supabase.co')}/rest/v1/learning_path_performance_summary?select=*,learning_paths(name)`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const testDuration = Date.now() - testStartTime;
      console.log(`   ✅ Analytics query executed in ${testDuration}ms (${data.length} records)`);
    } else {
      console.log('   ⚠️ Analytics API test failed (this is expected if tables are empty)');
    }

    const totalDuration = Date.now() - startTime;
    
    console.log('');
    console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Total time: ${Math.round(totalDuration / 1000)}s`);
    console.log(`📊 Total operations: ${totalOperations}`);
    console.log('');
    console.log('🎯 Summary tables are now ready for high-performance analytics!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   • Set up daily cron job: POST /api/cron/update-learning-path-summaries');
    console.log('   • Analytics API will now use pre-aggregated data');
    console.log('   • Summary tables will auto-update via triggers');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ SEEDING FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting:');
    console.error('   • Check database connection');
    console.error('   • Verify migration 20250722000004 has been applied');
    console.error('   • Ensure service role key has proper permissions');
    console.error('');
    process.exit(1);
  }
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('');
  console.log('Learning Path Summary Tables Seeding Script');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('This script populates the pre-aggregated summary tables for');
  console.log('learning path analytics with initial data from existing records.');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/seed-learning-path-summaries.js');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h    Show this help message');
  console.log('');
  console.log('Prerequisites:');
  console.log('  • Database migration 20250722000004 must be applied');
  console.log('  • Environment variables must be configured');
  console.log('  • Service role key must have table access');
  console.log('');
  process.exit(0);
}

// Run the seeding
seedSummaryTables();