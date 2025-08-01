#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 CHECKING DATABASE USERS');
console.log('==========================');

async function checkUsers() {
  try {
    // Create service role client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // Get profiles to see user data
    console.log('👥 Fetching user profiles...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .order('created_at', { ascending: false })
      .limit(10);

    if (profilesError) {
      console.error('❌ Error fetching profiles:', profilesError);
      return;
    }

    console.log('✅ Found profiles:');
    profiles.forEach((profile, index) => {
      console.log(`${index + 1}. ${profile.first_name} ${profile.last_name} (${profile.email}) - ID: ${profile.id}`);
    });

    // Check for learning path assignments
    console.log('\n📚 Checking learning path assignments...');
    const { data: assignments, error: assignmentError } = await supabase
      .from('learning_path_assignments')
      .select(`
        *,
        path:learning_paths(id, name),
        user:profiles(email, first_name, last_name)
      `)
      .limit(10);

    if (assignmentError) {
      console.error('❌ Error fetching assignments:', assignmentError);
    } else {
      console.log('✅ Found assignments:');
      assignments.forEach((assignment, index) => {
        console.log(`${index + 1}. User: ${assignment.user?.email} -> Path: ${assignment.path?.name} (ID: ${assignment.path?.id})`);
      });
    }

    // Also check learning paths themselves
    console.log('\n🛤️  Checking learning paths...');
    const { data: paths, error: pathsError } = await supabase
      .from('learning_paths')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (pathsError) {
      console.error('❌ Error fetching paths:', pathsError);
    } else {
      console.log('✅ Found learning paths:');
      paths.forEach((path, index) => {
        console.log(`${index + 1}. ${path.name} (ID: ${path.id}) - Created: ${path.created_at}`);
      });
    }

  } catch (error) {
    console.error('❌ Unexpected Error:', error);
  }
}

checkUsers();