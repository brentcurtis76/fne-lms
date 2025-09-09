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

async function createTestSuperadmin() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const testEmail = 'brentcurtis76@gmail.com'; // Your actual email
    
    console.log(`\n=== Creating test superadmin with ${testEmail} ===`);
    
    try {
        // First, check if user exists in auth.users
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) {
            console.log("Error listing users:", listError.message);
            return;
        }
        
        let userId = null;
        const existingUser = users.find(u => u.email === testEmail);
        
        if (existingUser) {
            userId = existingUser.id;
            console.log(`Found existing auth user: ${userId}`);
        } else {
            // Create auth user if doesn't exist
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: testEmail,
                password: 'TestPassword123!',
                email_confirm: true,
                user_metadata: { full_name: 'Brent Curtis' }
            });
            
            if (authError) {
                console.log("Error creating auth user:", authError.message);
                return;
            }
            
            userId = authData.user.id;
            console.log(`Created new auth user: ${userId}`);
        }
        
        // Ensure user exists in public.users
        const { data: publicUser, error: publicError } = await supabase
            .from('users')
            .upsert({
                id: userId,
                email: testEmail,
                full_name: 'Brent Curtis'
            }, {
                onConflict: 'id'
            })
            .select()
            .single();
            
        if (publicError) {
            console.log("Error creating public.users record:", publicError.message);
        } else {
            console.log("Public user record ready:", publicUser);
        }
        
        // Now grant superadmin
        const { data: superadminData, error: superadminError } = await supabase
            .from('superadmins')
            .upsert({
                user_id: userId,
                granted_by: userId,
                reason: 'Local RBAC Phase 2 test grant',
                is_active: true
            }, {
                onConflict: 'user_id'
            })
            .select();
            
        if (superadminError) {
            console.log("Error granting superadmin:", superadminError.message);
        } else {
            console.log("\n✅ Superadmin granted successfully:", superadminData);
        }
        
        // Verify
        const { data: verifyData, error: verifyError } = await supabase
            .rpc('auth_is_superadmin', { check_user_id: userId });
            
        if (verifyError) {
            console.log("Verification error:", verifyError.message);
        } else {
            console.log(`\n✅ Verification complete: is_superadmin = ${verifyData}`);
            console.log(`Test user email: ${testEmail}`);
            console.log(`Test user ID: ${userId}`);
        }
        
    } catch (err) {
        console.error('Error:', err);
    }
}

createTestSuperadmin().catch(console.error);
