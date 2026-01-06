/**
 * Browser Console Test for Notification Triggers
 * 
 * INSTRUCTIONS:
 * 1. Login to http://localhost:3001
 * 2. Open browser dev tools (F12)
 * 3. Go to Console tab
 * 4. Copy and paste this entire script
 * 5. Press Enter to run
 */

async function testNotificationTriggers() {
  console.log('🧪 Testing Genera Notification Triggers...\n');

  // Get auth token from localStorage
  const authData = localStorage.getItem('sb-sxlogxqzmarhqsblxmtj-auth-token');
  if (!authData) {
    console.error('❌ No auth token found. Please login first.');
    return;
  }

  let accessToken;
  try {
    const authObj = JSON.parse(authData);
    accessToken = authObj.access_token;
  } catch (e) {
    console.error('❌ Could not parse auth token');
    return;
  }

  if (!accessToken) {
    console.error('❌ No access token found. Please login first.');
    return;
  }

  try {
    // Test comprehensive notification triggers
    console.log('🔔 Running notification trigger tests...');
    
    const response = await fetch('/api/test/notification-triggers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Notification tests completed!');
      console.log('\n📊 RESULTS:');
      console.log(`• Triggers tested: ${result.results.triggers_tested}`);
      console.log(`• Successful: ${result.results.successful_triggers}`);
      console.log(`• Failed: ${result.results.failed_triggers}`);
      console.log(`• Success rate: ${result.results.success_rate}`);
      console.log(`• Total notifications created: ${result.results.total_notifications_created}`);
      
      console.log('\n📝 DETAILED RESULTS:');
      result.results.test_details.forEach((test, index) => {
        const status = test.success ? '✅' : '❌';
        console.log(`${index + 1}. ${status} ${test.trigger}`);
        console.log(`   Notifications created: ${test.notifications || 0}`);
        if (test.error) {
          console.log(`   ⚠️ Error: ${test.error}`);
        }
      });

      console.log('\n🔔 RECENT NOTIFICATIONS:');
      if (result.results.recent_notifications.length > 0) {
        result.results.recent_notifications.forEach((notif, index) => {
          const time = new Date(notif.created_at).toLocaleTimeString();
          console.log(`${index + 1}. [${notif.category.toUpperCase()}] ${notif.title} (${time})`);
        });
      } else {
        console.log('No recent notifications found');
      }

      // Test individual triggers
      console.log('\n🧪 Testing individual triggers...');
      
      // Test 1: Assignment notification
      console.log('\n📚 Testing assignment notification...');
      const assignmentTest = await fetch('/api/admin/course-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          courseId: 'test-course-' + Date.now(),
          teacherIds: [authObj.user.id] // Assign to yourself for testing
        })
      });
      
      if (assignmentTest.ok) {
        console.log('✅ Assignment trigger test passed');
      } else {
        console.log('❌ Assignment trigger test failed');
      }

      // Test 2: Message notification
      console.log('\n💬 Testing message notification...');
      const messageTest = await fetch('/api/messaging/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          recipient_id: authObj.user.id, // Send to yourself
          content: 'This is a test message from the notification system',
          subject: 'Test Notification Message'
        })
      });
      
      if (messageTest.ok) {
        console.log('✅ Message trigger test passed');
      } else {
        console.log('❌ Message trigger test failed');
      }

      console.log('\n🎉 All tests completed! Check your notifications in the UI.');

    } else {
      console.error('❌ Test failed:', result);
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

// Run the test
testNotificationTriggers();