#!/usr/bin/env node

/**
 * Apply the quiz_submissions RLS fix migration
 * This fixes the incorrect user_id reference in RLS policies (should be student_id)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔧 Applying quiz_submissions RLS fix migration...\n');

// Read the migration file
const migrationPath = path.join(__dirname, '..', 'database', 'fix-quiz-submissions-rls.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

// Show what we're about to do
console.log('📋 This migration will:');
console.log('  - Drop incorrect RLS policies that reference user_id');
console.log('  - Recreate policies with correct student_id reference');
console.log('  - Add consultant access policies');
console.log('  - Fix the quiz submission error users are experiencing\n');

console.log('📄 Migration file:', migrationPath);
console.log('⚠️  Please run this SQL directly in your Supabase SQL Editor\n');

console.log('Copy and paste the following SQL:\n');
console.log('=' .repeat(80));
console.log(migrationSQL);
console.log('=' .repeat(80));

console.log('\n✅ After running the migration:');
console.log('  1. Quiz submissions should work correctly');
console.log('  2. Students can submit and view their own quizzes');
console.log('  3. Teachers and consultants can review submissions');
console.log('  4. The "Error al enviar el quiz" error should be resolved');

console.log('\n🧪 To test the fix:');
console.log('  1. Log in as a student');
console.log('  2. Navigate to a course with a quiz');
console.log('  3. Complete and submit the quiz');
console.log('  4. Verify no errors occur');