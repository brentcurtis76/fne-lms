import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (using environment variables)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAuthStatus() {
  try {
    // Check if user is authenticated
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session Error:', sessionError);
      return;
    }
    
    if (!session) {
      console.log('🔴 No active session');
      console.log('- RLS policies requiring authentication will prevent operations');
      console.log('- You need to be logged in to perform operations with RLS');
      return false;
    }
    
    console.log('🟢 User is authenticated');
    console.log('User ID:', session.user.id);
    console.log('User Email:', session.user.email);
    
    // Check user metadata for role
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('User Data Error:', userError);
      return false;
    }
    
    const role = userData?.user?.user_metadata?.role;
    console.log('User Role from metadata:', role || 'Not set');
    
    // Also check profiles table as fallback
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
      
    if (profileError) {
      console.log('Profile Error:', profileError.message);
    } else {
      console.log('User Role from profiles table:', profileData?.role || 'Not set');
    }
    
    return true;
  } catch (err) {
    console.error('Authentication Check Error:', err);
    return false;
  }
}

async function checkTablePermissions() {
  console.log('\n==== TABLE PERMISSIONS CHECK ====');
  
  // First verify we're authenticated
  const isAuthenticated = await checkAuthStatus();
  
  if (!isAuthenticated) {
    console.log('⚠️ Authentication required for this check to be meaningful');
  }
  
  // Test reading from courses table
  try {
    console.log('\n📚 Checking COURSES table read access...');
    const { data: coursesData, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .limit(1);
    
    if (coursesError) {
      console.log('❌ Cannot read from courses:', coursesError.message);
    } else {
      console.log('✅ Successfully read from courses');
      console.log(`   Found ${coursesData.length} records`);
    }
  } catch (err) {
    console.error('Error checking courses read:', err);
  }
  
  // Test inserting a test record
  try {
    console.log('\n📝 Checking COURSES table insert access...');
    
    // Create a test record
    const testRecord = {
      title: 'RLS Test Course',
      description: 'This is a test to check RLS policies',
      instructor_id: '00000000-0000-0000-0000-000000000000', // placeholder UUID for test
      thumbnail_url: 'https://example.com/test.jpg'
    };
    
    console.log('   Attempting to insert:', testRecord);
    
    const { data: insertData, error: insertError } = await supabase
      .from('courses')
      .insert([testRecord])
      .select();
    
    if (insertError) {
      console.log('❌ Cannot insert into courses:', insertError.message);
      
      if (insertError.message.includes('row-level security') || 
          insertError.message.includes('new row violates')) {
        console.log('\n🔐 RLS POLICY VIOLATION:');
        console.log('   This confirms that there are RLS policies on the courses table');
        console.log('   The current user does not have permission to insert records');
        console.log('\n💡 SOLUTION OPTIONS:');
        console.log('   1. Modify RLS policies to allow the current user to insert');
        console.log('   2. Ensure the user has the correct role (admin)');
        console.log('   3. Temporarily disable RLS for testing (not recommended for production)');
      }
    } else {
      console.log('✅ Successfully inserted test record');
      console.log('   Inserted:', insertData);
      
      // Clean up test data
      try {
        const { error: deleteError } = await supabase
          .from('courses')
          .delete()
          .eq('id', insertData[0].id);
          
        if (deleteError) {
          console.log('⚠️ Could not clean up test record:', deleteError.message);
        } else {
          console.log('🧹 Test record cleaned up successfully');
        }
      } catch (cleanupErr) {
        console.error('Error cleaning up:', cleanupErr);
      }
    }
  } catch (err) {
    console.error('Error checking courses insert:', err);
  }
}

// Run the checks
checkTablePermissions();
