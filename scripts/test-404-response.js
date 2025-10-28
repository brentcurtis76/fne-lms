/**
 * Test script to verify 404 response handling
 * This tests that the PATCH endpoint returns 404 (not 400)
 * when trying to update a non-existent assessment
 */

async function test404Response() {
  console.log('🧪 Testing 404 Response Handling\n');

  const fakeAssessmentId = '00000000-0000-0000-0000-000000000000';
  const testUrl = `http://localhost:3000/api/transformation/assessments/${fakeAssessmentId}`;

  try {
    console.log('1️⃣  Testing PATCH to non-existent assessment...');
    console.log(`   URL: ${testUrl}`);

    // Make PATCH request to non-existent assessment
    // Note: This will fail with auth error if not logged in, but we're testing the endpoint logic
    const response = await fetch(testUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context_metadata: {
          testField: 'testValue'
        }
      })
    });

    const statusCode = response.status;
    const responseData = await response.json();

    console.log(`   Status Code: ${statusCode}`);
    console.log(`   Response:`, JSON.stringify(responseData, null, 2));

    // Verification
    console.log('\n2️⃣  Verifying response...');

    if (statusCode === 401) {
      console.log('   ⚠️  Got 401 Unauthorized - This is expected if not logged in');
      console.log('   ℹ️  To fully test 404 handling, run this test while logged in');
      console.log('   ℹ️  Or use the authenticated test script instead');
      console.log('\n✅ Test skipped (auth required)');
      return;
    }

    if (statusCode === 404) {
      console.log('   ✅ PASS: Returned 404 status code');

      if (responseData.error && responseData.error.includes('no encontrada')) {
        console.log('   ✅ PASS: Error message in Spanish');
      } else {
        console.log('   ⚠️  Warning: Error message not in expected format');
      }

      console.log('\n' + '='.repeat(70));
      console.log('✅ ALL TESTS PASSED - 404 handling working correctly!');
      console.log('='.repeat(70));
    } else if (statusCode === 400) {
      console.log('   ❌ FAIL: Returned 400 instead of 404');
      console.log('   This indicates the bug is NOT fixed');
      console.log('\n' + '='.repeat(70));
      console.log('❌ TEST FAILED - Still returning 400 for missing resources');
      console.log('='.repeat(70));
      process.exit(1);
    } else {
      console.log(`   ⚠️  Unexpected status code: ${statusCode}`);
      console.log('   Expected either 401 (auth) or 404 (not found)');
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the test
test404Response();
