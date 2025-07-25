/**
 * Force cleanup by clearing all data from test tables
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function forceCleanup() {
  console.log('🧹 Force cleaning all test data...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    // Step 1: Clear communities completely
    console.log('1. Clearing ALL communities...');
    const { error: commError } = await supabase
      .from('communities')
      .delete()
      .gte('id', 0); // Delete everything
    
    if (commError && !commError.message.includes('no rows')) {
      console.warn('⚠️  Warning clearing communities:', commError.message);
    } else {
      console.log('✅ Cleared all communities');
    }
    
    // Step 2: Clear generations completely
    console.log('2. Clearing ALL generations...');
    const { error: genError } = await supabase
      .from('generations')
      .delete()
      .gte('id', 0); // Delete everything
    
    if (genError && !genError.message.includes('no rows')) {
      console.warn('⚠️  Warning clearing generations:', genError.message);
    } else {
      console.log('✅ Cleared all generations');
    }
    
    // Step 3: Clear schools with high IDs (test schools)
    console.log('3. Clearing test schools (ID >= 10000)...');
    const { data: deletedSchools, error: schoolError } = await supabase
      .from('schools')
      .delete()
      .gte('id', 10000)
      .select();
    
    if (schoolError) {
      console.error('❌ Error clearing test schools:', schoolError.message);
      
      // Try clearing schools with test names
      console.log('🔄 Trying to clear by name pattern...');
      const { data: deletedByName, error: nameError } = await supabase
        .from('schools')
        .delete()
        .like('name', '%(Test)%')
        .select();
      
      if (nameError) {
        console.warn('⚠️  Warning clearing schools by name:', nameError.message);
      } else {
        console.log(`✅ Cleared ${deletedByName?.length || 0} schools by name`);
      }
    } else {
      console.log(`✅ Cleared ${deletedSchools?.length || 0} test schools`);
    }
    
    console.log('\n✅ Force cleanup completed');
    return true;
    
  } catch (error) {
    console.error('❌ Force cleanup failed:', error.message);
    return false;
  }
}

// Run cleanup
if (require.main === module) {
  forceCleanup()
    .then(success => {
      if (success) {
        console.log('\n🎉 FORCE CLEANUP COMPLETED!');
        console.log('✅ Tables cleared for fresh seeding');
        console.log('✅ Ready to run: npm run seed:all');
      } else {
        console.log('\n❌ FORCE CLEANUP FAILED');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 FORCE CLEANUP CRASHED:', error.message);
      process.exit(1);
    });
}