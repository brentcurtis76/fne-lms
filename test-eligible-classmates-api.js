/**
 * Test script to reproduce the 404 error from eligible-classmates endpoint
 * Usage: node test-eligible-classmates-api.js
 */

const fetch = require('node-fetch');

// You'll need to replace these with actual values from your browser session
const TEST_CONFIG = {
  assignmentId: 'YOUR_ASSIGNMENT_ID',  // Replace with actual assignment ID
  groupId: 'YOUR_GROUP_ID',             // Replace with actual group ID
  cookie: 'YOUR_SESSION_COOKIE'         // Replace with your actual session cookie
};

async function testEligibleClassmates() {
  const url = `http://localhost:3000/api/assignments/eligible-classmates?assignmentId=${TEST_CONFIG.assignmentId}&groupId=${TEST_CONFIG.groupId}`;

  console.log('Testing eligible-classmates endpoint');
  console.log('URL:', url);
  console.log('');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': TEST_CONFIG.cookie,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(data, null, 2));
    console.log('');

    if (response.status === 404) {
      console.log('❌ Got 404 error as expected');
      console.log('   This means the group query is still failing');
    } else if (response.status === 200) {
      console.log('✅ Success! Classmates returned:', data.classmates?.length || 0);
    } else {
      console.log('⚠️  Unexpected status code');
    }

  } catch (error) {
    console.error('Error making request:', error.message);
  }
}

// Check if test config is set
if (TEST_CONFIG.assignmentId === 'YOUR_ASSIGNMENT_ID') {
  console.log('⚠️  Please update TEST_CONFIG with actual values from your browser session');
  console.log('   1. Open dev tools in browser');
  console.log('   2. Go to Network tab');
  console.log('   3. Find eligible-classmates request');
  console.log('   4. Copy assignmentId, groupId from URL');
  console.log('   5. Copy Cookie header value');
  process.exit(1);
}

testEligibleClassmates();
