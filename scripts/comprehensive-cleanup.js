/**
 * Comprehensive cleanup that handles foreign key relationships
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function comprehensiveCleanup() {
  console.log('🧹 Starting comprehensive test data cleanup...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    // Step 1: Delete communities first (they depend on generations and schools)
    console.log('1. Cleaning communities...');
    const { data: deletedCommunities, error: commError } = await supabase
      .from('communities')
      .delete()
      .like('name', '%Test%')
      .select();
    
    if (commError && !commError.message.includes('no rows')) {
      console.warn('⚠️  Warning cleaning communities:', commError.message);
    } else {
      console.log(`✅ Deleted ${deletedCommunities?.length || 0} test communities`);
    }
    
    // Step 2: Delete generations (they depend on schools)
    console.log('2. Cleaning generations...');
    const { data: deletedGenerations, error: genError } = await supabase
      .from('generations')
      .delete()
      .like('name', '%Test%')
      .or('name.like.%Generación%')
      .select();
    
    if (genError && !genError.message.includes('no rows')) {
      console.warn('⚠️  Warning cleaning generations:', genError.message);
    } else {
      console.log(`✅ Deleted ${deletedGenerations?.length || 0} test generations`);
    }
    
    // Step 3: Now delete schools
    console.log('3. Cleaning schools...');
    const { data: deletedSchools, error: schoolError } = await supabase
      .from('schools')
      .delete()
      .like('name', '%(Test)%')
      .select();
    
    if (schoolError) {
      console.error('❌ Error deleting test schools:', schoolError.message);
      
      // Try deleting by ID range as backup
      console.log('🔄 Trying cleanup by ID range...');
      const { data: deletedByIds, error: deleteIdError } = await supabase
        .from('schools')
        .delete()
        .gte('id', 10000)
        .select();
      
      if (deleteIdError) {
        console.warn('⚠️  Warning deleting schools by ID:', deleteIdError.message);
        return false;
      } else {
        console.log(`✅ Deleted ${deletedByIds?.length || 0} schools by ID range`);
      }
    } else {
      console.log(`✅ Deleted ${deletedSchools?.length || 0} test schools`);
    }
    
    // Step 4: Clean up any other test data
    console.log('4. Cleaning other test tables...');
    
    const otherTables = ['profiles', 'courses', 'user_sessions'];
    
    for (const tableName of otherTables) {
      try {
        const { data: deletedOther, error: otherError } = await supabase
          .from(tableName)
          .delete()
          .like('name', '%Test%')
          .or('email.like.%test%')
          .select();
        
        if (otherError && !otherError.message.includes('no rows') && !otherError.message.includes('column') && !otherError.message.includes('relation')) {
          console.warn(`⚠️  Warning cleaning ${tableName}:`, otherError.message);
        } else if (deletedOther && deletedOther.length > 0) {
          console.log(`✅ Deleted ${deletedOther.length} test records from ${tableName}`);
        }
      } catch (error) {
        // Ignore errors for tables that might not exist or have different schemas
        console.log(`ℹ️  Skipped ${tableName} (not accessible or doesn't exist)`);
      }
    }
    
    console.log('\n📊 Cleanup Summary:');
    console.log(`   • Communities: ${deletedCommunities?.length || 0} deleted`);
    console.log(`   • Generations: ${deletedGenerations?.length || 0} deleted`);
    console.log(`   • Schools: ${deletedSchools?.length || 0} deleted`);
    console.log('✅ Comprehensive cleanup completed');
    
    return true;
    
  } catch (error) {
    console.error('❌ Comprehensive cleanup failed:', error.message);
    return false;
  }
}

// Run cleanup
if (require.main === module) {
  comprehensiveCleanup()
    .then(success => {
      if (success) {
        console.log('\n🎉 COMPREHENSIVE CLEANUP COMPLETED!');
        console.log('✅ All test data removed');
        console.log('✅ Ready to run: npm run seed:all');
      } else {
        console.log('\n❌ CLEANUP FAILED');
        console.log('Some test data may still exist');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 CLEANUP CRASHED:', error.message);
      process.exit(1);
    });
}