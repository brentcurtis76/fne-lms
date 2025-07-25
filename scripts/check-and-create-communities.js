/**
 * Check if communities table exists and create it if needed
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function checkAndCreateCommunities() {
  console.log('🔍 Checking communities table...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    // Test if communities table exists and is accessible
    const { data: testData, error: testError } = await supabase
      .from('communities')
      .select('*')
      .limit(1);
    
    if (testError) {
      console.log('❌ Communities table error:', testError.message);
      
      if (testError.message.includes('does not exist')) {
        console.log('📝 Communities table does not exist. Creating it...');
        
        // Create communities table
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS public.communities (
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
        
        console.log('🔧 Please run this SQL in Supabase SQL Editor:');
        console.log('=' .repeat(60));
        console.log(createTableSQL);
        console.log('=' .repeat(60));
        
        return false;
      } else {
        console.log('❌ Other communities table error:', testError.message);
        return false;
      }
    } else {
      console.log('✅ Communities table exists and is accessible');
      console.log(`Found ${testData.length} existing communities`);
      
      // Test inserting a sample community
      const testCommunity = {
        name: 'Test Community',
        description: 'Test community for validation',
        school_id: null,
        generation_id: null,
        created_by: null,
        is_active: true
      };
      
      console.log('🧪 Testing community insert...');
      
      const { data: insertResult, error: insertError } = await supabase
        .from('communities')
        .insert(testCommunity)
        .select()
        .single();
      
      if (insertError) {
        console.error('❌ Community insert test failed:', insertError.message);
        console.error('Error code:', insertError.code);
        return false;
      } else {
        console.log('✅ Community insert test successful');
        
        // Clean up test record
        await supabase.from('communities').delete().eq('id', insertResult.id);
        console.log('✅ Test record cleaned up');
        
        return true;
      }
    }
    
  } catch (error) {
    console.error('❌ Communities check failed:', error.message);
    return false;
  }
}

// Run check
if (require.main === module) {
  checkAndCreateCommunities()
    .then(success => {
      if (success) {
        console.log('\n✅ COMMUNITIES TABLE READY');
        console.log('Ready to run data seeding');
      } else {
        console.log('\n❌ COMMUNITIES TABLE NEEDS ATTENTION');
        console.log('Please create the table using the SQL above');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 COMMUNITIES CHECK CRASHED:', error.message);
      process.exit(1);
    });
}