const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function identifyDuplicates() {
  console.log('🔍 IDENTIFYING DUPLICATE USERS ISSUE\n');
  console.log('=' .repeat(50));
  
  // 1. Get data from the current function
  const { data: allRows, error } = await supabase.rpc('get_all_auth_users');
  
  if (error) {
    console.error('Error calling function:', error);
    return;
  }

  console.log(`\n📊 CURRENT SITUATION:`);
  console.log(`Total rows returned by get_all_auth_users: ${allRows.length}`);
  
  // 2. Group by user ID to find duplicates
  const userMap = new Map();
  allRows.forEach(row => {
    if (!userMap.has(row.id)) {
      userMap.set(row.id, []);
    }
    userMap.get(row.id).push(row);
  });

  const uniqueUsers = Array.from(userMap.keys()).length;
  const duplicateUsers = Array.from(userMap.entries()).filter(([_, rows]) => rows.length > 1);
  
  console.log(`Unique user IDs: ${uniqueUsers}`);
  console.log(`Users appearing multiple times: ${duplicateUsers.length}`);
  
  // 3. Analyze WHY duplicates exist
  console.log(`\n🔍 WHY ARE THERE DUPLICATES?`);
  console.log('The function does a LEFT JOIN with user_roles table.');
  console.log('When a user has multiple roles, they appear multiple times.');
  
  console.log(`\n📋 EXAMPLES OF DUPLICATED USERS:`);
  duplicateUsers.slice(0, 5).forEach(([userId, rows]) => {
    console.log(`\n${rows[0].email} (ID: ${userId.substring(0, 8)}...)`);
    console.log(`  Appears ${rows.length} times with roles:`);
    rows.forEach(row => {
      console.log(`    - ${row.role_type || '(no role)'}`);
    });
  });

  // 4. Check if these users have course progress
  console.log(`\n🎓 CHECKING COURSE PROGRESS FOR DUPLICATED USERS...`);
  
  for (const [userId, rows] of duplicateUsers.slice(0, 3)) {
    const email = rows[0].email;
    
    // Check course enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('course_id, enrolled_at, completed_at, progress')
      .eq('student_id', userId);
    
    // Check lesson progress
    const { data: progress } = await supabase
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('user_id', userId);
    
    // Check quiz attempts
    const { data: quizAttempts } = await supabase
      .from('quiz_attempts')
      .select('quiz_id, score, created_at')
      .eq('user_id', userId);
    
    console.log(`\n${email}:`);
    console.log(`  - Course enrollments: ${enrollments?.length || 0}`);
    console.log(`  - Lessons completed: ${progress?.length || 0}`);
    console.log(`  - Quiz attempts: ${quizAttempts?.length || 0}`);
    
    if ((enrollments?.length || 0) > 0 || (progress?.length || 0) > 0 || (quizAttempts?.length || 0) > 0) {
      console.log(`  ⚠️  This user has activity - DO NOT DELETE!`);
    }
  }

  // 5. Explain the fix
  console.log(`\n✅ WHAT THE FIX DOES:`);
  console.log('=' .repeat(50));
  console.log('The SQL fix updates the get_all_auth_users() function to:');
  console.log('1. Use DISTINCT ON (au.id) to return only ONE row per user');
  console.log('2. Use a subquery to fetch the first role (if any) instead of JOIN');
  console.log('3. This eliminates duplicates in the display WITHOUT deleting any data');
  console.log('\n🔒 SAFETY: This fix ONLY changes how users are displayed.');
  console.log('          It does NOT delete users or any of their data.');
  console.log('          All course progress, messages, etc. remain intact.');
  
  // 6. Show what will happen after the fix
  console.log(`\n📊 AFTER THE FIX:`);
  console.log(`- Total users displayed: ${uniqueUsers} (down from ${allRows.length})`);
  console.log(`- Each user appears only once`);
  console.log(`- All user data remains intact`);
  console.log(`- Course progress is preserved`);
  
  console.log(`\n💡 RECOMMENDATION:`);
  console.log('This fix is SAFE to apply. It only changes the display logic.');
  console.log('No user data, course progress, or activities will be affected.');
}

identifyDuplicates().catch(console.error);