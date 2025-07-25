/**
 * Create communities table directly via HTTP API
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

async function createCommunitiesTable() {
  console.log('🔧 Creating communities table...');
  
  try {
    const createTableSQL = `
      CREATE TABLE public.communities (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        school_id INTEGER REFERENCES public.schools(id),
        generation_id INTEGER REFERENCES public.generations(id),
        created_by UUID,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
    `;
    
    const result = await executeSQL(createTableSQL);
    
    if (result.success) {
      console.log('✅ Communities table created successfully');
      return true;
    } else {
      console.error('❌ Table creation failed:', result.error);
      
      // The error might be because RLS policies need to be created
      // Let's try a simpler approach
      console.log('🔄 Trying simplified table creation...');
      
      const simpleSQL = `
        CREATE TABLE public.communities (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          school_id INTEGER,
          generation_id INTEGER,
          created_by UUID,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `;
      
      const simpleResult = await executeSQL(simpleSQL);
      
      if (simpleResult.success) {
        console.log('✅ Simplified communities table created');
        
        // Now add foreign keys
        const fkSQL = `
          ALTER TABLE public.communities 
          ADD CONSTRAINT communities_school_id_fkey 
          FOREIGN KEY (school_id) REFERENCES public.schools(id);
          
          ALTER TABLE public.communities 
          ADD CONSTRAINT communities_generation_id_fkey 
          FOREIGN KEY (generation_id) REFERENCES public.generations(id);
        `;
        
        const fkResult = await executeSQL(fkSQL);
        
        if (fkResult.success) {
          console.log('✅ Foreign key constraints added');
        } else {
          console.warn('⚠️  Foreign key constraints failed, but table exists');
        }
        
        return true;
      } else {
        console.error('❌ Simplified creation also failed:', simpleResult.error);
        return false;
      }
    }
    
  } catch (error) {
    console.error('❌ Communities table creation failed:', error.message);
    return false;
  }
}

// Run creation
if (require.main === module) {
  createCommunitiesTable()
    .then(success => {
      if (success) {
        console.log('\n🎉 COMMUNITIES TABLE CREATED!');
        console.log('✅ Ready to run data seeding');
        console.log('\nNext step: npm run seed:all');
      } else {
        console.log('\n❌ COMMUNITIES TABLE CREATION FAILED');
        console.log('Please create the table manually in Supabase SQL Editor');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 COMMUNITIES CREATION CRASHED:', error.message);
      process.exit(1);
    });
}