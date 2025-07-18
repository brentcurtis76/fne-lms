import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function findAdminUsers() {
  console.log('=== FINDING ADMIN USERS IN FNE LMS ===\n');
  
  // First, let's find all users with admin role
  const { data: adminRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id, role_type')
    .eq('role_type', 'admin');
    
  if (rolesError) {
    console.error('Error fetching admin roles:', rolesError);
    return;
  }
  
  console.log(`Found ${adminRoles?.length || 0} admin role assignments\n`);
  
  if (adminRoles && adminRoles.length > 0) {
    // Get the user details for these admin users
    const adminUserIds = adminRoles.map(role => role.user_id);
    
    const { data: adminUsers, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, created_at')
      .in('id', adminUserIds);
      
    if (usersError) {
      console.error('Error fetching admin user profiles:', usersError);
      return;
    }
    
    console.log('=== ADMIN USERS FOUND ===\n');
    adminUsers?.forEach((user, index) => {
      console.log(`${index + 1}. ${user.first_name} ${user.last_name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleDateString()}`);
      console.log('');
    });
    
    // Check specifically for Brent Curtis and Mora del Fresno
    console.log('=== CHECKING FOR SPECIFIC USERS ===\n');
    
    const brent = adminUsers?.find(u => 
      u.email?.includes('brent') || 
      u.first_name?.toLowerCase() === 'brent' ||
      u.email === 'brentcurtis76@gmail.com'
    );
    
    if (brent) {
      console.log('✅ Brent Curtis found:');
      console.log(`   Email: ${brent.email}`);
      console.log(`   ID: ${brent.id}`);
      console.log(`   Can use for E2E testing\n`);
    }
    
    const mora = adminUsers?.find(u => 
      u.email?.includes('mdelfresno') || 
      u.first_name?.toLowerCase() === 'mora' ||
      u.email === 'mdelfresno@nuevaeducacion.org'
    );
    
    if (mora) {
      console.log('✅ Mora del Fresno found:');
      console.log(`   Email: ${mora.email}`);
      console.log(`   ID: ${mora.id}`);
      console.log(`   Can use for E2E testing\n`);
    }
    
    // Find admin with simplest email for testing
    const testFriendlyAdmin = adminUsers?.find(u => u.email && !u.email.includes(' '));
    if (testFriendlyAdmin) {
      console.log('=== RECOMMENDED FOR E2E TESTING ===');
      console.log(`Email: ${testFriendlyAdmin.email}`);
      console.log(`Name: ${testFriendlyAdmin.first_name} ${testFriendlyAdmin.last_name}`);
      console.log(`ID: ${testFriendlyAdmin.id}\n`);
    }
  }
  
  // Also check for any users with emails ending in approved domains
  console.log('=== CHECKING USERS WITH VALID EMAIL DOMAINS ===\n');
  
  const { data: validDomainUsers, error: domainError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .or('email.ilike.%@nuevaeducacion.org,email.ilike.%@perrotuertocm.cl,email.ilike.%@gmail.com')
    .limit(10);
    
  if (validDomainUsers && validDomainUsers.length > 0) {
    console.log('Users with valid email domains (may not be admins):');
    validDomainUsers.forEach(user => {
      console.log(`- ${user.first_name} ${user.last_name}: ${user.email}`);
    });
  }
  
  // Check auth.users table as well
  console.log('\n=== CHECKING AUTH.USERS TABLE ===\n');
  
  const { data: authUsers, error: authError } = await supabase
    .from('auth.users')
    .select('id, email, created_at')
    .limit(20);
    
  if (authError) {
    console.log('Note: Cannot access auth.users table directly (expected behavior)');
  } else if (authUsers) {
    console.log('Found users in auth system:');
    authUsers.forEach(user => {
      console.log(`- ${user.email} (ID: ${user.id})`);
    });
  }
}

// Run the search
findAdminUsers()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });