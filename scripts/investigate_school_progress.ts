import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Starting investigation for "Colegio Metodista William Taylor"...');

  // 1. Find School ID
  const { data: schools, error: schoolError } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%Colegio Metodista William Taylor%');

  if (schoolError) {
    console.error('Error finding school:', schoolError);
    return;
  }

  if (!schools || schools.length === 0) {
    console.log('School not found');
    return;
  }

  const school = schools[0];
  console.log(`Found School: ${school.name} (${school.id})`);

  // 2. Find Users
  // We need to query user_roles to find users in this school
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id, role_type')
    .eq('school_id', school.id);

  if (rolesError) {
    console.error('Error finding users:', rolesError);
    return;
  }

  const userIds = userRoles.map(ur => ur.user_id);
  console.log(`Found ${userIds.length} users in school`);

  if (userIds.length === 0) return;

  // 3. Get Profiles for names
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', userIds);
    
  if (profilesError) {
      console.error('Error fetching profiles', profilesError);
      return;
  }

  const profileMap = new Map(profiles.map(p => [p.id, p]));

  // 4. Get Progress
  // Note: We select learning_paths(name) assuming the relation is set up correctly.
  // If this fails, we might need to fetch paths separately.
  const { data: progress, error: progressError } = await supabase
    .from('learning_path_assignments')
    .select(`
      user_id,
      path_id,
      progress_percentage,
      total_time_spent_minutes,
      completed_at,
      last_activity_at,
      learning_paths (name)
    `)
    .in('user_id', userIds);

  if (progressError) {
    console.error('Error finding progress:', progressError);
    return;
  }

  console.log('\n--- User Progress Report ---');
  console.log('User Email | Name | Role | Path Name | Progress % | Time (min) | Completed At | Last Activity');
  console.log('--- | --- | --- | --- | --- | --- | --- | ---');

  // Group by user for better readability
  const progressByUser = new Map();
  progress.forEach(p => {
    if (!progressByUser.has(p.user_id)) {
      progressByUser.set(p.user_id, []);
    }
    progressByUser.get(p.user_id).push(p);
  });

  // Iterate through all users found in the school, even if they have no progress
  userIds.forEach(userId => {
    const profile = profileMap.get(userId);
    const role = userRoles.find(ur => ur.user_id === userId)?.role_type;
    const userProgress = progressByUser.get(userId) || [];

    if (userProgress.length === 0) {
       console.log(`${profile?.email} | ${profile?.first_name} ${profile?.last_name} | ${role} | NO ASSIGNMENTS | - | - | - | -`);
    } else {
      userProgress.forEach((p: any) => {
        // Handle array or object for learning_paths depending on relation type (usually object for FK)
        const pathName = Array.isArray(p.learning_paths) 
          ? p.learning_paths[0]?.name 
          : p.learning_paths?.name || 'Unknown Path';
        
        console.log(`${profile?.email} | ${profile?.first_name} ${profile?.last_name} | ${role} | ${pathName} | ${p.progress_percentage}% | ${p.total_time_spent_minutes} | ${p.completed_at || 'In Progress'} | ${p.last_activity_at}`);
      });
    }
  });
}

main().catch(e => console.error(e));
