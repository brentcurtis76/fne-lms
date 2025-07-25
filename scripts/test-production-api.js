const fetch = require('node-fetch');

async function testProductionAPI() {
  console.log('🚀 Testing Production API Directly');
  console.log('==================================');
  
  try {
    // Test the production API endpoint
    const response = await fetch('https://fne-lms.vercel.app/api/reports/detailed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'sb-sxlogxqzmarhqsblxmtj-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSlNVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKcGMzTWlPaUpvZEhSd2N6b3ZMM040Ykc5bmVIRjZiV0Z5YUhGemFteHllVzEwYWlJc0luSmxaaUk2SW5ONGJHOW5lSEY2YldGeWFIRnphbXg0YlcxMGFpSXNJbUYxWkNJNkltRjFkR2hsYm5ScFkyRjBaV1FpTENKbGVIQWlPakUzTmpJNU1UWXhNVFVzSW1saGRDSTZNVGMwTnpNME56YzFOU3dpYzNWaUlqb2lOR0ZsTVRkaU1qRXRPRGszTnkwME1qVmpMV0l3TlRFdFkyRTNZMlJpT0dJNVpHWTFJaXdpWlcxaGFXd2lPaUppY21WdWRFQndaWEp5YjNSMVpYSjBiME50TG1Oc0lpd2ljR2h2Ym1VaU9pSXJOVFk1TkRFeE5qSXpOVGMzSWl3aVlYQndYMjFsZEdGa1lYUmhJanA3SW5CeWIzWnBaR1Z5SWpvaVoyOXZaMnhsSWl3aWNISnZkbWxrWlhKeklqcGJYWDBzSW5WeVpYSmZiV1YwWVdSaGRHRWlPbnNpWVhaaGRHRnlYM1Z5YkNJNkltaDBkSEJ6T2k4dmMzaHNiMmQ0Y1hwa2JXRnlhSEZ6WW14NGJXMTBHUE53aHMrblRWMHpZdnVPanF0UW1WNnJ0OGhPbE9GZVYwNWdNQVRQQzNrQXcyRCtvIzNlWjZpelFnU1FIRmo4TjMvYjB4Tm5neTZxeXlOTm1yNHpRaXhNQlQ1V1RYVGlsKy9NVFpHSTQJD2JEWGdSRHlqckpxQkRPa2xtZ01tVXNjTjNneHJNNkNhOTBLU4YP#Auth'
      },
      body: JSON.stringify({
        filters: {},
        sort: { field: 'last_activity_date', order: 'desc' },
        pagination: { page: 1, limit: 50 }
      })
    });
    
    console.log('API Response Status:', response.status);
    console.log('API Response Headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ API Error Response:', errorText);
      return;
    }
    
    const data = await response.json();
    
    console.log('\n📊 API Response Summary:');
    console.log('Total users returned:', data.users?.length || 0);
    console.log('Summary data:', data.summary);
    console.log('Pagination:', data.pagination);
    
    // Check for Los Pellines users in the response
    if (data.users) {
      console.log('\n🏫 Looking for Los Pellines users:');
      const losUsers = data.users.filter(user => 
        user.user_email?.includes('lospellines.cl') || 
        user.school_name?.toLowerCase().includes('pellines')
      );
      
      console.log('Los Pellines users found:', losUsers.length);
      losUsers.forEach(user => {
        console.log(`  - ${user.user_name} (${user.user_email}) - ${user.total_courses_enrolled} courses`);
      });
      
      if (losUsers.length === 0) {
        console.log('❌ No Los Pellines users found in API response');
        console.log('\nAll users in response:');
        data.users.slice(0, 10).forEach(user => {
          console.log(`  - ${user.user_name} (${user.user_email}) - School: ${user.school_name || 'N/A'}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Production API test error:', error.message);
    
    // Try a simpler test without authentication
    console.log('\n🔄 Trying without authentication...');
    try {
      const simpleResponse = await fetch('https://fne-lms.vercel.app/api/reports/detailed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filters: {},
          sort: { field: 'last_activity_date', order: 'desc' },
          pagination: { page: 1, limit: 50 }
        })
      });
      
      console.log('Simple API Response Status:', simpleResponse.status);
      const simpleText = await simpleResponse.text();
      console.log('Simple API Response:', simpleText);
    } catch (simpleError) {
      console.error('❌ Simple API test also failed:', simpleError.message);
    }
  }
}

testProductionAPI();