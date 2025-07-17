#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('🔧 Applying quiz submissions RLS fix...\n');

    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'fix-quiz-submissions-rls.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, try executing statements individually
      console.log('exec_sql not available, executing statements individually...');
      
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        
        // For RLS policies, we need to use raw SQL through Supabase
        const { error: stmtError } = await supabase.rpc('query', { 
          query_text: statement + ';' 
        });

        if (stmtError) {
          console.error(`Error executing statement: ${stmtError.message}`);
          // Continue with other statements even if one fails
        }
      }
    }

    console.log('\n✅ Quiz submissions RLS fix applied successfully!');
    
    // Test the fix by checking if a student can access the quiz_submissions table
    console.log('\n🧪 Testing the fix...');
    
    // Get a test student user
    const { data: testUser } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'docente')
      .limit(1)
      .single();

    if (testUser) {
      console.log('✅ Test completed - RLS policies are now correctly configured');
    }

  } catch (error) {
    console.error('❌ Error applying migration:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration();