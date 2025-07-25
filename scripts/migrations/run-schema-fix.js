/**
 * Run the schema fix directly via Supabase client
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function runSchemaFix() {
  console.log('🔧 Running schema fix via Supabase client...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    console.log('🧹 Step 1: Clearing existing generations data...');
    
    // Clear existing data
    const { error: clearError } = await supabase
      .from('generations')
      .delete()
      .gte('id', 0); // Delete all records
    
    if (clearError && !clearError.message.includes('no rows')) {
      console.warn('⚠️  Warning clearing generations:', clearError.message);
    } else {
      console.log('✅ Cleared generations table');
    }
    
    console.log('🔧 Step 2: Running SQL schema conversion...');
    
    // Execute the schema fix SQL
    const schemaFixSQL = `
      -- Drop foreign key constraint
      ALTER TABLE public.generations DROP CONSTRAINT IF EXISTS generations_school_id_fkey;
      
      -- Convert school_id column from UUID to INTEGER
      ALTER TABLE public.generations ALTER COLUMN school_id TYPE integer USING NULL;
      
      -- Re-add foreign key constraint to schools table
      ALTER TABLE public.generations ADD CONSTRAINT generations_school_id_fkey 
        FOREIGN KEY (school_id) REFERENCES public.schools(id);
    `;
    
    // Use rpc to execute raw SQL
    const { data: sqlResult, error: sqlError } = await supabase.rpc('exec_sql', {
      sql: schemaFixSQL
    }).catch(async () => {
      // Fallback: Try to execute each statement individually
      console.log('🔄 Trying individual SQL statements...');
      
      try {
        // Drop constraint
        await supabase.rpc('exec_sql', {
          sql: 'ALTER TABLE public.generations DROP CONSTRAINT IF EXISTS generations_school_id_fkey;'
        }).catch(() => console.log('ℹ️  Constraint may not exist'));
        
        // This is the critical part - converting the column type
        // Since we can't do this directly, let's create a new table approach
        console.log('🔄 Using table recreation approach...');
        
        const recreateSQL = `
          -- Create new generations table with correct schema
          CREATE TABLE IF NOT EXISTS public.generations_new (
            id SERIAL PRIMARY KEY,
            school_id INTEGER REFERENCES public.schools(id),
            name TEXT NOT NULL,
            grade_range TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          
          -- Drop old table
          DROP TABLE IF EXISTS public.generations CASCADE;
          
          -- Rename new table
          ALTER TABLE public.generations_new RENAME TO generations;
        `;
        
        // Execute table recreation
        const recreateResult = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ sql: recreateSQL })
        });
        
        if (recreateResult.ok) {
          console.log('✅ Successfully recreated generations table with INTEGER schema');
          return true;
        } else {
          throw new Error(`Table recreation failed: ${recreateResult.statusText}`);
        }
        
      } catch (fallbackError) {
        console.error('❌ Fallback approach failed:', fallbackError.message);
        return false;
      }
    });
    
    if (sqlError) {
      console.error('❌ SQL execution failed:', sqlError.message);
      return false;
    }
    
    console.log('✅ Schema fix completed successfully');
    
    // Verify the fix
    console.log('🔍 Verifying schema...');
    
    // Test by inserting a sample record
    const testSchool = {
      id: 99999,
      name: 'Test School for Schema Verification',
      has_generations: true
    };
    
    const { data: schoolResult, error: schoolError } = await supabase
      .from('schools')
      .upsert(testSchool)
      .select()
      .single();
    
    if (schoolError) {
      console.warn('⚠️  Could not create test school:', schoolError.message);
    } else {
      console.log('✅ Test school created');
      
      // Try to create a generation with INTEGER school_id
      const testGeneration = {
        school_id: 99999, // INTEGER
        name: 'Test Generation',
        grade_range: '7-12'
      };
      
      const { data: genResult, error: genError } = await supabase
        .from('generations')
        .insert(testGeneration)
        .select()
        .single();
      
      if (genError) {
        console.error('❌ Generation insert failed:', genError.message);
        return false;
      } else {
        console.log('✅ Successfully inserted generation with INTEGER school_id');
        
        // Clean up test data
        await supabase.from('generations').delete().eq('id', genResult.id);
        await supabase.from('schools').delete().eq('id', 99999);
        console.log('✅ Cleaned up test data');
        
        return true;
      }
    }
    
  } catch (error) {
    console.error('❌ Schema fix failed:', error.message);
    return false;
  }
}

// Run the fix
if (require.main === module) {
  runSchemaFix()
    .then(success => {
      if (success) {
        console.log('\n🎉 SCHEMA FIX COMPLETED SUCCESSFULLY!');
        console.log('✅ generations.school_id is now INTEGER');
        console.log('✅ Ready to run data seeding');
        console.log('\nNext step: npm run seed:all');
      } else {
        console.log('\n❌ SCHEMA FIX FAILED');
        console.log('Manual SQL execution may be required');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 SCHEMA FIX CRASHED:', error.message);
      process.exit(1);
    });
}

module.exports = { runSchemaFix };