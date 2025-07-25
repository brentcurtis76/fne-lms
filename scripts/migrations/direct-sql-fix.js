/**
 * Execute SQL directly via Supabase REST API
 */

const https = require('https');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function executeSQL(sql) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const url = new URL(`${supabaseUrl}/rest/v1/rpc/exec_sql`);
  
  const postData = JSON.stringify({ sql });
  
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Prefer': 'return=minimal'
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, data: data });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });
    
    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
    
    req.write(postData);
    req.end();
  });
}

async function runDirectSQLFix() {
  console.log('🔧 Running direct SQL schema fix...');
  
  try {
    // Step 1: Recreate the generations table with correct schema
    console.log('🔄 Step 1: Recreating generations table...');
    
    const recreateSQL = `
      BEGIN;
      
      -- Drop the existing generations table completely
      DROP TABLE IF EXISTS public.generations CASCADE;
      
      -- Create new generations table with INTEGER school_id
      CREATE TABLE public.generations (
        id SERIAL PRIMARY KEY,
        school_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        grade_range TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        
        -- Add foreign key constraint to schools
        CONSTRAINT generations_school_id_fkey 
          FOREIGN KEY (school_id) REFERENCES public.schools(id)
      );
      
      -- Add RLS (Row Level Security) if needed
      ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
      
      COMMIT;
    `;
    
    const result = await executeSQL(recreateSQL);
    
    if (result.success) {
      console.log('✅ Successfully recreated generations table');
    } else {
      console.error('❌ Table recreation failed:', result.error);
      
      // Try a simpler approach
      console.log('🔄 Trying simpler table drop and create...');
      
      const simpleSQL = `
        DROP TABLE IF EXISTS public.generations CASCADE;
        CREATE TABLE public.generations (
          id SERIAL PRIMARY KEY,
          school_id INTEGER REFERENCES public.schools(id),
          name TEXT NOT NULL,
          grade_range TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;
      
      const simpleResult = await executeSQL(simpleSQL);
      
      if (!simpleResult.success) {
        console.error('❌ Simple approach also failed:', simpleResult.error);
        return false;
      } else {
        console.log('✅ Simple table creation succeeded');
      }
    }
    
    console.log('🎉 Schema fix completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Direct SQL fix failed:', error.message);
    return false;
  }
}

// Run the fix
if (require.main === module) {
  runDirectSQLFix()
    .then(success => {
      if (success) {
        console.log('\n🎉 DIRECT SQL FIX COMPLETED!');
        console.log('✅ generations table recreated with INTEGER schema');
        console.log('✅ Ready to run data seeding');
        console.log('\nNext step: npm run seed:all');
      } else {
        console.log('\n❌ DIRECT SQL FIX FAILED');
        console.log('Please run the SQL manually in Supabase SQL Editor');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 DIRECT SQL FIX CRASHED:', error.message);
      process.exit(1);
    });
}

module.exports = { runDirectSQLFix };