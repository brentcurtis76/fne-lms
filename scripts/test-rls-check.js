import fetch from 'node-fetch';

async function testRLSCheck() {
  const baseUrl = 'http://localhost:3000';
  
  try {
    // First, we need to login as admin
    console.log('Logging in as admin...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'bcurtis@nuevaeducacion.org',
        password: 'your_password_here' // Replace with actual password
      })
    });

    if (!loginResponse.ok) {
      console.error('Login failed:', await loginResponse.text());
      return;
    }

    const cookies = loginResponse.headers.get('set-cookie');
    
    // Now check RLS policies
    console.log('\nChecking RLS policies...');
    const checkResponse = await fetch(`${baseUrl}/api/admin/check-rls-policies`, {
      headers: {
        'Cookie': cookies || ''
      }
    });

    if (!checkResponse.ok) {
      console.error('Check failed:', await checkResponse.text());
      return;
    }

    const result = await checkResponse.json();
    
    console.log('\n=== RLS Policy Check Results ===\n');
    console.log(`Tables with RLS enabled: ${result.summary.tablesWithRLS}`);
    console.log(`Policies with legacy references: ${result.summary.policiesWithLegacyReferences}`);
    console.log(`Functions with legacy references: ${result.summary.functionsWithLegacyReferences}`);
    
    if (result.data.policiesWithLegacyReferences.length > 0) {
      console.log('\n⚠️  Policies with legacy profiles.role references:');
      result.data.policiesWithLegacyReferences.forEach(policy => {
        console.log(`\nTable: ${policy.tablename}`);
        console.log(`Policy: ${policy.policyname}`);
        console.log(`Command: ${policy.cmd}`);
        if (policy.has_qual_reference) {
          console.log('QUAL has legacy reference');
        }
        if (policy.has_check_reference) {
          console.log('WITH CHECK has legacy reference');
        }
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

console.log('NOTE: Update the password in the script before running');
console.log('Also make sure the dev server is running on port 3000');

// testRLSCheck();