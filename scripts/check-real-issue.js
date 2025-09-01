const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkRealIssue() {
  console.log('🔍 CHECKING THE REAL ISSUE - WHY USERS CANNOT SEE ASSIGNED LEARNING PATHS');
  console.log('=' + '='.repeat(70));
  
  // The learning path shown in the screenshot
  const pathId = 'c47136ef-058b-4dd5-a3d9-2d470cfbe5e4'; // From URL in screenshot
  
  // Get Katherine's data
  const { data: katherine } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  console.log('\n👤 USER STATUS:');
  console.log('  Name:', katherine?.first_name, katherine?.last_name);
  console.log('  Email:', katherine?.email);
  console.log('  User ID:', katherine?.id);
  console.log('  School ID:', katherine?.school_id);
  console.log('  Community ID:', katherine?.community_id);
  console.log('  Generation ID:', katherine?.generation_id);
  
  // Check the learning path
  console.log('\n📚 LEARNING PATH "Elementos del plan personal":');
  const { data: learningPath } = await supabase
    .from('learning_paths')
    .select('*')
    .eq('id', pathId)
    .single();
    
  if (learningPath) {
    console.log('  Title:', learningPath.name);
    console.log('  ID:', learningPath.id);
    console.log('  Active:', learningPath.is_active);
    console.log('  School ID:', learningPath.school_id);
    console.log('  Generation ID:', learningPath.generation_id);
  }
  
  // Check learning path assignments for Katherine
  console.log('\n🔗 CHECKING LEARNING PATH ASSIGNMENTS:');
  
  // Direct user assignment
  const { data: directAssignment } = await supabase
    .from('learning_path_assignments')
    .select('*')
    .eq('path_id', pathId)
    .eq('user_id', katherine?.id);
    
  console.log('  Direct assignment to Katherine:', directAssignment?.length || 0);
  
  // Group-based assignment (if she has a group/community)
  if (katherine?.community_id) {
    const { data: groupAssignment } = await supabase
      .from('learning_path_assignments')
      .select('*')
      .eq('path_id', pathId)
      .eq('group_id', katherine.community_id);
      
    console.log('  Group assignment via community:', groupAssignment?.length || 0);
  }
  
  // Check ALL assignments for this path
  const { data: allAssignments } = await supabase
    .from('learning_path_assignments')
    .select('*')
    .eq('path_id', pathId);
    
  console.log('  Total assignments for this path:', allAssignments?.length || 0);
  
  if (allAssignments && allAssignments.length > 0) {
    // Group by type
    const userAssignments = allAssignments.filter(a => a.user_id);
    const groupAssignments = allAssignments.filter(a => a.group_id);
    
    console.log('    - User-based assignments:', userAssignments.length);
    console.log('    - Group-based assignments:', groupAssignments.length);
    
    // Check if Katherine is in any of these
    const katherineFound = userAssignments.some(a => a.user_id === katherine?.id);
    console.log('    - Katherine in user assignments:', katherineFound ? 'YES' : 'NO');
  }
  
  // Check how the learning path is assigned to the school
  console.log('\n🏫 SCHOOL-BASED ASSIGNMENT CHECK:');
  
  // The UI might be using a different mechanism
  // Check if the path has school_id = 25
  if (learningPath) {
    const schoolMatch = learningPath.school_id === katherine?.school_id;
    console.log('  Path school_id:', learningPath.school_id);
    console.log('  Katherine school_id:', katherine?.school_id);
    console.log('  Match:', schoolMatch ? 'YES' : 'NO');
    
    // If they don't match, this could be the issue
    if (!schoolMatch && learningPath.school_id !== null) {
      console.log('\n  ❌ PROBLEM FOUND: Path is assigned to a different school!');
    }
  }
  
  // Check learning path enrollments (different from assignments)
  console.log('\n📋 LEARNING PATH ENROLLMENTS:');
  const { data: enrollment } = await supabase
    .from('learning_path_enrollments')
    .select('*')
    .eq('user_id', katherine?.id)
    .eq('learning_path_id', pathId);
    
  console.log('  Katherine enrolled in this path:', enrollment?.length || 0);
  
  // Check how the UI queries for user's paths
  console.log('\n🖥️ UI QUERY SIMULATION (from LearningPathsService):');
  
  // Get Katherine's communities
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('community_id')
    .eq('user_id', katherine?.id)
    .eq('is_active', true)
    .not('community_id', 'is', null);
    
  const communityIds = (userRoles || []).map(r => r.community_id);
  console.log('  Katherine\'s communities:', communityIds.length ? communityIds : 'None');
  
  // Query as the UI does
  let query = supabase
    .from('learning_path_assignments')
    .select('*, path:learning_paths(*)');
    
  if (communityIds.length > 0) {
    query = query.or(`user_id.eq.${katherine?.id},group_id.in.(${communityIds.join(',')})`);
  } else {
    query = query.eq('user_id', katherine?.id);
  }
  
  const { data: uiResult } = await query;
  console.log('  Paths UI would show:', uiResult?.length || 0);
  
  if (uiResult && uiResult.length > 0) {
    uiResult.forEach(assignment => {
      console.log('    -', assignment.path?.name || 'Unknown');
    });
  }
  
  console.log('\n🎯 DIAGNOSIS:');
  console.log('  The learning path IS assigned in the admin UI (we can see it)');
  console.log('  But users cannot see it in their view');
  console.log('  This suggests the assignment mechanism used by admin UI');
  console.log('  is different from what the user UI queries');
}

checkRealIssue().catch(console.error);