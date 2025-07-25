/**
 * Create or update admin user in sandbox database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function createSandboxAdmin() {
  const email = 'bcurtis@nuevaeducacion.org';
  const password = 'FNE2025admin!';
  
  console.log('🔐 Creating/updating admin user in SANDBOX database');
  console.log('   Database:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  
  try {
    // First try to create the user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { 
        full_name: 'Brent Curtis',
        role: 'admin'
      }
    });
    
    if (createError) {
      if (createError.message.includes('already been registered')) {
        console.log('⚠️  User already exists, updating password...');
        
        // Get the existing user
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) {
          console.error('❌ Error listing users:', listError);
          return;
        }
        
        const existingUser = users.find(u => u.email === email);
        
        if (existingUser) {
          // Update password
          const { data, error: updateError } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            { password: password }
          );
          
          if (updateError) {
            console.error('❌ Error updating password:', updateError);
          } else {
            console.log('✅ Password updated successfully!');
            console.log('   User ID:', existingUser.id);
            
            // Ensure profile exists
            const { data: profile, error: profileCheckError } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', existingUser.id)
              .single();
              
            if (profileCheckError || !profile) {
              const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                  id: existingUser.id,
                  email: email,
                  name: 'Brent Curtis'
                });
                
              if (profileError) {
                console.log('⚠️  Profile creation error:', profileError.message);
              } else {
                console.log('✅ Profile created');
              }
            } else {
              console.log('✅ Profile already exists');
            }
            
            // Ensure admin role exists
            const { data: role, error: roleCheckError } = await supabase
              .from('user_roles')
              .select('id')
              .eq('user_id', existingUser.id)
              .eq('role_type', 'admin')
              .single();
              
            if (roleCheckError || !role) {
              const { error: roleError } = await supabase
                .from('user_roles')
                .insert({
                  user_id: existingUser.id,
                  role_type: 'admin',
                  is_active: true
                });
                
              if (roleError) {
                console.log('⚠️  Role assignment error:', roleError.message);
              } else {
                console.log('✅ Admin role assigned');
              }
            } else {
              console.log('✅ Admin role already exists');
            }
          }
        }
      } else {
        console.error('❌ Error creating user:', createError);
        return;
      }
    } else {
      console.log('✅ Admin user created successfully!');
      console.log('   User ID:', newUser.user.id);
      
      // Create profile record
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: newUser.user.id,
          email: email,
          name: 'Brent Curtis'
        });
        
      if (profileError) {
        console.log('⚠️  Profile creation error:', profileError.message);
      } else {
        console.log('✅ Profile created');
      }
      
      // Create admin role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: newUser.user.id,
          role_type: 'admin',
          is_active: true
        });
        
      if (roleError) {
        console.log('⚠️  Role assignment error:', roleError.message);
      } else {
        console.log('✅ Admin role assigned');
      }
    }
    
    console.log('\n📋 SANDBOX Login Credentials:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('   URL: http://localhost:3000/login');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

createSandboxAdmin();