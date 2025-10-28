/**
 * RLS Error Monitor - Browser Console Script
 *
 * Paste this into the browser console to automatically detect and report
 * RLS policy errors as you navigate the application.
 *
 * Usage:
 * 1. Open browser console (F12)
 * 2. Copy and paste this entire script
 * 3. Navigate the app normally
 * 4. Check console for "🚨 RLS ERROR DETECTED" messages
 */

(function() {
  console.log('🔍 RLS Error Monitor Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Monitoring for RLS policy errors...');
  console.log('Navigate the app - errors will be logged automatically\n');

  const rlsErrors = [];

  // Intercept fetch requests
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    try {
      const response = await originalFetch.apply(this, args);

      // Check if response is an error
      if (!response.ok) {
        const url = args[0];
        const clonedResponse = response.clone();

        try {
          const data = await clonedResponse.json();

          // Check for RLS-related errors
          if (data.message && (
            data.message.includes('policy') ||
            data.message.includes('row-level security') ||
            data.message.includes('permission denied') ||
            data.code === '42501'
          )) {
            const error = {
              timestamp: new Date().toISOString(),
              url: url.toString(),
              status: response.status,
              message: data.message,
              code: data.code,
              details: data.details || data.hint
            };

            rlsErrors.push(error);

            console.group('🚨 RLS ERROR DETECTED');
            console.log('Time:', error.timestamp);
            console.log('URL:', error.url);
            console.log('Status:', error.status);
            console.log('Message:', error.message);
            if (error.details) console.log('Details:', error.details);
            console.log('\n💡 Action Required:');

            // Try to identify the table
            const tableMatch = error.message.match(/relation "(\w+)"/);
            if (tableMatch) {
              console.log(`   Table "${tableMatch[1]}" needs RLS policy`);
            }

            console.groupEnd();

            // Also show a visual notification
            showRLSNotification(error);
          }
        } catch (e) {
          // Not JSON response, ignore
        }
      }

      return response;
    } catch (err) {
      throw err;
    }
  };

  // Visual notification function
  function showRLSNotification(error) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ef4444;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      max-width: 400px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease-out;
    `;

    const tableMatch = error.message.match(/relation "(\w+)"/);
    const tableName = tableMatch ? tableMatch[1] : 'unknown table';

    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">🚨 RLS Policy Error</div>
      <div style="opacity: 0.9;">Table: ${tableName}</div>
      <div style="opacity: 0.9; font-size: 12px; margin-top: 4px;">Check console for details</div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  // Summary function
  window.getRLSErrorSummary = function() {
    console.log('\n📊 RLS ERROR SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total errors detected: ${rlsErrors.length}`);

    if (rlsErrors.length === 0) {
      console.log('✅ No RLS errors detected!');
      return;
    }

    // Group by table
    const byTable = {};
    rlsErrors.forEach(err => {
      const match = err.message.match(/relation "(\w+)"/);
      const table = match ? match[1] : 'unknown';
      byTable[table] = (byTable[table] || 0) + 1;
    });

    console.log('\nErrors by table:');
    Object.entries(byTable)
      .sort((a, b) => b[1] - a[1])
      .forEach(([table, count]) => {
        console.log(`  • ${table}: ${count} error(s)`);
      });

    console.log('\n💡 Recommended Actions:');
    Object.keys(byTable).forEach(table => {
      console.log(`  1. Add RLS policy for table: ${table}`);
    });

    console.log('\nDetailed errors:');
    rlsErrors.forEach((err, i) => {
      console.log(`\n${i + 1}. ${new Date(err.timestamp).toLocaleTimeString()}`);
      console.log(`   URL: ${err.url}`);
      console.log(`   Message: ${err.message}`);
    });
  };

  console.log('✅ Monitor active');
  console.log('💡 Run getRLSErrorSummary() anytime to see summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
})();
