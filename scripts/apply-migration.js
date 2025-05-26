// This script applies the database migration to add the missing columns to the lessons table
// Run with: node scripts/apply-migration.js

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Get Supabase URL and key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY; // Note: Requires service role key

async function applyMigration() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase URL or Service Role Key not found in environment variables');
    console.log('Make sure you have a .env.local file with:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=your-supabase-url');
    console.log('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    process.exit(1);
  }

  console.log(`Connecting to Supabase at ${supabaseUrl}`);
  
  // Create Supabase client with service role key (has admin privileges)
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20250516_add_downloadable_files.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Applying migration to add missing columns to lessons table...');
    
    // Execute the SQL migration
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Migration applied successfully!');
    
    // Verify the columns were added
    console.log('Verifying columns were added...');
    
    // Try to select from the lessons table with the new columns
    const { data, error: selectError } = await supabase
      .from('lessons')
      .select('downloadable_files, has_files, entry_quiz, exit_quiz, has_entry_quiz, has_exit_quiz')
      .limit(1);
    
    if (selectError) {
      console.warn(`Warning: Could not verify columns: ${selectError.message}`);
    } else {
      console.log('✅ Columns verified successfully!');
      console.log('Sample data:', data);
    }
    
  } catch (error) {
    console.error('Error applying migration:', error.message);
    process.exit(1);
  }
}

applyMigration();
