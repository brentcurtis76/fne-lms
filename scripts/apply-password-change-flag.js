const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting migration: Add password change flag...\n');

const migrationFile = path.join(__dirname, '..', 'database', 'add-password-change-flag.sql');

if (!fs.existsSync(migrationFile)) {
  console.error('❌ Migration file not found:', migrationFile);
  process.exit(1);
}

console.log('📄 Reading migration file...');
const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

console.log('📋 Migration includes:');
console.log('  - Adding must_change_password column to profiles table');
console.log('  - Creating index for performance');
console.log('  - Adding RLS policy for users to update their own flag\n');

console.log('⚠️  This migration will:');
console.log('  1. Add a flag to track if users need to change their password');
console.log('  2. Allow admin-created users to be prompted for password change on first login\n');

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Do you want to continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ Migration cancelled');
    rl.close();
    process.exit(0);
  }

  console.log('\n🔄 Applying migration to Supabase...');
  
  try {
    // Execute the migration using Supabase CLI
    execSync(`npx supabase db push --db-url "${process.env.DATABASE_URL || 'postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres'}"`, {
      input: migrationSQL,
      stdio: 'inherit'
    });
    
    console.log('\n✅ Migration applied successfully!');
    console.log('\n📝 Next steps:');
    console.log('  1. Create new users through the admin panel');
    console.log('  2. Users will be prompted to change password on first login');
    console.log('  3. The change-password page enforces strong password requirements');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('  - Check your Supabase connection');
    console.log('  - Verify DATABASE_URL is set correctly');
    console.log('  - Check if column already exists');
  }
  
  rl.close();
});