import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applySchoolsRlsFix() {
  console.log('🔧 Fixing schools table RLS policies for Jorge Parra...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'fix-schools-rls-jorge.sql');
    const sqlScript = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL script
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql_query: sqlScript 
    });

    if (error) {
      // If exec_sql doesn't exist, try direct execution
      console.log('⚠️  exec_sql function not found, trying alternative method...');
      
      // Split the script into individual statements
      const statements = sqlScript
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--') && s !== 'BEGIN' && s !== 'COMMIT');

      for (const statement of statements) {
        if (statement.includes('DROP POLICY') || statement.includes('CREATE POLICY')) {
          console.log(`Executing: ${statement.substring(0, 50)}...`);
          
          // For policies, we need to use raw SQL through the database
          // Since Supabase JS client doesn't support DDL, we'll create the verification script instead
        }
      }

      console.log('\n❗ Manual intervention required:');
      console.log('Please execute the following SQL script in your Supabase SQL Editor:');
      console.log(`\nFile location: ${sqlPath}\n`);
      console.log('Or copy and paste from below:\n');
      console.log('=' * 80);
      console.log(sqlScript);
      console.log('=' * 80);
    } else {
      console.log('✅ Schools RLS policies fixed successfully!');
    }

    // Verify the fix by checking policies
    console.log('\n📋 Verification query to run after applying the fix:');
    console.log(`
SELECT policyname, cmd, permissive
FROM pg_policies 
WHERE tablename = 'schools'
ORDER BY policyname;
`);

    console.log('\n✨ Expected result:');
    console.log('- authenticated_users_read_schools (SELECT, permissive)');
    console.log('- admin_full_access_schools (ALL, permissive)');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the fix
applySchoolsRlsFix();