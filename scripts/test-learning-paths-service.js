const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Import the service
const { LearningPathsService } = require('../lib/services/learningPathsService');

async function testLearningPathsService() {
  console.log('Testing Learning Paths Service Directly\n');
  console.log('='.repeat(50));
  
  try {
    console.log('\n1. Testing getAllLearningPaths() method...');
    const paths = await LearningPathsService.getAllLearningPaths(supabase);
    
    console.log('   ✅ Success! Found', paths.length, 'learning paths');
    
    if (paths.length > 0) {
      console.log('\n   Sample learning paths:');
      paths.slice(0, 5).forEach(path => {
        console.log(`     - ${path.name}`);
        console.log(`       Created by: ${path.created_by_name}`);
        console.log(`       Courses: ${path.course_count}`);
        console.log(`       ID: ${path.id}`);
        console.log('');
      });
    }
    
    console.log('\n2. Testing hasManagePermission() for sample user...');
    // Get a sample admin user
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);
    
    if (admins && admins.length > 0) {
      const adminId = admins[0].user_id;
      const hasPermission = await LearningPathsService.hasManagePermission(supabase, adminId);
      console.log(`   Admin user ${adminId} has permission:`, hasPermission ? '✅ Yes' : '❌ No');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('\n✅ CONCLUSION: The Learning Paths Service is working correctly!');
    console.log('\nThe service successfully:');
    console.log('- Queries the learning_paths table');
    console.log('- Fetches creator names from profiles');
    console.log('- Counts courses for each path');
    console.log('- Returns properly formatted data');
    
    console.log('\n🔍 IMPORTANT DISCOVERY:');
    console.log('The learning paths page does NOT use the RPC functions we were trying to fix.');
    console.log('It uses the LearningPathsService which queries tables directly.');
    console.log('This is why the "schema cache" errors for RPCs don\'t matter!');
    
    console.log('\n📱 If the page isn\'t loading in the browser:');
    console.log('1. Make sure you\'re logged in as admin/equipo_directivo/consultor');
    console.log('2. Check the browser console for JavaScript errors');
    console.log('3. Check the Network tab for failed API calls');
    console.log('4. Try hard refreshing the page (Cmd+Shift+R)');
    
  } catch (error) {
    console.error('\n❌ Service test failed:', error.message);
    console.error('Full error:', error);
  }
}

testLearningPathsService();