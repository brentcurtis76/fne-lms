import { createClient } from '@supabase/supabase-js';

// Get test environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for test data seeding');
}

// Create service role client for bypassing RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export interface SupervisorTestData {
  userId: string;
  email: string;
  password: string;
  networkId: string;
  networkName: string;
  schoolIds: string[];
  adminUserId: string;
}

/**
 * Creates a complete test setup for supervisor permissions testing
 * This function uses admin privileges to set up all necessary data
 */
export async function createSupervisorTestData(): Promise<SupervisorTestData> {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const testEmail = `supervisor-e2e-${timestamp}-${random}@test.com`;
  const testPassword = 'Test123456!';
  const networkName = `Red de Prueba E2E ${timestamp}-${random}`;

  try {
    console.log('🔧 Creating supervisor test data...');

    // 1. First, get the admin user that was created in global setup
    const { data: adminRole, error: adminError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (adminError || !adminRole) {
      throw new Error('No admin user found. Make sure global setup has run.');
    }

    const adminUserId = adminRole.user_id;
    console.log('✅ Found admin user for setup');

    // 2. Create test network using admin privileges
    const { data: networkData, error: networkError } = await supabaseAdmin
      .from('redes_de_colegios')
      .insert({
        nombre: networkName,
        descripcion: 'Red de prueba para E2E tests de permisos de supervisor',
        created_by: adminUserId,
        last_updated_by: adminUserId
      })
      .select()
      .single();

    if (networkError) {
      throw new Error(`Failed to create network: ${networkError.message}`);
    }

    const networkId = networkData.id;
    console.log(`✅ Created test network: ${networkName}`);

    // 3. Create supervisor user account
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          first_name: 'Test',
          last_name: 'Supervisor'
        }
      }
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create auth user: ${authError?.message || 'No user returned'}`);
    }

    const userId = authData.user.id;
    console.log(`✅ Created supervisor user: ${testEmail}`);

    // 4. Create profile for the supervisor
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email: testEmail,
        first_name: 'Test',
        last_name: 'Supervisor',
        approval_status: 'approved'
      });

    if (profileError) {
      // Profile might be created automatically by trigger, check if it exists
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();
      
      if (!existingProfile) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
    }
    console.log('✅ Profile ready for supervisor');

    // 5. Assign supervisor role with the network
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role_type: 'supervisor_de_red',
        red_id: networkId,
        is_active: true,
        created_at: new Date().toISOString(),
        assigned_by: adminUserId
      });

    if (roleError) {
      throw new Error(`Failed to assign supervisor role: ${roleError.message}`);
    }
    console.log('✅ Assigned supervisor_de_red role with network');

    // 6. Get existing schools to assign to the network
    const { data: schools, error: schoolsError } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .limit(2);

    let schoolIds: string[] = [];
    
    if (!schoolsError && schools && schools.length > 0) {
      // 7. Assign schools to the network
      const schoolAssignments = schools.map(school => ({
        red_id: networkId,
        school_id: school.id,
        agregado_por: adminUserId
      }));

      const { error: assignError } = await supabaseAdmin
        .from('red_escuelas')
        .insert(schoolAssignments);

      if (!assignError) {
        schoolIds = schools.map(s => s.id);
        console.log(`✅ Assigned ${schools.length} schools to network`);
      } else {
        console.warn(`⚠️  Could not assign schools: ${assignError.message}`);
      }
    }

    // 8. Verify the setup is complete
    const { data: verification } = await supabaseAdmin
      .from('user_roles')
      .select('*, profiles!user_id(*)')
      .eq('user_id', userId)
      .single();

    if (verification) {
      console.log('✅ Supervisor test setup verified:', {
        email: testEmail,
        role: verification.role_type,
        network: networkName,
        hasProfile: !!verification.profiles
      });
    }

    return {
      userId,
      email: testEmail,
      password: testPassword,
      networkId,
      networkName,
      schoolIds,
      adminUserId
    };

  } catch (error) {
    console.error('❌ Failed to create supervisor test data:', error);
    throw error;
  }
}

/**
 * Cleans up test data after tests complete
 */
export async function cleanupSupervisorTestData(testData: SupervisorTestData) {
  if (!testData) return;
  
  try {
    console.log('🧹 Cleaning up supervisor test data...');

    // Delete in reverse order of creation
    // 1. Remove school assignments
    await supabaseAdmin
      .from('red_escuelas')
      .delete()
      .eq('red_id', testData.networkId);

    // 2. Remove user role
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', testData.userId);

    // 3. Delete network
    await supabaseAdmin
      .from('redes_de_colegios')
      .delete()
      .eq('id', testData.networkId);

    // 4. Delete profile
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', testData.userId);

    // 5. Delete auth user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(testData.userId);
    if (error) {
      // Try alternative method
      await supabaseAdmin.from('auth.users').delete().eq('id', testData.userId);
    }

    console.log('✅ Test data cleaned up successfully');
  } catch (error) {
    console.error('❌ Cleanup error (non-critical):', error);
    // Don't throw - cleanup failures shouldn't fail tests
  }
}