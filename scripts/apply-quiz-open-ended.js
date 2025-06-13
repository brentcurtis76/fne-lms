const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting migration: Add open-ended quiz support...\n');

const migrationFile = path.join(__dirname, '..', 'database', 'add-quiz-open-ended-support.sql');

if (!fs.existsSync(migrationFile)) {
  console.error('❌ Migration file not found:', migrationFile);
  process.exit(1);
}

console.log('📄 Reading migration file...');
const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

console.log('📋 Migration includes:');
console.log('  - quiz_submissions table');
console.log('  - Row Level Security policies');
console.log('  - pending_quiz_reviews view');
console.log('  - Helper functions for quiz submission and grading');
console.log('  - Indexes for performance\n');

console.log('⚠️  This migration will:');
console.log('  1. Create new tables and functions for quiz submission tracking');
console.log('  2. Enable open-ended questions in quizzes');
console.log('  3. Add manual grading workflow for consultants\n');

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
    console.log('  1. Test creating a quiz with open-ended questions in the lesson editor');
    console.log('  2. Submit a quiz as a student to verify auto-grading works');
    console.log('  3. Check the quiz-reviews page as a consultant');
    console.log('  4. Verify notifications are sent when quizzes need review');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('  - Check your Supabase connection');
    console.log('  - Verify DATABASE_URL is set correctly');
    console.log('  - Check if tables already exist');
    console.log('  - Review the SQL file for syntax errors');
  }
  
  rl.close();
});