#!/usr/bin/env node

/**
 * Script to create Jorge Parra as an admin user
 * This uses the Supabase Admin API to properly create the auth user
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createJorgeParra() {
  console.log('Creating Jorge Parra as admin user...\n');

  try {
    // Step 1: Create the auth user
    console.log('Step 1: Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'jorge@lospellines.cl',
      password: 'FNE123!',
      email_confirm: true,
      user_metadata: {
        first_name: 'Jorge',
        last_name: 'Parra'
      }
    });

    if (authError) {
      if (authError.message.includes('already exists')) {
        console.log('Auth user already exists, continuing...');
        // Get existing user
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users.find(u => u.email === 'jorge@lospellines.cl');
        if (existingUser) {
          authData.user = existingUser;
        } else {
          throw new Error('Could not find existing user');
        }
      } else {
        throw authError;
      }
    } else {
      console.log('✅ Auth user created successfully');
    }

    const userId = authData.user.id;
    console.log(`User ID: ${userId}`);

    // Step 2: Create or update profile
    console.log('\nStep 2: Creating profile...');
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: 'jorge@lospellines.cl',
        first_name: 'Jorge',
        last_name: 'Parra',
        name: 'Jorge Parra',
        approval_status: 'approved',
        must_change_password: false
      });

    if (profileError) {
      console.error('Profile error:', profileError);
      throw profileError;
    }
    console.log('✅ Profile created/updated successfully');

    // Step 3: Assign admin role
    console.log('\nStep 3: Assigning admin role...');
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: userId,
        role_type: 'admin',
        is_active: true,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,role_type'
      });

    if (roleError) {
      console.error('Role error:', roleError);
      // Try inserting without upsert
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role_type: 'admin',
          is_active: true,
          created_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error('Insert error:', insertError);
      } else {
        console.log('✅ Admin role assigned successfully');
      }
    } else {
      console.log('✅ Admin role assigned successfully');
    }

    // Final verification
    console.log('\n===========================================');
    console.log('✅ Jorge Parra created successfully!');
    console.log('===========================================');
    console.log('Email: jorge@lospellines.cl');
    console.log('Password: FNE123!');
    console.log('Role: admin');
    console.log('User ID:', userId);
    console.log('===========================================');

  } catch (error) {
    console.error('\n❌ Error creating user:', error.message);
    process.exit(1);
  }
}

createJorgeParra();