/**
 * Clean up existing test schools before seeding
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function cleanupTestSchools() {
  console.log('🧹 Cleaning up existing test schools...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    // Delete schools with "(Test)" in the name
    const { data: deletedSchools, error: deleteError } = await supabase
      .from('schools')
      .delete()
      .like('name', '%(Test)%')
      .select();
    
    if (deleteError) {
      console.error('❌ Error deleting test schools:', deleteError.message);
      return false;
    }
    
    console.log(`✅ Deleted ${deletedSchools?.length || 0} test schools`);
    
    // Also clean up any schools with specific IDs we might have created
    const { data: deletedByIds, error: deleteIdError } = await supabase
      .from('schools')
      .delete()
      .gte('id', 10000)
      .select();
    
    if (deleteIdError) {
      console.warn('⚠️  Warning deleting schools by ID:', deleteIdError.message);
    } else {
      console.log(`✅ Deleted ${deletedByIds?.length || 0} schools by ID range`);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    return false;
  }
}

// Run cleanup
if (require.main === module) {
  cleanupTestSchools()
    .then(success => {
      if (success) {
        console.log('\n✅ TEST SCHOOL CLEANUP COMPLETED');
        console.log('Ready to run: npm run seed:all');
      } else {
        console.log('\n❌ CLEANUP FAILED');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 CLEANUP CRASHED:', error.message);
      process.exit(1);
    });
}