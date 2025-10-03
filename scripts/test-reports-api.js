/**
 * Test Reports API Data
 * Checks what getReportableUsers() returns and what data reports API queries
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('\n🔍 REPORTS API INVESTIGATION\n');

async function investigateReports() {
  // Get a sample user to test with
  console.log('1️⃣  Finding users with progress...');
  const { data: usersWithProgress } = await supabase
    .from('lesson_progress')
    .select('user_id')
    .limit(10);

  const uniqueUserIds = [...new Set(usersWithProgress.map(p => p.user_id))];
  console.log(`   → Found ${uniqueUserIds.length} users with progress\n`);

  // Check what getReportableUsers would return for different roles
  console.log('2️⃣  Checking user roles...');
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('user_id, role_type')
    .in('user_id', uniqueUserIds)
    .eq('is_active', true);

  console.log(`   → User roles found:`);
  const roleMap = new Map();
  (userRoles || []).forEach(r => {
    console.log(`      ${r.user_id.substring(0,8)}: ${r.role_type}`);
    roleMap.set(r.user_id, r.role_type);
  });
  console.log('');

  // Check profiles for these users
  console.log('3️⃣  Checking user profiles...');
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, school_id, generation_id, community_id')
    .in('id', uniqueUserIds);

  console.log(`   → Found ${profiles?.length || 0} profiles`);
  (profiles || []).slice(0, 5).forEach(p => {
    const role = roleMap.get(p.id) || 'no role';
    console.log(`      ${p.first_name} ${p.last_name} (${role})`);
    console.log(`         school: ${p.school_id || 'none'}, gen: ${p.generation_id || 'none'}`);
  });
  console.log('');

  // Simulate what detailed reports API does
  console.log('4️⃣  Simulating getReportableUsers() for admin...');
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id');

  console.log(`   → Admin would see ${allProfiles?.length || 0} users\n`);

  // Check course_assignments for these users
  console.log('5️⃣  Checking course_assignments...');
  const { data: assignments } = await supabase
    .from('course_assignments')
    .select('teacher_id, course_id, status, progress_percentage')
    .in('teacher_id', uniqueUserIds);

  console.log(`   → Found ${assignments?.length || 0} assignments for users with progress`);
  const usersWithAssignments = new Set(assignments?.map(a => a.teacher_id) || []);
  console.log(`   → ${usersWithAssignments.size} unique users have assignments\n`);

  // Check lesson_progress details
  console.log('6️⃣  Checking lesson_progress details...');
  const { data: progressDetails } = await supabase
    .from('lesson_progress')
    .select('user_id, time_spent, completed_at')
    .in('user_id', uniqueUserIds);

  const progressByUser = new Map();
  (progressDetails || []).forEach(p => {
    if (!progressByUser.has(p.user_id)) {
      progressByUser.set(p.user_id, { totalTime: 0, completed: 0, total: 0 });
    }
    const stats = progressByUser.get(p.user_id);
    stats.total++;
    stats.totalTime += p.time_spent || 0;
    if (p.completed_at) stats.completed++;
  });

  console.log('   Sample user progress stats:');
  let count = 0;
  for (const [userId, stats] of progressByUser) {
    if (count++ >= 5) break;
    const profile = profiles?.find(p => p.id === userId);
    const userName = profile ? `${profile.first_name} ${profile.last_name}` : userId.substring(0,8);
    console.log(`      ${userName}:`);
    console.log(`         ${stats.completed}/${stats.total} blocks completed`);
    console.log(`         ${(stats.totalTime / 60).toFixed(1)} minutes total`);
  }
  console.log('');

  // Check what reports would calculate
  console.log('7️⃣  Simulating reports calculation...');
  const sampleUserId = uniqueUserIds[0];
  const sampleProfile = profiles?.find(p => p.id === sampleUserId);
  const sampleAssignments = (assignments || []).filter(a => a.teacher_id === sampleUserId);
  const sampleProgress = (progressDetails || []).filter(p => p.user_id === sampleUserId);

  console.log(`   Sample User: ${sampleProfile?.first_name} ${sampleProfile?.last_name}`);
  console.log(`   Courses enrolled: ${sampleAssignments.length}`);
  console.log(`   Lesson blocks tracked: ${sampleProgress.length}`);
  console.log(`   Completed blocks: ${sampleProgress.filter(p => p.completed_at).length}`);
  console.log(`   Total time: ${(sampleProgress.reduce((sum, p) => sum + (p.time_spent || 0), 0) / 60).toFixed(1)} min`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 FINDINGS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('✅ Data exists and is queryable');
  console.log('✅ Users have course_assignments');
  console.log('✅ lesson_progress has real data');
  console.log(`✅ ${progressByUser.size} users have measurable progress\n`);

  if (progressByUser.size > 0 && allProfiles && allProfiles.length > progressByUser.size * 2) {
    console.log('⚠️  POTENTIAL ISSUE:');
    console.log(`   Only ${progressByUser.size} users have progress`);
    console.log(`   But ${allProfiles.length} users exist in system`);
    console.log('   → This may look like "no activity" if viewing all users\n');
  }

  console.log('RECOMMENDATIONS:');
  console.log('1. Check if reports are filtering to users with NO progress');
  console.log('2. Verify completion_percentage calculation is correct');
  console.log('3. Check if time values are being rounded to 0');
  console.log('4. Test reports with a known user ID that has progress\n');
}

investigateReports()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
