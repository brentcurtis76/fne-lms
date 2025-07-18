const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

async function testAllSchoolsAPI() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('Testing /api/admin/networks/all-schools endpoint...\n');

  try {
    // First, we need to get an auth token
    // For testing, you'll need to provide a valid admin session token
    // You can get this from the browser's developer tools after logging in as admin
    
    const response = await fetch(`${baseUrl}/api/admin/networks/all-schools`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // You'll need to replace this with a valid session token
        'Authorization': 'Bearer YOUR_SESSION_TOKEN_HERE'
      }
    });

    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (data.schools) {
      console.log(`\nFound ${data.schools.length} schools:`);
      data.schools.forEach((school, index) => {
        console.log(`${index + 1}. ${school.name}`);
        if (school.current_network) {
          console.log(`   -> Assigned to: ${school.current_network.name}`);
        } else {
          console.log(`   -> No network assigned`);
        }
      });
    }
    
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

console.log('NOTE: To test this properly, you need to:');
console.log('1. Make sure the app is running on localhost:3000');
console.log('2. Login as admin in your browser');
console.log('3. Open Developer Tools -> Network tab');
console.log('4. Make any API request and copy the Authorization header');
console.log('5. Replace YOUR_SESSION_TOKEN_HERE with the actual token\n');

// Uncomment this line after adding your token
// testAllSchoolsAPI();