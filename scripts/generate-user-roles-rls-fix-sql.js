// This script generates the SQL statements for fixing the user_roles RLS policies
// Run with: node scripts/generate-user-roles-rls-fix-sql.js
// Then copy the output and run it in Supabase SQL Editor

const fs = require('fs');
const path = require('path');

// Read the migration SQL file
const migrationPath = path.join(__dirname, '../database/migrations/003_fix_user_roles_rls_recursion.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

console.log('Copy and paste the following SQL into your Supabase SQL Editor:');
console.log('=' .repeat(80));
console.log();

// Output the SQL, removing comments and empty lines for clarity
const lines = migrationSQL.split('\n');
let inComment = false;
let outputBuffer = [];

for (const line of lines) {
  const trimmedLine = line.trim();
  
  // Skip empty lines
  if (!trimmedLine) continue;
  
  // Skip comment lines (but keep important section headers)
  if (trimmedLine.startsWith('--')) {
    if (trimmedLine.includes('===') || trimmedLine.includes('Policy')) {
      console.log(line);
    }
    continue;
  }
  
  // Output the SQL statements
  console.log(line);
}

console.log();
console.log('=' .repeat(80));
console.log();
console.log('After running the above SQL, verify the policies with:');
console.log();
console.log(`SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual
FROM pg_policies
WHERE tablename = 'user_roles'
ORDER BY policyname;`);
console.log();
console.log('You should see 3 policies:');
console.log('1. user_roles_self_view - allows users to see their own roles');
console.log('2. user_roles_admin_view - allows admins to see all roles');
console.log('3. user_roles_block_mutations - blocks all direct mutations');