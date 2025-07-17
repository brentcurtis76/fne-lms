#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

console.log('🔧 Executing quiz submissions RLS fix...\n');
console.log('Supabase URL:', supabaseUrl);

// Read the SQL file
const sqlPath = path.join(__dirname, '..', 'database', 'fix-quiz-submissions-rls.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

console.log('\n📋 Migration Summary:');
console.log('This will fix the quiz_submissions RLS policies by:');
console.log('1. Dropping incorrect policies that reference user_id');
console.log('2. Creating new policies that correctly reference student_id');
console.log('3. Adding consultant access policies');
console.log('4. Fixing the "Error al enviar el quiz" issue\n');

console.log('⚠️  IMPORTANT: This script cannot execute DDL statements directly.');
console.log('Please copy and paste the following SQL into your Supabase SQL Editor:\n');

console.log('═'.repeat(80));
console.log(sqlContent);
console.log('═'.repeat(80));

console.log('\n📍 To execute this migration:');
console.log('1. Go to your Supabase Dashboard');
console.log('2. Navigate to SQL Editor');
console.log('3. Paste the SQL above');
console.log('4. Click "Run" to execute');

console.log('\n✅ After running the migration:');
console.log('- Students will be able to submit quizzes');
console.log('- Teachers can review submissions for their courses');
console.log('- Consultants can review their assigned students\' submissions');
console.log('- The "Error al enviar el quiz" error will be resolved');

// Create a direct link to Supabase SQL editor
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (projectRef) {
  console.log(`\n🔗 Direct link to SQL Editor:`);
  console.log(`https://supabase.com/dashboard/project/${projectRef}/sql/new`);
}