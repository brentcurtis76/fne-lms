const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.log("Missing required environment variables");
    process.exit(1);
}

async function setupExistingUser() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log("\n=== Setting up superadmin with existing user ===");
    
    try {
        // List existing users to find one we can use
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) {
            console.log("Error listing users:", listError.message);
            return;
        }
        
        console.log(`Found ${users.length} existing users`);
        
        if (users.length === 0) {
            console.log("No users found in auth.users");
            return;
        }
        
        // Use the first available user
        const testUser = users[0];
        console.log(`\nUsing existing user: ${testUser.email} (${testUser.id})`);
        
        // Ensure user exists in public.users
        const { data: publicUser, error: publicError } = await supabase
            .from('users')
            .upsert({
                id: testUser.id,
                email: testUser.email,
                full_name: testUser.user_metadata?.full_name || 'Test User'
            }, {
                onConflict: 'id'
            })
            .select()
            .single();
            
        if (publicError) {
            console.log("Error creating public.users record:", publicError.message);
            return;
        }
        
        console.log("Public user record ready");
        
        // Grant superadmin
        const { data: superadminData, error: superadminError } = await supabase
            .from('superadmins')
            .upsert({
                user_id: testUser.id,
                granted_by: testUser.id,
                reason: 'Local RBAC Phase 2 test grant',
                is_active: true
            }, {
                onConflict: 'user_id'
            })
            .select();
            
        if (superadminError) {
            console.log("Error granting superadmin:", superadminError.message);
        } else {
            console.log("\n✅ Superadmin granted successfully");
        }
        
        // Verify
        const { data: verifyData, error: verifyError } = await supabase
            .rpc('auth_is_superadmin', { check_user_id: testUser.id });
            
        if (verifyError) {
            console.log("Verification error:", verifyError.message);
        } else {
            console.log(`\n✅ VERIFICATION SUCCESS: is_superadmin = ${verifyData}`);
            console.log(`\n=== TEST CREDENTIALS ===`);
            console.log(`Email: ${testUser.email}`);
            console.log(`User ID: ${testUser.id}`);
            console.log(`Login at: http://localhost:3000`);
        }
        
    } catch (err) {
        console.error('Error:', err);
    }
}

setupExistingUser().catch(console.error);
