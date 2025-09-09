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

async function fixSuperadmin() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log("\n=== Direct superadmin setup ===");
    
    try {
        // Use the first user directly
        const userId = '8a27f1b4-0b25-443e-ab9f-8fea1941d8ec';
        const userEmail = 'loreto.sanchez@colegiosantamartavaldivia.cl';
        
        console.log(`Setting up: ${userEmail}`);
        
        // Check if user exists in public.users first
        const { data: checkUser, error: checkError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
            
        if (checkError && checkError.code === 'PGRST116') {
            // User doesn't exist, create it
            console.log("Creating public.users record...");
            const { data: createUser, error: createError } = await supabase
                .from('users')
                .insert({
                    id: userId,
                    email: userEmail,
                    full_name: 'Loreto Sanchez'
                })
                .select();
                
            if (createError) {
                console.log("Insert error:", createError);
            } else {
                console.log("Created:", createUser);
            }
        } else if (!checkError) {
            console.log("User already exists in public.users");
        }
        
        // Now handle superadmin - check first
        const { data: checkSuper, error: checkSuperError } = await supabase
            .from('superadmins')
            .select('*')
            .eq('user_id', userId)
            .single();
            
        if (checkSuperError && checkSuperError.code === 'PGRST116') {
            // Doesn't exist, create it
            console.log("Creating superadmin record...");
            const { data: superadminData, error: superadminError } = await supabase
                .from('superadmins')
                .insert({
                    user_id: userId,
                    granted_by: userId,
                    reason: 'Local RBAC Phase 2 test grant',
                    is_active: true
                })
                .select();
                
            if (superadminError) {
                console.log("Superadmin insert error:", superadminError);
            } else {
                console.log("✅ Superadmin created:", superadminData);
            }
        } else if (!checkSuperError) {
            // Update existing
            console.log("Updating existing superadmin record...");
            const { data: updateData, error: updateError } = await supabase
                .from('superadmins')
                .update({ is_active: true, updated_at: new Date().toISOString() })
                .eq('user_id', userId)
                .select();
                
            if (updateError) {
                console.log("Update error:", updateError);
            } else {
                console.log("✅ Superadmin updated:", updateData);
            }
        }
        
        // Final verification
        const { data: verifyData, error: verifyError } = await supabase
            .rpc('auth_is_superadmin', { check_user_id: userId });
            
        console.log(`\n=== FINAL VERIFICATION ===`);
        console.log(`Is superadmin: ${verifyData}`);
        console.log(`Email: ${userEmail}`);
        console.log(`User ID: ${userId}`);
        
    } catch (err) {
        console.error('Error:', err);
    }
}

fixSuperadmin().catch(console.error);
