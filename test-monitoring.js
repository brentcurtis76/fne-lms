#!/usr/bin/env node

/**
 * Test script for the Proactive Monitoring System
 *
 * Usage:
 *   node test-monitoring.js              # Run monitoring checks
 *   node test-monitoring.js --create-logs # Create test logs first, then run checks
 *
 * This script helps test the monitoring system locally by:
 * 1. Optionally creating test log data in debug_logs
 * 2. Running the ProactiveMonitor checks directly
 * 3. Displaying results and any bugs created
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  log(colors.red, '❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Create test logs to trigger monitoring rules
 */
async function createTestLogs() {
  log(colors.cyan, '\n📝 Creating test logs...\n');

  const testLogs = [
    // Auth failures (triggers auth-failure-rate rule)
    ...Array(12).fill(null).map((_, i) => ({
      log_level: 'error',
      message: `Authentication failed for user test${i}@example.com`,
      source: 'auth-api',
      context: { attempt: i + 1 }
    })),

    // RLS denials (triggers rls-denial-spike rule)
    ...Array(25).fill(null).map((_, i) => ({
      log_level: 'error',
      message: `Permission denied for relation 'users' - RLS policy violation`,
      source: `api-endpoint-${i % 5}`,
      context: { user_id: `test-user-${i}` }
    })),

    // Slow API responses (triggers slow-api-responses rule)
    ...Array(7).fill(null).map((_, i) => ({
      log_level: 'info',
      message: `API request completed`,
      source: `/api/courses/list`,
      context: { response_time_ms: 1500 + (i * 100) }
    })),

    // Real-time failures (triggers realtime-failures rule)
    ...Array(12).fill(null).map((_, i) => ({
      log_level: 'error',
      message: `Realtime subscription failed: WebSocket connection error`,
      source: 'realtime-client',
      context: { subscription_id: `sub-${i}` }
    })),

    // Database errors (triggers database-errors rule)
    ...Array(6).fill(null).map((_, i) => ({
      log_level: 'error',
      message: i % 2 === 0
        ? `Unique constraint violation: duplicate key value violates unique constraint "users_email_key"`
        : `Foreign key constraint violation: insert or update on table "enrollments" violates foreign key constraint`,
      source: 'database',
      context: { table: i % 2 === 0 ? 'users' : 'enrollments' }
    })),
  ];

  const { data, error } = await supabase
    .from('debug_logs')
    .insert(testLogs)
    .select('id');

  if (error) {
    log(colors.red, '❌ Failed to create test logs:', error.message);
    throw error;
  }

  log(colors.green, `✅ Created ${data.length} test logs`);
  log(colors.yellow, '⏳ Waiting 2 seconds for logs to propagate...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Run monitoring checks by calling the API endpoint locally
 */
async function runMonitoringChecks() {
  log(colors.cyan, '\n🔍 Running monitoring checks via API...\n');

  try {
    const response = await fetch('http://localhost:3000/api/monitoring/run-checks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'dev-secret'}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(colors.red, `❌ API returned ${response.status}: ${errorText}`);
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();

    log(colors.blue, `Found ${result.results?.length || 0} monitoring rules\n`);

    if (result.results) {
      result.results.forEach(r => {
        const icon = r.status === 'healthy' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${r.ruleName} - ${r.status}`);
      });
    }
    console.log('');

    return result;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log(colors.red, '❌ Could not connect to dev server at http://localhost:3000');
      log(colors.yellow, '\n💡 Make sure your dev server is running:');
      log(colors.cyan, '   npm run dev\n');
      throw new Error('Dev server not running');
    }
    throw error;
  }
}

/**
 * Display results from the monitoring run
 */
async function displayResults() {
  log(colors.cyan, '\n📊 Monitoring Results:\n');

  // Get recent monitoring logs
  const { data: logs, error: logsError } = await supabase
    .from('debug_logs')
    .select('*')
    .eq('source', 'proactive-monitor')
    .order('created_at', { ascending: false })
    .limit(10);

  if (logsError) {
    log(colors.red, '❌ Failed to fetch monitoring logs:', logsError.message);
  } else if (logs && logs.length > 0) {
    log(colors.blue, 'Recent monitoring activity:');
    logs.forEach(log => {
      const icon = log.log_level === 'warn' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} [${log.log_level.toUpperCase()}] ${log.message}`);
      if (log.context) {
        console.log(`     Context:`, JSON.stringify(log.context, null, 2));
      }
    });
    console.log('');
  }

  // Get any bugs created
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: bugs, error: bugsError } = await supabase
    .from('debug_bugs')
    .select('*')
    .eq('source', 'proactive-monitor')
    .gte('created_at', oneMinuteAgo)
    .order('created_at', { ascending: false });

  if (bugsError) {
    log(colors.red, '❌ Failed to fetch bugs:', bugsError.message);
  } else if (bugs && bugs.length > 0) {
    log(colors.yellow, `\n🐛 Created ${bugs.length} new bug(s):\n`);
    bugs.forEach((bug, i) => {
      console.log(`${i + 1}. ${bug.title}`);
      console.log(`   Severity: ${bug.severity.toUpperCase()}`);
      console.log(`   Category: ${bug.category}`);
      console.log(`   Status: ${bug.status}`);
      console.log(`   ID: ${bug.id}`);
      console.log('');
    });
  } else {
    log(colors.green, '\n✅ No new bugs created\n');
  }
}

/**
 * Clean up test logs created by this script
 */
async function cleanup() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    readline.question('\n🧹 Clean up test logs? (y/N): ', async (answer) => {
      readline.close();

      if (answer.toLowerCase() === 'y') {
        log(colors.cyan, '\nCleaning up test logs...');

        // Delete logs from the last 5 minutes created by this script
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { error } = await supabase
          .from('debug_logs')
          .delete()
          .gte('created_at', fiveMinutesAgo)
          .or('source.eq.auth-api,source.ilike.api-endpoint-%,source.eq.realtime-client,source.eq.database');

        if (error) {
          log(colors.red, '❌ Failed to clean up logs:', error.message);
        } else {
          log(colors.green, '✅ Test logs cleaned up');
        }
      }

      resolve();
    });
  });
}

/**
 * Main execution
 */
async function main() {
  try {
    log(colors.bright, '\n🚀 Proactive Monitoring Test Script\n');
    log(colors.blue, `Database: ${supabaseUrl}`);
    log(colors.blue, `Mode: ${process.argv.includes('--create-logs') ? 'Create logs + Run checks' : 'Run checks only'}\n`);

    // Check if we should create test logs
    if (process.argv.includes('--create-logs')) {
      await createTestLogs();
    }

    // Run monitoring checks
    await runMonitoringChecks();

    // Display results
    await displayResults();

    // Offer cleanup
    if (process.argv.includes('--create-logs')) {
      await cleanup();
    }

    log(colors.green, '\n✅ Test completed!\n');
    process.exit(0);

  } catch (error) {
    log(colors.red, '\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
