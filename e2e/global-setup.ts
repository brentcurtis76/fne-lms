/**
 * Global setup for Playwright tests
 * Cleans the database and sets up test users before running E2E tests
 */

import { chromium, FullConfig } from '@playwright/test';
import { UserFactory } from '../__tests__/factories/userFactory';
import { createClient, User } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables - prefer local test environment if it exists
if (!process.env.CI) {
  const fs = require('fs');
  const localEnvPath = './.env.test.local';
  const testEnvPath = './.env.test';
  
  if (fs.existsSync(localEnvPath)) {
    console.log('Using local Supabase environment from .env.test.local');
    dotenv.config({ path: localEnvPath });
  } else {
    dotenv.config({ path: testEnvPath });
  }
} else {
  dotenv.config();
}

/**
 * Upsert admin user to ensure a known valid state for tests
 */
async function upsertAdminUser(supabaseAdmin: any) {
  const adminEmail = 'brent@perrotuertocm.cl';
  const adminPassword = 'NuevaEdu2025!';
  const adminFirstName = 'Brent';
  const adminLastName = 'Curtis';
  
  try {
    let userId: string;
    
    // Try to create user first
    console.log(`Attempting to create admin user ${adminEmail}...`);
    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { role: 'admin' }
    });
    
    if (createError && createError.code === 'email_exists') {
      // User exists - sign in to get the user ID
      console.log('User already exists, signing in to get user details...');
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword
      });
      
      if (signInError) {
        console.log('Sign in failed, trying to update password...');
        // Can't sign in - try to find user by email and update password
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          throw listError;
        }
        
        // Search through all pages of users if needed
        let foundUser: User | null = null;
        for (const user of users || []) {
          if (user.email === adminEmail) {
            foundUser = user;
            break;
          }
        }
        
        if (!foundUser) {
          // Try getting user by email directly
          console.log('User not found in list, trying direct retrieval...');
          throw new Error(`Cannot find user with email ${adminEmail}`);
        }
        
        userId = foundUser.id;
        
        // Update password and metadata
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          { 
            password: adminPassword,
            user_metadata: { role: 'admin' }
          }
        );
        
        if (updateError) {
          throw updateError;
        }
        console.log(`✅ Updated existing user password and metadata`);
      } else {
        userId = signInData.user.id;
        console.log(`✅ Found existing user with ID: ${userId}`);
        
        // Update metadata to ensure admin role
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          { user_metadata: { role: 'admin' } }
        );
        
        if (updateError) {
          console.warn('Failed to update user metadata:', updateError);
        }
      }
    } else if (createError) {
      throw createError;
    } else {
      userId = authUser.user.id;
      console.log(`✅ Created new admin user with ID: ${userId}`);
    }
    
    // Step 2: Ensure profile exists and is in correct state
    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      console.error('❌ Error checking profile:', profileCheckError.message);
      throw profileCheckError;
    }
    
    // First ensure a school exists for the admin
    const { data: fnSchool, error: schoolCheckError } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .eq('name', 'Fundación Nueva Educación')
      .single();
    
    let schoolName = 'Fundación Nueva Educación';
    if (schoolCheckError && schoolCheckError.code === 'PGRST116') {
      // School doesn't exist, create it
      console.log('Creating Fundación Nueva Educación school...');
      const { error: createSchoolError } = await supabaseAdmin
        .from('schools')
        .insert({
          name: schoolName,
          has_generations: false
        });
      
      if (createSchoolError) {
        console.error('❌ Error creating school:', createSchoolError.message);
        // Use fallback if school creation fails
        schoolName = '';
      } else {
        console.log('✅ Created Fundación Nueva Educación school');
      }
    }
    
    // Prepare profile data, preserving avatar_url if it exists
    const baseProfileData = {
      email: adminEmail,
      name: `${adminFirstName} ${adminLastName}`,
      first_name: adminFirstName,
      last_name: adminLastName,
      middle_name: '',  // Add middle_name field
      school: schoolName,  // Add school field
      description: 'Administrador del sistema FNE LMS',  // Add description
      approval_status: 'approved',
      timezone: 'UTC',
      must_change_password: false,
      growth_community: null  // Explicitly set growth_community
    };
    
    // Don't overwrite avatar_url if profile already exists
    const profileData = existingProfile 
      ? { ...baseProfileData } // Don't include avatar_url in update
      : { ...baseProfileData, avatar_url: null }; // Only set null for new profiles
    
    if (!existingProfile) {
      // Create profile
      console.log('Creating admin profile...');
      const { error: createProfileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          ...profileData
        });
      
      if (createProfileError) {
        console.error('❌ Error creating admin profile:', createProfileError.message);
        throw createProfileError;
      }
      console.log('✅ Created admin profile');
    } else {
      // Update profile
      console.log('Updating admin profile...');
      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update(profileData)
        .eq('id', userId);
      
      if (updateProfileError) {
        console.error('❌ Error updating admin profile:', updateProfileError.message);
        throw updateProfileError;
      }
      console.log('✅ Updated admin profile');
    }
    
    // Step 3: Ensure admin role exists and is active
    const { data: existingRole, error: roleCheckError } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .eq('role_type', 'admin')
      .single();
    
    if (roleCheckError && roleCheckError.code !== 'PGRST116') {
      console.error('❌ Error checking admin role:', roleCheckError.message);
      throw roleCheckError;
    }
    
    if (!existingRole) {
      // Create admin role
      console.log('Creating admin role...');
      const { error: createRoleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role_type: 'admin',
          is_active: true
        });
      
      if (createRoleError) {
        console.error('❌ Error creating admin role:', createRoleError.message);
        throw createRoleError;
      }
      console.log('✅ Created admin role');
    } else if (!existingRole.is_active) {
      // Activate existing role
      console.log('Activating admin role...');
      const { error: updateRoleError } = await supabaseAdmin
        .from('user_roles')
        .update({ is_active: true })
        .eq('user_id', userId)
        .eq('role_type', 'admin');
      
      if (updateRoleError) {
        console.error('❌ Error activating admin role:', updateRoleError.message);
        throw updateRoleError;
      }
      console.log('✅ Activated admin role');
    } else {
      console.log('✅ Admin role already active');
    }
    
    // Verify the profile was created/updated correctly
    const { data: finalProfile, error: verifyError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (verifyError) {
      console.error('❌ Error verifying profile:', verifyError.message);
    } else {
      console.log('✅ Final profile state:', {
        id: finalProfile.id,
        email: finalProfile.email,
        first_name: finalProfile.first_name,
        last_name: finalProfile.last_name,
        name: finalProfile.name,
        school: finalProfile.school,
        approval_status: finalProfile.approval_status,
        must_change_password: finalProfile.must_change_password
      });
    }
    
    console.log(`✅ Admin user ${adminEmail} is ready for testing`);
    
  } catch (error) {
    console.error('❌ Failed to set up admin user:', error);
    throw error;
  }
}

async function globalSetup(config: FullConfig) {
  console.log('🚀 Setting up E2E test environment...');
  console.log('--- Starting Global Test Setup: Cleaning Database ---');

  // Create Supabase admin client for database cleanup
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  // First, clean up auth.users to ensure fresh start
  console.log('Cleaning auth.users...');
  try {
    // Get all users except service role user
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError.message);
    } else {
      console.log(`Found ${users.users.length} total users`);
      let deletedCount = 0;
      
      for (const user of users.users) {
        // Delete test users and the admin user (we'll recreate it fresh)
        if (user.email?.includes('@test.com') ||
            user.email === 'consultant@nuevaeducacion.org' ||
            user.email === 'student@nuevaeducacion.org' ||
            user.email === 'director@nuevaeducacion.org' ||
            user.email === 'brent@perrotuertocm.cl') {
          console.log(`Deleting user: ${user.email} (ID: ${user.id})`);
          const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
          if (deleteError) {
            console.error(`❌ Error deleting user ${user.email}:`, deleteError.message);
          } else {
            console.log(`✅ Deleted user ${user.email}`);
            deletedCount++;
          }
        }
      }
      console.log(`✅ Auth users cleaned (deleted ${deletedCount} users)`);
    }
  } catch (err) {
    console.error('❌ Error cleaning auth users:', err);
  }

  // Define tables to clean in order (respecting foreign key constraints)
  const tablesToClean = [
    // Clean dependent tables first
    'quiz_submissions',
    'assignment_submissions',
    'learning_path_assignments',
    'learning_path_courses',
    'course_enrollments',
    'course_assignments',
    'lessons',
    'modules',
    'blocks',
    'user_roles',
    'expense_reports',
    'expense_items',
    'platform_feedback', // Add this to clean before profiles
    'red_escuelas', // Clean before redes_de_colegios
    'supervisor_auditorias', // Clean before redes_de_colegios
    // Then clean parent tables
    'learning_paths',
    'courses',
    'community_workspaces',
    'generations',
    'schools',
    'redes_de_colegios',
    'profiles',
  ];

  // Clean each table
  for (const table of tablesToClean) {
    try {
      // Use a filter that will match all rows (id is not null)
      const { error, count } = await supabaseAdmin
        .from(table)
        .delete()
        .not('id', 'is', null);
      
      if (error) {
        console.error(`❌ Error cleaning table ${table}:`, error.message);
      } else {
        console.log(`✅ Table ${table} cleaned (${count || 0} rows deleted)`);
      }
    } catch (err) {
      console.error(`❌ Unexpected error cleaning table ${table}:`, err);
    }
  }

  console.log('--- Database Cleanup Complete ---');

  // First, handle the admin user separately with upsert logic
  console.log('Setting up admin user...');
  await upsertAdminUser(supabaseAdmin);

  // Define other test users
  const testUsers = [
    {
      email: 'consultant@nuevaeducacion.org',
      password: 'test123456',
      firstName: 'Test',
      lastName: 'Consultant',
      role: 'consultor'
    },
    {
      email: 'student@nuevaeducacion.org',
      password: 'test123456',
      firstName: 'Test',
      lastName: 'Student',
      role: 'docente'
    },
    {
      email: 'director@nuevaeducacion.org',
      password: 'test123456',
      firstName: 'Test',
      lastName: 'Director',
      role: 'equipo_directivo'
    }
  ];

  // Create test users in the database
  console.log('Creating test users in database...');
  
  for (const user of testUsers) {
    try {
      // First check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users.find(u => u.email === user.email);
      
      let userId: string;
      
      if (existingUser) {
        // User exists, update password
        userId = existingUser.id;
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password: user.password }
        );
        
        if (updateError) {
          console.error(`❌ Error updating password for ${user.email}:`, updateError.message);
          continue;
        }
      } else {
        // Create new user
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true
        });

        if (authError) {
          console.error(`❌ Error creating auth user ${user.email}:`, authError.message);
          continue;
        }
        
        userId = authUser.user?.id;
      }

      if (!userId) continue;

      // Check if profile exists
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (!existingProfile) {
        // Create profile with correct schema
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: userId,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`, // Required field
            first_name: user.firstName,
            last_name: user.lastName,
            approval_status: 'approved', // Set to approved for test users
            timezone: 'UTC',
            must_change_password: false // Don't require password change for test users
          });

        if (profileError) {
          console.error(`❌ Error creating profile for ${user.email}:`, profileError.message);
        }
      } else {
        // Update existing profile with correct schema
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            name: `${user.firstName} ${user.lastName}`,
            first_name: user.firstName,
            last_name: user.lastName,
            approval_status: 'approved',
            must_change_password: false
          })
          .eq('id', userId);

        if (updateError) {
          console.error(`❌ Error updating profile for ${user.email}:`, updateError.message);
        }
      }

      // Create a test school if needed for non-admin users
      let schoolId = null;
      if (user.role !== 'admin') {
        const { data: testSchool } = await supabaseAdmin
          .from('schools')
          .select('id')
          .eq('name', 'Test School')
          .single();
        
        if (!testSchool) {
          const { data: newSchool, error: schoolError } = await supabaseAdmin
            .from('schools')
            .insert({ name: 'Test School', has_generations: false })
            .select()
            .single();
          
          if (schoolError) {
            console.error('❌ Error creating test school:', schoolError.message);
          } else {
            schoolId = newSchool?.id;
          }
        } else {
          schoolId = testSchool.id;
        }
      }

      // Delete existing role if any
      await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Create user role with proper scope
      const roleData: any = {
        user_id: userId,
        role_type: user.role,
        is_active: true
      };

      // Add organizational scope based on role
      if (user.role === 'docente' || user.role === 'consultor' || user.role === 'equipo_directivo') {
        roleData.school_id = schoolId;
      }

      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert(roleData);

      if (roleError) {
        console.error(`❌ Error creating role for ${user.email}:`, roleError.message);
      } else {
        console.log(`✅ Created/Updated test user: ${user.email} (${user.role})`);
      }
    } catch (err) {
      console.error(`❌ Unexpected error creating user ${user.email}:`, err);
    }
  }

  // Store test data in global state (using the exact emails)
  process.env.TEST_ADMIN_EMAIL = 'brent@perrotuertocm.cl';
  process.env.TEST_ADMIN_PASSWORD = 'NuevaEdu2025!';
  
  process.env.TEST_CONSULTANT_EMAIL = 'consultant@nuevaeducacion.org';
  process.env.TEST_CONSULTANT_PASSWORD = 'test123456';
  
  process.env.TEST_STUDENT_EMAIL = 'student@nuevaeducacion.org';
  process.env.TEST_STUDENT_PASSWORD = 'test123456';
  
  process.env.TEST_DIRECTOR_EMAIL = 'director@nuevaeducacion.org';
  process.env.TEST_DIRECTOR_PASSWORD = 'test123456';

  console.log('✅ Test users created in database');

  // Launch browser for initial setup
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Verify the application is running
    await page.goto(config.projects[0].use?.baseURL || 'http://localhost:3000');
    await page.waitForSelector('body', { timeout: 10000 });
    console.log('✅ Application is accessible');

    // Check if login page is working
    const baseUrl = config.projects[0].use?.baseURL || 'http://localhost:3000';
    await page.goto(`${baseUrl}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    console.log('✅ Login page is functional');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }

  console.log('🎭 E2E test environment ready!');
}

export default globalSetup;