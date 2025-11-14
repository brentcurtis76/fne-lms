#!/usr/bin/env node

/**
 * Trigger Monitoring API Script
 *
 * Manually triggers the monitoring API endpoint for testing.
 * Useful for testing the cron endpoint locally before deploying.
 *
 * Usage:
 *   node trigger-monitoring.js                    # Use default dev server
 *   node trigger-monitoring.js --prod             # Test production endpoint
 *   CRON_SECRET=mysecret node trigger-monitoring.js
 */

require('dotenv').config({ path: '.env.local' });

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

// Determine the API URL
const isProduction = process.argv.includes('--prod');
const apiUrl = isProduction
  ? 'https://fne-lms.vercel.app/api/monitoring/run-checks'
  : 'http://localhost:3000/api/monitoring/run-checks';

// Get CRON_SECRET from environment or use dev default
const cronSecret = process.env.CRON_SECRET || 'dev-secret-for-testing';

/**
 * Make the API request
 */
async function triggerMonitoring() {
  log(colors.bright, '\n🚀 Triggering Monitoring API\n');
  log(colors.blue, `URL: ${apiUrl}`);
  log(colors.blue, `Secret: ${cronSecret.substring(0, 8)}...`);
  log(colors.blue, `Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}\n`);

  if (isProduction) {
    log(colors.yellow, '⚠️  WARNING: Testing PRODUCTION endpoint!\n');
  }

  const startTime = Date.now();

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json'
      }
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    // Display response
    log(colors.cyan, '\n📊 Response:\n');
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Duration: ${duration}ms\n`);

    if (response.ok) {
      // Success response
      log(colors.green, '✅ Monitoring completed successfully\n');

      console.log(`Message: ${data.message}\n`);

      // Display summary
      if (data.summary) {
        log(colors.bright, 'Summary:');
        console.log(`  ✅ Healthy:  ${data.summary.healthy}`);
        console.log(`  ⚠️  Warning:  ${data.summary.warning}`);
        console.log(`  ❌ Critical: ${data.summary.critical}`);
        console.log(`  ⏱️  Duration: ${data.summary.duration}ms\n`);
      }

      // Display individual results
      if (data.results && data.results.length > 0) {
        log(colors.bright, 'Check Results:');
        data.results.forEach((result, i) => {
          const icon = result.status === 'healthy' ? '✅'
                     : result.status === 'warning' ? '⚠️'
                     : '❌';
          console.log(`  ${i + 1}. ${icon} ${result.ruleName}`);
          console.log(`     Status: ${result.status}`);
          console.log(`     Message: ${result.message}`);
          console.log('');
        });
      }

      // Highlight critical issues
      if (data.summary && data.summary.critical > 0) {
        log(colors.red, `⚠️  ${data.summary.critical} CRITICAL ISSUE(S) DETECTED!`);
        log(colors.yellow, 'Check the results above and review debug_bugs table.\n');
      }

    } else {
      // Error response
      log(colors.red, `❌ Request failed: ${response.status} ${response.statusText}\n`);
      console.log('Response:', JSON.stringify(data, null, 2));

      if (response.status === 401) {
        log(colors.yellow, '\n💡 Tip: Check your CRON_SECRET environment variable');
      } else if (response.status === 405) {
        log(colors.yellow, '\n💡 Tip: Only POST requests are allowed');
      }
    }

  } catch (error) {
    log(colors.red, '\n❌ Error making request:\n');
    console.error(error);

    if (error.code === 'ECONNREFUSED') {
      log(colors.yellow, '\n💡 Tip: Make sure your dev server is running on port 3000');
      log(colors.cyan, '   Run: npm run dev');
    }
  }
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
${colors.bright}Trigger Monitoring API Script${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node trigger-monitoring.js              # Test local dev server (default)
  node trigger-monitoring.js --prod       # Test production endpoint
  node trigger-monitoring.js --help       # Show this help

${colors.cyan}Environment Variables:${colors.reset}
  CRON_SECRET                             # Secret for authentication (defaults to 'dev-secret-for-testing')

${colors.cyan}Examples:${colors.reset}
  # Test locally
  node trigger-monitoring.js

  # Test with custom secret
  CRON_SECRET=my-secret-123 node trigger-monitoring.js

  # Test production (use with caution!)
  node trigger-monitoring.js --prod

${colors.cyan}Prerequisites:${colors.reset}
  - For local testing: Dev server must be running (npm run dev)
  - For production: Valid CRON_SECRET must be set
`);
}

/**
 * Main execution
 */
async function main() {
  // Check for help flag
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  // Run the monitoring trigger
  await triggerMonitoring();

  log(colors.green, '\n✅ Done!\n');
  process.exit(0);
}

// Run the script
main().catch(error => {
  log(colors.red, '\n❌ Unexpected error:', error.message);
  console.error(error);
  process.exit(1);
});
