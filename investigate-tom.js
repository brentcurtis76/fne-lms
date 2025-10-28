const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function investigateTom() {
  console.log('=== INVESTIGATING TOM@NUEVAEDUCACION.ORG ===\n');

  // 1. Get Tom from auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

  const tom = authData?.users?.find(u => u.email === 'tom@nuevaeducacion.org');

  if (!tom) {
    console.log('User not found');
    return;
  }

  console.log('1. AUTH USER RECORD:');
  console.log('   User ID:', tom.id);
  console.log('   Email:', tom.email);
  console.log('   User Metadata:', JSON.stringify(tom.user_metadata, null, 2));
  console.log();

  // 2. Get Tom's user_roles
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', tom.id);

  console.log('2. USER_ROLES TABLE:');
  console.log(JSON.stringify(userRoles, null, 2));
  console.log();

  // 3. Get Tom's community assignments
  const { data: communities, error: commError } = await supabase
    .from('user_communities')
    .select(`
      *,
      communities:community_id (
        id,
        name,
        type,
        school_id,
        schools:school_id (
          id,
          name
        )
      )
    `)
    .eq('user_id', tom.id);

  console.log('3. COMMUNITY ASSIGNMENTS:');
  console.log(JSON.stringify(communities, null, 2));
  console.log();

  // 4. Get Liceo Nacional de Llolleo school info
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('*')
    .ilike('name', '%Liceo Nacional de Llolleo%');

  console.log('4. LICEO NACIONAL DE LLOLLEO SCHOOL:');
  console.log(JSON.stringify(school, null, 2));
  console.log();

  // 5. Get all communities for the school
  if (school && school.length > 0) {
    const { data: schoolCommunities } = await supabase
      .from('communities')
      .select('*')
      .eq('school_id', school[0].id);

    console.log('5. ALL COMMUNITIES FOR LICEO NACIONAL DE LLOLLEO:');
    console.log(JSON.stringify(schoolCommunities, null, 2));
    console.log();

    // 6. Check if Tom has access to any of these communities
    console.log('6. TOM\'S ACCESS TO SCHOOL COMMUNITIES:');
    const tomCommunityIds = communities?.map(c => c.community_id) || [];
    const schoolCommunityIds = schoolCommunities?.map(c => c.id) || [];
    const hasAccess = schoolCommunityIds.some(id => tomCommunityIds.includes(id));
    console.log('   Tom\'s communities:', tomCommunityIds);
    console.log('   School communities:', schoolCommunityIds);
    console.log('   Has access:', hasAccess);
    console.log();
  }

  // 7. Check role_permissions table
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('*')
    .eq('role', 'directivo');

  console.log('7. ROLE_PERMISSIONS FOR DIRECTIVO:');
  console.log(JSON.stringify(rolePerms, null, 2));
}

investigateTom().catch(console.error);
