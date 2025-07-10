import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchoolsPolicies() {
  console.log('🔍 Checking schools table RLS policies...\n');
  
  // First check if we have any schools
  const { data: schools, error: schoolError } = await supabase
    .from('schools')
    .select('id, name')
    .limit(3);
    
  if (schoolError) {
    console.error('❌ Error fetching schools:', schoolError);
  } else {
    console.log(`✅ Found ${schools?.length || 0} schools (using service role key)`);
    if (schools && schools.length > 0) {
      console.table(schools);
    }
  }
  
  console.log('\n📋 To check RLS policies, run this SQL in Supabase SQL Editor:');
  console.log('```sql');
  console.log(`SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'schools'
ORDER BY policyname;`);
  console.log('```');
  
  console.log('\n🔍 Also check if RLS is enabled:');
  console.log('```sql');
  console.log(`SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'schools';`);
  console.log('```');
}

checkSchoolsPolicies();