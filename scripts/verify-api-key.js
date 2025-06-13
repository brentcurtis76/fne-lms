require('dotenv').config({ path: '.env.local' });

const EXPECTED_URL = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const EXPECTED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';

console.log('=== API Key Verification ===\n');

// Check environment variables
const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('1. Environment Variables:');
console.log('   URL from env:', envUrl);
console.log('   URL matches expected:', envUrl === EXPECTED_URL);
console.log('   Key length from env:', envKey?.length);
console.log('   Key matches expected:', envKey === EXPECTED_KEY);

// Check for invisible characters
console.log('\n2. Checking for invisible characters:');
if (envKey) {
  console.log('   First 50 chars:', envKey.substring(0, 50));
  console.log('   Last 50 chars:', envKey.substring(envKey.length - 50));
  console.log('   Contains whitespace:', /\s/.test(envKey));
  console.log('   Contains non-ASCII:', /[^\x00-\x7F]/.test(envKey));
  
  // Character-by-character comparison
  if (envKey !== EXPECTED_KEY) {
    console.log('\n3. Character-by-character comparison:');
    const minLength = Math.min(envKey.length, EXPECTED_KEY.length);
    for (let i = 0; i < minLength; i++) {
      if (envKey[i] !== EXPECTED_KEY[i]) {
        console.log(`   Difference at position ${i}:`);
        console.log(`   Expected: "${EXPECTED_KEY[i]}" (charCode: ${EXPECTED_KEY.charCodeAt(i)})`);
        console.log(`   Got: "${envKey[i]}" (charCode: ${envKey.charCodeAt(i)})`);
        break;
      }
    }
    if (envKey.length !== EXPECTED_KEY.length) {
      console.log(`   Length difference: Expected ${EXPECTED_KEY.length}, got ${envKey.length}`);
    }
  }
}

// Test the key with curl
console.log('\n4. Testing with curl...');
const { exec } = require('child_process');
const curlCommand = `curl -s -o /dev/null -w "%{http_code}" -X GET "${EXPECTED_URL}/auth/v1/health" -H "apikey: ${EXPECTED_KEY}"`;

exec(curlCommand, (error, stdout) => {
  console.log('   Curl response code:', stdout);
  
  // Also test with the env key
  if (envKey && envKey !== EXPECTED_KEY) {
    const curlCommand2 = `curl -s -o /dev/null -w "%{http_code}" -X GET "${envUrl}/auth/v1/health" -H "apikey: ${envKey}"`;
    exec(curlCommand2, (error2, stdout2) => {
      console.log('   Curl with env key:', stdout2);
    });
  }
});