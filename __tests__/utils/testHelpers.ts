import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Test user types
export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: string;
  profile?: {
    first_name: string;
    last_name: string;
  };
}

// Create a test Supabase client with service role
export function createTestSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Create test users with different roles
export async function createTestUsers(supabase: SupabaseClient): Promise<{
  admin: TestUser;
  supervisor: TestUser;
  docente: TestUser;
}> {
  const admin: TestUser = {
    id: uuidv4(),
    email: `admin-${Date.now()}@test.com`,
    password: 'TestPass123!',
    role: 'admin',
    profile: {
      first_name: 'Test',
      last_name: 'Admin',
    },
  };

  const supervisor: TestUser = {
    id: uuidv4(),
    email: `supervisor-${Date.now()}@test.com`,
    password: 'TestPass123!',
    role: 'supervisor_de_red',
    profile: {
      first_name: 'Test',
      last_name: 'Supervisor',
    },
  };

  const docente: TestUser = {
    id: uuidv4(),
    email: `docente-${Date.now()}@test.com`,
    password: 'TestPass123!',
    role: 'docente',
    profile: {
      first_name: 'Test',
      last_name: 'Docente',
    },
  };

  // Create users using service role client
  for (const user of [admin, supervisor, docente]) {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        id: user.id,
      },
    });

    if (authError) {
      throw new Error(`Failed to create auth user ${user.email}: ${authError.message}`);
    }

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user!.id,
        email: user.email,
        first_name: user.profile!.first_name,
        last_name: user.profile!.last_name,
      });

    if (profileError) {
      throw new Error(`Failed to create profile for ${user.email}: ${profileError.message}`);
    }

    // Assign role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authData.user!.id,
        role_type: user.role,
        is_active: true,
      });

    if (roleError) {
      throw new Error(`Failed to assign role for ${user.email}: ${roleError.message}`);
    }

    // Update user ID to match auth user
    user.id = authData.user!.id;
  }

  return { admin, supervisor, docente };
}

// Create test network
export async function createTestNetwork(
  supabase: SupabaseClient,
  createdBy: string,
  name?: string
): Promise<{ id: string; name: string }> {
  const networkName = name || `Test Network ${Date.now()}`;
  
  const { data, error } = await supabase
    .from('redes_de_colegios')
    .insert({
      name: networkName,
      description: 'Test network for automated tests',
      created_by: createdBy,
      last_updated_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test network: ${error.message}`);
  }

  return data;
}

// Create test school
export async function createTestSchool(
  supabase: SupabaseClient,
  name?: string
): Promise<{ id: number; name: string }> {
  const schoolName = name || `Test School ${Date.now()}`;
  
  const { data, error } = await supabase
    .from('schools')
    .insert({
      name: schoolName,
      has_generations: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test school: ${error.message}`);
  }

  return data;
}

// Assign school to network
export async function assignSchoolToNetwork(
  supabase: SupabaseClient,
  networkId: string,
  schoolId: number,
  assignedBy: string
): Promise<void> {
  const { error } = await supabase
    .from('red_escuelas')
    .insert({
      red_id: networkId,
      school_id: schoolId,
      assigned_by: assignedBy,
    });

  if (error) {
    throw new Error(`Failed to assign school to network: ${error.message}`);
  }
}

// Assign supervisor to network
export async function assignSupervisorToNetwork(
  supabase: SupabaseClient,
  userId: string,
  networkId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .update({
      red_id: networkId,
    })
    .eq('user_id', userId)
    .eq('role_type', 'supervisor_de_red');

  if (error) {
    throw new Error(`Failed to assign supervisor to network: ${error.message}`);
  }
}

// Clean up test data
export async function cleanupTestData(supabase: SupabaseClient): Promise<void> {
  // Delete test networks (will cascade to red_escuelas)
  await supabase
    .from('redes_de_colegios')
    .delete()
    .like('name', 'Test Network%');

  // Delete test schools
  await supabase
    .from('schools')
    .delete()
    .like('name', 'Test School%');

  // Delete test users
  const { data: testUsers } = await supabase
    .from('profiles')
    .select('id')
    .like('email', '%@test.com');

  if (testUsers && testUsers.length > 0) {
    const userIds = testUsers.map(u => u.id);
    
    // Delete user roles
    await supabase
      .from('user_roles')
      .delete()
      .in('user_id', userIds);

    // Delete profiles
    await supabase
      .from('profiles')
      .delete()
      .in('id', userIds);

    // Delete auth users
    for (const userId of userIds) {
      await supabase.auth.admin.deleteUser(userId);
    }
  }
}

// Get auth token for test user
export async function getAuthToken(
  supabase: SupabaseClient,
  email: string,
  password: string
): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(`Failed to get auth token: ${error?.message || 'No session'}`);
  }

  return data.session.access_token;
}