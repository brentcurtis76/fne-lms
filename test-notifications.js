/**
 * Simple test script for notification triggers
 * Run this with: node test-notifications.js
 */

const https = require('https');

const BASE_URL = 'http://localhost:3001';

// You'll need to get your auth token from the browser
// 1. Login to the FNE LMS
// 2. Open browser dev tools (F12)
// 3. Go to Application > Local Storage > find your auth token
// 4. Replace 'YOUR_AUTH_TOKEN_HERE' below
const AUTH_TOKEN = 'YOUR_AUTH_TOKEN_HERE';

async function makeRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    };

    const req = require(url.protocol === 'https:' ? 'https' : 'http').request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const jsonBody = JSON.parse(body);
          resolve({ status: res.statusCode, data: jsonBody });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testNotifications() {
  console.log('🧪 Testing FNE LMS Notification Triggers System...\n');

  if (AUTH_TOKEN === 'YOUR_AUTH_TOKEN_HERE') {
    console.log('❌ Please set your AUTH_TOKEN first!');
    console.log('1. Login to http://localhost:3001');
    console.log('2. Open browser dev tools (F12)');
    console.log('3. Go to Application > Local Storage');
    console.log('4. Find your auth token and replace AUTH_TOKEN in this script');
    return;
  }

  try {
    // Test the comprehensive notification triggers endpoint
    console.log('🔔 Running comprehensive notification trigger tests...');
    const result = await makeRequest('/api/test/notification-triggers', 'POST');
    
    if (result.status === 200) {
      console.log('✅ Test completed successfully!');
      console.log('\n📊 Results:');
      console.log(`- Triggers tested: ${result.data.results.triggers_tested}`);
      console.log(`- Successful: ${result.data.results.successful_triggers}`);
      console.log(`- Failed: ${result.data.results.failed_triggers}`);
      console.log(`- Success rate: ${result.data.results.success_rate}`);
      console.log(`- Notifications created: ${result.data.results.total_notifications_created}`);
      
      console.log('\n📝 Test Details:');
      result.data.results.test_details.forEach((test, index) => {
        const status = test.success ? '✅' : '❌';
        console.log(`${index + 1}. ${status} ${test.trigger} - ${test.notifications || 0} notifications`);
        if (test.error) {
          console.log(`   Error: ${test.error}`);
        }
      });

      console.log('\n🔔 Recent Notifications:');
      if (result.data.results.recent_notifications.length > 0) {
        result.data.results.recent_notifications.forEach((notif, index) => {
          console.log(`${index + 1}. [${notif.category}] ${notif.title} (${new Date(notif.created_at).toLocaleTimeString()})`);
        });
      } else {
        console.log('No notifications found - check if user_notifications table has data');
      }

    } else {
      console.log('❌ Test failed:', result.status);
      console.log('Response:', result.data);
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

// Run the test
testNotifications();