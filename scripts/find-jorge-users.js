import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findJorgeUsers() {
  try {
    console.log('=== Searching for Jorge users ===\n');

    // Search for Jorge in profiles
    const { data: jorgeProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, created_at')
      .or('email.ilike.%jorge%,first_name.ilike.%Jorge%,last_name.ilike.%Parra%')
      .order('created_at', { ascending: false });

    if (profileError) {
      console.error('Error searching profiles:', profileError);
      return;
    }

    console.log('Found Jorge profiles:');
    console.table(jorgeProfiles);

    // Check Los Pellines users
    console.log('\n=== Users from Los Pellines (school_id: 21) ===\n');
    
    const { data: pelillesUsers, error: pelillesError } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        role_type,
        profiles:user_id(
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq('school_id', 21);

    if (pelillesError) {
      console.error('Error fetching Los Pellines users:', pelillesError);
      return;
    }

    console.log('Los Pellines users:');
    const formattedUsers = pelillesUsers.map(user => ({
      user_id: user.user_id,
      email: user.profiles.email,
      name: `${user.profiles.first_name || ''} ${user.profiles.last_name || ''}`,
      role: user.role_type
    }));
    console.table(formattedUsers);

    // Check if any Jorge is in Los Pellines
    console.log('\n=== Jorge users in Los Pellines ===\n');
    const jorgeInPelilles = pelillesUsers.filter(user => 
      user.profiles.first_name?.includes('Jorge') || 
      user.profiles.email?.includes('jorge')
    );
    
    if (jorgeInPelilles.length > 0) {
      console.log('Found Jorge users in Los Pellines:');
      console.table(jorgeInPelilles.map(user => ({
        user_id: user.user_id,
        email: user.profiles.email,
        name: `${user.profiles.first_name || ''} ${user.profiles.last_name || ''}`,
        role: user.role_type
      })));
    } else {
      console.log('No Jorge users found in Los Pellines school');
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

findJorgeUsers();