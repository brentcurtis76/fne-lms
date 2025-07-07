#!/usr/bin/env node

/**
 * Post-deployment authentication monitoring script
 * Run with: node scripts/monitor-auth-health.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function monitorAuthHealth() {
  console.log('🔍 FNE LMS Authentication Health Monitor\n');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const metrics = {
    totalUsers: 0,
    activeSessions: 0,
    recentLogins: 0,
    recentLogouts: 0,
    failedLogins: 0,
    tokenRefreshes: 0,
    unexpectedLogouts: 0,
  };

  try {
    // 1. Check total users
    const { count: userCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    metrics.totalUsers = userCount || 0;

    // 2. Check auth logs from last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Note: This assumes you have audit_logs table
    const { data: authLogs } = await supabase
      .from('audit_logs')
      .select('*')
      .gte('created_at', yesterday.toISOString())
      .in('action', ['login', 'logout', 'token_refresh', 'auth_error']);

    if (authLogs) {
      authLogs.forEach(log => {
        switch (log.action) {
          case 'login':
            if (log.metadata?.success) {
              metrics.recentLogins++;
            } else {
              metrics.failedLogins++;
            }
            break;
          case 'logout':
            metrics.recentLogouts++;
            if (log.metadata?.reason === 'unexpected') {
              metrics.unexpectedLogouts++;
            }
            break;
          case 'token_refresh':
            metrics.tokenRefreshes++;
            break;
        }
      });
    }

    // 3. Estimate active sessions (users who logged in but haven't logged out)
    metrics.activeSessions = Math.max(0, metrics.recentLogins - metrics.recentLogouts);

    // 4. Display results
    console.log('📊 Authentication Metrics (Last 24 Hours)');
    console.log('=========================================');
    console.log(`Total Users:          ${metrics.totalUsers}`);
    console.log(`Active Sessions:      ${metrics.activeSessions} (estimated)`);
    console.log(`Recent Logins:        ${metrics.recentLogins}`);
    console.log(`Recent Logouts:       ${metrics.recentLogouts}`);
    console.log(`Failed Logins:        ${metrics.failedLogins}`);
    console.log(`Token Refreshes:      ${metrics.tokenRefreshes}`);
    console.log(`Unexpected Logouts:   ${metrics.unexpectedLogouts}`);

    // 5. Health assessment
    console.log('\n🏥 Health Assessment');
    console.log('====================');
    
    const healthIssues = [];
    
    if (metrics.unexpectedLogouts > metrics.recentLogins * 0.01) {
      healthIssues.push('⚠️  High rate of unexpected logouts (>1%)');
    }
    
    if (metrics.failedLogins > metrics.recentLogins * 0.05) {
      healthIssues.push('⚠️  High rate of failed logins (>5%)');
    }
    
    if (metrics.tokenRefreshes < metrics.activeSessions * 0.5) {
      healthIssues.push('⚠️  Low token refresh rate (possible expiry issues)');
    }
    
    if (healthIssues.length === 0) {
      console.log('✅ All metrics within healthy ranges');
    } else {
      healthIssues.forEach(issue => console.log(issue));
    }

    // 6. Recommendations
    console.log('\n💡 Recommendations');
    console.log('==================');
    
    if (metrics.unexpectedLogouts > 0) {
      console.log('1. Review application logs for auth errors');
      console.log('2. Check for RLS policy conflicts');
      console.log('3. Verify token refresh mechanism');
    }
    
    if (metrics.failedLogins > 10) {
      console.log('1. Review failed login patterns');
      console.log('2. Consider implementing rate limiting');
      console.log('3. Check for brute force attempts');
    }

    // 7. Create monitoring log
    const monitoringResult = {
      timestamp: new Date().toISOString(),
      metrics,
      healthIssues,
      status: healthIssues.length === 0 ? 'healthy' : 'issues_detected'
    };

    // Save to monitoring log
    const fs = require('fs');
    const logDir = 'logs/auth-monitoring';
    fs.mkdirSync(logDir, { recursive: true });
    
    const logFile = `${logDir}/monitor-${new Date().toISOString().split('T')[0]}.json`;
    const existingLogs = fs.existsSync(logFile) 
      ? JSON.parse(fs.readFileSync(logFile, 'utf8')) 
      : [];
    
    existingLogs.push(monitoringResult);
    fs.writeFileSync(logFile, JSON.stringify(existingLogs, null, 2));
    
    console.log(`\n📁 Log saved to: ${logFile}`);

  } catch (error) {
    console.error('\n❌ Error during monitoring:', error.message);
  }
}

// Run monitoring
monitorAuthHealth();

// Export for use in other scripts
module.exports = { monitorAuthHealth };