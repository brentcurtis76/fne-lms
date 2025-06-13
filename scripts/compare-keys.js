const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

// Get key from .env.local
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Get key from CLAUDE.md
const claudeMd = fs.readFileSync('/Users/brentcurtis76/CLAUDE.md', 'utf8');
const match = claudeMd.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\s\n]+)/);
const claudeKey = match ? match[1] : null;

console.log('=== Detailed Key Comparison ===\n');

console.log('1. Key from .env.local:');
console.log('   Length:', envKey?.length);
console.log('   First 20:', envKey?.substring(0, 20));
console.log('   Last 20:', envKey?.substring(envKey.length - 20));

console.log('\n2. Key from CLAUDE.md:');
console.log('   Length:', claudeKey?.length);
console.log('   First 20:', claudeKey?.substring(0, 20));
console.log('   Last 20:', claudeKey?.substring(claudeKey.length - 20));

console.log('\n3. Keys match:', envKey === claudeKey);

if (envKey !== claudeKey) {
  console.log('\n4. Character-by-character comparison:');
  const minLen = Math.min(envKey?.length || 0, claudeKey?.length || 0);
  for (let i = 0; i < minLen; i++) {
    if (envKey[i] !== claudeKey[i]) {
      console.log(`   Difference at position ${i}:`);
      console.log(`   .env.local: "${envKey[i]}" (${envKey.charCodeAt(i)})`);
      console.log(`   CLAUDE.md: "${claudeKey[i]}" (${claudeKey.charCodeAt(i)})`);
      break;
    }
  }
}

// Test both keys
const { execSync } = require('child_process');

console.log('\n5. Testing keys with curl:');
try {
  const result1 = execSync(`curl -s -o /dev/null -w "%{http_code}" -X GET "https://sxlogxqzmarhqsblxmtj.supabase.co/auth/v1/health" -H "apikey: ${envKey}"`);
  console.log('   .env.local key:', result1.toString().trim());
} catch (e) {
  console.log('   .env.local key: ERROR');
}

try {
  const result2 = execSync(`curl -s -o /dev/null -w "%{http_code}" -X GET "https://sxlogxqzmarhqsblxmtj.supabase.co/auth/v1/health" -H "apikey: ${claudeKey}"`);
  console.log('   CLAUDE.md key:', result2.toString().trim());
} catch (e) {
  console.log('   CLAUDE.md key: ERROR');
}